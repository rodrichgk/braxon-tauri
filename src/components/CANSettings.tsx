
import { useState, useEffect, useRef, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { SignalIcon, ArrowDownTrayIcon, XCircleIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useAppSettings } from '@/contexts/AppSettingsContext';

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface RawField { label: string; name: string; value: string; ph: string; }

interface CanFrame {
  /** monotonically increasing — a stable React key for the sliding window */
  seq: number;
  timestamp: string;
  direction: 'TX' | 'RX';
  /** formatted display string for TX or unparsed lines */
  message?: string;
  /** CAN arbitration ID (present for parsed RX frames) */
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
  /** Passive bus monitor only: the legacy-style frame log + activity light,
   *  no CAN-speed selector, no raw-send fields, no NANO badge. Works on both
   *  transports (listens serial-data + kvaser-data). The card also becomes a
   *  flex column so the frame log fills whatever height it's given. */
  monitorOnly?: boolean;
  /** Extra classes on the root card (e.g. `h-full` to fill a grid column). */
  className?: string;
}

// The Nano firmware receives the literal kbps value: 250, 500, or 1000.
const LEGACY_SPEEDS = [
  { label: '250 kbps', cmd: 250  },
  { label: '500 kbps', cmd: 500  },
  { label: '1 Mbps',   cmd: 1000 },
];

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function CANSettings({
  result,
  isConnected,
  sendMessage,
  legacyMode = false,
  monitorOnly = false,
  className = '',
}: CANSettingsProps) {
  const { legacyCanSpeed, setLegacyCanSpeed, legacySensorType, legacyFreq } = useAppSettings();
  const { t } = useTranslation();

  // Whether to render the frame-log monitor (legacy mode, or an explicit
  // monitor-only panel on the Pico/Kvaser path).
  const monitor = legacyMode || monitorOnly;

  const [canData, setCanData] = useState({
    speed: result.canSpeed,
    byte:  result.canByte,
    idLine: result.canIdLine,
    value:  result.canValue,
  });
  const [frames, setFrames] = useState<CanFrame[]>([]);
  const [showLog, setShowLog] = useState(true);
  const [matchCount, setMatchCount] = useState(0);
  const [hasCan, setHasCan] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const MAX_FRAMES = 200;
  // A busy CAN bus is hundreds of frames/sec — buffer them and flush to state a
  // few times a second so the list isn't re-rendered on every single frame.
  const pendingRef     = useRef<CanFrame[]>([]);
  const matchTotalRef  = useRef(0);
  const lastFrameAtRef = useRef(0);
  const frameSeqRef    = useRef(0);

  // Stable refs so interval/timeout callbacks never see stale values
  const hasCanRef      = useRef(false);
  const prevHasCanRef  = useRef(false);
  const sendMsgRef     = useRef(sendMessage);
  const sensorTypeRef  = useRef(legacySensorType);
  const freqRef        = useRef(legacyFreq);
  hasCanRef.current    = hasCan;
  sendMsgRef.current   = sendMessage;
  sensorTypeRef.current = legacySensorType;
  freqRef.current      = legacyFreq;

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

  // Auto-scroll — but leave the user alone if they've scrolled up to inspect.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) {
      el.scrollTop = el.scrollHeight;
    }
  }, [frames]);

  // Monitor: listen to bus frames, buffer them (no render per frame).
  useEffect(() => {
    if (!monitor) return;
    const onLine = (line: string) => {
      const parsed = parseNanoFrame(line);
      if (!parsed) return; // not a CAN frame (e.g. "Freq : 12.3" or "init")

      lastFrameAtRef.current = Date.now();

      const isMatch = matchId !== null && parsed.id === matchId;
      const matchByteValue =
        isMatch && matchByte !== null && matchByte < parsed.data.length
          ? parsed.data[matchByte]
          : undefined;

      if (isMatch) matchTotalRef.current += 1;

      pendingRef.current.push({
        seq: frameSeqRef.current++,
        timestamp: ts(),
        direction: 'RX',
        id: parsed.id,
        dlc: parsed.dlc,
        data: parsed.data,
        isMatch,
        matchByteValue,
      });
      // Don't let the buffer grow without bound if a flush is ever missed.
      if (pendingRef.current.length > MAX_FRAMES * 3) {
        pendingRef.current.splice(0, pendingRef.current.length - MAX_FRAMES);
      }
    };
    // Board bridge and Kvaser interface print frames identically.
    const subs = (['serial-data', 'kvaser-data'] as const).map(evt =>
      listen<string>(evt, e => onLine(e.payload))
    );
    return () => { subs.forEach(s => s.then(u => u())); };
  }, [monitor, matchId, matchByte]);

  // Flush the buffer to state ~7×/sec.
  useEffect(() => {
    if (!monitor) return;
    const iv = setInterval(() => {
      if (pendingRef.current.length) {
        const batch = pendingRef.current;
        pendingRef.current = [];
        setFrames(prev => (prev.length + batch.length > MAX_FRAMES
          ? [...prev, ...batch].slice(-MAX_FRAMES)
          : [...prev, ...batch]));
      }
      setMatchCount(matchTotalRef.current);
      setHasCan(Date.now() - lastFrameAtRef.current < 2000);
    }, 150);
    return () => clearInterval(iv);
  }, [monitor]);

  // Retry CAN speed every second while no CAN frames are arriving
  useEffect(() => {
    if (!legacyMode || !isConnected || legacyCanSpeed === null) return;
    const iv = setInterval(() => {
      if (!hasCanRef.current) {
        sendMsgRef.current?.(`CANSpeed : ${legacyCanSpeed}\n`);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [legacyMode, isConnected, legacyCanSpeed]);

  // When CAN goes from inactive â†’ active, wait 300 ms then resend the sensor waveform
  useEffect(() => {
    if (!legacyMode) { prevHasCanRef.current = false; return; }
    if (hasCan && !prevHasCanRef.current) {
      prevHasCanRef.current = true;
      const type = sensorTypeRef.current;
      const t = setTimeout(() => {
        if (type > 0) {
          sendMsgRef.current?.(`Waveform : ${type},${freqRef.current}\n`);
        }
      }, 300);
      return () => clearTimeout(t);
    }
    if (!hasCan) prevHasCanRef.current = false;
  }, [hasCan, legacyMode]);

  // Pico settings mode: send handshake ping (not in the passive monitor)
  useEffect(() => {
    if (legacyMode || monitorOnly || !isConnected || !sendMessage) return;
    const t = setTimeout(() => sendMessage('t\n'), 1000);
    return () => clearTimeout(t);
  }, [legacyMode, monitorOnly, isConnected, sendMessage]);

  const addTx = (msg: string) => {
    setFrames(prev => {
      const frame: CanFrame = { seq: frameSeqRef.current++, timestamp: ts(), direction: 'TX', message: msg };
      return prev.length >= MAX_FRAMES ? [...prev.slice(1), frame] : [...prev, frame];
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

  const clearLog = () => {
    pendingRef.current = [];
    matchTotalRef.current = 0;
    setFrames([]);
    setMatchCount(0);
  };

  const picoFields: RawField[] = [
    { label: 'CAN Speed', name: 'speed',  value: canData.speed,  ph: '500kbps' },
    { label: 'CAN Byte',  name: 'byte',   value: canData.byte,   ph: '8'      },
    { label: 'CAN ID',    name: 'idLine', value: canData.idLine, ph: '0x7E0'  },
    { label: 'CAN Value', name: 'value',  value: canData.value,  ph: '0xFF'   },
  ];

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className={['card', className].filter(Boolean).join(' ')}>
      {/* Header */}
      <h2 className="card-header flex items-center gap-2 shrink-0">
        <SignalIcon className="h-4 w-4 text-text-tertiary" />
        {monitor ? t('can.monitor') : t('can.settings')}

        {/* CAN activity indicator */}
        <span
          title={
            hasCan
              ? t('can.active')
              : legacyCanSpeed !== null
              ? t('can.no_can')
              : t('can.not_started')
          }
          className={[
            'w-2.5 h-2.5 rounded-full transition-colors',
            hasCan
              ? 'bg-success animate-pulse-slow'
              : legacyCanSpeed !== null
              ? 'bg-danger animate-pulse-slow'
              : 'bg-text-tertiary/40',
          ].join(' ')}
        />

        {legacyMode && (
          <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-warning/15 text-warning border border-warning/20">
            NANO
          </span>
        )}
      </h2>

      {/* â”€â”€ Legacy mode: CAN speed selector (Nano only) â”€â”€ */}
      {legacyMode && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-text-secondary">{t('can.bus_speed')}</span>
            {legacyCanSpeed !== null && (
              <button
                onClick={() => setLegacyCanSpeed(null)}
                disabled={!isConnected}
                className="text-[10px] text-danger hover:text-danger/80 disabled:opacity-40 transition-colors"
              >
                {t('can.stop_can')}
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
      )}

      {/* â”€â”€ Pico settings mode: 4 text fields (not in the passive monitor) â”€â”€ */}
      {!legacyMode && !monitorOnly && (
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

      {/* â”€â”€ Toolbar row â”€â”€ */}
      <div className="flex items-center justify-between mb-3 gap-2 shrink-0">
        {/* Status */}
        <div className="flex items-center gap-2 text-xs">
          <span className={['w-2 h-2 rounded-full shrink-0', isConnected ? 'bg-success' : 'bg-text-tertiary'].join(' ')} />
          <span className={isConnected ? 'text-success' : 'text-text-tertiary'}>
            {isConnected ? t('common.connected') : t('common.not_connected')}
          </span>
          {monitor && matchCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-success/15 text-success border border-success/20 font-semibold">
              {matchCount} {matchCount !== 1 ? t('can.matches') : t('can.match')}
            </span>
          )}
          {monitor && frames.filter(f => f.direction === 'RX').length > 0 && (
            <span className="text-[10px] text-text-tertiary">
              {frames.filter(f => f.direction === 'RX').length} {t('can.frames')}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {!monitorOnly && (
            <button onClick={() => setShowLog(v => !v)}
              className="p-1 rounded-lg hover:bg-elevated transition-colors text-text-tertiary">
              {showLog ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
            </button>
          )}
          {!legacyMode && !monitorOnly && (
            <button onClick={sendCanMessage} disabled={!isConnected} className="btn-primary text-xs px-2.5 py-1 flex items-center gap-1">
              <ArrowDownTrayIcon className="h-3 w-3" /> Send
            </button>
          )}
          <button onClick={clearLog} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
            <XCircleIcon className="h-3 w-3" /> Clear
          </button>
        </div>
      </div>

      {/* â”€â”€ Frame log â”€â”€ */}
      {(showLog || monitorOnly) && (
        <div
          ref={logRef}
          className={[
            'bg-elevated border border-border rounded-xl p-3 overflow-y-auto overscroll-y-contain font-mono text-xs space-y-1',
            monitorOnly ? 'h-[calc(100vh-24rem)] min-h-[16rem] max-h-[42rem]' : '',
          ].join(' ')}
          style={monitorOnly ? undefined : { height: monitor ? '11rem' : '8rem' }}
        >
          {!isConnected ? (
            <span className="text-text-tertiary italic">{t('common.not_connected')}…</span>
          ) : frames.length === 0 ? (
            <span className="text-text-tertiary italic">
              {monitor ? t('can.waiting') : t('can.no_messages')}
            </span>
          ) : frames.map(f => (
            <FrameRow
              key={f.seq}
              frame={f}
              matchByte={matchByte}
              matchValue={result.canValue}
              matchByteLabel={result.canByte}
            />
          ))}
        </div>
      )}

      {/* Match legend (monitor only) */}
      {monitor && result.canIdLine && (
        <p className="text-[10px] text-text-tertiary mt-2 px-0.5 shrink-0">
          <span className="text-success font-semibold">Highlighted</span> = frame ID matches selected entry
          {result.canIdLine && ` (0x${hex(parseCanIdStr(result.canIdLine) ?? 0, 3)})`}
          {result.canByte && `, byte [${result.canByte}]`}
        </p>
      )}
    </div>
  );
}

// â”€â”€ FrameRow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// memo + primitive props so a re-render of the parent doesn't re-render every
// row — only genuinely new/changed rows repaint.
const FrameRow = memo(function FrameRow({
  frame,
  matchByte,
  matchValue,
  matchByteLabel,
}: {
  frame: CanFrame;
  matchByte: number | null;
  matchValue: string;
  matchByteLabel: string;
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
    const expected = parseCanIdStr(matchValue);
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
        ? <span className="text-success shrink-0 font-bold">&#9656; RX</span>
        : <span className="text-text-tertiary shrink-0 pl-2.5">RX</span>
      }
      <span className={['shrink-0 font-semibold w-14', frame.isMatch ? 'text-success' : 'text-text-secondary'].join(' ')}>
        {idHex}
      </span>
      <span className="text-text-tertiary shrink-0">DLC:{frame.dlc}</span>
      <span className="font-mono">{dataDisplay}</span>
      {frame.isMatch && frame.matchByteValue !== undefined && (
        <span className="ml-auto text-[10px] text-success shrink-0">
          [{matchByteLabel}]={hex(frame.matchByteValue)}
          {parseCanIdStr(matchValue) !== null
            && frame.matchByteValue === parseCanIdStr(matchValue)
            ? ' âœ“' : ' ?'}
        </span>
      )}
    </div>
  );
});
