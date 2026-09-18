import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { useWheelSpeedControl } from '@/hooks/useWheelSpeedControl';
import { useProfileManagement } from '@/hooks/useProfileManagement';
import { useRecording } from '@/hooks/useRecording';
import { useWssReadback } from '@/hooks/useWssReadback';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { wssReadSpecFor, hzToKmh, evaluateWheel } from '@/lib/wssReadback';
import WaveformCanvas from './WaveformCanvas';
import WheelSpeedControls from './WheelSpeedControls';
import ProfileEditor from './ProfileEditor';
import RecordingControls from './RecordingControls';
import { PlayIcon, PauseIcon } from '@heroicons/react/24/solid';

interface SignalTesterProps {
  sendMessage: (message: string) => void;
  isConnected: boolean;
  /** Selected ABS reference row — enables per-reference save/recall of the
   *  protocol assignment + geometry, and (when a wheel-read spec is on file)
   *  the live wheel-speed readback. */
  selectedRef?: { id: string; reference: string } | null;
  /** Main serial / CAN transport send — the readback polls the ECU over
   *  ISO-TP through this (distinct from `sendMessage`, which is the signal
   *  board). Absent → readback unavailable. */
  canSend?: (message: string) => Promise<boolean | void> | boolean | void;
}

const WHEEL_KEYS = ['fl', 'fr', 'rl', 'rr'] as const;

interface WheelSpeeds {
  fl: number;
  fr: number;
  rl: number;
  rr: number;
}

const WHEEL_NAMES = ['FL', 'FR', 'RL', 'RR'] as const;

const VARIANTS = [
  { label: 'Std',    detailDF11: '7/14 mA',       detailAK: '7/14/28 mA' },
  { label: '1.5 kΩ', detailDF11: '8/16 mA',       detailAK: '8/16/32 mA' },
  { label: '2.7 kΩ', detailDF11: '4.4/8.8 mA',    detailAK: '4.4/8.8/17.6 mA' },
  { label: '1 kΩ',   detailDF11: '12/24 mA',       detailAK: '12/24/~33 mA' },
] as const;

const QUICK_SPEEDS_KMH = [0, 5, 20, 50, 80, 120, 180, 250];

export default function SignalTesterMain({ sendMessage, isConnected, selectedRef, canSend }: SignalTesterProps) {

  // Wheel model — used for km/h ↔ Hz conversion
  const [circumference, setCircumference] = useState(2.0);   // tyre circumference in metres
  const [ppr, setPpr] = useState(48);                        // pulses (teeth) per revolution
  const circumferenceRef = useRef(2.0);
  const pprRef = useRef(48);
  circumferenceRef.current = circumference;
  pprRef.current = ppr;

  // ── Live wheel-speed readback ──
  // The ABS ECU's own measured speed per wheel, polled over ISO-TP and
  // compared against what the bench is injecting (the legacy Arduino
  // bench's green "within 5%" check). Layout is per-reference — see
  // `src/lib/wssReadback.ts`.
  const readSpec = useMemo(() => wssReadSpecFor(selectedRef?.reference), [selectedRef?.reference]);
  const [readbackOn, setReadbackOn] = useState(false);
  const { measured, error: readErr } = useWssReadback({ readSpec, canSend, enabled: readbackOn });
  // Where the wheel-speed *signal itself* is coming from — this is what the
  // "commanded" side of the comparison has to track:
  //  - 'pico'   this Pico wheel-speed control panel is driving it; BRAXON
  //             knows the exact Hz it told the board (`wheelSpeedControl`).
  //  - 'legacy' the old Nano signal generator (`LegacySignalPanel`) is
  //             driving it instead — one shared waveform on `legacyFreq`.
  //  - 'manual' anything else: hand-wired generator, a wheel spun by hand,
  //             or any source BRAXON isn't commanding. The frequency is
  //             unknowable here, so `evaluateWheel` must never call a
  //             mismatch a fault in this mode — see wssReadback.ts.
  const [signalSource, setSignalSource] = useState<'pico' | 'legacy' | 'manual'>('pico');
  const { legacyFreq } = useAppSettings();

  // km/h master speed — drives the Hz value sent to the Pico
  const [speedKmh, setSpeedKmh] = useState(0);
  const speedKmhRef = useRef(0);
  speedKmhRef.current = speedKmh;
  const speedDirtyRef = useRef(false);
  const lastSentHzRef = useRef(-1);

  // Per-channel WSS profiles: index = channel (0=FL,1=FR,2=RL,3=RR), value = profile 0-7
  const [wheelProfiles, setWheelProfiles] = useState<[number, number, number, number]>([0, 0, 0, 0]);
  const isAnyAKChannel = wheelProfiles.some(id => id >= 4);

  // Per-channel AK frequency multipliers ×100 (100=1×, 200=2×, etc.)
  const [akMultipliers, setAkMultipliers] = useState<[number, number, number, number]>([100, 100, 100, 100]);

  // Test states
  const [isAutoTesting, setIsAutoTesting] = useState(false);
  const [isHardwareTesting, setIsHardwareTesting] = useState(false);
  const [isPlayingRecorded, setIsPlayingRecorded] = useState(false);
  const [remainingTime, setRemainingTime] = useState(900);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);

  const maxFrequency = 1500;
  const maxSpeed = 1500;

  // Serial log (TX = blue, RX = green)
  const [serialLog, setSerialLog] = useState<string[]>([]);
  const [logExpanded, setLogExpanded] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Wrap sendMessage to also record TX/ERR lines in the log
  const loggedSend = useCallback((msg: string) => {
    setSerialLog(prev => [...prev.slice(-299), `TX: ${msg.trim()}`]);
    Promise.resolve(sendMessage(msg)).catch((err: unknown) => {
      setSerialLog(prev => [...prev.slice(-299), `ERR: ${String(err)}`]);
    });
  }, [sendMessage]);

  // Wheel speed hook — messages formatted as W<fl>,<fr>,<rl>,<rr>\n
  const wheelSpeedControl = useWheelSpeedControl({
    isConnected,
    sendMessage: (speeds: WheelSpeeds) => {
      loggedSend(`W${speeds.fl},${speeds.fr},${speeds.rl},${speeds.rr}\n`);
    }
  });

  const profileManagement = useProfileManagement();
  const recording = useRecording();

  // km/h → Hz  (v_ms = kmh/3.6 ; rev/s = v_ms / circ ; Hz = rev/s * ppr)
  const kmhToHz = (kmh: number, circ = circumferenceRef.current, p = pprRef.current) => {
    if (circ <= 0 || p <= 0) return 0;
    return Math.round((kmh / 3.6) / circ * p);
  };

  const currentHz = kmhToHz(speedKmh);

  const wheelSpeedControlRef = useRef(wheelSpeedControl);
  wheelSpeedControlRef.current = wheelSpeedControl;

  // 50 ms throttled ticker — matches Python LIVE_UPDATE_INTERVAL_MS = 50
  // Uses refs to avoid stale closures; only sends if Hz changed by ≥ 1
  useEffect(() => {
    const id = setInterval(() => {
      if (!speedDirtyRef.current) return;
      const hz = kmhToHz(speedKmhRef.current);
      if (Math.abs(hz - lastSentHzRef.current) >= 1) {
        wheelSpeedControlRef.current.handleMasterSpeedChange(hz);
        lastSentHzRef.current = hz;
      }
      speedDirtyRef.current = false;
    }, 50);
    return () => clearInterval(id);
  }, []); // intentionally empty — uses refs throughout

  // Listen for incoming serial data and add to log. Board bridge and Kvaser
  // interface print frames identically (see CANSettings.tsx) — the signal
  // board itself always stays on the board bridge, but the diagnostic
  // session driving readback can be on either, so both event sources need
  // to reach this log or RX traffic silently vanishes whenever Kvaser is
  // the active transport.
  useEffect(() => {
    const subs = (['serial-data', 'kvaser-data'] as const).map(evt =>
      listen<string>(evt, e => {
        setSerialLog(prev => [...prev.slice(-299), `RX: ${e.payload}`]);
      })
    );
    return () => { subs.forEach(s => s.then(unlisten => unlisten())); };
  }, []);

  // Auto-scroll log when expanded
  useEffect(() => {
    if (logExpanded) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serialLog, logExpanded]);

  // ── Per-reference protocol assignment + geometry (extends the same
  //    `wssCalibration` blob Signal.tsx's legacy calibration writes). ──
  const [refCalStatus, setRefCalStatus] =
    useState<'idle' | 'loading' | 'loaded' | 'none' | 'saving' | 'saved' | 'error'>('idle');
  const appliedRefRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedRef) { setRefCalStatus('idle'); appliedRefRef.current = null; return; }
    if (appliedRefRef.current === selectedRef.id) return;
    appliedRefRef.current = selectedRef.id;
    setRefCalStatus('loading');
    invoke<string | null>('get_wss_calibration', { id: selectedRef.id })
      .then(json => {
        if (!json) { setRefCalStatus('none'); return; }
        let data: Record<string, unknown>;
        try { data = JSON.parse(json); } catch { setRefCalStatus('error'); return; }
        if (typeof data.circ === 'number' && data.circ > 0) { setCircumference(data.circ); circumferenceRef.current = data.circ; }
        if (typeof data.ppr === 'number' && data.ppr > 0) { setPpr(data.ppr); pprRef.current = data.ppr; }
        const proto = data.protocol as { profiles?: unknown; akMultipliers?: unknown } | undefined;
        const rawProfiles = proto?.profiles;
        if (!Array.isArray(rawProfiles) || rawProfiles.length !== 4) { setRefCalStatus('none'); return; }
        const profs = rawProfiles.map(n => (typeof n === 'number' ? n : 0)) as [number, number, number, number];
        const rawMults = proto?.akMultipliers;
        const mults = (Array.isArray(rawMults) && rawMults.length === 4
          ? rawMults.map(n => (typeof n === 'number' ? n : 100))
          : [100, 100, 100, 100]) as [number, number, number, number];
        setWheelProfiles(profs);
        setAkMultipliers(mults);
        if (isConnected) {
          profs.forEach((p, ch) => loggedSend(`C${ch},${p}\n`));
          mults.forEach((m, ch) => { if (profs[ch] >= 4) loggedSend(`M${ch},${m}\n`); });
        }
        setRefCalStatus('loaded');
      })
      .catch(() => setRefCalStatus('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRef?.id]);

  const saveToReference = useCallback(async () => {
    if (!selectedRef) return;
    setRefCalStatus('saving');
    let existing: Record<string, unknown> = {};
    try {
      const json = await invoke<string | null>('get_wss_calibration', { id: selectedRef.id });
      if (json) existing = JSON.parse(json) as Record<string, unknown>;
    } catch { /* write a fresh blob */ }
    try {
      await invoke('save_wss_calibration', {
        id: selectedRef.id,
        calibration: JSON.stringify({
          ...existing,
          ppr, circ: circumference,
          protocol: { profiles: wheelProfiles, akMultipliers },
        }),
      });
      setRefCalStatus('saved');
      setTimeout(() => setRefCalStatus('loaded'), 2000);
    } catch { setRefCalStatus('error'); }
  }, [selectedRef, ppr, circumference, wheelProfiles, akMultipliers]);

  // ---- Handlers ----

  const handleKmhSlider = (kmh: number) => {
    setSpeedKmh(kmh);
    speedKmhRef.current = kmh;
    speedDirtyRef.current = true;
  };

  // Quick-set: bypass the 50ms throttle and send immediately
  const handleQuickSpeed = (kmh: number) => {
    setSpeedKmh(kmh);
    speedKmhRef.current = kmh;
    const hz = kmhToHz(kmh);
    wheelSpeedControl.handleMasterSpeedChange(hz);
    lastSentHzRef.current = hz;
    speedDirtyRef.current = false;
  };

  const handleStop = () => {
    handleQuickSpeed(0);
    loggedSend('X\n');
  };

  const handleChannelProfileSelect = (ch: number, profileId: number) => {
    setWheelProfiles(prev => {
      const next = [...prev] as [number, number, number, number];
      next[ch] = profileId;
      return next;
    });
    loggedSend(`C${ch},${profileId}\n`);
  };

  const handleChannelProtocolToggle = (ch: number, toAK: boolean) => {
    const variant = wheelProfiles[ch] % 4;
    handleChannelProfileSelect(ch, toAK ? 4 + variant : variant);
  };

  const handleChannelVariantSelect = (ch: number, variant: number) => {
    const isAK = wheelProfiles[ch] >= 4;
    handleChannelProfileSelect(ch, isAK ? 4 + variant : variant);
  };

  const handleAllProtocol = (toAK: boolean) => {
    for (let ch = 0; ch < 4; ch++) {
      const variant = wheelProfiles[ch] % 4;
      handleChannelProfileSelect(ch, toAK ? 4 + variant : variant);
    }
  };

  const handleAKMultiplierChange = (ch: number, multX100: number) => {
    setAkMultipliers(prev => {
      const next = [...prev] as [number, number, number, number];
      next[ch] = multX100;
      return next;
    });
    loggedSend(`M${ch},${multX100}\n`);
  };

  const toggleAutoTest = () => {
    if (!isAutoTesting) {
      setRemainingTime(900);
      loggedSend('R\n');
    } else {
      loggedSend('X\n');
    }
    setIsAutoTesting(prev => !prev);
  };

  const handleStopRecording = () => recording.stopRecording(wheelSpeedControl.masterSpeed);

  const handlePlayRecorded = () => {
    setRemainingTime(900);
    loggedSend('R\n');
    setIsPlayingRecorded(true);
  };

  const handleStopPlayback = () => {
    setIsPlayingRecorded(false);
    loggedSend('X\n');
  };

  const handleSaveRecorded = async (name: string) => {
    await recording.saveRecordedProfile(name);
    await profileManagement.fetchProfiles();
    profileManagement.setActiveProfile(recording.recordedProfile);
  };

  const handleProfileCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const margin = { left: 30, right: 20, top: 20, bottom: 30 };
    const plotWidth = rect.width - margin.left - margin.right;
    const plotHeight = rect.height - margin.top - margin.bottom;
    if (x < margin.left || x > rect.width - margin.right ||
        y < margin.top  || y > rect.height - margin.bottom) return;

    const clickTime = Math.max(0, Math.min(15, ((x - margin.left) / plotWidth) * 15));
    const clickFreq = Math.max(0, Math.min(maxFrequency, (1 - (y - margin.top) / plotHeight) * maxFrequency));

    let foundIdx: number | null = null;
    profileManagement.activeProfile.forEach((point, i) => {
      const px = margin.left + (point.time / 15) * plotWidth;
      const py = margin.top + plotHeight - (point.frequency / maxFrequency) * plotHeight;
      if (Math.hypot(px - x, py - y) < 10) foundIdx = i;
    });

    if (foundIdx !== null) {
      profileManagement.setEditingPoint(foundIdx);
    } else if (profileManagement.editingPoint !== null) {
      profileManagement.updateProfilePoint(profileManagement.editingPoint, {
        time: clickTime, frequency: Math.round(clickFreq)
      });
    } else {
      const newProfile = [...profileManagement.activeProfile, {
        time: clickTime, frequency: Math.round(clickFreq)
      }].sort((a, b) => a.time - b.time);
      profileManagement.setActiveProfile(newProfile);
      profileManagement.setEditingPoint(
        newProfile.findIndex(p => p.time === clickTime && p.frequency === Math.round(clickFreq))
      );
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ---- Render ----

  return (
    <div className="card w-full">

      {/* ── Header ── */}
      <h2 className="card-header flex items-center justify-between">
        <span>Signal Tester</span>
        <span className={[
          'text-xs font-medium px-2 py-0.5 rounded-md',
          isConnected ? 'bg-success/15 text-success' : 'bg-elevated text-text-tertiary border border-border',
        ].join(' ')}>
          {isConnected ? '● Connected' : '○ Disconnected'}
        </span>
      </h2>

      {/* ── Waveform preview ── */}
      <WaveformCanvas
        wheelSpeeds={wheelSpeedControl.wheelSpeeds}
        wheelEnabled={wheelSpeedControl.wheelEnabled}
        isConnected={isConnected}
      />

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        <div>
            {/* ── Speed Control (km/h) ── */}
          <div className="mt-6 pt-6 border-t border-border">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Speed Control</h3>

            {/* Big readout */}
            <div className="flex items-end justify-between mb-3">
              <div className="leading-none">
                <span className="text-4xl font-bold tabular-nums text-text-primary">{speedKmh.toFixed(1)}</span>
                <span className="text-base text-text-tertiary ml-1.5">km/h</span>
              </div>
              <div className="text-right leading-none">
                <span className="text-2xl font-semibold tabular-nums text-accent">{currentHz}</span>
                <span className="text-sm text-text-tertiary ml-1">Hz</span>
              </div>
            </div>

            <input type="range" min="0" max="300" step="0.5" value={speedKmh}
              onChange={e => handleKmhSlider(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-elevated rounded-full appearance-none cursor-pointer accent-[#0a84ff] disabled:opacity-40"
              disabled={!isConnected || isAutoTesting || isPlayingRecorded}
            />

            <div className="flex flex-wrap gap-1.5 mt-3">
              {QUICK_SPEEDS_KMH.map(v => (
                <button key={v} onClick={() => handleQuickSpeed(v)}
                  disabled={!isConnected || isAutoTesting || isPlayingRecorded}
                  className={['px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40',
                    speedKmh === v
                      ? 'bg-accent/15 text-accent border border-accent/20'
                      : 'bg-elevated text-text-secondary hover:text-text-primary border border-border'].join(' ')}>
                  {v}
                </button>
              ))}
              <span className="text-xs text-text-tertiary self-center ml-0.5">km/h</span>
              <button onClick={handleStop} disabled={!isConnected}
                className="ml-auto px-3 py-1 rounded-md text-xs font-medium btn-danger disabled:opacity-40">
                STOP (X)
              </button>
            </div>

            <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-xs text-text-tertiary shrink-0">Wheel model:</span>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-text-tertiary">Circumference</label>
                <input type="number" value={circumference} min="0.1" max="5" step="0.01"
                  onChange={e => { const v = parseFloat(e.target.value); if (v > 0) setCircumference(v); }}
                  className="input-field w-16 text-xs py-1" />
                <span className="text-xs text-text-tertiary">m</span>
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-text-tertiary">Teeth</label>
                <input type="number" value={ppr} min="1" max="200" step="1"
                  onChange={e => { const v = parseInt(e.target.value); if (v > 0) setPpr(v); }}
                  className="input-field w-14 text-xs py-1" />
                <span className="text-xs text-text-tertiary">PPR</span>
              </div>
            </div>
          </div>

          {/* ── WSS Protocol Assignment (per channel) ── */}
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-text-primary">WSS Protocol Assignment</h3>
              <div className="flex items-center gap-1.5">
                {selectedRef && (
                  <>
                    <span
                      data-testid="wss-ref-status"
                      className={[
                        'text-[10px] px-1.5 py-0.5 rounded',
                        refCalStatus === 'error' ? 'text-danger'
                          : refCalStatus === 'saved' || refCalStatus === 'loaded' ? 'text-success'
                          : 'text-text-tertiary',
                      ].join(' ')}
                    >
                      {refCalStatus === 'loading' ? 'Loading…'
                        : refCalStatus === 'saving' ? 'Saving…'
                        : refCalStatus === 'saved' ? 'Saved'
                        : refCalStatus === 'loaded' ? `From ${selectedRef.reference}`
                        : refCalStatus === 'none' ? 'Not saved yet'
                        : refCalStatus === 'error' ? 'Save error'
                        : ''}
                    </span>
                    <button
                      data-testid="btn-wss-save-ref"
                      onClick={saveToReference}
                      disabled={refCalStatus === 'saving' || refCalStatus === 'loading'}
                      className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 bg-elevated text-text-secondary border border-border hover:text-text-primary"
                    >
                      Save to reference
                    </button>
                  </>
                )}
                <button onClick={() => handleAllProtocol(false)} disabled={!isConnected}
                  className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 bg-accent/15 text-accent border border-accent/20 hover:bg-accent/25">
                  All DF11
                </button>
                <button onClick={() => handleAllProtocol(true)} disabled={!isConnected}
                  className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 bg-elevated text-text-secondary border border-border hover:text-text-primary">
                  All AK
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {WHEEL_NAMES.map((wheel, ch) => {
                const profileId = wheelProfiles[ch];
                const isAK = profileId >= 4;
                const variant = profileId % 4;
                return (
                  <div key={wheel} className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold w-7 shrink-0 text-text-secondary">{wheel}</span>

                    <div className="flex rounded-lg overflow-hidden border border-border shrink-0 text-xs">
                      <button onClick={() => handleChannelProtocolToggle(ch, false)} disabled={!isConnected}
                        className={['px-2.5 py-1 font-medium transition-colors disabled:opacity-40',
                          !isAK ? 'bg-accent/15 text-accent' : 'bg-elevated text-text-tertiary hover:text-text-secondary'].join(' ')}>
                        DF11
                      </button>
                      <button onClick={() => handleChannelProtocolToggle(ch, true)} disabled={!isConnected}
                        className={['px-2.5 py-1 font-medium transition-colors disabled:opacity-40',
                          isAK ? 'bg-elevated text-text-primary' : 'bg-elevated text-text-tertiary hover:text-text-secondary'].join(' ')}>
                        VDA AK
                      </button>
                    </div>

                    <div className="flex gap-1">
                      {VARIANTS.map((v, vi) => (
                        <button key={vi} onClick={() => handleChannelVariantSelect(ch, vi)} disabled={!isConnected}
                          title={isAK ? v.detailAK : v.detailDF11}
                          className={['px-2 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40',
                            variant === vi
                              ? 'bg-accent/15 text-accent border border-accent/20'
                              : 'bg-elevated text-text-tertiary border border-border hover:text-text-secondary'].join(' ')}>
                          {v.label}
                        </button>
                      ))}
                    </div>

                    <span className="text-xs text-text-tertiary shrink-0">
                      {isAK ? VARIANTS[variant].detailAK : VARIANTS[variant].detailDF11}
                    </span>

                    {isAK && (
                      <select value={akMultipliers[ch]} disabled={!isConnected}
                        onChange={e => handleAKMultiplierChange(ch, parseInt(e.target.value))}
                        title="AK frequency multiplier"
                        className="text-xs rounded-md px-1.5 py-1 bg-elevated border border-border text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/40 disabled:opacity-40">
                        <option value={50}>×0.5</option>
                        <option value={100}>×1</option>
                        <option value={125}>×1.25</option>
                        <option value={150}>×1.5</option>
                        <option value={175}>×1.75</option>
                        <option value={200}>×2</option>
                        <option value={250}>×2.5</option>
                        <option value={300}>×3</option>
                        <option value={400}>×4</option>
                      </select>
                    )}

                    {isAK && (
                      <button onClick={() => loggedSend(`K${ch}\n`)} disabled={!isConnected}
                        className="ml-auto px-2 py-1 rounded-md text-xs font-medium btn-warning disabled:opacity-40 shrink-0">
                        Barcode
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Live Wheel Speed (ECU-measured, per wheel) ── */}
          {readSpec && (
            <div className="mt-6 pt-6 border-t border-border" data-testid="wss-readback">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-text-primary">Live Wheel Speed</h3>
                <div className="flex items-center gap-2">
                  {readbackOn && readErr && <span className="text-[10px] text-danger">{readErr}</span>}
                  <button
                    data-testid="btn-wss-readback"
                    onClick={() => setReadbackOn(v => !v)}
                    disabled={!canSend}
                    className={[
                      'px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 border',
                      readbackOn
                        ? 'bg-success/15 text-success border-success/20'
                        : 'bg-elevated text-text-secondary border-border hover:text-text-primary',
                    ].join(' ')}
                  >
                    {readbackOn ? 'Reading…' : 'Read wheel speeds'}
                  </button>
                </div>
              </div>

              {/* Signal source — what's actually driving the sensor frequency.
                  Only 'pico' and 'legacy' give evaluateWheel a real commanded
                  speed to check against; 'manual' shows the raw reading only. */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-text-tertiary">Signal source</span>
                <div className="flex gap-0.5 p-0.5 bg-app rounded-lg">
                  {([
                    { id: 'pico', label: 'Pico' },
                    { id: 'legacy', label: 'Legacy Nano' },
                    { id: 'manual', label: 'Manual' },
                  ] as const).map(s => (
                    <button
                      key={s.id}
                      data-testid={`signal-source-${s.id}`}
                      onClick={() => setSignalSource(s.id)}
                      className={[
                        'px-2 py-0.5 text-[10px] font-medium rounded-md transition-colors',
                        signalSource === s.id
                          ? 'bg-elevated text-text-primary shadow-sm'
                          : 'text-text-tertiary hover:text-text-secondary',
                      ].join(' ')}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {WHEEL_NAMES.map((label, i) => {
                  const key = WHEEL_KEYS[i];
                  // Commanded speed, per signal source — null means "unknown
                  // to BRAXON", which evaluateWheel treats as never-a-fault.
                  const cmd: number | null =
                    signalSource === 'manual' ? null
                    : signalSource === 'legacy' ? hzToKmh(legacyFreq, circumference, ppr)
                    : wheelSpeedControl.wheelEnabled[key]
                      ? hzToKmh(wheelSpeedControl.wheelSpeeds[key], circumference, ppr)
                      : 0;
                  const m = measured[i];
                  const { status, deviationPct, errorKmh } = evaluateWheel({ measured: m, commanded: cmd });
                  const good = status === 'ok';
                  const bad = status === 'off' || status === 'no-signal';
                  const [hi, lo] = readSpec.dids[i];
                  return (
                    <div key={label} data-testid={`wss-wheel-${label}`} data-status={status} className={[
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
                        {m == null ? '—' : m.toFixed(1)}
                      </div>
                      <div className="text-[10px] text-text-tertiary mt-0.5">km/h</div>
                      <div className="text-[10px] text-text-tertiary/70 mt-1 tabular-nums">
                        {status === 'idle' ? 'idle'
                          : status === 'no-signal' ? 'no signal'
                          : status === 'unknown' ? 'manual — no verdict'
                          // Lead with the km/h error — the % looks alarming at
                          // low speed where 1-count ECU rounding dominates; append
                          // it only on a flagged wheel, where "how far" matters.
                          : `cmd ${(cmd ?? 0).toFixed(1)} · ${errorKmh >= 0 ? '+' : ''}${errorKmh.toFixed(1)} km/h${
                              status === 'off' ? ` (${deviationPct >= 0 ? '+' : ''}${deviationPct.toFixed(0)}%)` : ''
                            }`}
                      </div>
                      <div className="text-[9px] text-text-tertiary/50 mt-0.5 font-mono">
                        22 {hi.toString(16).toUpperCase().padStart(2, '0')} {lo.toString(16).toUpperCase().padStart(2, '0')}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-text-tertiary mt-2 px-0.5">
                {signalSource === 'manual'
                  ? 'Manual source: showing the raw ECU reading only — no expected speed to compare against, so no wheel is flagged.'
                  : 'Green = ECU reading within 5% of the injected speed.'} The check is coarse
                below ~20 km/h (1&nbsp;km/h ECU resolution) — hold ≥&nbsp;20 km/h for a
                definitive result. Needs a held diagnostic session — open it in Diagnostics above.
              </p>
            </div>
          )}
        </div>

        <div>
            {/* ── Per-wheel independent control (Hz fine-tune) ── */}
          <WheelSpeedControls
            wheelSpeeds={wheelSpeedControl.wheelSpeeds}
            wheelEnabled={wheelSpeedControl.wheelEnabled}
            isLinked={wheelSpeedControl.isLinked}
            masterSpeed={wheelSpeedControl.masterSpeed}
            maxSpeed={maxSpeed}
            isConnected={isConnected}
            isAutoTesting={isAutoTesting}
            isPlayingRecorded={isPlayingRecorded}
            onMasterSpeedChange={wheelSpeedControl.handleMasterSpeedChange}
            onIndividualWheelChange={wheelSpeedControl.handleIndividualWheelChange}
            onToggleWheelEnabled={wheelSpeedControl.toggleWheelEnabled}
            onToggleLinked={wheelSpeedControl.toggleLinked}
          />

          {/* ── Test Controls ── */}
          <div className="mt-6 space-y-3">
            {(isAutoTesting || isPlayingRecorded) && (
              <div className="text-center p-4 bg-elevated rounded-xl border border-border">
                <p className="text-xs text-text-tertiary mb-1">Test in Progress</p>
                <div className="text-4xl font-bold text-accent tabular-nums font-mono">
                  {formatTime(remainingTime)}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={toggleAutoTest}
                className={`px-4 py-3 rounded-lg font-medium flex items-center justify-center transition-all text-sm shadow-sm disabled:opacity-50 ${
                  isAutoTesting ? 'btn-danger' : 'btn-primary'
                }`}
                disabled={!isConnected || isPlayingRecorded || profileEditorOpen}
              >
                {isAutoTesting ? <PauseIcon className="w-4 h-4 mr-2" /> : <PlayIcon className="w-4 h-4 mr-2" />}
                {isAutoTesting ? 'Stop Curve' : 'Run ABS Curve'}
              </button>

              <button
                className={`px-4 py-3 rounded-lg font-medium flex items-center justify-center transition-all text-sm shadow-sm disabled:opacity-50 ${
                  isHardwareTesting ? 'btn-danger' : 'btn-success'
                }`}
                disabled={!isConnected || isAutoTesting || isPlayingRecorded || profileEditorOpen}
                onClick={() => {
                  const starting = !isHardwareTesting;
                  setIsHardwareTesting(starting);
                  loggedSend(starting ? 'R\n' : 'X\n');
                }}
              >
                {isHardwareTesting ? <PauseIcon className="w-4 h-4 mr-2" /> : <PlayIcon className="w-4 h-4 mr-2" />}
                {isHardwareTesting ? 'Stop Test' : 'Hardware Test'}
              </button>

              <button
                onClick={() => loggedSend('K\n')}
                disabled={!isConnected || !isAnyAKChannel}
                title={!isAnyAKChannel ? 'Set at least one channel to VDA AK first' : 'Send VDA AK standstill barcode on all AK channels'}
                className="px-4 py-2.5 rounded-lg font-medium text-sm btn-warning shadow-sm disabled:opacity-50 transition-all"
              >
                Send AK Barcode
              </button>

              <button
                onClick={() => setProfileEditorOpen(v => !v)}
                disabled={isAutoTesting || isPlayingRecorded}
                className="px-4 py-2.5 rounded-lg font-medium text-sm btn-secondary shadow-sm disabled:opacity-50"
              >
                {profileEditorOpen ? '✕ Close Editor' : '⚙ Profile Editor'}
              </button>
            </div>
          </div>

          {/* ── Profile Editor ── */}
          {profileEditorOpen && (
            <ProfileEditor
              profiles={profileManagement.profiles}
              activeProfile={profileManagement.activeProfile}
              selectedProfileId={profileManagement.selectedProfileId}
              isLoadingProfiles={profileManagement.isLoadingProfiles}
              editingPoint={profileManagement.editingPoint}
              maxFrequency={maxFrequency}
              onLoadProfile={profileManagement.loadProfile}
              onSaveProfile={profileManagement.saveProfile}
              onAddPoint={() => profileManagement.addProfilePoint(maxFrequency)}
              onRemovePoint={profileManagement.removeProfilePoint}
              onCanvasClick={handleProfileCanvasClick}
            />
          )}

          {/* ── Recording Studio ── */}
          <RecordingControls
            isRecording={recording.isRecording}
            isPlayingRecorded={isPlayingRecorded}
            recordedProfile={recording.recordedProfile}
            recordingStartTime={recording.recordingStartTimeRef.current}
            isConnected={isConnected}
            isAutoTesting={isAutoTesting}
            profileEditorOpen={profileEditorOpen}
            onStartRecording={recording.startRecording}
            onStopRecording={handleStopRecording}
            onPlayRecorded={handlePlayRecorded}
            onStopPlayback={handleStopPlayback}
            onSaveRecorded={handleSaveRecorded}
          />

          {/* ── Serial Log ── */}
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                Serial Log
                {serialLog.length > 0 && (
                  <span className="text-xs font-normal text-text-tertiary">({serialLog.length})</span>
                )}
              </h3>
              <div className="flex gap-1.5">
                <button onClick={() => setLogExpanded(v => !v)} className="text-xs btn-secondary px-2.5 py-1">
                  {logExpanded ? 'Collapse' : 'Expand'}
                </button>
                <button onClick={() => setSerialLog([])} className="text-xs btn-secondary px-2.5 py-1">Clear</button>
              </div>
            </div>
            <div className={['bg-elevated border border-border rounded-xl p-3 font-mono text-xs overflow-y-auto transition-all duration-200 space-y-0.5',
              logExpanded ? 'h-56' : 'h-20'].join(' ')}>
              {serialLog.length === 0 ? (
                <span className="text-text-tertiary">No messages yet…</span>
              ) : serialLog.map((line, i) => (
                <div key={i} className={
                  line.startsWith('TX:')  ? 'text-accent'  :
                  line.startsWith('ERR:') ? 'text-danger'  : 'text-success'
                }>{line}</div>
              ))}
              <div ref={logEndRef} />
            </div>
          </div>  
        </div>
      </div>      
    </div>
  );
}
