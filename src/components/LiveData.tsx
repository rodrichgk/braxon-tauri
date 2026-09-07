/* ── Live data (measured values) ──────────────────────────────
   Polls a ReadDataBy… service inside the held diagnostic session and decodes
   the response bytes into named signals.

     KWP2000  21 <LID>          -> 61 <LID> <data…>
     UDS      22 <DID hi lo>    -> 62 <DID> <data…>
     OBD-II   01 <PID>          -> 41 <PID> <data…>

   The MK61 / Renault ABS layout isn't in any DB, so this is discovery-first:
   sweep the LIDs to see what answers, watch the raw bytes move while you feed
   a wheel-speed signal in, then pin the offsets as signals. Signal maps are
   saved per (ABS ref | family) + request, so they stick. ─────────────────── */

import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChartBarIcon, PlayIcon, StopIcon, TrashIcon, PlusIcon, BoltIcon,
  ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { isoTpRequest } from '@/lib/isotp';
import { type Protocol } from '@/lib/ecu';
import { builtinLiveFor, type LivePreset } from '@/lib/builtinLiveSignals';
import { decodeVwMeasuringBlock } from '@/lib/vwKwp';

type Svc = '21' | '22' | '01' | 'can';

interface Signal {
  id: string;
  name: string;
  offset: number;   // byte index into the payload (21/22/01: incl. the 61/62/41 header; CAN: raw frame)
  length: 1 | 2;
  signed: boolean;
  scale: number;
  add: number;
  unit: string;
}

const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const keyFor = (unit: string, svc: Svc, id: string) => `braxon.livedata.${unit}.${svc}${id.toUpperCase()}`;

interface SweepRow { id: number; len: number; nrc?: number }

interface Props {
  isConnected: boolean;
  send: (msg: string) => Promise<boolean | void>;
  sendId: number | null;
  recvId: number | null;
  protocol: Protocol;
  absRef?: string;
  family?: string | null;
  /** Guarantees the diagnostic session is open before a request goes out. */
  prepareSession: () => Promise<{ ok: boolean; detail?: string }>;
  /**
   * VW TP2.0 units: a request sender bound to the held channel. When set, Live
   * Data runs in "measuring block" mode — `21 <block>` through the channel,
   * decoded by the VW formula table (no ISO-TP session, no manual addressing).
   */
  vwRequest?: ((data: number[]) => Promise<{ payload: number[] } | null>) | null;
}

const POLL_MS = 300;

const svcReqSid = (s: Svc): number => (s === '01' ? 0x01 : parseInt(s, 16));
const hx = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

/** `"302 8 255 0 …"` (Nano/Kvaser text frame) → data bytes for `wantId`, or null. */
function frameData(line: string, wantId: number): number[] | null {
  const p = line.trim().split(/\s+/);
  if (p.length < 3) return null;
  const id = parseInt(p[0], 10);
  const dlc = parseInt(p[1], 10);
  if (id !== wantId || isNaN(dlc)) return null;
  const out: number[] = [];
  for (let i = 2; i < 2 + dlc && i < p.length; i++) out.push(parseInt(p[i], 10) || 0);
  return out;
}

function readVal(payload: number[], s: Signal): number | null {
  if (s.offset + s.length > payload.length) return null;
  let v = 0;
  for (let k = 0; k < s.length; k++) v = (v << 8) | payload[s.offset + k];
  if (s.signed && s.length === 1 && v >= 0x80) v -= 0x100;
  if (s.signed && s.length === 2 && v >= 0x8000) v -= 0x10000;
  return v * s.scale + s.add;
}

function fmt(n: number): string {
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1 || !Number.isInteger(n))) return n.toFixed(2);
  return String(Math.round(n));
}

export default function LiveData({
  isConnected, send, sendId, recvId, protocol, absRef, family, prepareSession, vwRequest,
}: Props) {
  const vwMode = !!vwRequest;
  const vwReqRef = useRef(vwRequest);
  vwReqRef.current = vwRequest;
  const [open, setOpen]       = useState(false);
  const [svc, setSvc]         = useState<Svc>(protocol === 'OBD2' ? '01' : '21');
  const [idHex, setIdHex]     = useState('01');
  const [polling, setPolling] = useState(false);
  const [payload, setPayload] = useState<number[] | null>(null);
  const [err, setErr]         = useState('');
  const [signals, setSignals] = useState<Signal[]>([]);

  const [sweepOpen, setSweepOpen]     = useState(false);
  const [sweepFrom, setSweepFrom]     = useState('01');
  const [sweepTo, setSweepTo]         = useState('40');
  const [sweeping, setSweeping]       = useState(false);
  const [sweepDone, setSweepDone]     = useState(0);
  const [sweepRows, setSweepRows]     = useState<SweepRow[]>([]);
  const sweepCancel = useRef(false);

  const sendRef = useRef(send);
  sendRef.current = send;
  const prepRef = useRef(prepareSession);
  prepRef.current = prepareSession;

  const unit = absRef || family || 'generic';
  const isCan = svc === 'can';
  const ready = vwMode ? isConnected : (isCan ? isConnected : (isConnected && sendId !== null && recvId !== null));
  const storeKey = keyFor(unit, vwMode ? 'vw' as Svc : svc, idHex);
  const presets = vwMode ? [] : builtinLiveFor(family);

  // Load / save signal map for the current (unit + request) key.
  useEffect(() => {
    setPolling(false);
    setPayload(null);
    setErr('');
    try {
      const raw = localStorage.getItem(storeKey);
      setSignals(raw ? (JSON.parse(raw) as Signal[]) : []);
    } catch { setSignals([]); }
  }, [storeKey]);

  const persist = useCallback((next: Signal[]) => {
    setSignals(next);
    try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* ignore */ }
  }, [storeKey]);

  const applyPreset = useCallback((p: LivePreset, autoOpen: boolean) => {
    const key = keyFor(unit, p.service, p.id);
    let saved: Signal[] | null = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) saved = JSON.parse(raw) as Signal[];
    } catch { /* ignore */ }
    const sigs = saved ?? p.signals.map(s => ({ ...s, id: rid() }));
    if (!saved) { try { localStorage.setItem(key, JSON.stringify(sigs)); } catch { /* ignore */ } }
    setSvc(p.service);
    setIdHex(p.id.toUpperCase());
    setSignals(sigs);
    if (autoOpen && !saved) setOpen(true);
  }, [unit]);

  // Auto-apply the family's preset when the ABS ref resolves — unless the
  // operator has already saved a map for it.
  const autoAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!presets.length) return;
    if (autoAppliedRef.current === unit) return;
    autoAppliedRef.current = unit;
    applyPreset(presets[0], true);
  }, [unit, presets, applyPreset]);

  const idBytes = useCallback((): number[] => {
    const n = parseInt(idHex.replace(/[^0-9a-fA-F]/g, ''), 16) || 0;
    // 22 takes a 2-byte DID (so "01" -> 00 01, "F190" -> F1 90); 21 / 01 a single byte.
    return svc === '22' ? [(n >> 8) & 0xff, n & 0xff] : [n & 0xff];
  }, [idHex, svc]);

  const requestOnce = useCallback(async (): Promise<number[] | null> => {
    if (vwReqRef.current) {
      const block = parseInt(idHex.replace(/[^0-9a-fA-F]/g, ''), 16) & 0xff || 1;
      const r = await vwReqRef.current([0x21, block]);
      return r ? r.payload : null;
    }
    if (sendId === null || recvId === null) return null;
    const sid = svcReqSid(svc);
    const res = await isoTpRequest({
      send: (m) => sendRef.current(m),
      sendId,
      recvIds: [recvId],
      data: [sid, ...idBytes()],
      timeoutMs: 800,
      accept: (p) => p[0] === (sid + 0x40) || (p[0] === 0x7f && p[1] === sid),
    });
    return res ? res.payload : null;
  }, [svc, idBytes, sendId, recvId, idHex]);

  // CAN broadcast source — passively decode a frame off the monitor stream.
  useEffect(() => {
    if (!isCan || !polling || !isConnected) return;
    const wantId = parseInt(idHex.replace(/[^0-9a-fA-F]/g, ''), 16) || 0;
    let latest: number[] | null = null;
    setErr('');
    const onLine = (line: string) => {
      const d = frameData(line, wantId);
      if (d) latest = d;
    };
    const subs = (['serial-data', 'kvaser-data'] as const).map(ev =>
      listen<string>(ev, e => onLine(e.payload)),
    );
    const iv = setInterval(() => {
      if (latest) { setPayload(latest); latest = null; }
    }, 150);
    return () => { subs.forEach(s => s.then(u => u())); clearInterval(iv); };
  }, [isCan, polling, isConnected, idHex]);

  // Poll loop — recursive setTimeout so requests never overlap.
  useEffect(() => {
    if (isCan || !polling || !ready) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (!alive) return;
      const p = await requestOnce();
      if (!alive) return;
      if (!p) setErr('no response');
      else if (p[0] === 0x7f) setErr(`negative — 7F ${hx(p[1])} ${hx(p[2] ?? 0)}`);
      else { setErr(''); setPayload(p); }
      timer = setTimeout(tick, POLL_MS);
    };

    (async () => {
      if (!vwMode) {
        const gate = await prepRef.current();
        if (!alive) return;
        if (!gate.ok) { setErr(gate.detail || 'session not open'); setPolling(false); return; }
      }
      tick();
    })();

    return () => { alive = false; clearTimeout(timer); };
  }, [polling, ready, requestOnce, vwMode]);

  const runSweep = async () => {
    if (!ready || sweeping) return;
    const from = Math.max(0, parseInt(sweepFrom, 16) || 0);
    const to   = Math.min(0xff, parseInt(sweepTo, 16) || 0);
    if (to < from) return;
    setPolling(false);
    sweepCancel.current = false;
    setSweeping(true);
    setSweepRows([]);
    setSweepDone(0);

    if (!vwMode) {
      const gate = await prepRef.current();
      if (!gate.ok) { setErr(gate.detail || 'session not open'); setSweeping(false); return; }
    }

    const sid = svcReqSid(svc);
    const rows: SweepRow[] = [];
    for (let id = from; id <= to; id++) {
      if (sweepCancel.current) break;
      if (vwReqRef.current) {
        const r = await vwReqRef.current([0x21, id]);
        if (r && r.payload[0] === 0x61) { rows.push({ id, len: r.payload.length }); setSweepRows([...rows]); }
        else if (r && r.payload[0] === 0x7f && r.payload[2] !== 0x31 && r.payload[2] !== 0x11) { rows.push({ id, len: 0, nrc: r.payload[2] }); setSweepRows([...rows]); }
        setSweepDone(id - from + 1);
        continue;
      }
      const res = await isoTpRequest({
        send: (m) => sendRef.current(m),
        sendId: sendId!, recvIds: [recvId!],
        // 22 sweeps DIDs 0x0000–0x00FF (low byte); 21 / 01 sweep the single id byte.
        data: svc === '22' ? [sid, 0x00, id] : [sid, id],
        timeoutMs: 250,
        waitForPending: false,
        accept: (p) => p[0] === (sid + 0x40) || (p[0] === 0x7f && p[1] === sid),
      });
      if (res && res.payload[0] === sid + 0x40) {
        rows.push({ id, len: res.payload.length });
        setSweepRows([...rows]);
      } else if (res && res.payload[0] === 0x7f && res.payload[2] !== 0x11 && res.payload[2] !== 0x31) {
        rows.push({ id, len: 0, nrc: res.payload[2] });
        setSweepRows([...rows]);
      }
      setSweepDone(id - from + 1);
    }
    setSweeping(false);
  };

  const addSignal = (offset = 0) => persist([
    ...signals,
    { id: rid(), name: `Signal ${signals.length + 1}`, offset, length: 1, signed: false, scale: 1, add: 0, unit: '' },
  ]);
  const patchSignal = (id: string, p: Partial<Signal>) =>
    persist(signals.map(s => (s.id === id ? { ...s, ...p } : s)));
  const removeSignal = (id: string) => persist(signals.filter(s => s.id !== id));

  const sweepTotal = Math.max(1, (parseInt(sweepTo, 16) || 0) - (parseInt(sweepFrom, 16) || 0) + 1);

  return (
    <div className="mb-3 border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-elevated hover:bg-app/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChartBarIcon className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
          <span className="text-[11px] font-semibold text-text-primary shrink-0">Live Data</span>
          {polling && <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />}
          {(presets.length > 0 || vwMode) && (
            <span className="text-[9px] font-semibold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded shrink-0">
              {vwMode ? 'VAG TP2.0' : family}
            </span>
          )}
          <span className="text-[10px] text-text-tertiary truncate">
            {vwMode ? `Measuring block ${parseInt(idHex, 16) || 1}` : isCan ? `CAN 0x${idHex.toUpperCase()}` : `${svc} ${idHex.toUpperCase()}`}
            {!vwMode && signals.length ? ` · ${signals.length} signal${signals.length !== 1 ? 's' : ''}` : ''}
          </span>
        </div>
        {open ? <ChevronUpIcon className="w-3.5 h-3.5 text-text-tertiary shrink-0" /> : <ChevronDownIcon className="w-3.5 h-3.5 text-text-tertiary shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-2 space-y-3">

              {!ready && (
                <p className="text-[10px] text-warning bg-warning/5 border border-warning/20 rounded-lg px-2 py-1.5">
                  Set an ABS reference / request ID and connect the interface first.
                </p>
              )}

              {/* Preset quick-apply */}
              {presets.map((p, i) => (
                <button
                  key={i}
                  onClick={() => applyPreset(p, true)}
                  className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-colors"
                >
                  <BoltIcon className="w-3 h-3" />
                  {family} preset — {p.label}
                </button>
              ))}

              {/* Request row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {vwMode ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-text-tertiary">Block</span>
                    <input
                      value={parseInt(idHex, 16) || 1}
                      onChange={e => {
                        const n = Math.max(1, Math.min(0xff, parseInt(e.target.value, 10) || 1));
                        setIdHex(n.toString(16).toUpperCase().padStart(2, '0'));
                      }}
                      type="number" min={1} max={255}
                      className="w-14 input-field !py-1 text-xs text-center"
                    />
                  </div>
                ) : (
                  <div className="flex gap-0.5 p-0.5 bg-app rounded-lg">
                    {(['21', '22', '01', 'can'] as Svc[]).map(s => (
                      <button
                        key={s}
                        onClick={() => setSvc(s)}
                        className={[
                          'px-2 py-0.5 text-[10px] font-semibold rounded-md transition-colors',
                          svc === s ? 'bg-elevated text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary',
                        ].join(' ')}
                      >
                        {s === '21' ? '21 KWP' : s === '22' ? '22 UDS' : s === '01' ? '01 OBD' : 'CAN'}
                      </button>
                    ))}
                  </div>
                )}
                {!vwMode && (
                <input
                  value={idHex}
                  onChange={e => setIdHex(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, svc === '22' ? 4 : svc === 'can' ? 3 : 2))}
                  placeholder={svc === '22' ? 'DID' : svc === 'can' ? 'CAN ID' : 'ID'}
                  className="w-16 input-field !py-1 font-mono text-xs text-center uppercase"
                />
                )}
                <button
                  onClick={() => setPolling(v => !v)}
                  disabled={!ready}
                  className={[
                    'flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border transition-colors disabled:opacity-40',
                    polling ? 'text-danger bg-danger/10 border-danger/25' : 'text-accent hover:bg-accent/10 border-accent/30',
                  ].join(' ')}
                >
                  {polling
                    ? <><StopIcon className="w-3 h-3" />Stop</>
                    : <><PlayIcon className="w-3 h-3" />{isCan ? 'Watch' : 'Read'}</>}
                </button>
                {!isCan && (
                  <button
                    onClick={() => setSweepOpen(v => !v)}
                    className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-border text-text-secondary hover:bg-app transition-colors"
                  >
                    <MagnifyingGlassIcon className="w-3 h-3" />
                    Sweep IDs
                  </button>
                )}
              </div>

              {err && <p className="text-[10px] text-danger">{err}</p>}

              {/* VW measuring block — formula-decoded, read-only */}
              {vwMode && payload && payload[0] === 0x61 && (() => {
                const mb = decodeVwMeasuringBlock(payload);
                if (!mb) return null;
                return (
                  <div className="flex flex-wrap gap-2">
                    {mb.values.map((v, i) => (
                      <div key={i} className="px-2 py-1 rounded-lg bg-app border border-border">
                        <div className="text-[9px] text-text-tertiary">field {i + 1}</div>
                        <div className="text-[12px] font-semibold text-text-primary font-mono">
                          {typeof v.value === 'number' ? (+v.value.toFixed(2)) : v.value}
                          {v.unit && v.unit !== '' && <span className="text-[10px] text-text-tertiary ml-1">{v.unit}</span>}
                        </div>
                      </div>
                    ))}
                    {mb.values.length === 0 && <span className="text-[10px] text-text-tertiary">block {mb.slot}: no fields</span>}
                  </div>
                );
              })()}

              {/* Raw bytes — click one to pin a signal at that offset */}
              {payload && (
                <div>
                  <p className="text-[9px] text-text-tertiary mb-1">
                    {isCan ? `Frame 0x${idHex.toUpperCase()}` : 'Response'} ({payload.length} bytes) — click a byte to add a signal
                  </p>
                  <div className="flex flex-wrap gap-x-1 gap-y-0.5 font-mono text-[10px] bg-app border border-border rounded-lg p-2">
                    {payload.map((b, i) => (
                      <button
                        key={i}
                        onClick={() => addSignal(i)}
                        title={`offset ${i}`}
                        className={[
                          'px-0.5 rounded hover:bg-accent/20 transition-colors',
                          i < (isCan ? 0 : svc === '22' ? 3 : 2) ? 'text-text-tertiary' : 'text-text-primary',
                        ].join(' ')}
                      >
                        {hx(b)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Signal table */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-text-secondary">Signals</span>
                  <button
                    onClick={() => addSignal()}
                    className="flex items-center gap-1 text-[10px] text-accent hover:bg-accent/10 border border-accent/30 rounded-lg px-1.5 py-0.5"
                  >
                    <PlusIcon className="w-3 h-3" />add
                  </button>
                </div>

                {signals.length === 0 && (
                  <p className="text-[10px] text-text-tertiary">
                    No signals mapped. Read a response, click bytes to pin them, then set scale / unit.
                  </p>
                )}

                {signals.map(s => {
                  const v = payload ? readVal(payload, s) : null;
                  return (
                    <div key={s.id} className="flex items-center gap-1 text-[10px]">
                      <input
                        value={s.name}
                        onChange={e => patchSignal(s.id, { name: e.target.value })}
                        className="flex-1 min-w-0 input-field !py-0.5 !text-[10px]"
                      />
                      <input
                        type="number" value={s.offset} title="byte offset"
                        onChange={e => patchSignal(s.id, { offset: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        className="w-10 input-field !py-0.5 !text-[10px] text-center"
                      />
                      <select
                        value={s.length} title="length"
                        onChange={e => patchSignal(s.id, { length: Number(e.target.value) as 1 | 2 })}
                        className="input-field !py-0.5 !text-[10px] bg-app"
                      >
                        <option value={1}>1B</option>
                        <option value={2}>2B</option>
                      </select>
                      <button
                        onClick={() => patchSignal(s.id, { signed: !s.signed })}
                        title="signed"
                        className={['px-1 py-0.5 rounded border text-[10px]', s.signed ? 'border-accent/40 text-accent' : 'border-border text-text-tertiary'].join(' ')}
                      >
                        ±
                      </button>
                      <input
                        type="number" step="any" value={s.scale} title="× scale"
                        onChange={e => patchSignal(s.id, { scale: parseFloat(e.target.value) || 0 })}
                        className="w-14 input-field !py-0.5 !text-[10px] text-center"
                      />
                      <input
                        type="number" step="any" value={s.add} title="+ offset"
                        onChange={e => patchSignal(s.id, { add: parseFloat(e.target.value) || 0 })}
                        className="w-12 input-field !py-0.5 !text-[10px] text-center"
                      />
                      <input
                        value={s.unit} placeholder="unit"
                        onChange={e => patchSignal(s.id, { unit: e.target.value })}
                        className="w-12 input-field !py-0.5 !text-[10px]"
                      />
                      <span className="w-16 text-right font-mono font-semibold text-text-primary shrink-0">
                        {v === null ? '—' : `${fmt(v)}${s.unit ? ` ${s.unit}` : ''}`}
                      </span>
                      <button onClick={() => removeSignal(s.id)} className="text-text-tertiary hover:text-danger shrink-0">
                        <TrashIcon className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* ID sweep */}
              <AnimatePresence>
                {sweepOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border pt-2 space-y-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-text-tertiary">Try {svc}</span>
                        <input value={sweepFrom} onChange={e => setSweepFrom(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 2))}
                          className="w-12 input-field !py-0.5 font-mono text-[10px] text-center uppercase" />
                        <span className="text-[10px] text-text-tertiary">to</span>
                        <input value={sweepTo} onChange={e => setSweepTo(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 2))}
                          className="w-12 input-field !py-0.5 font-mono text-[10px] text-center uppercase" />
                        {sweeping ? (
                          <button onClick={() => { sweepCancel.current = true; }}
                            className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-danger/25 text-danger bg-danger/10">
                            <StopIcon className="w-3 h-3" />Stop ({sweepDone}/{sweepTotal})
                          </button>
                        ) : (
                          <button onClick={runSweep} disabled={!ready}
                            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 disabled:opacity-40">
                            <MagnifyingGlassIcon className="w-3 h-3" />Run
                          </button>
                        )}
                      </div>
                      {sweepRows.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {sweepRows.map(r => (
                            <button
                              key={r.id}
                              onClick={() => { setIdHex(hx(r.id)); setSweepOpen(false); }}
                              className={[
                                'text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors',
                                r.nrc === undefined
                                  ? 'border-success/30 text-success hover:bg-success/10'
                                  : 'border-border text-text-tertiary hover:bg-app',
                              ].join(' ')}
                              title={r.nrc === undefined ? `${r.len} bytes` : `7F ${svc} ${hx(r.nrc)}`}
                            >
                              {hx(r.id)}{r.nrc === undefined ? ` (${r.len})` : ' ✗'}
                            </button>
                          ))}
                        </div>
                      )}
                      {!sweeping && sweepDone > 0 && sweepRows.filter(r => r.nrc === undefined).length === 0 && (
                        <p className="text-[10px] text-text-tertiary">Nothing answered positively in that range.</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
