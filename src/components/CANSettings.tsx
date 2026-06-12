"use client";

import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { SignalIcon, ArrowDownTrayIcon, XCircleIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useAppSettings } from '@/contexts/AppSettingsContext';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawField { label: string; name: string; value: string; ph: string; }

interface CanFrame {
  timestamp: string;
  direction: 'TX' | 'RX';
  /** formatted display string for TX or unparsed lines */
  message?: string;
  /** present for parsed RX frames */
  id?: number;
  dlc?: number;
  data?: number[];
  /** true when frame ID matches the selected ABS entry */
  isMatch?: boolean;
  /** value at the expected byte position from the database entry */
  matchByteValue?: number;
}

interface CANSettingsProps {
  result: { canSpeed: string; canByte: string; canIdLine: string; canValue: string };
  isConnected: boolean;
  sendMessage?: (message: string) => Promise<boolean | void>;
  canReceivedData?: { idLine?: string; byte?: string; value?: string };
  legacyMode?: boolean;
}

// The Nano firmware receives the literal kbps value: 250, 500, or 1000.
const LEGACY_SPEEDS = [
  { label: '250 kbps', cmd: 250  },
  { label: '500 kbps', cmd: 500  },
  { label: '1 Mbps',   cmd: 1000 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ts() {
  const now = new Date();
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => n.toString().padStart(2, '0')).join(':');
}

function hex(n: number, pad = 2) {
  return n.toString(16).toUpperCase().padStart(pad, '0');
}

/** Try to parse a CAN ID string that may be decimal or hex ("0x201", "513", "201"). */
function parseCanIdStr(s: string): number | null {
  if (!s) return null;
  s = s.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) {
    const n = parseInt(s.slice(2), 16);
    return isNaN(n) ? null : n;
  }
  const dec = parseInt(s, 10);
  if (!isNaN(dec)) return dec;
  const hex = parseInt(s, 16);
  return isNaN(hex) ? null : hex;
}

/**
 * Try to parse a line like "513 8 0 0 255 255 255 255 255 255" as a CAN frame.
 * Returns null for non-frame lines ("Freq : 12.3", "init", etc.).
 */
function parseNanoFrame(line: string): { id: number; dlc: number; data: number[] } | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const id = parseInt(parts[0], 10);
  const dlc = parseInt(parts[1], 10);
  if (isNaN(id) || isNaN(dlc) || dlc < 0 || dlc > 8) return null;
  if (parts.length !== 2 + dlc) return null;
  const data = parts.slice(2).map(b => parseInt(b, 10));
  if (data.some(isNaN)) return null;
  return { id, dlc, data };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CANSettings({
  result,
  isConnected,
  sendMessage,
  legacyMode = false,
}: CANSettingsProps) {
  const { legacyCanSpeed, setLegacyCanSpeed } = useAppSettings();

  const [canData, setCanData] = useState({
    speed: result.canSpeed,
    byte:  result.canByte,
    idLine: result.canIdLine,
    value:  result.canValue,
  });
  const [frames, setFrames] = useState<CanFrame[]>([]);
  const [showLog, setShowLog] = useState(true);
  const [matchCount, setMatchCount] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  // The selected ABS entry's CAN ID and byte, parsed for matching
  const matchId = parseCanIdStr(result.canIdLine);
  const matchByte = result.canByte ? parseInt(result.canByte, 10) : null;

  useEffect(() => {
    setCanData({
      speed: result.canSpeed,
      byte:  result.canByte,
      idLine: result.canIdLine,
      value:  result.canValue,
    });
  }, [result.canSpeed, result.canByte, result.canIdLine, result.canValue]);

  // Auto-scroll
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [frames]);

  // Legacy mode: listen to serial-data and parse Nano CAN frames
  useEffect(() => {
    if (!legacyMode) return;
    const unsub = listen<string>('serial-data', e => {
      const line = e.payload;
      const parsed = parseNanoFrame(line);
      if (!parsed) return; // not a CAN frame (e.g. "Freq : 12.3" or "init")

      const isMatch = matchId !== null && parsed.id === matchId;
      const matchByteValue =
        isMatch && matchByte !== null && matchByte < parsed.data.length
          ? parsed.data[matchByte]
          : undefined;

      const frame: CanFrame = {
        timestamp: ts(),
        direction: 'RX',
        id: parsed.id,
        dlc: parsed.dlc,
        data: parsed.data,
        isMatch,
        matchByteValue,
      };

      setFrames(prev => {
        const next = prev.length >= 200 ? [...prev.slice(1), frame] : [...prev, frame];
        return next;
      });
      if (isMatch) setMatchCount(c => c + 1);
    });
    return () => { unsub.then(u => u()); };
  }, [legacyMode, matchId, matchByte]);

  // Pico mode: send handshake ping
  useEffect(() => {
    if (legacyMode || !isConnected || !sendMessage) return;
    const t = setTimeout(() => sendMessage('t\n'), 1000);
    return () => clearTimeout(t);
  }, [legacyMode, isConnected, sendMessage]);

  const addTx = (msg: string) => {
    setFrames(prev => {
      const frame: CanFrame = { timestamp: ts(), direction: 'TX', message: msg };
      return prev.length >= 200 ? [...prev.slice(1), frame] : [...prev, frame];
    });
  };

  // Legacy: set CAN speed on the Nano
  const sendLegacySpeed = async (cmd: number) => {
    if (!isConnected || !sendMessage) return;
    const msg = `CANSpeed : ${cmd}`;
    addTx(msg);
    await sendMessage(`${msg}\n`);
    setLegacyCanSpeed(cmd);
  };

  // Pico: send a raw CAN message
  const sendCanMessage = async () => {
    if (!isConnected || !sendMessage) return;
    const msg = `ID: ${canData.idLine} | Data: ${canData.value} | Len: ${canData.byte}`;
    addTx(msg);
    await sendMessage(`SEND:${canData.idLine}:${canData.value}:${canData.byte}`);
  };

  const clearLog = () => { setFrames([]); setMatchCount(0); };

  const picoFields: RawField[] = [
    { label: 'CAN Speed', name: 'speed',  value: canData.speed,  ph: '500kbps' },
    { label: 'CAN Byte',  name: 'byte',   value: canData.byte,   ph: '8'      },
    { label: 'CAN ID',    name: 'idLine', value: canData.idLine, ph: '0x7E0'  },
    { label: 'CAN Value', name: 'value',  value: canData.value,  ph: '0xFF'   },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="card">
      {/* Header */}
      <h2 className="card-header flex items-center gap-2">
        <SignalIcon className="h-4 w-4 text-text-tertiary" />
        {legacyMode ? 'CAN Bus Monitor' : 'CAN Settings'}
        {legacyMode && (
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-warning/15 text-warning border border-warning/20">
            NANO
          </span>
        )}
      </h2>

      {/* ── Legacy mode: CAN speed selector ── */}
      {legacyMode ? (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-text-secondary">CAN Bus Speed</span>
            {legacyCanSpeed !== null && (
              <button
                onClick={() => setLegacyCanSpeed(null)}
                disabled={!isConnected}
                className="text-[10px] text-danger hover:text-danger/80 disabled:opacity-40 transition-colors"
              >
                Stop CAN ✕
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {LEGACY_SPEEDS.map(s => (
              <button
                key={s.cmd}
                disabled={!isConnected}
                onClick={() => sendLegacySpeed(s.cmd)}
                className={[
                  'flex-1 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-40',
                  legacyCanSpeed === s.cmd
                    ? 'bg-success/15 text-success border border-success/20'
                    : 'bg-elevated text-text-secondary border border-border hover:text-text-primary',
                ].join(' ')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ── Pico mode: 4 text fields ── */
        <div className="grid grid-cols-2 gap-3 mb-4">
          {picoFields.map(f => (
            <div key={f.name}>
              <label className="input-label">{f.label}</label>
              <input
                name={f.name} type="text" value={f.value} placeholder={f.ph}
                onChange={e => setCanData(p => ({ ...p, [e.target.name]: e.target.value }))}
                className="input-field"
              />
            </div>
          ))}
        </div>
      )}

      {/* ── Toolbar row ── */}
      <div className="flex items-center justify-between mb-3 gap-2">
        {/* Status */}
        <div className="flex items-center gap-2 text-xs">
          <span className={['w-2 h-2 rounded-full shrink-0', isConnected ? 'bg-success' : 'bg-text-tertiary'].join(' ')} />
          <span className={isConnected ? 'text-success' : 'text-text-tertiary'}>
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
          {legacyMode && matchCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-success/15 text-success border border-success/20 font-semibold">
              {matchCount} match{matchCount !== 1 ? 'es' : ''}
            </span>
          )}
          {legacyMode && frames.filter(f => f.direction === 'RX').length > 0 && (
            <span className="text-[10px] text-text-tertiary">
              {frames.filter(f => f.direction === 'RX').length} frames
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowLog(v => !v)}
            className="p-1 rounded-lg hover:bg-elevated transition-colors text-text-tertiary">
            {showLog ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </button>
          {!legacyMode && (
            <button onClick={sendCanMessage} disabled={!isConnected} className="btn-primary text-xs px-2.5 py-1 flex items-center gap-1">
              <ArrowDownTrayIcon className="h-3 w-3" /> Send
            </button>
          )}
          <button onClick={clearLog} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
            <XCircleIcon className="h-3 w-3" /> Clear
          </button>
        </div>
      </div>

      {/* ── Frame log ── */}
      {showLog && (
        <div
          ref={logRef}
          className="bg-elevated border border-border rounded-xl p-3 overflow-y-auto overscroll-y-contain font-mono text-xs space-y-1"
          style={{ height: legacyMode ? '11rem' : '8rem' }}
        >
          {!isConnected ? (
            <span className="text-text-tertiary italic">Not connected…</span>
          ) : frames.length === 0 ? (
            <span className="text-text-tertiary italic">
              {legacyMode ? 'Waiting for CAN frames — select a bus speed above to start' : 'No messages yet'}
            </span>
          ) : frames.map((f, i) => (
            <FrameRow key={i} frame={f} matchByte={matchByte} result={result} />
          ))}
        </div>
      )}

      {/* Match legend (legacy only) */}
      {legacyMode && result.canIdLine && (
        <p className="text-[10px] text-text-tertiary mt-2 px-0.5">
          <span className="text-success font-semibold">★</span> = frame ID matches selected entry
          {result.canIdLine && ` (0x${hex(parseCanIdStr(result.canIdLine) ?? 0, 3)})`}
          {result.canByte && `, byte [${result.canByte}]`}
        </p>
      )}
    </div>
  );
}

// ── FrameRow ─────────────────────────────────────────────────────────────────

function FrameRow({
  frame,
  matchByte,
  result,
}: {
  frame: CanFrame;
  matchByte: number | null;
  result: { canValue: string; canIdLine: string; canByte: string };
}) {
  if (frame.direction === 'TX') {
    return (
      <div className="flex items-start gap-2">
        <span className="text-text-tertiary shrink-0">[{frame.timestamp}]</span>
        <span className="text-accent shrink-0 font-semibold">TX</span>
        <span className="text-text-secondary">{frame.message}</span>
      </div>
    );
  }

  // RX frame without parsed data (shouldn't happen in normal use)
  if (frame.id === undefined || frame.data === undefined) {
    return (
      <div className="flex items-start gap-2">
        <span className="text-text-tertiary shrink-0">[{frame.timestamp}]</span>
        <span className="text-success shrink-0 font-semibold">RX</span>
        <span className="text-text-secondary">{frame.message}</span>
      </div>
    );
  }

  const idHex = `0x${hex(frame.id, frame.id > 0x7FF ? 8 : 3)}`;
  const dataHex = frame.data.map(b => hex(b)).join(' ');

  // Highlight specific byte from the ABS DB entry
  let dataDisplay: React.ReactNode = <span className="text-text-primary">{dataHex}</span>;
  if (frame.isMatch && matchByte !== null && matchByte < frame.data.length) {
    const bytes = frame.data.map(hex);
    const expected = parseCanIdStr(result.canValue);
    const actual = frame.data[matchByte];
    const ok = expected !== null && actual === expected;
    dataDisplay = (
      <>
        {bytes.slice(0, matchByte).join(' ')}{bytes.slice(0, matchByte).length > 0 ? ' ' : ''}
        <span className={[
          'px-0.5 rounded',
          ok ? 'bg-success/25 text-success' : 'bg-warning/25 text-warning',
        ].join(' ')}>
          {bytes[matchByte]}
        </span>
        {bytes.slice(matchByte + 1).length > 0 ? ' ' : ''}{bytes.slice(matchByte + 1).join(' ')}
      </>
    );
  }

  return (
    <div className={[
      'flex items-start gap-2 rounded px-1',
      frame.isMatch ? 'bg-success/5 ring-1 ring-success/20' : '',
    ].join(' ')}>
      <span className="text-text-tertiary shrink-0">[{frame.timestamp}]</span>
      {frame.isMatch
        ? <span className="text-success shrink-0 font-bold">★ RX</span>
        : <span className="text-text-tertiary shrink-0">   RX</span>
      }
      <span className={['shrink-0 font-semibold w-14', frame.isMatch ? 'text-success' : 'text-text-secondary'].join(' ')}>
        {idHex}
      </span>
      <span className="text-text-tertiary shrink-0">DLC:{frame.dlc}</span>
      <span className="font-mono">{dataDisplay}</span>
      {frame.isMatch && frame.matchByteValue !== undefined && (
        <span className="ml-auto text-[10px] text-success shrink-0">
          [{result.canByte}]={hex(frame.matchByteValue)}
          {parseCanIdStr(result.canValue) !== null
            && frame.matchByteValue === parseCanIdStr(result.canValue)
            ? ' ✓' : ' ?'}
        </span>
      )}
    </div>
  );
}
