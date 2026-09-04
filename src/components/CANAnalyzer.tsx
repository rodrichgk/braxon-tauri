
import { useState, useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { BeakerIcon, ChevronDownIcon, ChevronUpIcon, XCircleIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import type { WSSChannels } from '@/contexts/AppSettingsContext';
import { WHEEL_LABELS } from '@/contexts/AppSettingsContext';

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface IDStats {
  id: number;
  count: number;
  dlc: number;
  lastData: number[];
  prevData: number[];
  timestamps: number[];
}

interface Sample { hz: number; value: number }

interface Fit {
  slope: number;
  intercept: number;
  r2: number;
  n: number;
}

interface CANAnalyzerProps {
  result: { canIdLine: string; canByte: string; canValue: string; canSpeed: string };
}

// â”€â”€ Known ID hints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ID_HINTS: Record<number, string> = {
  0x0C0: 'Wheel speeds â€” Continental/Teves',
  0x0E4: 'ABS status â€” Continental/Teves',
  0x1A0: 'Wheel speeds â€” Bosch ESP',
  0x1E0: 'ABS/ESP status â€” Bosch',
  0x360: 'ABS â€” some VW/Audi/PSA',
  0x3B4: 'ABS status â€” some VW/Audi',
  0x1F4: 'ABS â€” some Ford/PSA',
  0x284: 'Vehicle speed â€” Toyota/common',
  0x4B0: 'Wheel speed â€” some BMW',
};

// â”€â”€ Math helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function parseCanIdStr(s: string): number | null {
  if (!s) return null;
  s = s.trim();
  if (s.startsWith('0x') || s.startsWith('0X')) {
    const n = parseInt(s.slice(2), 16);
    return isNaN(n) ? null : n;
  }
  const dec = parseInt(s, 10);
  if (!isNaN(dec)) return dec;
  const hx = parseInt(s, 16);
  return isNaN(hx) ? null : hx;
}

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

function h(n: number, pad = 2) { return n.toString(16).toUpperCase().padStart(pad, '0'); }
function idHex(id: number) { return `0x${h(id, id > 0x7FF ? 8 : 3)}`; }

function calcRate(timestamps: number[]): number {
  const now = Date.now();
  const recent = timestamps.filter(t => now - t < 2000);
  if (recent.length < 2) return 0;
  const span = recent[recent.length - 1] - recent[0];
  return span > 0 ? Math.round(((recent.length - 1) / (span / 1000)) * 10) / 10 : 0;
}

/**
 * Least-squares linear fit.
 * Deduplicates by Hz bucket (mean value per Hz level to avoid sampling bias).
 */
function linearFit(samples: Sample[]): Fit | null {
  const byHz = new Map<number, number[]>();
  samples.forEach(({ hz, value }) => {
    const arr = byHz.get(hz) ?? [];
    arr.push(value);
    byHz.set(hz, arr);
  });
  if (byHz.size < 3) return null;

  const pts = [...byHz.entries()].map(([hz, vals]) => ({
    x: hz,
    y: vals.reduce((a, b) => a + b, 0) / vals.length,
  }));

  const n = pts.length;
  const sx  = pts.reduce((a, p) => a + p.x, 0);
  const sy  = pts.reduce((a, p) => a + p.y, 0);
  const sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
  const sx2 = pts.reduce((a, p) => a + p.x ** 2, 0);
  const denom = n * sx2 - sx ** 2;
  if (Math.abs(denom) < 1e-10) return null;

  const slope     = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;

  const yMean = sy / n;
  const ssTot = pts.reduce((a, p) => a + (p.y - yMean) ** 2, 0);
  const ssRes = pts.reduce((a, p) => a + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2    = ssTot < 1e-10 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, r2, n };
}

function round(n: number, d = 3) { return parseFloat(n.toFixed(d)); }

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function CANAnalyzer({ result }: CANAnalyzerProps) {
  const {
    legacyFreq,
    wssChannels, setWssChannels,
    wssCalPpr: ppr, setWssCalPpr: setPpr,
    wssCalCirc: circ, setWssCalCirc: setCirc,
  } = useAppSettings();

  const [analyzerOpen, setAnalyzerOpen] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem('analyzerOpen') ?? 'false'); } catch { return false; }
  });
  const toggleAnalyzer = (next: boolean) => {
    setAnalyzerOpen(next);
    try { localStorage.setItem('analyzerOpen', JSON.stringify(next)); } catch {}
  };

  const statsRef   = useRef<Map<number, IDStats>>(new Map());
  const corrRef    = useRef<Map<string, Sample[]>>(new Map());
  const lastHzRef  = useRef<number>(-999);
  const freqRef    = useRef(legacyFreq);
  freqRef.current  = legacyFreq;

  const [, setTick]       = useState(0);
  const [expandedId, setExpandedId]     = useState<number | null>(null);
  const [showSpeedFor, setShowSpeedFor] = useState<number | null>(null);
  const [showCorr, setShowCorr]         = useState(true);
  const [totalFrames, setTotalFrames]   = useState(0);

  const matchId   = parseCanIdStr(result.canIdLine);
  const matchByte = result.canByte ? parseInt(result.canByte, 10) : null;
  const matchVal  = parseCanIdStr(result.canValue);

  // â”€â”€ Data ingestion â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleData = useCallback((line: string) => {
    const frame = parseNanoFrame(line);
    if (!frame) return;

    const now = Date.now();
    const prev = statsRef.current.get(frame.id);
    const timestamps = prev
      ? [...prev.timestamps.filter(t => now - t < 3000), now].slice(-30)
      : [now];
    statsRef.current.set(frame.id, {
      id: frame.id,
      dlc: frame.dlc,
      count: (prev?.count ?? 0) + 1,
      lastData: frame.data,
      prevData: prev?.lastData ?? frame.data,
      timestamps,
    });

    const hz = freqRef.current;
    if (hz > 0 && Math.abs(hz - lastHzRef.current) >= 1) {
      lastHzRef.current = hz;
      frame.data.forEach((value, i) => {
        const key = `${frame.id}:${i}`;
        const arr = corrRef.current.get(key) ?? [];
        corrRef.current.set(key, [...arr, { hz, value }].slice(-200));
      });
    }

    setTotalFrames(t => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    // Both transports print frames in the same `<id> <dlc> <b…>` format.
    (['serial-data', 'kvaser-data'] as const).forEach(evt => {
      listen<string>(evt, e => handleData(e.payload)).then(fn => {
        if (cancelled) fn();
        else unlisteners.push(fn);
      });
    });
    return () => { cancelled = true; unlisteners.forEach(fn => fn()); };
  }, [handleData]);

  // 5 Hz render tick
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  // â”€â”€ Derived data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const entries = [...statsRef.current.values()].sort((a, b) => {
    const am = a.id === matchId ? 1 : 0;
    const bm = b.id === matchId ? 1 : 0;
    return bm - am || b.count - a.count;
  });

  const corrFits: { key: string; id: number; byteIdx: number; fit: Fit }[] = [];
  corrRef.current.forEach((samples, key) => {
    const [idStr, byteStr] = key.split(':');
    const fit = linearFit(samples);
    if (!fit || fit.r2 < 0.80 || Math.abs(fit.slope) < 0.001) return;
    corrFits.push({ key, id: parseInt(idStr), byteIdx: parseInt(byteStr), fit });
  });
  corrFits.sort((a, b) => b.fit.r2 - a.fit.r2);

  const totalCorrSamples = [...corrRef.current.values()].reduce((a, v) => a + v.length, 0);
  const uniqueHz = new Set([...corrRef.current.values()].flatMap(arr => arr.map(s => s.hz))).size;

  const clearAll = () => {
    statsRef.current.clear();
    corrRef.current.clear();
    lastHzRef.current = -999;
    setTotalFrames(0);
    setExpandedId(null);
    setShowSpeedFor(null);
    setTick(t => t + 1);
  };

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className="card w-full">

      {/* â”€â”€ Header â€” always visible â”€â”€ */}
      <div className="flex items-center justify-between mb-0">
        <h2 className="card-header flex items-center gap-2 mb-0">
          <BeakerIcon className="h-4 w-4 text-accent" />
          CAN Analyzer
          {corrFits.length > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/20">
              {corrFits.length} equation{corrFits.length !== 1 ? 's' : ''}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {totalFrames > 0 && (
            <span className="text-[10px] text-text-tertiary tabular-nums">
              {totalFrames.toLocaleString()} frames · {entries.length} ID{entries.length !== 1 ? 's' : ''}
            </span>
          )}
          <button onClick={clearAll} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
            <XCircleIcon className="h-3 w-3" /> Clear
          </button>
          <button
            onClick={() => toggleAnalyzer(!analyzerOpen)}
            className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1"
          >
            {analyzerOpen
              ? <><ChevronUpIcon className="h-3.5 w-3.5" /> Collapse</>
              : <><ChevronDownIcon className="h-3.5 w-3.5" /> Expand</>
            }
          </button>
        </div>
      </div>

      {/* â”€â”€ Collapsible body â”€â”€ */}
      {analyzerOpen && (
        <div className="space-y-4 mt-4">

          {/* Match banner */}
          {matchId !== null && (
            <div className="px-3 py-2 rounded-xl bg-elevated border border-border text-xs flex items-center gap-2 flex-wrap">
              <span className="text-text-tertiary">Looking for:</span>
              <span className="font-mono font-semibold text-accent">{idHex(matchId)}</span>
              {matchByte !== null && <span className="text-text-tertiary">byte [{matchByte}]</span>}
              {matchVal  !== null && <span className="font-mono text-text-primary">= 0x{h(matchVal)}</span>}
              {statsRef.current.has(matchId)
                ? <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/20">âœ“ SEEN</span>
                : <span className="ml-auto text-[10px] text-text-tertiary">not seen yet</span>
              }
            </div>
          )}

          {/* No data */}
          {entries.length === 0 && (
            <p className="text-xs text-text-tertiary italic py-4 text-center">
              No frames yet â€” select a CAN bus speed above, then move the frequency slider
            </p>
          )}

          {/* â”€â”€ Live ID table â”€â”€ */}
          {entries.length > 0 && (
            <div className="space-y-1.5">
              {entries.map(entry => {
                const rate    = calcRate(entry.timestamps);
                const isMatch = entry.id === matchId;
                const expanded = expandedId === entry.id;
                const hint    = ID_HINTS[entry.id];
                const changed = entry.lastData.map((b, i) => b !== entry.prevData[i]);

                return (
                  <div key={entry.id}
                    className={['rounded-xl border transition-colors',
                      isMatch ? 'border-success/30 bg-success/5' : 'border-border bg-elevated',
                    ].join(' ')}>

                    <button className="w-full flex items-center gap-2 px-3 py-2 text-left"
                      onClick={() => setExpandedId(expanded ? null : entry.id)}>
                      <span className={['font-mono font-semibold text-sm w-16 shrink-0',
                        isMatch ? 'text-success' : 'text-text-primary'].join(' ')}>
                        {isMatch && 'â˜… '}{idHex(entry.id)}
                      </span>
                      <span className="font-mono text-xs text-text-secondary flex gap-1 flex-1 min-w-0 truncate">
                        {entry.lastData.map((b, i) => (
                          <span key={i} className={[
                            'px-0.5',
                            changed[i] ? 'text-warning font-bold' : '',
                            isMatch && matchByte === i ? 'text-success font-bold' : '',
                          ].join(' ')}>{h(b)}</span>
                        ))}
                      </span>
                      <span className="text-[10px] text-text-tertiary shrink-0 tabular-nums w-14 text-right">
                        {rate > 0 ? `${rate} Hz` : 'â€”'}
                      </span>
                      <span className="text-[10px] text-text-tertiary shrink-0 tabular-nums w-10 text-right">
                        Ã—{entry.count}
                      </span>
                      <span className="text-text-tertiary shrink-0 ml-1">
                        {expanded ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
                      </span>
                    </button>

                    {hint && !expanded && (
                      <div className="px-3 pb-1.5 -mt-1">
                        <span className="text-[10px] text-text-tertiary italic">{hint}</span>
                      </div>
                    )}

                    {expanded && (
                      <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-2">
                        {hint && <p className="text-xs text-accent/80 italic">{hint}</p>}

                        <div>
                          <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">
                            Bytes — <span className="text-warning normal-case font-normal">orange = changing</span>
                            {isMatch && <span className="text-success normal-case font-normal"> · green = DB byte</span>}
                          </p>
                          <div className="grid grid-cols-4 gap-1.5">
                            {entry.lastData.map((b, i) => {
                              const isDbByte = isMatch && matchByte === i;
                              const matchOk  = isDbByte && matchVal !== null && b === matchVal;
                              const matchBad = isDbByte && matchVal !== null && b !== matchVal;
                              return (
                                <div key={i} className={['rounded-lg p-2 text-center border',
                                  isDbByte ? (matchOk ? 'bg-success/10 border-success/30' : matchBad ? 'bg-warning/10 border-warning/30' : 'bg-accent/10 border-accent/30')
                                  : changed[i] ? 'bg-warning/5 border-warning/20' : 'bg-app border-border',
                                ].join(' ')}>
                                  <div className="text-[9px] text-text-tertiary mb-0.5">B[{i}]</div>
                                  <div className="font-mono text-xs font-semibold text-text-primary">0x{h(b)}</div>
                                  <div className="font-mono text-[10px] text-text-tertiary">{b}</div>
                                  {isDbByte && (
                                    <div className={['text-[9px] font-medium mt-0.5',
                                      matchOk ? 'text-success' : matchBad ? 'text-warning' : 'text-accent'].join(' ')}>
                                      {matchOk ? 'âœ“ match' : matchBad ? 'â‰  expected' : 'DB byte'}
                                    </div>
                                  )}
                                  {changed[i] && !isDbByte && (
                                    <div className="text-[9px] text-warning mt-0.5">changed</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {isMatch && matchByte !== null && matchByte < entry.lastData.length && (
                          <div className="rounded-lg px-3 py-2 bg-elevated border border-border text-xs space-y-0.5">
                            <p className="font-semibold text-text-primary">ABS DB match</p>
                            <p className="text-text-secondary">
                              {idHex(entry.id)} byte [{matchByte}]
                              {' '}= <span className="font-mono">0x{h(entry.lastData[matchByte])} ({entry.lastData[matchByte]})</span>
                              {matchVal !== null && (
                                entry.lastData[matchByte] === matchVal
                                  ? <span className="text-success font-semibold"> âœ“ matches expected 0x{h(matchVal)}</span>
                                  : <span className="text-warning"> â‰  expected 0x{h(matchVal)}</span>
                              )}
                            </p>
                          </div>
                        )}

                        <button
                          onClick={() => setShowSpeedFor(showSpeedFor === entry.id ? null : entry.id)}
                          className="text-[10px] text-accent hover:text-accent/80 font-medium transition-colors">
                          {showSpeedFor === entry.id ? 'â–² Hide' : 'â–¼ Show'} raw speed formula guesses
                        </button>
                        {showSpeedFor === entry.id && <QuickSpeedTable data={entry.lastData} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* â”€â”€ Correlation tracker â”€â”€ */}
          <div className="border-t border-border pt-4">
            <button
              className="w-full flex items-center justify-between"
              onClick={() => setShowCorr(v => !v)}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <ChartBarIcon className="h-4 w-4 text-accent" />
                Speed Correlation
                {corrFits.length > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/20">
                    {corrFits.length} equation{corrFits.length !== 1 ? 's' : ''} found
                  </span>
                )}
              </span>
              <span className="text-text-tertiary">
                {showCorr ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
              </span>
            </button>

            {showCorr && (
              <div className="mt-3 space-y-3">

                <div className="text-xs text-text-tertiary bg-elevated border border-border rounded-xl px-3 py-2 space-y-1">
                  <p className="font-medium text-text-secondary">How to calibrate:</p>
                  <p>1. Set a CAN bus speed and wait for frames to appear.</p>
                  <p>2. Slowly move the frequency slider across its range (e.g. 0 â†’ 200 Hz).</p>
                  <p>3. The analyzer records each (Hz, byte value) pair and fits a line.</p>
                  <p>4. Bytes that move with the slider are speed-related â€” assign them to FL/FR/RL/RR.</p>
                </div>

                {totalCorrSamples > 0 && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-text-tertiary">
                      {totalCorrSamples} samples captured across {uniqueHz} Hz levels
                    </span>
                    {corrFits.length === 0 && uniqueHz < 3 && (
                      <span className="text-warning text-[10px]">need â‰¥ 3 distinct Hz values</span>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-text-tertiary shrink-0">Wheel model (for km/h):</span>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-text-tertiary">PPR</label>
                    <input type="number" min="1" max="200" step="1" value={ppr}
                      onChange={e => setPpr(Math.max(1, parseInt(e.target.value) || 48))}
                      className="input-field w-16 text-xs py-1" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-text-tertiary">Circ</label>
                    <input type="number" min="0.1" max="5" step="0.01" value={circ}
                      onChange={e => setCirc(Math.max(0.1, parseFloat(e.target.value) || 2.0))}
                      className="input-field w-16 text-xs py-1" />
                    <span className="text-xs text-text-tertiary">m</span>
                  </div>
                </div>

                {corrFits.length > 0 ? (
                  <div className="space-y-3">
                    {corrFits.map(({ id, byteIdx, fit }) => {
                      const kmhPerHz   = circ * 3.6 / ppr;
                      const intercept  = round(fit.intercept, 2);
                      const slope      = round(fit.slope, 4);
                      const kmhScale   = round(kmhPerHz / fit.slope, 4);
                      const kmhOffset  = round(-fit.intercept / fit.slope * kmhPerHz, 3);

                      const predictedRaw = round(fit.slope * legacyFreq + fit.intercept, 1);
                      const actualEntry  = statsRef.current.get(id);
                      const actualRaw    = actualEntry?.lastData[byteIdx] ?? null;

                      // Use saved channel coefficients when this byte is assigned to a wheel â€”
                      // this ensures the value shown here is identical to the ABS Readback panel.
                      const assignedWheelIdx = WHEEL_LABELS.findIndex((_, wi) =>
                        wssChannels[wi]?.canId === id && wssChannels[wi]?.byteIdx === byteIdx
                      );
                      const assignedCh = assignedWheelIdx >= 0 ? wssChannels[assignedWheelIdx] : null;
                      const effectiveKmhScale = assignedCh?.kmhScale ?? kmhScale;
                      const effectiveKmhOffset = assignedCh?.kmhOffset ?? kmhOffset;

                      // Decode from actual raw byte (same path as ABS Readback).
                      // Fall back to geometric prediction when no live frame yet.
                      const liveKmh = actualRaw !== null
                        ? round(Math.max(0, actualRaw * effectiveKmhScale + effectiveKmhOffset), 1)
                        : round(legacyFreq * kmhPerHz, 1);

                      const r2Color = fit.r2 > 0.97 ? 'text-success' : fit.r2 > 0.90 ? 'text-warning' : 'text-text-tertiary';

                      return (
                        <div key={`${id}:${byteIdx}`}
                          className="rounded-xl border border-border bg-elevated p-3 space-y-2">

                          {/* Title row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-semibold text-text-primary text-sm">{idHex(id)}</span>
                            <span className="text-text-tertiary text-xs">byte [{byteIdx}]</span>
                            {id === matchId && byteIdx === matchByte && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/20 font-semibold">DB match</span>
                            )}
                            <span className={['ml-auto text-[10px] font-mono', r2Color].join(' ')}>
                              RÂ²={round(fit.r2, 3)} ({fit.n} pts)
                            </span>
                          </div>

                          {/* Fitted equation */}
                          <div className="rounded-lg bg-app border border-border px-3 py-2 font-mono text-xs space-y-1">
                            <div className="text-text-tertiary">Fit (raw value from Hz):</div>
                            <div className="text-text-primary">
                              value = <span className="text-accent">{slope}</span> Ã— Hz
                              {intercept !== 0 && (
                                <> {intercept > 0 ? '+' : 'âˆ’'} <span className="text-accent">{Math.abs(intercept)}</span></>
                              )}
                            </div>
                            <div className="text-text-tertiary mt-1">Inverted (Hz from value):</div>
                            <div className="text-success">
                              Hz = (value{intercept !== 0 && <> {intercept > 0 ? 'âˆ’' : '+'} {Math.abs(intercept)}</>}) / {slope}
                            </div>
                            <div className="text-text-tertiary mt-1">Full km/h ({ppr} PPR, {circ} m):</div>
                            <div className="text-accent font-semibold">
                              km/h â‰ˆ value Ã— {kmhScale}
                              {kmhOffset !== 0 && <> {kmhOffset > 0 ? '+' : 'âˆ’'} {Math.abs(kmhOffset)}</>}
                            </div>
                          </div>

                          {/* Live prediction at current slider position */}
                          {legacyFreq > 0 && (
                            <div className="rounded-lg bg-elevated border border-border px-3 py-1.5 text-xs flex items-center gap-3 flex-wrap">
                              <span className="text-text-tertiary shrink-0">
                                At {legacyFreq} Hz:
                              </span>
                              <span className="font-mono text-text-primary">
                                expected raw â‰ˆ <span className="text-accent">{predictedRaw}</span>
                              </span>
                              {actualRaw !== null && (
                                <span className="font-mono">
                                  live = <span className={
                                    Math.abs(actualRaw - predictedRaw) < 2 ? 'text-success' : 'text-warning'
                                  }>{actualRaw}</span>
                                </span>
                              )}
                              <span className="font-mono text-text-primary shrink-0 flex items-center gap-1.5">
                                â‰ˆ <span className="text-success font-semibold">{liveKmh} km/h</span>
                                {assignedCh && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/20 font-semibold">
                                    {WHEEL_LABELS[assignedWheelIdx]}
                                  </span>
                                )}
                              </span>
                            </div>
                          )}

                          {/* Assign to wheel channel */}
                          <div className="flex items-center gap-2 flex-wrap pt-1.5 border-t border-border/50">
                            <span className="text-[10px] text-text-tertiary shrink-0">Assign to wheel:</span>
                            {WHEEL_LABELS.map((label, wi) => {
                              const ch = wssChannels[wi];
                              const isAssigned = ch?.canId === id && ch?.byteIdx === byteIdx;
                              return (
                                <button
                                  key={label}
                                  onClick={() => {
                                    const newCh = WHEEL_LABELS.map((_, i) =>
                                      i === wi
                                        ? (isAssigned ? null : { canId: id, byteIdx, kmhScale, kmhOffset, kmhPerHz })
                                        : wssChannels[i]
                                    ) as WSSChannels;
                                    setWssChannels(newCh);
                                  }}
                                  className={['text-[10px] px-2.5 py-1 rounded-lg font-semibold transition-colors border',
                                    isAssigned
                                      ? 'bg-success/15 text-success border-success/30'
                                      : 'bg-app text-text-tertiary border-border hover:text-text-primary',
                                  ].join(' ')}
                                >
                                  {label}{isAssigned ? ' âœ“' : ''}
                                </button>
                              );
                            })}
                            {WHEEL_LABELS.some((_, wi) => wssChannels[wi]?.canId === id && wssChannels[wi]?.byteIdx === byteIdx) && (
                              <span className="text-[10px] text-success font-medium ml-auto">â†’ live in Signal panel</span>
                            )}
                          </div>

                        </div>
                      );
                    })}
                  </div>
                ) : totalCorrSamples === 0 ? (
                  <p className="text-xs text-text-tertiary italic">
                    Move the frequency slider while CAN frames are being received to start calibrating.
                  </p>
                ) : (
                  <p className="text-xs text-text-tertiary italic">
                    No strongly correlated bytes found yet â€” keep moving the slider across a wider range.
                  </p>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

// â”€â”€ QuickSpeedTable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function QuickSpeedTable({ data }: { data: number[] }) {
  const results: { label: string; value: number }[] = [];

  for (let i = 0; i < data.length; i++) {
    const b = data[i];
    [0.5, 1, 2].forEach(sc => {
      const v = round(b * sc, 1);
      if (v > 0 && v <= 300) results.push({ label: `B[${i}] Ã— ${sc}`, value: v });
    });
  }
  for (let i = 0; i + 1 < data.length; i++) {
    const be = (data[i] << 8) | data[i + 1];
    const le = (data[i + 1] << 8) | data[i];
    [0.01, 0.0625].forEach(sc => {
      const vBE = round(be * sc, 1);
      const vLE = round(le * sc, 1);
      if (vBE > 0 && vBE <= 300) results.push({ label: `B[${i}-${i+1}] BE Ã— ${sc}`, value: vBE });
      if (vLE > 0 && vLE <= 300) results.push({ label: `B[${i}-${i+1}] LE Ã— ${sc}`, value: vLE });
    });
  }

  if (results.length === 0)
    return <p className="text-[10px] text-text-tertiary mt-1.5 italic">No plausible 0â€“300 km/h values from static formulas.</p>;

  return (
    <div className="mt-2 max-h-36 overflow-y-auto overscroll-y-contain grid grid-cols-2 gap-x-4 gap-y-0.5">
      {results.map((r, i) => (
        <div key={i} className="flex items-baseline gap-1.5 text-xs">
          <span className="font-mono font-semibold text-text-primary tabular-nums w-14 shrink-0">{r.value} km/h</span>
          <span className="text-text-tertiary text-[10px] truncate">{r.label}</span>
        </div>
      ))}
    </div>
  );
}
