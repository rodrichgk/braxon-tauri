
import { useState, useEffect, useRef, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { PlayIcon, PauseIcon } from '@heroicons/react/24/solid';
import { BoltIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useRecording } from '@/hooks/useRecording';
import { useWssReadback } from '@/hooks/useWssReadback';
import { buildPlaybackSchedule } from '@/lib/signalPlayback';
import { wssReadSpecFor, hzToKmh, evaluateWheel } from '@/lib/wssReadback';
import RecordingControls from './SignalTester/RecordingControls';

interface LegacySignalPanelProps {
  sendMessage: (message: string) => void;
  isConnected: boolean;
  /** Selected ABS reference — when a wheel-read spec is on file for it
   *  (`src/lib/wssReadback.ts`), the readback below polls the ECU directly
   *  over ISO-TP instead of guessing at a passively-sniffed CAN byte. */
  selectedRef?: { id: string; reference: string } | null;
  /** Main CAN transport send (board or Kvaser) — distinct from `sendMessage`,
   *  which drives the Nano's own signal-generation link. Absent → the
   *  DID-based readback falls back to the passive CAN Analyzer one. */
  canSend?: (message: string) => Promise<boolean | void> | boolean | void;
}

const QUICK_FREQS = [5, 10, 20, 50, 100, 200, 500];
const QUICK_DURATIONS_MIN = [5, 10];
// The ABS ECU reacts while the signal ramps back down to a standstill —
// hold there this long before starting the next loop of the recorded curve.
const ABS_REACTION_PAUSE_SECONDS = 4;

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

export default function LegacySignalPanel({ sendMessage, isConnected, selectedRef, canSend }: LegacySignalPanelProps) {
  const { t } = useTranslation();
  // Persistent state (survives page navigation)
  const {
    legacySensorType, setLegacySensorType, legacyFreq, setLegacyFreq, wssChannels,
    wssCalPpr, wssCalCirc,
  } = useAppSettings();

  // ── Live wheel-speed readback — DID poll when the reference has a known
  //    spec (reliable, matches an Autel scan tool), else the older passive
  //    CAN-sniff channels assigned in CAN Analyzer.
  const readSpec = useMemo(() => wssReadSpecFor(selectedRef?.reference), [selectedRef?.reference]);
  const [readbackOn, setReadbackOn] = useState(false);
  const { measured: didMeasured, error: didReadErr } = useWssReadback({ readSpec, canSend, enabled: readbackOn });

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

  // ── Recording Studio — record a frequency curve by hand, then loop it
  //    host-side for a set duration (distinct from the Nano's own on-device
  //    "AutoTest" canned ramp below). Shares the capture hook + UI with the
  //    Pico's Signal Tester (src/hooks/useRecording.ts, RecordingControls).
  const recording = useRecording();
  const [isPlayingRecorded, setIsPlayingRecorded] = useState(false);
  const [testDurationMinutes, setTestDurationMinutes] = useState(5);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const playbackTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPlaybackTimers = () => {
    playbackTimeoutsRef.current.forEach(clearTimeout);
    playbackTimeoutsRef.current = [];
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  };

  // Leaving the page mid-test must not leave timers running against an
  // unmounted component (or, worse, a board nobody's watching anymore).
  useEffect(() => stopPlaybackTimers,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  const addLog = (line: string) =>
    setSerialLog(prev => [...prev.slice(-299), line]);

  const loggedSend = (msg: string) => {
    addLog(`TX: ${msg.trimEnd()}`);
    sendMessage(msg);
  };

  // Listen for CAN/telemetry RX â€” handles both "Freq :" lines and CAN
  // frames. Two event sources, not one: in the Kvaser-as-main-transport
  // setup this Nano is only wired to generate the WSS signal, so real CAN
  // traffic (the ABS ECU's speed frames the readback below decodes) arrives
  // over `kvaser-data` instead of the Nano's own `serial-data` line. Both
  // carry the identical `<id> <dlc> <bytes...>` line shape on purpose (see
  // kvaser.rs's `format_frame` / its `..._matches_the_isotp_parser_contract`
  // test), so one parser handles either source — only "Freq :" telemetry
  // (the Nano's own AutoTest feedback) is meaningful on `serial-data` only,
  // but it's harmless to check both since a CAN frame line never matches it.
  useEffect(() => {
    const handleLine = (line: string) => {
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
    };
    const unsubSerial = listen<string>('serial-data', e => handleLine(e.payload));
    const unsubKvaser = listen<string>('kvaser-data', e => handleLine(e.payload));
    return () => { unsubSerial.then(u => u()); unsubKvaser.then(u => u()); };
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
    if (legacySensorType > 0 && !isAutoTest && !isPlayingRecorded) loggedSend(nanoCmd.frequency(f));
    recording.addRecordingPoint(f); // no-op while not recording
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

  const handleStopRecording = () => recording.stopRecording(legacyFreq);

  const handlePlayRecorded = () => {
    if (legacySensorType === 0 || recording.recordedProfile.length < 2) return;
    const totalDurationSeconds = testDurationMinutes * 60;
    const schedule = buildPlaybackSchedule(recording.recordedProfile, {
      totalDurationSeconds,
      loopPauseSeconds: ABS_REACTION_PAUSE_SECONDS,
    });
    if (schedule.length === 0) return;

    stopPlaybackTimers();
    setIsPlayingRecorded(true);
    setRemainingSeconds(totalDurationSeconds);

    schedule.forEach(({ atSeconds, frequency }) => {
      playbackTimeoutsRef.current.push(setTimeout(() => {
        setLegacyFreq(frequency);
        loggedSend(nanoCmd.frequency(frequency));
      }, atSeconds * 1000));
    });
    playbackTimeoutsRef.current.push(setTimeout(() => {
      setIsPlayingRecorded(false);
      stopPlaybackTimers();
    }, totalDurationSeconds * 1000));

    countdownIntervalRef.current = setInterval(() => {
      setRemainingSeconds(prev => Math.max(0, prev - 1));
    }, 1000);
  };

  const handleStopPlayback = () => {
    stopPlaybackTimers();
    setIsPlayingRecorded(false);
    loggedSend(nanoCmd.frequency(0));
    setLegacyFreq(0);
  };

  const sensorBtnCls = (id: number) => [
    'px-3 py-2.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-40 text-center',
    legacySensorType === id
      ? id === 0
        ? 'bg-danger/15 text-danger border border-danger/20'
        : 'bg-accent/15 text-accent border border-accent/20'
      : 'bg-elevated text-text-secondary border border-border hover:text-text-primary',
  ].join(' ');

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

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
          <button disabled={!isConnected || isPlayingRecorded || recording.isRecording} onClick={() => applySensorType(0)} className={sensorBtnCls(0)}>
            <div>{t('signal_gen.stop')}</div>
            <div className="text-[10px] opacity-60 mt-0.5">{t('signal_gen.stop_sub')}</div>
          </button>
          <button disabled={!isConnected || isPlayingRecorded || recording.isRecording} onClick={() => applySensorType(1)} className={sensorBtnCls(1)}>
            <div>{t('signal_gen.df11')}</div>
            <div className="text-[10px] opacity-60 mt-0.5">{t('signal_gen.df11_sub')}</div>
          </button>
          <button disabled={!isConnected || isPlayingRecorded || recording.isRecording} onClick={() => applySensorType(2)} className={sensorBtnCls(2)}>
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

        {/* Bench Report finding: this was hardcoded to the dark-mode
            accent hex specifically — the slider thumb stayed dark-mode
            blue in light mode while every other accent element on the
            page correctly switched to #007aff. `accent-accent` (the
            theme token, same pattern already used for AddStepForm's
            radio buttons in Reman.tsx) resolves to the right shade in
            both themes. */}
        <input
          type="range" min="0" max="1000" step="1" value={legacyFreq}
          onChange={e => handleFreqChange(parseInt(e.target.value))}
          disabled={!isConnected || isAutoTest || isPlayingRecorded || legacySensorType === 0}
          className="w-full h-1.5 bg-elevated rounded-full appearance-none cursor-pointer accent-accent disabled:opacity-40"
        />

        <div className="flex flex-wrap gap-1.5 mt-2 items-center">
          {QUICK_FREQS.map(v => (
            <button key={v}
              disabled={!isConnected || isAutoTest || isPlayingRecorded || legacySensorType === 0}
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
            disabled={!isConnected || isAutoTest || isPlayingRecorded || legacySensorType === 0}
            className="input-field w-20 text-xs py-1 ml-auto"
          />
        </div>
      </div>

      {/* Recording Studio — record a custom ramp (e.g. 0→200→0 Hz for an
          accel/brake sim), then loop it host-side for the chosen duration
          with a pause after each cycle for the ABS to react. */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
          <span className="text-xs text-text-tertiary">{t('signal_gen.recording_hint')}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="text-xs text-text-tertiary">{t('signal_gen.test_duration')}</label>
            <input
              type="number" min="1" max="60" step="1"
              value={testDurationMinutes}
              onChange={e => setTestDurationMinutes(Math.max(1, parseInt(e.target.value, 10) || 1))}
              disabled={isPlayingRecorded || recording.isRecording}
              className="input-field w-14 text-xs py-1"
            />
            <span className="text-xs text-text-tertiary">{t('signal_gen.minutes_unit')}</span>
            {QUICK_DURATIONS_MIN.map(v => (
              <button key={v}
                disabled={isPlayingRecorded || recording.isRecording}
                onClick={() => setTestDurationMinutes(v)}
                className={[
                  'px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40',
                  testDurationMinutes === v
                    ? 'bg-accent/15 text-accent border border-accent/20'
                    : 'bg-elevated text-text-secondary border border-border hover:text-text-primary',
                ].join(' ')}>
                {v}m
              </button>
            ))}
          </div>
        </div>

        <RecordingControls
          isRecording={recording.isRecording}
          isPlayingRecorded={isPlayingRecorded}
          recordedProfile={recording.recordedProfile}
          recordingStartTime={recording.recordingStartTimeRef.current}
          isConnected={isConnected && legacySensorType > 0}
          isAutoTesting={isAutoTest}
          profileEditorOpen={false}
          onStartRecording={recording.startRecording}
          onStopRecording={handleStopRecording}
          onPlayRecorded={handlePlayRecorded}
          onStopPlayback={handleStopPlayback}
          onSaveRecorded={recording.saveRecordedProfile}
        />

        {isPlayingRecorded && (
          <div className="mt-3 text-center p-3 bg-elevated rounded-xl border border-border">
            <p className="text-xs text-text-tertiary mb-1">{t('signal_gen.test_in_progress')}</p>
            <div className="text-2xl font-bold text-accent tabular-nums font-mono">{formatTime(remainingSeconds)}</div>
          </div>
        )}
      </div>

      {/* ABS Speed Readback — DID poll when this reference has a known
          wssReadback spec (reliable, matches an Autel scan tool); otherwise
          the older passive CAN-sniff channels from CAN Analyzer. */}
      {readSpec ? (
        <div className="mt-4 pt-4 border-t border-border" data-testid="legacy-wss-readback">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-text-primary">{t('signal_gen.abs_readback')}</h3>
            <div className="flex items-center gap-2">
              {readbackOn && didReadErr && <span className="text-[10px] text-danger">{didReadErr}</span>}
              <button
                data-testid="btn-legacy-wss-readback"
                onClick={() => setReadbackOn(v => !v)}
                disabled={!canSend}
                className={[
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 border',
                  readbackOn
                    ? 'bg-success/15 text-success border-success/20'
                    : 'bg-elevated text-text-secondary border-border hover:text-text-primary',
                ].join(' ')}
              >
                {readbackOn ? t('signal_gen.reading') : t('signal_gen.read_wheel_speeds')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(['FL', 'FR', 'RL', 'RR'] as const).map((label, i) => {
              const m = didMeasured[i];
              const commanded = legacySensorType > 0 ? hzToKmh(legacyFreq, wssCalCirc, wssCalPpr) : null;
              const { status, deviationPct, errorKmh } = evaluateWheel({ measured: m, commanded });
              const good = status === 'ok';
              const bad = status === 'off' || status === 'no-signal';
              return (
                <div key={label} data-testid={`legacy-wss-wheel-${label}`} data-status={status} className={[
                  'rounded-xl p-3 text-center border transition-colors',
                  good ? 'bg-success/5 border-success/25'
                    : bad ? 'bg-danger/5 border-danger/25'
                    : 'bg-elevated border-border',
                ].join(' ')}>
                  <div className="text-[10px] font-semibold text-text-tertiary tracking-wide">{label}</div>
                  <div className={[
                    'text-2xl font-bold tabular-nums mt-1',
                    good ? 'text-success' : bad ? 'text-danger' : 'text-text-primary',
                  ].join(' ')}>
                    {m == null ? 'â€”' : m.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-text-tertiary mt-0.5">km/h</div>
                  <div className="text-[10px] text-text-tertiary/70 mt-1 tabular-nums">
                    {status === 'idle' ? 'idle'
                      : status === 'no-signal' ? 'no signal'
                      : `cmd ${(commanded ?? 0).toFixed(1)} · ${errorKmh >= 0 ? '+' : ''}${errorKmh.toFixed(1)} km/h${
                          status === 'off' ? ` (${deviationPct >= 0 ? '+' : ''}${deviationPct.toFixed(0)}%)` : ''
                        }`}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-text-tertiary mt-2 px-0.5">
            {t('signal_gen.legend')} {t('signal_gen.readback_session_hint')}
          </p>
        </div>
      ) : hasWssChannels && (
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
          disabled={!isConnected || legacySensorType === 0 || isPlayingRecorded || recording.isRecording}
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
