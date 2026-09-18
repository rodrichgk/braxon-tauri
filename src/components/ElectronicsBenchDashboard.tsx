import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import {
  CpuChipIcon,
  Battery50Icon,
  KeyIcon,
  BoltIcon,
  HandRaisedIcon,
  WrenchScrewdriverIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  LinkSlashIcon,
  ArrowPathIcon,
  RectangleGroupIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useStickyLog } from '@/hooks/useStickyLog';
import {
  buildModelPayload,
  cableLabel,
  defaultModel,
  modelPayloadTooLong,
  MODEL_PRESETS,
  type AbsElectronicsModel,
} from '@/lib/absModel';
import {
  CATALOG_MANUFACTURERS,
  catalogModelsFor,
  catalogToModel,
} from '@/lib/absModelCatalog';
import { canStringsFor } from '@/lib/absCanStrings';
import { buildCanUpload, N_STRING } from '@/lib/absCanUpload';
import {
  benchReduce,
  initialBenchState,
  eventAnswersCommand,
  voltageBand,
  WHEELS,
  RAMP_MAX_HZ,
  type BenchState,
  type BenchMsg,
  type BenchInboundEvent,
  type ElectronicsCmd,
  type WheelId,
} from '@/lib/absBench';

// The "TEST BENCH - ABS" screen from the original F2-EVO app, rebuilt.
// All the sequencing lives in `@/lib/absBench` (`benchReduce`) — this
// component is the shell: it renders `BenchState`, turns clicks and timer
// ticks into `BenchMsg`s, and pushes the resulting `ElectronicsCmd`s out
// through a re-send-until-OK queue that mirrors `ABS.cs`'s `Polling_Tick`.

interface Props {
  isConnected: boolean;
  // A brief USB blip that self-heals shouldn't wipe the whole bench state
  // — same distinction HydraulicBenchDashboard threads through. Optional so
  // an older caller degrades to the plain 3 s grace window.
  isReconnecting?: boolean;
}

type ParsedEvent = { kind: string; [k: string]: unknown };

// `Polling.Interval = 300`, `Read.Interval = 1000`, `SpeedTimer.Interval =
// 1000` in the decompiled `ABS.cs`.
const RETRY_INTERVAL_MS = 300;
// ~10 re-sends. The board answers with a substantive reply (Volt:/Check ok/…)
// that also advances the queue (see eventAnswersCommand); this is only the
// fallback for a command the bench genuinely never answers.
const GIVE_UP_MS = 3000;
const POLL_INTERVAL_MS = 1000;
const RAMP_INTERVAL_MS = 1000;
// `ABS.cs Polling_Tick` pokes "ELECTRONIC" up to 8× (`ErrorConnection++ <= 7`)
// before giving up on pulling the shared bench into ECU mode.
const MODE_SWITCH_ATTEMPTS = 8;
const MODE_SWITCH_INTERVAL_MS = 800;
// "HYDRAULIC" hand-back — a few pokes is plenty over a local serial link
// (the original spams it for up to 3 s waiting on a response we don't have
// a distinct signal for).
const HAND_BACK_COUNT = 3;
const HAND_BACK_INTERVAL_MS = 400;
const HAND_BACK_DELAY_MS = 600;

export default function ElectronicsBenchDashboard({ isConnected, isReconnecting = false }: Props) {
  const { t } = useTranslation();
  const [bench, setBench] = useState<BenchState>(() => initialBenchState());
  const benchRef = useRef(bench);
  benchRef.current = bench;

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const {
    lines: log, add: addLog, clear: clearLog, containerRef, endRef: logEndRef, handleScroll,
    visible: logVisible, toggleVisible: toggleLogVisible,
  } = useStickyLog();

  // ---- Second COM port (the F2-EVO's ECU / "Centralina" board) ----
  // The bench is two ports (`MainMenuForm.TestHydraulic` / `TestElectronic`):
  // `ELECTRONIC`/`HYDRAULIC` mode switches on one, STX ECU commands on the
  // other. The connection bar owns the first; this owns the second.
  // `ecuOnSecond` = which physical port carries the STX ECU commands
  // (auto-corrected the moment a substantive ECU reply lands on a port).
  const [ecuPorts, setEcuPorts] = useState<{ port_name: string }[]>([]);
  const [secondPort, setSecondPort] = useState<string | null>(null);
  const [secondConnected, setSecondConnected] = useState(false);
  const [ecuOnSecond, setEcuOnSecond] = useState(true);
  const ecuOnSecondRef = useRef(ecuOnSecond);
  ecuOnSecondRef.current = ecuOnSecond;
  const secondConnectedRef = useRef(secondConnected);
  secondConnectedRef.current = secondConnected;

  // Send one STX ECU frame on whichever port currently carries them. Only
  // route to the second port when one is actually connected — `ecuOnSecond`
  // defaults to `true`, so without this guard a plain single-port session
  // would fire every command at the unconnected `ecu_serial_connection` and
  // get back `"Serial port not connected"`.
  const ecuInvoke = useCallback((cmd: ElectronicsCmd) =>
    invoke<string>('f2evo_electronics_send', {
      command: cmd,
      ecu: ecuOnSecondRef.current && secondConnectedRef.current,
    }),
  []);

  // ---- Command queue (re-send front until the board acks "OK") ----
  const queueRef = useRef<ElectronicsCmd[]>([]);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frontStartedAtRef = useRef(0);

  // How many CAN init batches (`can_frames`) are still queued — drives the
  // "Uploading CAN init…" chip. Recomputed whenever the queue changes.
  const [canSyncLeft, setCanSyncLeft] = useState(0);
  const refreshCanSync = useCallback(() => {
    setCanSyncLeft(queueRef.current.filter(c => c.action === 'can_frames').length);
  }, []);

  const sendFront = useCallback(() => {
    const cmd = queueRef.current[0];
    if (!cmd) return;
    (async () => {
      try {
        // Key must be "command", not "cmd" — see f2evo_electronics_send's
        // doc comment in src-tauri/src/f2evo.rs for why "cmd" specifically
        // breaks Tauri's own invoke() routing.
        const frame = await ecuInvoke(cmd);
        addLog(`TX: ${JSON.stringify(frame)}`);
      } catch (e) {
        addLog(`ERR: ${String(e)}`);
      }
    })();
  }, [addLog, ecuInvoke]);

  const advanceQueue = useCallback(() => {
    queueRef.current.shift();
    refreshCanSync();
    if (queueRef.current.length > 0) {
      frontStartedAtRef.current = Date.now();
      sendFront();
    } else if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [sendFront, refreshCanSync]);

  const ensureRetryLoop = useCallback(() => {
    if (retryTimerRef.current) return;
    frontStartedAtRef.current = Date.now();
    sendFront();
    retryTimerRef.current = setInterval(() => {
      if (queueRef.current.length === 0) {
        clearInterval(retryTimerRef.current!);
        retryTimerRef.current = null;
        return;
      }
      if (Date.now() - frontStartedAtRef.current > GIVE_UP_MS) {
        addLog(`WARN: no OK for ${JSON.stringify(queueRef.current[0])} after ${GIVE_UP_MS / 1000}s, dropping it`);
        advanceQueue();
        return;
      }
      sendFront();
    }, RETRY_INTERVAL_MS);
  }, [addLog, advanceQueue, sendFront]);

  const enqueue = useCallback((cmds: ElectronicsCmd[]) => {
    if (cmds.length === 0) return;
    queueRef.current.push(...cmds);
    refreshCanSync();
    ensureRetryLoop();
  }, [ensureRetryLoop, refreshCanSync]);

  // One-shot, no retry, no ack-wait — for idempotent pokes the bench never
  // replies to (the `ABS.cs Model_Click` preamble uses fixed `Sistem.Delay`,
  // not acks; routing them through the reliable queue would stall it
  // `GIVE_UP_MS` per reply-less command).
  const sendNow = useCallback((cmds: ElectronicsCmd[]) => {
    for (const cmd of cmds) {
      ecuInvoke(cmd)
        .then(f => addLog(`TX: ${JSON.stringify(f)}`))
        .catch(e => addLog(`ERR: ${String(e)}`));
    }
  }, [addLog, ecuInvoke]);

  // ---- dispatch: run the reducer, apply state, flush commands + toast ----
  const dispatch = useCallback((msg: BenchMsg) => {
    const step = benchReduce(benchRef.current, msg);
    benchRef.current = step.state;
    setBench(step.state);
    if ('action' in msg && msg.action === 'load_model') {
      // stop_test / frequency:0 / select_out:0 / passive → fire-and-forget;
      // only the model JSON itself needs reliable delivery.
      const upload = step.commands.filter(c => c.action === 'load_model');
      sendNow(step.commands.filter(c => c.action !== 'load_model'));
      enqueue(upload);
    } else {
      enqueue(step.commands);
    }
    if (step.toast) {
      const text = step.toast.translate ? t(`f2evo.abs_bench.${step.toast.message}`) : step.toast.message;
      if (step.toast.kind === 'success') toast.success(text);
      else if (step.toast.kind === 'error') toast.error(text);
      else toast(text, { icon: '⚠️' });
    }
  }, [enqueue, sendNow, t]);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // Abandon a slow CAN init upload: drop its frames from the send queue and
  // (via `skip_can_upload`) release the `Start Test` a `waitComunication`
  // Key Power was holding. The original's upload is an uncancellable modal —
  // this is the non-blocking port's escape hatch.
  const cancelCanUpload = useCallback(() => {
    const before = queueRef.current.length;
    queueRef.current = queueRef.current.filter(c => c.action !== 'can_frames' && c.action !== 'start_abs');
    // Stop the retry loop before re-seeding the queue — the pruned front was
    // never sent, so the next `OK` must not `advanceQueue()` past it.
    if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null; }
    refreshCanSync();
    const dropped = before - queueRef.current.length;
    if (dropped > 0) addLog(`WARN: CAN init upload cancelled — ${dropped} frame(s) dropped`);
    // Releases the `Start Test` a `waitComunication` Key Power was holding
    // (enqueue → ensureRetryLoop restarts the loop from a real send).
    dispatchRef.current({ action: 'skip_can_upload' });
    if (queueRef.current.length > 0 && !retryTimerRef.current) ensureRetryLoop();
    // Best-effort past this point: a late `OK` for a batch that was already
    // on the wire when we pruned can `advanceQueue()` past `start_test` (or
    // one follow-up) before its own retry cycle confirms it. Each is
    // transmitted once by the fresh `sendFront`, so it reaches the board;
    // only the re-send guarantee is lost, for one frame, in that race — an
    // acceptable trade for an abort the original bench simply can't do.
  }, [addLog, refreshCanSync, ensureRetryLoop]);

  // ---- serial-data listener — both ports (subscribes once) ----
  // `fromSecond` = the line arrived on the ECU-second port. An ECU-SPECIFIC
  // reply (`Volt:`, `Check ok`, `Comunication:`, …) landing on a port proves
  // that's where the ECU MCU is, so `ecuOnSecond` self-corrects to it. A bare
  // `OK` is deliberately NOT in this set: the mode / hydraulic MCU speaks
  // `OK` too, so it can't identify the ECU port and must not flip routing.
  const ECU_REPLY_KINDS = ['volt', 'current', 'comunication', 'check_ok', 'motor_result', 'frequency'];
  // Every line only the ECU / "Centralina" MCU ever emits — the auto-detect
  // trigger. Beyond the substantive replies: `Information` (its
  // handshake-complete frame, `ABS.cs` `case "Information"`) and its own
  // unprompted `Electronics` / `Test Centralina` announce
  // (`MainMenuForm.Handle_DataReceived:535`). The mode MCU's vocabulary is
  // disjoint (`Hydraulics` / `ACK Hydraulics` / `Status:`), so a hit here is
  // proof. `ver<X.X>` is excluded on purpose — BOTH boards send one on
  // connect (the hydraulic bench shows a version too), so it can't
  // disambiguate. Without this, a backwards-cabled bench (ECU MCU on the
  // primary port) would deadlock: every STX frame goes to the wrong port,
  // so the ECU never replies, so nothing ever flips — Swap the only way out.
  const isEcuPortSignal = (p: ParsedEvent) =>
    ECU_REPLY_KINDS.includes(p.kind)
    || p.kind === 'information'
    || (p.kind === 'discovery_broadcast' && p.board === 'Electronics');
  useEffect(() => {
    const handleLine = async (line: string, fromSecond: boolean) => {
      let parsed: ParsedEvent;
      try {
        parsed = await invoke<ParsedEvent>('f2evo_parse_line', { line });
      } catch {
        addLog(`RX${fromSecond ? '·2' : ''}: ${line}`);
        return;
      }
      addLog(`RX${fromSecond ? '·2' : ''}: ${line}`);
      if (secondConnectedRef.current && isEcuPortSignal(parsed) && ecuOnSecondRef.current !== fromSecond) {
        ecuOnSecondRef.current = fromSecond;
        setEcuOnSecond(fromSecond);
        addLog(`INFO: ECU board is on the ${fromSecond ? 'second' : 'primary'} port`);
      }
      if (parsed.kind === 'ok') {
        // Only the ECU port's `OK` acks an ECU command. With no second port
        // open the ECU is on the primary (whatever `ecuOnSecond` says); with
        // one open, a stray `OK` from the mode MCU must not drain the queue.
        const ecuFromSecond = secondConnectedRef.current && ecuOnSecondRef.current;
        if (fromSecond === ecuFromSecond) advanceQueue();
        return;
      }
      // First contact from the bench (`Information: Electronic connected.` /
      // a `ver` line — it may never send a bare `Electronics` line) — reply
      // `ACK Electronics` once, fire-and-forget: the mode-switch retry
      // re-elicits it if lost, so it doesn't need the reliable command
      // queue (which it would otherwise head-of-line block until answered).
      if ((parsed.kind === 'information' || parsed.kind === 'version') && !benchRef.current.linked && !benchRef.current.released) {
        ecuInvoke({ action: 'ack_electronics' })
          .then(f => addLog(`TX: ${JSON.stringify(f)}`))
          .catch(err => addLog(`ERR: ${String(err)}`));
      }
      // Advance the command queue when the board answers the front command
      // with its substantive reply rather than a bare `OK` (real hardware
      // often skips the `OK`). Checked against the pre-dispatch front, since
      // dispatch may enqueue follow-ups.
      const front = queueRef.current[0];
      dispatchRef.current({ inbound: parsed as BenchInboundEvent });
      if (eventAnswersCommand(front, parsed.kind)) advanceQueue();
    };
    const unsubA = listen<string>('serial-data', e => handleLine(e.payload, false));
    const unsubB = listen<string>('ecu-serial-data', e => handleLine(e.payload, true));
    return () => { unsubA.then(u => u()); unsubB.then(u => u()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retry-loop interval isn't owned by any effect above (it's started
  // lazily by `ensureRetryLoop` on the first enqueue), so it needs its own
  // unmount cleanup — otherwise leaving the page mid-send keeps firing
  // frames at the bench and logging into an unmounted component.
  useEffect(() => () => {
    if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null; }
  }, []);

  // ---- Second COM port: enumerate, restore, disconnect signal ----
  useEffect(() => {
    invoke<{ port_name: string }[]>('get_serial_ports')
      .then(setEcuPorts)
      .catch(() => {});
    invoke<boolean>('is_ecu_serial_connected').then(setSecondConnected).catch(() => {});
    const unsub = listen('ecu-serial-disconnected', () => setSecondConnected(false));
    return () => { unsub.then(u => u()); };
  }, []);

  const connectSecondPort = useCallback(async () => {
    if (!secondPort) return;
    try {
      await invoke('connect_ecu_serial', { portName: secondPort, baudRate: 115200 });
      setSecondConnected(true);
      addLog(`Second port ${secondPort} connected`);
    } catch (e) {
      addLog(`ERR: second port — ${String(e)}`);
    }
  }, [secondPort, addLog]);

  const disconnectSecondPort = useCallback(async () => {
    try { await invoke('disconnect_ecu_serial'); } catch { /* ignore */ }
    setSecondConnected(false);
  }, []);

  // ---- Pull the shared F2-EVO bench into ECU ("Centralina") mode ----
  // The bench runs as either the hydraulic bench or the ABS bench on one
  // serial line; `ELECTRONIC` is the runtime keyword that switches it (see
  // f2evo.rs::f2evo_bench_mode / ABS.cs Polling_Tick). The boot keyword
  // `Electronics` is sent alongside it every attempt (it's what elicits the
  // full `Electronics\nver X.X` announce), and `ACK Electronics` once.
  const [modeSwitchAttempts, setModeSwitchAttempts] = useState(0);
  // Bumped by the "Retry" button to re-arm the switch loop after it gave up.
  const [modeSwitchNonce, setModeSwitchNonce] = useState(0);
  useEffect(() => {
    if (!isConnected || bench.linked || bench.released) {
      setModeSwitchAttempts(0);
      return;
    }
    let attempt = 0;
    let cancelled = false;
    let id: ReturnType<typeof setInterval> | undefined;
    const poke = () => {
      if (cancelled || benchRef.current.linked || benchRef.current.released) return;
      if (attempt >= MODE_SWITCH_ATTEMPTS) {
        addLog(`WARN: bench did not switch to ECU mode after ${MODE_SWITCH_ATTEMPTS} tries`);
        if (id) clearInterval(id);
        return;
      }
      attempt += 1;
      setModeSwitchAttempts(attempt);
      // `ELECTRONIC` goes on the mode port (the one that ISN'T carrying ECU
      // commands). With no second port open it's just the primary.
      invoke<string>('f2evo_bench_mode', { mode: 'electronic', ecu: !ecuOnSecondRef.current && secondConnectedRef.current })
        .then(f => addLog(`TX (mode): ${f}`))
        .catch(e => addLog(`ERR: ${String(e)}`));
      // The boot keyword `Electronics` every attempt — it's what elicits the
      // full `Electronics\nver X.X` announce (`MainMenuForm_Load`), and some
      // firmware only knows that one. Sent on both ports when two are open.
      invoke<string>('f2evo_probe', { board: 'electronics', ecu: false })
        .then(f => addLog(`TX (probe): ${f}`))
        .catch(() => {});
      if (secondConnectedRef.current) {
        invoke<string>('f2evo_probe', { board: 'electronics', ecu: true }).catch(() => {});
      }
      // ACK once up front — some firmware needs `ACK Electronics` before it
      // will answer any command, and it may announce via `Information:` /
      // `ver` (no discovery broadcast to ack off).
      if (attempt === 1) {
        ecuInvoke({ action: 'ack_electronics' })
          .then(f => addLog(`TX: ${JSON.stringify(f)}`))
          .catch(() => {});
      }
    };
    poke();
    id = setInterval(poke, MODE_SWITCH_INTERVAL_MS);
    return () => { cancelled = true; if (id) clearInterval(id); };
  }, [isConnected, bench.linked, bench.released, modeSwitchNonce, addLog]);

  // ---- Hand the bench back to hydraulic mode after a Release ----
  useEffect(() => {
    if (!isConnected || !bench.released) return;
    let n = 0;
    let id: ReturnType<typeof setInterval> | undefined;
    const handBack = () => {
      invoke<string>('f2evo_bench_mode', { mode: 'hydraulic', ecu: !ecuOnSecondRef.current && secondConnectedRef.current })
        .then(f => addLog(`TX (mode): ${f}`))
        .catch(e => addLog(`ERR: ${String(e)}`));
      n += 1;
    };
    // Hold off until the ECU-shutdown commands (queued by the `release`
    // reducer) have had a moment on the wire, *then* start the HYDRAULIC
    // pokes — the interval is armed inside the delay so the first poke
    // really is the first thing after HAND_BACK_DELAY_MS, not sooner.
    const start = setTimeout(() => {
      handBack();
      id = setInterval(() => {
        if (n >= HAND_BACK_COUNT) { clearInterval(id); return; }
        handBack();
      }, HAND_BACK_INTERVAL_MS);
    }, HAND_BACK_DELAY_MS);
    return () => { clearTimeout(start); if (id) clearInterval(id); };
  }, [isConnected, bench.released, addLog]);

  // ---- Read poll + speed ramp timers ----
  useEffect(() => {
    const poll = setInterval(() => {
      // Don't stack poll batches if the last one hasn't drained yet.
      if (queueRef.current.some(c => c.action.startsWith('read_'))) return;
      dispatchRef.current({ action: 'poll_tick' });
    }, POLL_INTERVAL_MS);
    const ramp = setInterval(() => dispatchRef.current({ action: 'ramp_tick' }), RAMP_INTERVAL_MS);
    return () => { clearInterval(poll); clearInterval(ramp); };
  }, []);

  // ---- Disconnect wipe with a grace window ----
  const wipeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const clearPending = () => {
      if (wipeTimerRef.current) { clearTimeout(wipeTimerRef.current); wipeTimerRef.current = null; }
    };
    if (isConnected) { clearPending(); return; }
    clearPending();
    wipeTimerRef.current = setTimeout(() => {
      queueRef.current = [];
      setCanSyncLeft(0);
      if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null; }
      // The F2-EVO is one USB device: once the primary link is really gone
      // (past the grace window), its ECU COM port went with it. Release it so
      // it isn't left claimed with no affordance to reconnect — the
      // second-port picker only lives on this screen.
      if (secondConnectedRef.current) {
        invoke('disconnect_ecu_serial').catch(() => {});
        setSecondConnected(false);
      }
      dispatchRef.current({ action: 'connection_lost' });
    }, isReconnecting ? 60_000 : 3_000);
    return clearPending;
  }, [isConnected, isReconnecting]);

  // ---- Model selection (ABS.cs Model_Click) ----
  const [showModelForm, setShowModelForm] = useState(false);
  const loadModel = useCallback((m: AbsElectronicsModel) => {
    const payload = buildModelPayload(m);
    if (modelPayloadTooLong(payload)) {
      toast.error(t('f2evo.abs_bench.model_too_long'));
      return;
    }
    const cable = cableLabel(m.code);
    // `ABS.cs` streams this model's `Stringhe` CAN init on Key Power — only
    // ~17 catalog units carry one; a hand-filled model (no `id`) never does.
    // `waitComunication` only bites when there's actually a preamble to bring
    // the bus alive, or `Start Test` would hang forever waiting on comms.
    const strings = m.id != null ? canStringsFor(m.id) : null;
    const { commands: canUpload, hadInit } = buildCanUpload(strings, N_STRING);
    const frameCount = strings ? strings.init.length + strings.base.length + strings.motor.length : 0;
    const waitComunication = (canUpload.length > 0 || hadInit) && !!m.waitComunication;
    dispatch({
      action: 'load_model',
      name: m.name,
      cable,
      signal: m.signal + 1,
      active: m.type === 1,
      coefficient: m.coefficient,
      payload,
      canUpload,
      waitComunication,
    });
    setShowModelForm(false);
    toast.success(
      frameCount > 0
        ? t('f2evo.abs_bench.model_loaded_can', { cable, count: frameCount })
        : t('f2evo.abs_bench.model_loaded', { cable }),
    );
  }, [dispatch, t]);

  // ---- Derived view helpers ----
  const {
    linked, released, model, batteryOn, keyPowerOn, testStarted, speedTestOn, brakeOn, motorTestBusy,
    comms, commsOk, voltage, current, peakCurrent, speedKmh, maxSpeedKmh, rampHz,
    signalChannel, signalActive, wheels,
  } = bench;

  const wheelLabel = (id: WheelId) => t(`f2evo.abs_bench.wheel_${WHEELS[id].key}`);
  // Actions are live only once the bench is confirmed in ECU mode
  // (`linked`), hasn't been Released, AND a model has been uploaded — the
  // bench won't answer commands (`Check Code` etc.) until it knows the unit
  // under test (`ABS.cs`: buttons are dead until `Model.Text` is set).
  const canAct = isConnected && linked && !released && !!model;
  const switching = isConnected && !linked && !released;
  const gaveUp = switching && modeSwitchAttempts >= MODE_SWITCH_ATTEMPTS;

  const linkState = released
    ? { text: t('f2evo.abs_bench.released'), cls: 'text-warning font-medium', dot: 'connection-disconnected' }
    : linked
      ? { text: t('f2evo.abs_bench.linked'), cls: 'text-success font-medium', dot: 'connection-connected' }
      : gaveUp
        ? { text: t('f2evo.abs_bench.switch_failed'), cls: 'text-danger font-medium', dot: 'connection-disconnected' }
        : switching
          ? { text: t('f2evo.abs_bench.switching', { n: modeSwitchAttempts, max: MODE_SWITCH_ATTEMPTS }), cls: 'text-text-tertiary', dot: 'connection-disconnected' }
          : { text: t('f2evo.abs_bench.waiting_for_board'), cls: 'text-text-tertiary', dot: 'connection-disconnected' };

  return (
    <div className="space-y-4">
      {!isConnected && (
        <div className="alert alert-warning flex items-center gap-2" role="alert" data-testid="abs-offline">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
          <span>{t('common.not_connected')} — {t('f2evo.abs_bench.offline_hint')}</span>
        </div>
      )}

      {/* Model — the bench answers nothing until a unit is selected */}
      <div className="card" data-testid="abs-model-card">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <RectangleGroupIcon className="h-4 w-4 text-accent shrink-0" />
            {model ? (
              <>
                <span className="text-sm font-medium text-text-primary truncate">{model.name}</span>
                <span
                  data-testid="abs-cable"
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-md border bg-warning/15 text-warning border-warning/20"
                >
                  {t('f2evo.abs_bench.connect_cable', { cable: model.cable })}
                </span>
              </>
            ) : (
              <span className="text-sm text-text-tertiary">{t('f2evo.abs_bench.no_model')}</span>
            )}
          </div>
          <button
            data-testid="btn-model"
            onClick={() => setShowModelForm(v => !v)}
            // `ABS.cs Model_Click:1871` refuses ("Disconnect Battery") while
            // the battery is engaged — and a mid-session model swap can't
            // safely stand the relays down here. Also pointless while the
            // bench is released to hydraulic mode.
            disabled={!isConnected || batteryOn || released}
            className="btn-secondary text-xs px-2.5 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-40"
          >
            <RectangleGroupIcon className="h-3.5 w-3.5" />
            {model ? t('f2evo.abs_bench.change_model') : t('f2evo.abs_bench.select_model')}
          </button>
        </div>
        {!model && !showModelForm && (
          <p className="mt-2 text-[11px] text-text-tertiary">{t('f2evo.abs_bench.no_model_hint')}</p>
        )}
        {model && batteryOn && (
          <p className="mt-2 text-[11px] text-text-tertiary">{t('f2evo.abs_bench.change_model_hint')}</p>
        )}
        {showModelForm && <AbsModelForm onLoad={loadModel} onCancel={() => setShowModelForm(false)} />}
      </div>

      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="card-header flex items-center gap-2 mb-1">
              <CpuChipIcon className="h-4 w-4 text-accent" />
              {t('f2evo.abs_bench.title')}
            </h2>
            <p className="text-xs text-text-tertiary">{t('f2evo.abs_bench.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 text-xs shrink-0" data-testid="abs-link-state">
            <span className={`connection-dot ${linkState.dot}`} />
            <span className={linkState.cls}>{linkState.text}</span>
            {isConnected && linked && !released && (
              <button
                data-testid="btn-release"
                onClick={() => dispatch({ action: 'release' })}
                className="inline-flex items-center gap-1 btn-secondary px-2 py-1 text-[11px]"
              >
                <LinkSlashIcon className="h-3.5 w-3.5" />
                {t('f2evo.abs_bench.release')}
              </button>
            )}
            {isConnected && released && (
              <button
                data-testid="btn-reconnect"
                onClick={() => dispatch({ action: 'reconnect' })}
                className="inline-flex items-center gap-1 btn-secondary px-2 py-1 text-[11px]"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" />
                {t('f2evo.abs_bench.reconnect')}
              </button>
            )}
            {gaveUp && (
              <button
                data-testid="btn-retry-switch"
                onClick={() => setModeSwitchNonce(n => n + 1)}
                className="inline-flex items-center gap-1 btn-secondary px-2 py-1 text-[11px]"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" />
                {t('common.retry')}
              </button>
            )}
          </div>
        </div>

        {released && (
          <p className="mt-2 text-[11px] text-text-tertiary">{t('f2evo.abs_bench.released_hint')}</p>
        )}
        {gaveUp && (
          <p className="mt-2 text-[11px] text-danger">{t('f2evo.abs_bench.switch_failed_hint')}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <StatusChip label={t('f2evo.abs_bench.battery')} on={batteryOn} />
          <StatusChip label={t('f2evo.abs_bench.key_power')} on={keyPowerOn} />
          <StatusChip
            label={t('f2evo.abs_bench.communication')}
            value={comms || '—'}
            tone={commsOk ? 'success' : comms && comms !== 'None' ? 'accent' : 'muted'}
          />
          {motorTestBusy && (
            <StatusChip label={t('f2evo.abs_bench.motor_test')} value={t('f2evo.abs_bench.running')} tone="accent" />
          )}
          {canSyncLeft > 0 && (
            <span className="inline-flex items-center gap-1">
              <StatusChip
                label={t('f2evo.abs_bench.can_sync')}
                value={String(canSyncLeft)}
                tone="accent"
              />
              <button
                data-testid="btn-can-cancel"
                onClick={cancelCanUpload}
                className="btn-secondary px-1.5 py-0.5 text-[10px]"
              >
                {t('common.cancel')}
              </button>
            </span>
          )}
          {canSyncLeft === 0 && keyPowerOn && bench.waitComunication && !testStarted && (
            <span className="inline-flex items-center gap-1">
              <StatusChip label={t('f2evo.abs_bench.can_wait_comms')} value="…" tone="accent" />
              <button
                data-testid="btn-can-skip"
                onClick={cancelCanUpload}
                className="btn-secondary px-1.5 py-0.5 text-[10px]"
              >
                {t('f2evo.abs_bench.can_skip')}
              </button>
            </span>
          )}
        </div>

        {/* Second COM port — the F2-EVO's ECU board is on its own port */}
        <div className="mt-3 pt-3 border-t border-border" data-testid="abs-second-port">
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            <span className="text-text-tertiary">{t('f2evo.abs_bench.second_port')}</span>
            <select
              className="input-field py-1 text-[11px] w-32"
              data-testid="second-port-select"
              value={secondPort ?? ''}
              onChange={e => setSecondPort(e.target.value || null)}
              disabled={secondConnected}
            >
              <option value="">—</option>
              {ecuPorts.map(p => <option key={p.port_name} value={p.port_name}>{p.port_name}</option>)}
            </select>
            {secondConnected ? (
              <button data-testid="btn-second-disconnect" onClick={disconnectSecondPort} className="btn-secondary px-2 py-1 text-[11px]">
                {t('f2evo.disconnect')}
              </button>
            ) : (
              <button
                data-testid="btn-second-connect"
                onClick={connectSecondPort}
                disabled={!secondPort}
                className="btn-secondary px-2 py-1 text-[11px] disabled:opacity-40"
              >
                {t('common.connect')}
              </button>
            )}
            {secondConnected && (
              <>
                <span className="text-text-tertiary">
                  {t('f2evo.abs_bench.ecu_commands_on', { port: ecuOnSecond ? t('f2evo.abs_bench.second_port_short') : t('f2evo.abs_bench.primary_port_short') })}
                </span>
                <button
                  data-testid="btn-ecu-swap"
                  onClick={() => setEcuOnSecond(v => !v)}
                  className="btn-secondary px-2 py-1 text-[11px]"
                >
                  {t('f2evo.abs_bench.swap_ports')}
                </button>
              </>
            )}
          </div>
          {!secondConnected && (
            <p className="mt-1.5 text-[11px] text-text-tertiary">{t('f2evo.abs_bench.second_port_hint')}</p>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-4 lg:grid-cols-[210px_minmax(0,1fr)_248px]">
        {/* Left — action stack */}
        <div className="space-y-2.5">
          <ActionButton
            testid="btn-battery"
            icon={Battery50Icon}
            label={t('f2evo.abs_bench.battery_voltage')}
            active={batteryOn}
            disabled={!canAct}
            hint={batteryOn ? t('f2evo.abs_bench.state_engaged') : t('f2evo.abs_bench.state_off')}
            onClick={() => dispatch({ action: 'toggle_battery' })}
          />
          <ActionButton
            testid="btn-key"
            icon={KeyIcon}
            label={t('f2evo.abs_bench.key_power')}
            active={keyPowerOn}
            disabled={!canAct || !batteryOn}
            hint={!batteryOn
              ? t('f2evo.abs_bench.key_power_hint')
              : keyPowerOn ? t('f2evo.abs_bench.state_engaged') : t('f2evo.abs_bench.state_off')}
            onClick={() => dispatch({ action: 'toggle_key' })}
          />
          <ActionButton
            testid="btn-speed"
            icon={BoltIcon}
            label={t('f2evo.abs_bench.speed_test')}
            active={speedTestOn}
            disabled={!canAct || !keyPowerOn}
            hint={!keyPowerOn
              ? t('f2evo.abs_bench.speed_test_hint')
              : speedTestOn ? `${speedKmh.toFixed(1)} km/h` : t('f2evo.abs_bench.state_off')}
            onClick={() => dispatch({ action: 'toggle_speed' })}
          />

          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="w-full text-xs btn-secondary py-1.5"
          >
            {showAdvanced ? t('f2evo.abs_bench.hide_advanced') : t('f2evo.abs_bench.advanced')}
          </button>

          {showAdvanced && (
            <div className="space-y-2.5 pt-0.5">
              <ActionButton
                testid="btn-brake"
                compact
                tone="warning"
                icon={HandRaisedIcon}
                label={t('f2evo.abs_bench.brake_test')}
                active={brakeOn}
                disabled={!canAct || !testStarted}
                onClick={() => dispatch({ action: 'toggle_brake' })}
              />
              <ActionButton
                testid="btn-motor"
                compact
                icon={WrenchScrewdriverIcon}
                label={t('f2evo.abs_bench.motor_test')}
                active={motorTestBusy}
                disabled={!canAct || !testStarted || motorTestBusy}
                onClick={() => dispatch({ action: 'run_motor_test' })}
              />

              <div>
                <label className="input-label" htmlFor="abs-signal-ch">{t('f2evo.abs_bench.signal_channel')}</label>
                <input
                  id="abs-signal-ch"
                  type="number"
                  min={0}
                  max={15}
                  value={signalChannel}
                  onChange={e => dispatch({ action: 'set_signal', channel: parseInt(e.target.value, 10) || 0 })}
                  className="input-field py-1 text-xs"
                />
              </div>

              <button
                onClick={() => dispatch({ action: 'toggle_signal_mode' })}
                className="w-full text-xs btn-secondary py-1.5"
                data-testid="btn-signal-mode"
              >
                {signalActive ? t('f2evo.abs_bench.signal_active') : t('f2evo.abs_bench.signal_passive')}
              </button>

              <div>
                <label className="input-label" htmlFor="abs-freq">
                  {t('f2evo.abs_bench.frequency')} — {rampHz} Hz
                </label>
                <input
                  id="abs-freq"
                  type="range"
                  min={0}
                  max={RAMP_MAX_HZ}
                  step={10}
                  value={rampHz}
                  disabled={!canAct || (!testStarted && !speedTestOn)}
                  onChange={e => dispatch({ action: 'set_frequency', hz: parseInt(e.target.value, 10) })}
                  className="w-full accent-accent disabled:opacity-40"
                />
              </div>
            </div>
          )}
        </div>

        {/* Center — car diagram */}
        <div className="card flex flex-col items-center justify-center gap-4 py-6">
          <CarDiagram
            wheels={wheels}
            interactive={canAct && speedTestOn}
            brakeOn={brakeOn}
            label={wheelLabel}
            groupLabel={t('f2evo.abs_bench.wheel_group_label')}
            onToggleWheel={id => dispatch({ action: 'toggle_wheel', wheel: id })}
          />
          <div className="text-center">
            <div className="text-3xl font-semibold text-text-primary tabular-nums" data-testid="abs-speed">
              {speedTestOn ? speedKmh.toFixed(1) : '—'}
              <span className="text-sm text-text-tertiary ml-1">km/h</span>
            </div>
            <div className="text-[11px] text-text-tertiary mt-0.5">
              {t('f2evo.abs_bench.max_speed')}: {maxSpeedKmh.toFixed(1)} km/h
            </div>
          </div>
        </div>

        {/* Right — readouts */}
        <div className="space-y-2.5">
          <ReadoutTile
            label={t('f2evo.abs_bench.voltage')}
            value={voltage == null ? '—' : voltage.toFixed(1)}
            unit="V"
            band={voltageBand(voltage)}
            testid="abs-voltage"
          />
          <ReadoutTile
            label={t('f2evo.abs_bench.current')}
            value={current == null ? '—' : current.toFixed(2)}
            unit="A"
            sub={`${t('f2evo.abs_bench.peak')}: ${peakCurrent.toFixed(2)} A`}
            testid="abs-current"
          />
          <div className="card p-3">
            <div className="text-[11px] text-text-tertiary">{t('f2evo.abs_bench.communication')}</div>
            <div className={`text-sm font-medium mt-0.5 ${commsOk ? 'text-success' : 'text-text-secondary'}`}>
              {comms || '—'}
            </div>
          </div>
          <div className="card p-3 space-y-1">
            <div className="text-[11px] text-text-tertiary mb-1">{t('f2evo.abs_bench.wheel_speeds')}</div>
            {WHEELS.map(w => (
              <div key={w.id} className="flex items-center justify-between text-xs">
                <span className={wheels[w.id].locked ? 'text-danger font-medium' : 'text-text-secondary'}>
                  {wheelLabel(w.id)}
                </span>
                <span className="tabular-nums text-text-primary">
                  {speedTestOn ? wheels[w.id].kmh.toFixed(1) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Session summary (the "Print" analogue — an in-app recap) */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">{t('f2evo.abs_bench.test_summary')}</h3>
          <button onClick={() => setShowSummary(v => !v)} className="text-xs btn-secondary px-2.5 py-1 inline-flex items-center gap-1.5">
            <DocumentTextIcon className="h-3.5 w-3.5" />
            {showSummary ? t('common.collapse') : t('f2evo.abs_bench.report')}
          </button>
        </div>
        {showSummary && (
          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs" data-testid="abs-summary">
            <SummaryItem label={t('f2evo.abs_bench.voltage')} value={voltage == null ? '—' : `${voltage.toFixed(1)} V`} />
            <SummaryItem label={`${t('f2evo.abs_bench.peak')} ${t('f2evo.abs_bench.current')}`} value={`${peakCurrent.toFixed(2)} A`} />
            <SummaryItem
              label={t('f2evo.abs_bench.communication')}
              value={commsOk ? t('f2evo.abs_bench.comms_confirmed') : (comms || '—')}
            />
            <SummaryItem label={t('f2evo.abs_bench.max_speed')} value={`${maxSpeedKmh.toFixed(1)} km/h`} />
          </dl>
        )}
      </div>

      {/* Debug log */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text-primary">
            {t('f2evo.log')} {log.length > 0 && <span className="text-xs font-normal text-text-tertiary">({log.length})</span>}
          </h3>
          <div className="flex gap-1.5">
            <button onClick={toggleLogVisible} className="text-xs btn-secondary px-2.5 py-1">
              {logVisible ? t('f2evo.hide_log') : t('f2evo.show_log')}
            </button>
            {logVisible && (
              <button onClick={clearLog} className="text-xs btn-secondary px-2.5 py-1">{t('common.clear')}</button>
            )}
          </div>
        </div>
        {logVisible && (
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="bg-elevated border border-border rounded-xl p-3 font-mono text-[11px] overflow-y-auto overscroll-y-contain h-48 space-y-0.5"
          >
            {log.length === 0
              ? <span className="text-text-tertiary">{t('f2evo.no_messages')}</span>
              : log.map((line, i) => (
                <div key={i} className={
                  line.startsWith('TX') ? 'text-accent'
                    : line.startsWith('ERR:') || line.startsWith('WARN:') ? 'text-danger'
                    : 'text-success'
                }>{line}</div>
              ))
            }
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatusChip({ label, on, value, tone }: {
  label: string;
  on?: boolean;
  value?: string;
  tone?: 'success' | 'accent' | 'muted';
}) {
  const shown = value ?? (on ? 'ON' : 'OFF');
  const cls = value
    ? tone === 'success' ? 'bg-success/15 text-success border-success/20'
      : tone === 'accent' ? 'bg-accent/15 text-accent border-accent/20'
      : 'bg-elevated text-text-tertiary border-border'
    : on
      ? 'bg-success/15 text-success border-success/20'
      : 'bg-elevated text-text-tertiary border-border';
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${cls}`}>
      {label}: {shown}
    </span>
  );
}

function ActionButton({ testid, icon: Icon, label, active, disabled, hint, onClick, tone, compact }: {
  testid: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  active: boolean;
  disabled: boolean;
  hint?: string;
  onClick: () => void;
  tone?: 'warning';
  compact?: boolean;
}) {
  const activeCls = tone === 'warning'
    ? 'bg-warning/15 border-warning/40 text-warning'
    : 'bg-accent/15 border-accent/40 text-accent';
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        'w-full flex items-center gap-3 rounded-xl border px-3 text-left transition-colors',
        compact ? 'py-2' : 'py-3',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        active ? activeCls : 'bg-elevated border-border text-text-secondary hover:text-text-primary',
      ].join(' ')}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-medium truncate">{label}</span>
        {hint && !compact && <span className="block text-[11px] opacity-70 truncate">{hint}</span>}
      </span>
    </button>
  );
}

function ReadoutTile({ label, value, unit, sub, band, testid }: {
  label: string;
  value: string;
  unit: string;
  sub?: string;
  band?: 'none' | 'ok' | 'warn' | 'bad';
  testid?: string;
}) {
  const valueCls = band === 'bad' ? 'text-danger'
    : band === 'warn' ? 'text-warning'
    : band === 'ok' ? 'text-success'
    : 'text-text-primary';
  return (
    <div className="card p-3" data-testid={testid}>
      <div className="text-[11px] text-text-tertiary">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-0.5 ${valueCls}`}>
        {value}<span className="text-sm text-text-tertiary ml-1">{unit}</span>
      </div>
      {sub && <div className="text-[11px] text-text-tertiary mt-0.5">{sub}</div>}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-text-tertiary">{label}</dt>
      <dd className="text-text-primary font-medium tabular-nums mt-0.5">{value}</dd>
    </div>
  );
}

// The `SelectModelForm` + `Model_Click` params, as a form (BRAXON has no
// `ElectronicsData.accdb` model tree). Presets seed the electrical values;
// `code` (→ the GRM cable) always comes from the operator's sheet.
function AbsModelForm({ onLoad, onCancel }: {
  onLoad: (m: AbsElectronicsModel) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [m, setM] = useState<AbsElectronicsModel>(() => defaultModel());
  const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const set = <K extends keyof AbsElectronicsModel>(k: K, v: AbsElectronicsModel[K]) =>
    setM(prev => ({ ...prev, [k]: v }));
  const setRes = (wheel: 0 | 1 | 2 | 3, idx: 0 | 1, v: number) =>
    setM(prev => {
      const wr = prev.wheelRes;
      const put = (p: readonly [number, number]): readonly [number, number] =>
        idx === 0 ? [v, p[1]] : [p[0], v];
      return {
        ...prev,
        wheelRes: [
          wheel === 0 ? put(wr[0]) : wr[0],
          wheel === 1 ? put(wr[1]) : wr[1],
          wheel === 2 ? put(wr[2]) : wr[2],
          wheel === 3 ? put(wr[3]) : wr[3],
        ],
      };
    });
  const copyRow1 = () => setM(prev => ({
    ...prev,
    wheelRes: [prev.wheelRes[0], prev.wheelRes[0], prev.wheelRes[0], prev.wheelRes[0]],
  }));

  // Catalog picker (the original's SelectModelForm tree, from ElectronicsData.accdb).
  const [mfr, setMfr] = useState('');
  const catalogModels = useMemo(() => (mfr ? catalogModelsFor(mfr) : []), [mfr]);

  const field = 'input-field py-1 text-[11px]';
  return (
    <div className="mt-3 border-t border-border pt-3 space-y-3" data-testid="abs-model-form">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-text-tertiary">
          {t('f2evo.abs_bench.pick_manufacturer')}
          <select
            className={field}
            data-testid="model-mfr"
            value={mfr}
            onChange={e => setMfr(e.target.value)}
          >
            <option value="">—</option>
            {CATALOG_MANUFACTURERS.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-text-tertiary">
          {t('f2evo.abs_bench.pick_model')} {mfr && `(${catalogModels.length})`}
          <select
            className={field}
            data-testid="model-pick"
            value=""
            disabled={!mfr}
            onChange={e => {
              const c = catalogModels.find(x => String(x.id) === e.target.value);
              if (c) setM(catalogToModel(c));
            }}
          >
            <option value="">—</option>
            {catalogModels.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.code > 2000 ? '' : ` · ${t('f2evo.abs_bench.model_no_code')}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[11px] text-text-tertiary">{t('f2evo.abs_bench.catalog_hint')}</p>

      <div className="flex flex-wrap gap-1.5">
        {MODEL_PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => setM(defaultModel(p.model))}
            className="text-[11px] btn-secondary px-2 py-1"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <label className="text-[11px] text-text-tertiary">
          {t('f2evo.abs_bench.model_name')}
          <input className={field} value={m.name} onChange={e => set('name', e.target.value)} />
        </label>
        <label className="text-[11px] text-text-tertiary">
          {t('f2evo.abs_bench.model_code')} → {cableLabel(m.code)}
          <input className={field} type="number" value={m.code}
            onChange={e => set('code', Math.round(num(e.target.value)))} data-testid="model-code" />
        </label>
        <label className="text-[11px] text-text-tertiary">
          {t('f2evo.abs_bench.signal_channel')}
          <input className={field} type="number" min={0} max={15} value={m.signal}
            onChange={e => set('signal', Math.round(num(e.target.value)))} />
        </label>
        <button
          type="button"
          onClick={() => set('type', m.type === 1 ? 0 : 1)}
          aria-pressed={m.type === 1}
          className="btn-secondary text-[11px] py-1.5 self-end"
        >
          {m.type === 1 ? t('f2evo.abs_bench.signal_active') : t('f2evo.abs_bench.signal_passive')}
        </button>
        <label className="text-[11px] text-text-tertiary">
          {t('f2evo.abs_bench.model_coefficient')}
          <input className={field} type="number" step={0.01} value={m.coefficient}
            onChange={e => set('coefficient', num(e.target.value))} />
        </label>
        <label className="text-[11px] text-text-tertiary">
          {t('f2evo.abs_bench.model_brake_speed')}
          <input className={field} type="number" step={0.05} value={m.breakSpeed}
            onChange={e => set('breakSpeed', num(e.target.value))} />
        </label>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-text-tertiary">{t('f2evo.abs_bench.model_wheel_res')}</span>
          <button type="button" onClick={copyRow1} className="text-[10px] btn-secondary px-1.5 py-0.5">
            {t('f2evo.abs_bench.model_copy_row')}
          </button>
        </div>
        {WHEELS.map(w => {
          const label = t(`f2evo.abs_bench.wheel_${w.key}`);
          return (
            <div key={w.id} className="flex items-center gap-2">
              <span className="w-20 text-[11px] text-text-tertiary truncate">{label}</span>
              <input className={`${field} w-20`} type="number" value={m.wheelRes[w.id][0]}
                onChange={e => setRes(w.id, 0, num(e.target.value))} aria-label={`${label} R1`} />
              <input className={`${field} w-20`} type="number" value={m.wheelRes[w.id][1]}
                onChange={e => setRes(w.id, 1, num(e.target.value))} aria-label={`${label} R2`} />
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button type="button" data-testid="btn-model-load" onClick={() => onLoad(m)} className="btn-primary text-xs">
          {t('f2evo.abs_bench.load_model')}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-xs">{t('common.cancel')}</button>
      </div>
    </div>
  );
}

// Top-view car — the original's hand-rotated `Car\Wheel<mask>.jpg` bitmaps,
// redrawn as SVG so a locked / rolling wheel is a token colour, not an
// asset swap (same approach PressureGauge.tsx takes for its gauge face).
function CarDiagram({ wheels, interactive, brakeOn, label, groupLabel, onToggleWheel }: {
  wheels: BenchState['wheels'];
  interactive: boolean;
  brakeOn: boolean;
  label: (id: WheelId) => string;
  groupLabel: string;
  onToggleWheel: (id: WheelId) => void;
}) {
  // x/y of each wheel rect's top-left, indexed FL, FR, RL, RR.
  const pos = [
    { x: 12, y: 60 },
    { x: 130, y: 60 },
    { x: 12, y: 214 },
    { x: 130, y: 214 },
  ] as const;

  return (
    <svg viewBox="0 0 190 320" className="w-full max-w-[220px]" role="group" aria-label={groupLabel}>
      {/* Body */}
      <rect x="34" y="16" width="122" height="288" rx="40" className="fill-elevated stroke-border" strokeWidth="2" />
      {/* Roof / glass hints */}
      <path d="M52 96 h86 M52 224 h86" className="stroke-border" strokeWidth="2" fill="none" />
      <rect x="60" y="120" width="70" height="80" rx="12" className="fill-card stroke-border" strokeWidth="1.5" />
      {/* Axles */}
      <path d="M95 60 v46 M95 214 v46" className="stroke-border" strokeWidth="2" />

      {wheels.map((w, i) => {
        const id = i as WheelId;
        const p = pos[i];
        const rolling = interactive && !w.locked;
        const wheelCls = w.locked
          ? 'fill-danger/25 stroke-danger'
          : rolling
            ? 'fill-success/20 stroke-success'
            : 'fill-elevated stroke-border';
        return (
          <g
            key={id}
            data-testid={`wheel-${WHEELS[id].key}`}
            transform={`translate(${p.x} ${p.y})`}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-pressed={interactive ? w.locked : undefined}
            aria-label={label(id)}
            className={interactive ? 'cursor-pointer' : undefined}
            onClick={interactive ? () => onToggleWheel(id) : undefined}
            onKeyDown={interactive ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleWheel(id); } }) : undefined}
          >
            <rect width="48" height="46" rx="10" strokeWidth="2.5" className={wheelCls} />
            <text x="24" y="27" textAnchor="middle" className="fill-text-secondary" fontSize="9" fontWeight="600">
              {w.locked ? (brakeOn ? 'LOCK' : 'HOLD') : rolling ? '↻' : '—'}
            </text>
            <text x="24" y="62" textAnchor="middle" className="fill-text-tertiary" fontSize="8">
              {label(id)}
            </text>
            {interactive && (
              <text x="24" y="74" textAnchor="middle" className="fill-text-primary tabular-nums" fontSize="9">
                {w.kmh.toFixed(0)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
