
import { useState, useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { PlayIcon, PauseIcon } from '@heroicons/react/24/solid';
import { BoltIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { useAppSettings } from '@/contexts/AppSettingsContext';

interface LegacySignalPanelProps {
  sendMessage: (message: string) => void;
  isConnected: boolean;
}

const QUICK_FREQS = [5, 10, 20, 50, 100, 200, 500];

// The Nano firmware has an operator-precedence bug making pos always 0 or 1.
// Working format: "Keyword : value" (space-colon-space so substring(1+offset) lands on value).
const nanoCmd = {
  waveform:  (type: number, freq: number) => `Waveform : ${type},${freq}\n`,
  frequency: (freq: number) =>               `Frequency : ${freq}\n`,
  autoTest:  (on: boolean) =>                `AutoTest : ${on ? 1 : 0}\n`,
};

/** Parse a Nano CAN frame line: "513 8 0 0 255 255 255 255 255 255" */
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

function idHex(id: number) {
  return `0x${id.toString(16).toUpperCase().padStart(id > 0x7FF ? 8 : 3, '0')}`;
}

export default function LegacySignalPanel({ sendMessage, isConnected }: LegacySignalPanelProps) {
  const { t } = useTranslation();
  // Persistent state (survives page navigation)
  const { legacySensorType, setLegacySensorType, legacyFreq, setLegacyFreq, wssChannels } = useAppSettings();

  // Transient state (reset on mount is correct behaviour)
  const [isAutoTest, setIsAutoTest] = useState(false);
  const [nanoFreq, setNanoFreq] = useState<number | null>(null);
  const [serialLog, setSerialLog] = useState<string[]>([]);
  const [logExpanded, setLogExpanded] = useState(false);
  const [wheelKmh, setWheelKmh] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Keep mutable values fresh in the listener without re-subscribing
  const wssChannelsRef = useRef(wssChannels);
  wssChannelsRef.current = wssChannels;
  const isAutoTestRef = useRef(isAutoTest);
  isAutoTestRef.current = isAutoTest;

  const addLog = (line: string) =>
    setSerialLog(prev => [...prev.slice(-299), line]);

  const loggedSend = (msg: string) => {
    addLog(`TX: ${msg.trimEnd()}`);
    sendMessage(msg);
  };

  // Listen for Nano RX data â€” handles both "Freq :" lines and CAN frames
  useEffect(() => {
    const unsub = listen<string>('serial-data', e => {
      const line = e.payload;
      addLog(`RX: ${line}`);

      // AutoTest frequency feedback â€” update both the readout and the slider
      const freqMatch = line.match(/^Freq\s*:\s*([\d.]+)/);
      if (freqMatch) {
        const f = parseFloat(freqMatch[1]);
        setNanoFreq(f);
        if (isAutoTestRef.current) setLegacyFreq(f);
        return;
      }

      // CAN frame â†’ WSS readback
      const frame = parseNanoFrame(line);
      if (frame) {
        const channels = wssChannelsRef.current;
        setWheelKmh(prev => {
          let changed = false;
          const next: [number, number, number, number] = [prev[0], prev[1], prev[2], prev[3]];
          channels.forEach((ch, i) => {
            if (ch && frame.id === ch.canId && ch.byteIdx < frame.data.length) {
              const v = Math.max(0, ch.kmhScale * frame.data[ch.byteIdx] + ch.kmhOffset);
              if (Math.abs(next[i] - v) > 0.01) { next[i] = v; changed = true; }
            }
          });
          return changed ? next : prev;
        });
      }
    });
    return () => { unsub.then(u => u()); };
  }, []);

  useEffect(() => {
    if (logExpanded) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serialLog, logExpanded]);

  // ---- Handlers ----

  const applySensorType = (type: number, f = legacyFreq) => {
    setLegacySensorType(type);
    setIsAutoTest(false);
    setNanoFreq(null);
    loggedSend(type === 0 ? nanoCmd.waveform(0, 0) : nanoCmd.waveform(type, f));
  };

  const handleFreqChange = (f: number) => {
    setLegacyFreq(f);
    if (legacySensorType > 0 && !isAutoTest) loggedSend(nanoCmd.frequency(f));
  };

  const toggleAutoTest = () => {
    if (isAutoTest) {
      loggedSend(nanoCmd.autoTest(false));
      setIsAutoTest(false);
      setNanoFreq(null);
    } else {
      loggedSend(nanoCmd.autoTest(true));
      setIsAutoTest(true);
      setNanoFreq(null);
    }
  };

  const sensorBtnCls = (id: number) => [
    'px-3 py-2.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-40 text-center',
    legacySensorType === id
      ? id === 0
        ? 'bg-danger/15 text-danger border border-danger/20'
        : 'bg-accent/15 text-accent border border-accent/20'
      : 'bg-elevated text-text-secondary border border-border hover:text-text-primary',
  ].join(' ');

  const hasWssChannels = wssChannels.some(ch => ch !== null);
  // Use first assigned channel's kmhPerHz for reference expected speed
  const refKmhPerHz = wssChannels.find(ch => ch !== null)?.kmhPerHz ?? null;

  // ---- Render ----

  return (
    <div className="card w-full">
      {/* Header */}
      <h2 className="card-header flex items-center justify-between">
        <span className="flex items-center gap-2">
          <BoltIcon className="h-4 w-4 text-warning" />
          {t('signal_gen.title')}
        </span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-warning/15 text-warning border border-warning/20">
          NANO LEGACY
        </span>
      </h2>

      {/* Signal type */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-2">{t('signal_gen.signal_type')}</h3>
        <div className="grid grid-cols-3 gap-2">
          <button disabled={!isConnected} onClick={() => applySensorType(0)} className={sensorBtnCls(0)}>
            <div>{t('signal_gen.stop')}</div>
            <div className="text-[10px] opacity-60 mt-0.5">{t('signal_gen.stop_sub')}</div>
          </button>
          <button disabled={!isConnected} onClick={() => applySensorType(1)} className={sensorBtnCls(1)}>
            <div>{t('signal_gen.df11')}</div>
            <div className="text-[10px] opacity-60 mt-0.5">{t('signal_gen.df11_sub')}</div>
          </button>
          <button disabled={!isConnected} onClick={() => applySensorType(2)} className={sensorBtnCls(2)}>
            <div>{t('signal_gen.df6')}</div>
            <div className="text-[10px] opacity-60 mt-0.5">{t('signal_gen.df6_sub')}</div>
          </button>
        </div>
      </div>

      {/* Frequency */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-end justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">{t('signal_gen.frequency')}</h3>
          <div className="flex items-center gap-3">
            {isAutoTest && nanoFreq !== null && (
              <span className="text-xs text-text-tertiary">
                Nano: <span className="font-mono text-success">{nanoFreq.toFixed(2)} Hz</span>
              </span>
            )}
            <div className="leading-none">
              <span className="text-2xl font-bold tabular-nums text-text-primary">{legacyFreq}</span>
              <span className="text-sm text-text-tertiary ml-1">Hz</span>
            </div>
          </div>
        </div>

        <input
          type="range" min="0" max="1000" step="1" value={legacyFreq}
          onChange={e => handleFreqChange(parseInt(e.target.value))}
          disabled={!isConnected || isAutoTest || legacySensorType === 0}
          className="w-full h-1.5 bg-elevated rounded-full appearance-none cursor-pointer accent-[#0a84ff] disabled:opacity-40"
        />

        <div className="flex flex-wrap gap-1.5 mt-2 items-center">
          {QUICK_FREQS.map(v => (
            <button key={v}
              disabled={!isConnected || isAutoTest || legacySensorType === 0}
              onClick={() => handleFreqChange(v)}
              className={[
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40',
                legacyFreq === v
                  ? 'bg-accent/15 text-accent border border-accent/20'
                  : 'bg-elevated text-text-secondary border border-border hover:text-text-primary',
              ].join(' ')}>
              {v}
            </button>
          ))}
          <span className="text-xs text-text-tertiary">Hz</span>
          <input
            type="number" min="0" max="5000" step="0.5"
            value={legacyFreq}
            onChange={e => handleFreqChange(parseFloat(e.target.value) || 0)}
            disabled={!isConnected || isAutoTest || legacySensorType === 0}
            className="input-field w-20 text-xs py-1 ml-auto"
          />
        </div>
      </div>

      {/* ABS Speed Readback â€” shown when wheel channels are assigned in CAN Analyzer */}
      {hasWssChannels && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">{t('signal_gen.abs_readback')}</h3>
            {refKmhPerHz !== null && legacyFreq > 0 && (
              <span className="text-xs text-text-tertiary">
                {t('signal_gen.expected_at')} {legacyFreq} Hz:{' '}
                <span className="font-mono text-accent">
                  {(legacyFreq * refKmhPerHz).toFixed(1)} km/h
                </span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(['FL', 'FR', 'RL', 'RR'] as const).map((label, i) => {
              const ch = wssChannels[i];
              const speed = wheelKmh[i];
              const expected = refKmhPerHz !== null && legacyFreq > 0 ? legacyFreq * refKmhPerHz : null;
              const diff = ch && expected !== null ? Math.abs(speed - expected) : null;
              const isGood = diff !== null && diff < expected! * 0.05; // within 5%

              return (
                <div key={label} className={[
                  'rounded-xl p-3 text-center border transition-colors',
                  ch
                    ? isGood && speed > 0.5
                      ? 'bg-success/5 border-success/25'
                      : 'bg-elevated border-border'
                    : 'bg-app border-border/40 opacity-40',
                ].join(' ')}>
                  <div className="text-[10px] font-semibold text-text-tertiary tracking-wide">{label}</div>
                  <div className={[
                    'text-2xl font-bold tabular-nums mt-1',
                    ch ? (isGood && speed > 0.5 ? 'text-success' : 'text-text-primary') : 'text-text-tertiary',
                  ].join(' ')}>
                    {ch ? speed.toFixed(1) : 'â€”'}
                  </div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">km/h</div>
                  {ch && (
                    <div className="text-[9px] text-text-tertiary/60 mt-1 font-mono truncate">
                      {idHex(ch.canId)}[{ch.byteIdx}]
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-text-tertiary mt-2 px-0.5">
            {t('signal_gen.legend')}
            {!wssChannels.every(ch => ch !== null) && (
              <> {t('signal_gen.assign_remaining')}</>
            )}
          </p>
        </div>
      )}

      {/* AutoTest */}
      <div className="mt-4 pt-4 border-t border-border flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-text-primary">{t('signal_gen.auto_test')}</h3>
          <p className="text-xs text-text-tertiary mt-0.5">{t('signal_gen.auto_test_desc')}</p>
          {isAutoTest && nanoFreq !== null && (
            <div className="mt-2 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse shrink-0" />
              <span className="text-xs text-text-tertiary">{t('signal_gen.live')}</span>
              <span className="font-mono text-sm font-semibold text-success">{nanoFreq.toFixed(2)} Hz</span>
            </div>
          )}
        </div>
        <button
          onClick={toggleAutoTest}
          disabled={!isConnected || legacySensorType === 0}
          className={[
            'shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-40',
            isAutoTest ? 'btn-danger' : 'btn-primary',
          ].join(' ')}
        >
          {isAutoTest ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
          {isAutoTest ? t('signal_gen.stop_btn') : t('signal_gen.run')}
        </button>
      </div>

      {/* Serial log */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            {t('signal_gen.serial_log')}
            {serialLog.length > 0 && (
              <span className="text-xs font-normal text-text-tertiary">({serialLog.length})</span>
            )}
          </h3>
          <div className="flex gap-1.5">
            <button onClick={() => setLogExpanded(v => !v)} className="text-xs btn-secondary px-2.5 py-1">
              {logExpanded ? t('common.collapse') : t('common.expand')}
            </button>
            <button onClick={() => setSerialLog([])} className="text-xs btn-secondary px-2.5 py-1">{t('common.clear')}</button>
          </div>
        </div>
        <div className={[
          'bg-elevated border border-border rounded-xl p-3 font-mono text-xs overflow-y-auto overscroll-y-contain transition-all duration-200 space-y-0.5',
          logExpanded ? 'h-40' : 'h-20',
        ].join(' ')}>
          {serialLog.length === 0
            ? <span className="text-text-tertiary">No messages yet…</span>
            : serialLog.map((line, i) => (
              <div key={i} className={
                line.startsWith('TX:')  ? 'text-accent'  :
                line.startsWith('ERR:') ? 'text-danger'  : 'text-success'
              }>{line}</div>
            ))
          }
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
