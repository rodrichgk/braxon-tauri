import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import { MagnifyingGlassIcon, BriefcaseIcon } from '@heroicons/react/24/outline';
import SignalTester from '@/components/SignalTester/SignalTesterMain';
import LegacySignalPanel from '@/components/LegacySignalPanel';
import CANSettings from '@/components/CANSettings';
import CANAnalyzer from '@/components/CANAnalyzer';
import DTCScanner from '@/components/DTCScanner';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import type { WSSChannels } from '@/contexts/AppSettingsContext';
import { WHEEL_LABELS } from '@/contexts/AppSettingsContext';
import BenchPower from '@/components/BenchPower';
import PowerIndicators from '@/components/PowerIndicators';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import { useSession } from '@/contexts/SessionContext';

interface ABSDataRow {
  id: string;
  reference: string;
  manufacturer: string;
  wssType?: string;
  absAdapter?: string;
  absConnector?: string;
  canSpeed?: string;
  canIdLine?: string;
  canByte?: string;
  canValue?: string;
  comments?: string;
  testValidated?: string;
  otherReferences?: string;
}

/* ── animation variants ── */
const sectionVariants = {
  hidden:  { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1], delay: i * 0.07 },
  }),
};

const resultItemVariants = {
  hidden:  { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.18, ease: 'easeOut', delay: i * 0.04 },
  }),
  exit: { opacity: 0, x: 8, transition: { duration: 0.12 } },
};

export default function SignalPage() {
  const { sendMessage: wsSendMessage, isConnectedToDevice } = useWebSocketContext();
  const { isConnected: serialConnected, sendCommand: serialSendCommand } = useClientSerialConnection();
  const isConnected = isConnectedToDevice || serialConnected;
  const { currentJob, linkJobToRef } = useSession();
  const {
    legacyMode,
    legacyFreq,
    wssChannels, setWssChannels,
    wssCalPpr, setWssCalPpr,
    wssCalCirc, setWssCalCirc,
    setLegacyCanSpeed,
    setLegacySensorType,
  } = useAppSettings();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ABSDataRow[]>([]);
  const [selected, setSelected] = useState<ABSDataRow | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WSS calibration load/save state
  type CalStatus = 'idle' | 'loading' | 'loaded' | 'none' | 'saving' | 'saved' | 'error';
  const [calStatus, setCalStatus] = useState<CalStatus>('idle');

  const canData = {
    canSpeed:  selected?.canSpeed  || '',
    canByte:   selected?.canByte   || '',
    canIdLine: selected?.canIdLine || '',
    canValue:  selected?.canValue  || '',
  };
  const canReceivedData = { idLine: '', byte: '', value: '' };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await invoke<ABSDataRow[]>('search_abs_data', { query });
        setResults(data);
      } catch (e: any) {
        console.error('Search error:', e);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Auto-configure everything when a reference is selected in legacy mode
  useEffect(() => {
    if (!legacyMode || !selected) {
      if (!legacyMode) setCalStatus('idle');
      return;
    }

    let waveformTimer: ReturnType<typeof setTimeout> | null = null;

    // ── CAN bus speed ──
    const canSpeedCmd = parseDbCanSpeed(selected.canSpeed);
    if (canSpeedCmd !== null) {
      setLegacyCanSpeed(canSpeedCmd);
      if (isConnected) handleSendMessage(`CANSpeed : ${canSpeedCmd}\n`);
    }

    // ── Sensor type — delayed 300 ms so the Nano processes CAN speed first ──
    const sensorType = parseDbSensorType(selected.wssType);
    if (sensorType !== null) {
      setLegacySensorType(sensorType);
      if (isConnected) {
        const msg = sensorType === 0
          ? `Waveform : 0,0\n`
          : `Waveform : ${sensorType},${legacyFreq}\n`;
        waveformTimer = setTimeout(() => handleSendMessage(msg), 300);
      }
    }

    // ── WSS channel calibration (channels + PPR + circ) ──
    setCalStatus('loading');
    invoke<string | null>('get_wss_calibration', { id: selected.id })
      .then(json => {
        if (json) {
          try {
            const data = JSON.parse(json);
            // Support both old format (bare array) and new format ({ ppr, circ, channels })
            const channels: WSSChannels = Array.isArray(data) ? data : data.channels;
            if (channels?.some((ch: unknown) => ch !== null)) {
              setWssChannels(channels);
              if (!Array.isArray(data)) {
                if (typeof data.ppr  === 'number') setWssCalPpr(data.ppr);
                if (typeof data.circ === 'number') setWssCalCirc(data.circ);
              }
              setCalStatus('loaded');
              return;
            }
          } catch { /* ignore parse error */ }
        }
        setWssChannels([null, null, null, null]);
        setCalStatus('none');
      })
      .catch(() => {
        setCalStatus('error');
      });

    return () => {
      if (waveformTimer !== null) clearTimeout(waveformTimer);
    };
  }, [selected?.id, legacyMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCalibration = async () => {
    if (!selected) return;
    setCalStatus('saving');
    try {
      await invoke('save_wss_calibration', {
        id: selected.id,
        calibration: JSON.stringify({ ppr: wssCalPpr, circ: wssCalCirc, channels: wssChannels }),
      });
      setCalStatus('saved');
      setTimeout(() => setCalStatus('loaded'), 2500);
    } catch {
      setCalStatus('error');
    }
  };

  const handleSendMessage = async (message: string): Promise<boolean | void> => {
    if (serialConnected) return serialSendCommand(message);
    return wsSendMessage({ type: 1, data: message, timestamp: Date.now() });
  };

  return (
    <div className="container mx-auto px-4 py-8">

      {/* Header */}
      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h1 className="text-xl font-semibold text-text-primary tracking-tight">
          Wheel Speed Sensor — HIL Simulation
        </h1>
        <p className="text-sm text-text-secondary mt-0.5">
          ABS ECU diagnostics via CAN / K-Line / Wheel speed signals
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Left column ── */}
        <div className="space-y-6">

          {/* ABS Database Search */}
          <motion.div
            custom={0}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className="card"
          >
            <h2 className="card-header">ABS Reference Database</h2>

            {/* Search input */}
            <div className="relative mb-3">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); setSelected(null); }}
                placeholder="Part number, manufacturer, type…"
                className="input-field pl-9 pr-9"
              />

              {/* Spinner */}
              <AnimatePresence>
                {searching && (
                  <motion.div
                    key="spinner"
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin"
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Results list */}
            <AnimatePresence mode="popLayout">
              {results.length > 0 && (
                <motion.div
                  key="results"
                  className="max-h-48 overflow-y-auto space-y-1 mb-1"
                >
                  {results.map((row, i) => (
                    <motion.button
                      key={row.id}
                      custom={i}
                      variants={resultItemVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      layout
                      onClick={() => setSelected(row)}
                      className={[
                        'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors duration-150',
                        selected?.id === row.id
                          ? 'bg-accent/10 ring-1 ring-accent/30 text-accent'
                          : 'bg-elevated hover:bg-text-tertiary/10 text-text-primary',
                      ].join(' ')}
                    >
                      <div className="font-medium text-[13px]">{row.reference}</div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        {row.manufacturer}{row.wssType ? ` · ${row.wssType}` : ''}
                      </div>
                    </motion.button>
                  ))}
                </motion.div>
              )}

              {/* No results hint */}
              {query.trim() && !searching && results.length === 0 && (
                <motion.p
                  key="no-results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-text-tertiary px-1 py-2 text-center"
                >
                  No results for "{query}"
                </motion.p>
              )}
            </AnimatePresence>

            {/* Selected detail card */}
            <AnimatePresence mode="wait">
              {selected && (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                  className="mt-3 p-3 bg-elevated rounded-xl border border-border text-xs space-y-1.5"
                >
                  <div className="font-semibold text-text-primary text-[13px] mb-1 flex items-center justify-between">
                    <span>{selected.reference}</span>
                    {selected.testValidated && (
                      <span className={[
                        'text-[10px] font-medium px-2 py-0.5 rounded-full',
                        selected.testValidated === 'yes'
                          ? 'bg-success/15 text-success'
                          : 'bg-warning/15 text-warning',
                      ].join(' ')}>
                        {selected.testValidated === 'yes' ? '✓ Validated' : '⚠ Not validated'}
                      </span>
                    )}
                  </div>

                  {/* Active job link banner */}
                  {currentJob && currentJob.status === 'in_progress' && (
                    <div className="flex items-center justify-between text-[10px] py-1.5 px-2 mb-1 bg-app rounded-lg border border-border">
                      <div className="flex items-center gap-1.5 text-text-tertiary">
                        <BriefcaseIcon className="w-3 h-3 shrink-0" />
                        <span>Job: <span className="font-medium text-text-secondary">{currentJob.jobNumber}</span></span>
                      </div>
                      {currentJob.absRefId !== selected.id ? (
                        <button
                          onClick={() => linkJobToRef(selected.reference, selected.id)}
                          className="text-accent font-semibold hover:underline"
                        >
                          Link to job
                        </button>
                      ) : (
                        <span className="text-success font-semibold">✓ Linked</span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {selected.canSpeed    && <Row label="CAN Speed"  value={selected.canSpeed} />}
                    {selected.canIdLine   && <Row label="CAN ID"     value={selected.canIdLine} />}
                    {selected.canByte     && <Row label="CAN Byte"   value={selected.canByte} />}
                    {selected.canValue    && <Row label="CAN Value"  value={selected.canValue} />}
                    {selected.absAdapter  && <Row label="Adapter"    value={selected.absAdapter} />}
                    {selected.absConnector && <Row label="Connector" value={selected.absConnector} />}
                  </div>

                  {selected.comments && (
                    <p className="text-text-secondary pt-1 border-t border-border">{selected.comments}</p>
                  )}

                  {/* WSS Calibration — legacy mode only */}
                  {legacyMode && (
                    <div className="pt-2 mt-1 border-t border-border space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-text-primary text-[12px]">WSS Calibration</span>
                        <div className="flex items-center gap-1.5">
                          {calStatus === 'loading'  && <span className="text-[10px] text-text-tertiary animate-pulse">Loading…</span>}
                          {calStatus === 'saving'   && <span className="text-[10px] text-text-tertiary animate-pulse">Saving…</span>}
                          {calStatus === 'saved'    && <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/20">✓ Saved!</span>}
                          {calStatus === 'loaded'   && <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/15 text-success border border-success/20">✓ Loaded</span>}
                          {calStatus === 'none'     && <span className="text-[10px] text-text-tertiary">Not saved yet</span>}
                          {calStatus === 'error'    && <span className="text-[10px] text-warning">DB offline</span>}
                          <button
                            onClick={saveCalibration}
                            disabled={calStatus === 'saving' || calStatus === 'loading' || !wssChannels.some(ch => ch !== null)}
                            className="text-[10px] btn-secondary px-2 py-0.5 disabled:opacity-40"
                          >
                            Save to DB
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {WHEEL_LABELS.map((label, i) => {
                          const ch = wssChannels[i];
                          return (
                            <div key={label} className={[
                              'rounded-lg px-2 py-1 text-center border',
                              ch ? 'bg-success/5 border-success/20' : 'bg-app border-border/50 opacity-50',
                            ].join(' ')}>
                              <div className="text-[10px] font-semibold text-text-secondary">{label}</div>
                              <div className="font-mono text-[9px] text-text-tertiary truncate">
                                {ch ? `0x${ch.canId.toString(16).toUpperCase().padStart(3,'0')}[${ch.byteIdx}]` : '—'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* CAN Settings */}
          <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
            <CANSettings
              result={canData}
              isConnected={isConnected}
              sendMessage={handleSendMessage}
              canReceivedData={canReceivedData}
              legacyMode={legacyMode}
            />
          </motion.div>

          {/* DTC Scanner — always visible in left column */}
          <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="visible">
            <DTCScanner sendMessage={handleSendMessage} isConnected={isConnected} absReference={selected?.reference} />
          </motion.div>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-6">
          <motion.div custom={1} variants={sectionVariants} initial="hidden" animate="visible">
            <PowerIndicators sendMessage={handleSendMessage} />
          </motion.div>
          <motion.div custom={2} variants={sectionVariants} initial="hidden" animate="visible">
            <BenchPower sendMessage={handleSendMessage} />
          </motion.div>
        </div>
      </div>

      {/* CAN Analyzer — full-width, legacy mode only */}
      {legacyMode && (
        <motion.div
          custom={3}
          variants={sectionVariants}
          initial="hidden"
          animate="visible"
          className="mt-6"
        >
          <CANAnalyzer result={canData} />
        </motion.div>
      )}

      {/* Signal Tester / Legacy Signal Panel */}
      <motion.div
        custom={5}
        variants={sectionVariants}
        initial="hidden"
        animate="visible"
        className="mt-6"
      >
        {legacyMode
          ? <LegacySignalPanel sendMessage={handleSendMessage} isConnected={isConnected} />
          : <SignalTester sendMessage={handleSendMessage} />
        }
      </motion.div>
    </div>
  );
}

/* small helper to keep the detail grid clean */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-text-tertiary">{label}: </span>
      <span className="text-text-primary font-medium">{value}</span>
    </div>
  );
}

/**
 * Map a human-readable CAN speed string from the DB to the value sent to the Nano.
 * The Nano receives the literal kbps value: 250, 500, or 1000.
 */
function parseDbCanSpeed(s: string | undefined): number | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes('1m') || lower.includes('1000') || lower.includes('1 m')) return 1000;
  if (lower.includes('500')) return 500;
  if (lower.includes('250')) return 250;
  return null;
}

/**
 * Map a WSS type string from the DB to a Nano waveform type.
 * 1 = DF11 1.5kΩ active (square), 2 = DF6 passive (sine).
 */
function parseDbSensorType(s: string | undefined): number | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes('passive') || lower.includes('df6') || lower.includes('sine')) return 2;
  if (lower.includes('active') || lower.includes('df11') || lower.includes('1.5')) return 1;
  return null;
}
