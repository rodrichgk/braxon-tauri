import { useState, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { BeakerIcon, SignalIcon, ExclamationTriangleIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'react-i18next';
import { useStickyLog } from '@/hooks/useStickyLog';
import { useAppSettings } from '@/contexts/AppSettingsContext';
import { useTestSession } from '@/contexts/TestSessionContext';
import { useReports } from '@/contexts/ReportsContext';
import toast from 'react-hot-toast';
import PressureGauge from './PressureGauge';
import HydraulicTestReport from './HydraulicTestReport';
import { type ParsedReport, type Verdict, computeVerdict } from '@/lib/hydraulicReport';

// ---- Types mirroring src-tauri/src/f2evo.rs's `hydraulic::Telemetry` ----

interface ChannelPressure {
  primary: number;
  secondary: number;
}

interface Telemetry {
  pump_pressure: number;
  channel1: ChannelPressure;
  channel2: ChannelPressure;
  channel3: ChannelPressure;
  channel4: ChannelPressure;
  current_amps: number;
  temperature_c: number;
  ready_state: string;
  progress_percent: number;
  oil_level: number;
  oil_status: 'ok' | 'low' | 'critical';
  pod_enabled: boolean;
  protection_faults: string[];
  test_step_index: number;
  valve_under_test: number;
}

// Minimal subset of reman.rs's InterventionSummary — just enough to show
// a pickable search result and build a TestSessionContext LinkedJob out
// of it. Mirrors Reman.tsx's own InterventionSummary field names exactly
// (camelCase, via reman_search_interventions) rather than redeclaring the
// whole thing.
interface LinkCandidate {
  id: string;
  reference?: string;
  clientName?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
}

type F2EvoEvent =
  | { kind: 'hydraulic_status'; fields: string[]; telemetry: Telemetry | null }
  | { kind: 'model'; status: string; param: string | null }
  | { kind: 'ack'; board: string }
  | { kind: 'abs_caricato' }
  | { kind: 'hydraulic_report'; text: string }
  | { kind: string; [key: string]: unknown };

// Mirrors src-tauri/src/hydraulic_import.rs's AbsModelOption — one row from
// the imported HydraulicAbsModel table.
interface AbsModelOption {
  id: number;
  nome: string;
  subCode: number;
  correnteMax: number | null;
  correnteMin: number | null;
  pressioneMax: number | null;
  pressioneMin: number | null;
  pressioneLavoro: number | null;
  temperatura: number | null;
  resistenza: number | null;
}

// Mirrors hydraulic_import.rs's TestStep/AbsProgram.
interface TestStep {
  test: number;
  descrizione: string;
}
interface AbsProgram {
  cicliCount: number;
  steps: TestStep[];
}

// Mirrors hydraulic_import.rs's TestChannelGroup — backs the "Programs
// Cycle" test/channel picker (SelectTestForm/Program_Click in the
// original: picking a Test+Canale loads just that slice of the program
// instead of the default full Test=0/Canale=0 set).
interface TestChannelGroup {
  test: number;
  channels: number[];
}

type HydraulicCmd =
  | { action: 'enable_status' }
  | { action: 'disable_status' }
  | { action: 'get_model' }
  | { action: 'get_serial_number' }
  | { action: 'ack_hydraulics' }
  | { action: 'report_received' }
  | { action: 'pod_enable' }
  | { action: 'pod_disable' }
  | { action: 'reset' }
  | { action: 'oil' }
  | { action: 'unlock'; channel: number }
  | { action: 'pump'; on: boolean }
  | { action: 'bleeding' }
  | { action: 'valves' }
  | { action: 'motor' }
  | { action: 'hydraulic_test' }
  | { action: 'cycles' }
  | { action: 'print_report' }
  | { action: 'raw_json_payload'; json: string };

interface HydraulicBenchDashboardProps {
  isConnected: boolean;
  // Bench Report finding: a brief USB blip that self-heals a second later
  // used to wipe telemetry, the resolved model, the loaded program, and
  // abort any running auto-repair — identically to a real, sustained
  // disconnect, with no visible sign it was "just reconnecting." Optional
  // only so an older caller that doesn't pass it degrades to the old
  // immediate-wipe behavior rather than a type error.
  isReconnecting?: boolean;
  reconnectAttempt?: number;
}

export default function HydraulicBenchDashboard({ isConnected, isReconnecting = false, reconnectAttempt = 0 }: HydraulicBenchDashboardProps) {
  const { t } = useTranslation();
  const { activeHydraulicJob, setActiveHydraulicJob } = useTestSession();
  const { setHydraulicSnapshot } = useReports();
  const { hydraulicOilMax, setHydraulicOilMax } = useAppSettings();
  // Bench Report finding: linking a job could only ever be started from
  // Reman.tsx's own job card — a technician already at the bench wanting
  // to attach the current run to a job had to leave this page, find the
  // job over there, link it, then come back. This is that missing path,
  // scoped to a small inline search rather than reusing Reman.tsx's full
  // multi-filter search UI, which assumes a lot more screen space than
  // fits here.
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<LinkCandidate[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    const trimmed = linkQuery.trim();
    if (trimmed.length < 2) { setLinkResults([]); setLinkSearching(false); return; }
    setLinkSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      // 'open' — the same default landing queue as Interventions itself
      // (RemanPage's `useState<Tab>('interventions')`) — a technician
      // linking a job at the bench is almost always looking for
      // currently-active work, not something already closed.
      invoke<LinkCandidate[]>('reman_search_interventions', {
        query: trimmed, queue: 'open', techId: null, family: null, faultType: null, dateFrom: null, dateTo: null,
      })
        .then(r => { if (!cancelled) setLinkResults(r.slice(0, 8)); })
        .catch(() => { if (!cancelled) setLinkResults([]); })
        .finally(() => { if (!cancelled) setLinkSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [linkQuery]);

  const linkJob = (job: LinkCandidate) => {
    setActiveHydraulicJob({
      ligcdeId: job.id,
      clientName: job.clientName ?? '',
      reference: job.reference ?? '',
      vehiclePlate: job.vehiclePlate ?? '',
      vehicleModel: job.vehicleModel ?? '',
    });
    setLinkQuery('');
    setLinkResults([]);
    setLinkOpen(false);
  };

  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [modelStatus, setModelStatus] = useState<'none' | 'detecting' | 'unknown' | 'resolved' | null>(null);
  const [resolvedModel, setResolvedModel] = useState<AbsModelOption | null>(null);
  const [modelVariants, setModelVariants] = useState<AbsModelOption[] | null>(null); // non-null while the picker is open
  // Backs the "Programs Cycle" test/channel picker — non-null while it's
  // open. pickedTest is the two-step cascade's first choice (null = still
  // showing the Test list); once a channel is picked too, the picker
  // closes and a scoped program load fires.
  const [testChannelGroups, setTestChannelGroups] = useState<TestChannelGroup[] | null>(null);
  const [pickedTest, setPickedTest] = useState<number | null>(null);
  const [programLoading, setProgramLoading] = useState(false);
  const [programError, setProgramError] = useState<string | null>(null);
  const [programSteps, setProgramSteps] = useState<TestStep[] | null>(null);
  // True from the moment the board-upload payloads are enqueued until the
  // board's `ABS caricato.` completion line arrives (or the watchdog below
  // gives up) — the wire-protocol half of "loading a program", distinct
  // from programLoading (which only covers the local DB steps-fetch).
  const [uploadInProgress, setUploadInProgress] = useState(false);
  // How many of the upload's JSON payload lines have been acknowledged
  // ("OK") by the board so far, out of the total enqueued — drives the
  // real (not placeholder) progress bar and phase text below.
  const [uploadProgress, setUploadProgress] = useState<{ sent: number; total: number } | null>(null);
  const uploadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounces "test truly finished" — mid-test, the bench can transition
  // between named steps (e.g. Outlet Test -> Valve closure) with a brief
  // gap where progress_percent momentarily reads 100 for the step that
  // just ended, even though the overall test is still running. Clearing
  // activeTest on that single frame made the "last result" banner flash
  // PASS/REVIEW mid-test. Only actually clears it once progress has
  // stayed at 100 for a sustained period, cancelled if a lower value
  // arrives in the meantime (confirming it was just a step boundary).
  const activeTestClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a *stale* progress_percent — right after a test
  // command is sent, the board hasn't necessarily reset that counter
  // yet, so the very first telemetry frame can still read 100% left over
  // from whatever ran before. Without this, the completion debounce above
  // would start counting immediately off that leftover value and declare
  // the brand-new test "done" ~1.5s after it was sent, without it ever
  // having actually run (observed: an auto-sequence blowing through
  // Bleeding -> Valves -> Motor -> Hydraulic Test in seconds, none of
  // them having genuinely executed). Reset to false whenever activeTest
  // changes to a new test (see the effect below); only set true once a
  // frame with progress_percent < 100 is actually seen for it, which the
  // completion debounce below now requires before it'll start at all.
  const testStartConfirmedRef = useRef(false);
  // Resolves whatever `runTestAndWait` (auto-sequence, below) is currently
  // waiting on, the instant activeTest genuinely clears — piggybacks on
  // the same debounced "really finished, not just a step boundary" signal
  // above rather than re-deriving it.
  const testDoneResolverRef = useRef<(() => void) | null>(null);
  // Remembers whichever ABS model (+ Programs-Cycle scope, if that's what
  // was loaded) was last resolved, so the shield-close recovery below can
  // restore it without the operator re-picking it by hand. Updated at the
  // top of loadAbsProgram, so it covers every path that loads a program.
  const lastKnownModelRef = useRef<{ option: AbsModelOption; scope?: { test: number; canale: number } } | null>(null);
  // True when the last program load was scoped to a specific Test/Channel
  // (a "Programs Cycle" load, as opposed to the full default). Mirrors
  // the decompiled NameABS()'s `TestFailed > 0` check — confirmed from
  // source (not guessed) that a scoped load doesn't run anything on its
  // own: the board just sits at "Ready", progress at 0, right through
  // "ABS caricato.". What actually triggers it is the board's *next*
  // "Model: <name>" line re-confirming the model, which the original
  // reacts to with `if (TestFailed > 0) { Send_Click(Cycle, ...); }` —
  // i.e. the auto-"Cycle" fires off that event, not off the upload
  // finishing. See the 'model' event handling below for where this gets
  // read. Reset to false after firing once, rather than the original's
  // apparent unbounded repeat-on-every-reconfirmation — deliberately more
  // conservative given the physical repeatability risk of getting that
  // wrong, not something confirmed necessary either way.
  const lastLoadWasScopedRef = useRef(false);
  // Tracks the Shield protection fault's *falling* edge (open -> closed) —
  // that's the edge that matters here, not the opening one: the board's
  // own protection handling already halts everything and clears the
  // loaded model (see the 'Model: NONE' handling below) while the shield
  // is open, and hasFault/actuationDisabled already blocks every
  // actuation button for that whole span. This only automates what used
  // to be manual afterward: reselecting the model, reloading its program,
  // and re-enabling the pod, once it's safe again.
  const shieldOpenRef = useRef(false);
  // Set only while a shield-close-triggered reload is in flight, so the
  // pod gets auto re-enabled for *that* reload specifically — an operator
  // who reloads a program by hand still enables the pod themselves
  // afterward, same as before this feature existed.
  const shieldRecoveryPendingRef = useRef(false);
  // Auto Test & Repair sequence (see runAutoTestAndRepair) state — mostly
  // refs because the event listener effect below subscribes once (`[]`
  // deps) and would otherwise only ever see these at their initial values.
  const [autoSequenceRunning, setAutoSequenceRunning] = useState(false);
  const autoSequenceRunningRef = useRef(false);
  const [autoRepairRound, setAutoRepairRound] = useState<number | null>(null);
  const [autoPrompt, setAutoPrompt] = useState<{ verdict: Verdict; round: number } | null>(null);
  const autoPromptResolveRef = useRef<((cont: boolean) => void) | null>(null);
  const autoAbortRef = useRef(false);
  const parsedReportRef = useRef<ParsedReport | null>(null);
  // Resolves once loadAbsProgram's upload actually finishes (success via
  // 'abs_caricato', or a failure exit) — loadAbsProgram itself only
  // returns once the payload is *enqueued*, not once the board confirms
  // it, so the auto-repair loop needs this to know when a targeted
  // Programs-Cycle-style reload is genuinely done before acting on it.
  const programLoadResolverRef = useRef<(() => void) | null>(null);
  // Live progress watch during a targeted outlet-test repair — resolves
  // true the moment telemetry reports progress_percent past the stop
  // threshold, false if the repair action finishes naturally first
  // without ever reaching it. This bench has no dedicated "stop an
  // in-progress Cycle/Programs Cycle" command — ABORT/RESET (H-RESET) is
  // the only way to interrupt one, and that always disables the pod as a
  // side effect, which is why the early-stop path always pairs it with an
  // explicit pod_enable right after (see waitForProgress below).
  const progressWatchRef = useRef<{ minPercent: number; resolve: (reached: boolean) => void } | null>(null);
  // Ref mirrors of resolvedModel/hydraulicOilMax for the listener effect
  // below (subscribes once, `[]` deps — a plain closure over either would
  // only ever see their value at mount).
  const resolvedModelRef = useRef<AbsModelOption | null>(null);
  const hydraulicOilMaxRef = useRef(hydraulicOilMax);
  // Safety monitors: the board enforces its own max temperature for the
  // loaded model (and simply stops the test once crossed) and a minimum
  // oil level — these give the operator a heads-up *before* either of
  // those actually trips, rather than being surprised by a sudden
  // board-side stop mid-test. Edge-triggered (tempWarnedRef/oilWarnedRef)
  // so it only prompts once per crossing, not on every telemetry frame
  // while still over/under the threshold — clears once the reading
  // recovers back the other way.
  const [safetyPrompt, setSafetyPrompt] = useState<
    { kind: 'temperature'; current: number; max: number } | { kind: 'oil'; percent: number } | null
  >(null);
  const tempWarnedRef = useRef(false);
  const oilWarnedRef = useRef(false);
  const [linked, setLinked] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeTest, setActiveTest] = useState<string | null>(null);
  // Accumulated Report: telemetry text — mirrors FormHydraulicBench.cs's
  // own `ReportBuffer += text3`, which keeps appending across however many
  // Report: frames the board sends for one test rather than replacing it.
  const [reportText, setReportText] = useState('');
  const [showReport, setShowReport] = useState(false);
  // Kept in sync with reportText so the "last result" banner can show a
  // pass/review/fail verdict the moment a test finishes, without the
  // operator having to open the full report view to find out.
  const [parsedReport, setParsedReport] = useState<ParsedReport | null>(null);
  // Lifted up from HydraulicTestReport (rather than local state there) so
  // an override survives closing and reopening the report panel — it was
  // getting silently reset every time, since the report view unmounts
  // when collapsed. Keyed by index into parsedReport.valves.
  const [valveOverrides, setValveOverrides] = useState<Record<number, 'ok' | 'marginal' | 'fault'>>({});
  const {
    lines: log, add: addLog, clear: clearLog, containerRef, endRef: logEndRef, handleScroll,
    visible: logVisible, toggleVisible: toggleLogVisible,
  } = useStickyLog();

  // Command queue — matches what FormHydraulicBench.cs's `Send_Tick` timer
  // actually does, which turned out to be a genuinely different model than
  // "send once and wait": it fires every ~200ms (`Send.Interval`) and on
  // *every* tick re-transmits `Comand.Peek()` — the same front-of-queue
  // command, sent again and again — until `case "OK": Comand.Dequeue()`
  // pops it. Only a single 20s-of-no-progress watchdog gives up (there it
  // fully resets the COM connection; here, more conservatively, it just
  // drops the stuck command so the queue isn't wedged forever). A one-shot
  // send with a short timeout — what this replaced — isn't what the board
  // expects and is far less tolerant of a single dropped byte or missed
  // reply on the wire.
  const RETRY_INTERVAL_MS = 200;
  const GIVE_UP_MS = 20000;
  // How long progress_percent must hold at 100 before a test is treated
  // as genuinely finished, not just a step boundary — see
  // activeTestClearTimerRef. Bumped up from an earlier 1500ms: Bleeding
  // in particular can step pressure up/down through multiple internal
  // stages, and those pauses between stages can plausibly run longer than
  // that. Still just a tunable guess, not a confirmed number.
  const TEST_COMPLETE_DEBOUNCE_MS = 5000;
  // Auto-repair's targeted outlet-test repair (see waitForProgress below)
  // interrupts itself once progress crosses this point — no pressure
  // reading involved, just how far along the repair action is. This
  // bench has no dedicated stop for an in-progress Cycle/Programs Cycle,
  // so "interrupt" always means ABORT/RESET (H-RESET), which disables the
  // pod as a side effect — always paired with an explicit pod_enable
  // right after.
  const CHANNEL_WATCH_MIN_PROGRESS = 50;
  // Upper bound on how long the auto-sequence will ever wait on a single
  // test action — generous enough to never trip during a legitimately
  // long-running test, but guarantees the sequence can't be left stuck
  // forever even by some fault condition this code doesn't yet know to
  // watch for specifically (see abortAutoSequence).
  const AUTO_STEP_TIMEOUT_MS = 90000;
  const queueRef = useRef<HydraulicCmd[]>([]);
  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frontStartedAtRef = useRef(0);

  const sendFront = () => {
    const cmd = queueRef.current[0];
    if (!cmd) return;
    (async () => {
      try {
        // Key must be "command", not "cmd" — see the comment on
        // f2evo_hydraulic_send in src-tauri/src/f2evo.rs for why "cmd"
        // specifically breaks Tauri's own invoke() routing.
        const frame = await invoke<string>('f2evo_hydraulic_send', { command: cmd });
        addLog(`TX: ${JSON.stringify(frame)}`);
      } catch (e) {
        addLog(`ERR: ${String(e)}`);
      }
    })();
  };

  const ensureRetryLoop = () => {
    if (retryTimerRef.current) return; // already running
    frontStartedAtRef.current = Date.now();
    sendFront();
    retryTimerRef.current = setInterval(() => {
      if (queueRef.current.length === 0) {
        clearInterval(retryTimerRef.current!);
        retryTimerRef.current = null;
        return;
      }
      if (Date.now() - frontStartedAtRef.current > GIVE_UP_MS) {
        addLog(`WARN: no OK for ${JSON.stringify(queueRef.current[0])} after 20s, dropping it`);
        advanceQueue();
        return;
      }
      sendFront(); // re-send the same front command — this is the part that differs from a normal request/response queue
    }, RETRY_INTERVAL_MS);
  };

  const advanceQueue = () => {
    // Only the program-upload's own JSON payload lines count toward
    // uploadProgress — other commands can share the same queue (e.g. a
    // watchdog-triggered reset/pod_enable) without skewing the "N of M
    // lines sent" count.
    if (queueRef.current[0]?.action === 'raw_json_payload') {
      setUploadProgress(prev => (prev ? { ...prev, sent: prev.sent + 1 } : prev));
    }
    queueRef.current.shift();
    if (queueRef.current.length > 0) {
      frontStartedAtRef.current = Date.now();
      sendFront(); // don't wait for the next tick to send the new front
    } else if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const send = (cmd: HydraulicCmd) => {
    queueRef.current.push(cmd);
    ensureRetryLoop();
  };

  // The "Progress" dialog the original shows after an ABS model is picked
  // (FormHydraulicData's ctor / btnHydraulicLoad_Click) blocks the rest of
  // the UI until loading is done; reproduced here across two phases:
  // 1. Local DB validation that cycle data exists for this unit
  //    (IsABSExist/IsCycleExist) — programLoading covers this.
  // 2. The actual board upload the ctor triggers automatically right after
  //    (`LoadABS(); Invia_Click(...)`, headless, no dialog of its own) —
  //    uploadInProgress covers this, ending when the board's `ABS
  //    caricato.` line arrives (see the 'abs_caricato' case in the listener
  //    below) or the watchdog times out.
  // On failure at any phase it also hard-resets and re-enables the pod
  // (ABORT/RESET, i.e. H-RESET, then H-POD:ENABLE) rather than just
  // disabling it (EndLoad's original `H-POD:DISABLE`) — observed on real
  // hardware: a failed/timed-out upload (e.g. "ABS data incorrect", the
  // 20s watchdog below) can leave the bench stuck in a weird state that a
  // plain pod_disable doesn't clear, needing the same hard-reset-then-
  // re-enable procedure the auto-repair flow already uses to interrupt a
  // Cycle/Programs Cycle early.
  //
  // `scope` is the Test/Canale slice to load — omitted (or undefined) for
  // the default full-program load (Test=0, Canale=0), or a specific
  // {test, canale} pair when loading via the "Programs Cycle" picker below
  // (mirrors Program_Click's TestFailed/ChannelFailed in the original).
  const loadAbsProgram = async (option: AbsModelOption, scope?: { test: number; canale: number }) => {
    lastKnownModelRef.current = { option, scope };
    lastLoadWasScopedRef.current = scope !== undefined;
    setProgramLoading(true);
    setProgramError(null);
    setProgramSteps(null);
    let program: AbsProgram;
    try {
      program = await invoke<AbsProgram>('hydraulic_load_abs_program', { idAbs: option.id, test: scope?.test, canale: scope?.canale });
      setProgramSteps(program.steps);
    } catch (e) {
      addLog(`ERR: hydraulic_load_abs_program failed — ${String(e)}`);
      setProgramError(String(e));
      queueRef.current = [];
      setActiveTest(null);
      send({ action: 'reset' });
      send({ action: 'pod_enable' });
      shieldRecoveryPendingRef.current = false;
      setProgramLoading(false);
      const resolveLoad = programLoadResolverRef.current;
      programLoadResolverRef.current = null;
      resolveLoad?.();
      return;
    }
    setProgramLoading(false);

    setUploadInProgress(true);
    setUploadProgress({ sent: 0, total: 0 });
    try {
      const payloads = await invoke<string[]>('hydraulic_build_abs_upload', { idAbs: option.id, test: scope?.test, canale: scope?.canale });
      setUploadProgress({ sent: 0, total: payloads.length });
      for (const json of payloads) {
        send({ action: 'raw_json_payload', json });
      }
      addLog(`Upload: ${payloads.length} lines enqueued for "${option.nome}"`);
      if (uploadTimeoutRef.current) clearTimeout(uploadTimeoutRef.current);
      // No per-field CheckData replication (see build_abs_upload's doc
      // comment) — if `ABS caricato.` never arrives at all, this is the
      // fallback so the UI doesn't stay blocked forever.
      uploadTimeoutRef.current = setTimeout(() => {
        addLog('WARN: no "ABS caricato." within 20s, giving up on the upload');
        setUploadInProgress(false);
        setUploadProgress(null);
        setProgramError('Error: ABS data incorrect!!!');
        queueRef.current = [];
        setActiveTest(null);
        send({ action: 'reset' });
        send({ action: 'pod_enable' });
        shieldRecoveryPendingRef.current = false;
        const resolveLoad = programLoadResolverRef.current;
        programLoadResolverRef.current = null;
        resolveLoad?.();
      }, 20000);
    } catch (e) {
      addLog(`ERR: hydraulic_build_abs_upload failed — ${String(e)}`);
      setUploadInProgress(false);
      setUploadProgress(null);
      setProgramError(String(e));
      queueRef.current = [];
      setActiveTest(null);
      send({ action: 'reset' });
      send({ action: 'pod_enable' });
      shieldRecoveryPendingRef.current = false;
      const resolveLoad = programLoadResolverRef.current;
      programLoadResolverRef.current = null;
      resolveLoad?.();
    }
  };

  // Resolves the board's numeric CodiceABS against the imported reference
  // data. Mirrors SelectABSForm.cs: 0 matches → unknown unit, 1 → auto
  // resolved, >1 → the board can identify the base unit but not which
  // variant is mounted, so the operator has to pick (see the picker below).
  const resolveAbsModel = async (codiceAbsRaw: string) => {
    const codiceAbs = parseInt(codiceAbsRaw, 10);
    if (Number.isNaN(codiceAbs)) {
      setModelStatus('unknown');
      return;
    }
    setModelStatus('detecting');
    try {
      const options = await invoke<AbsModelOption[]>('hydraulic_lookup_abs_model', { codiceAbs });
      if (options.length === 0) {
        setModelStatus('unknown');
        setResolvedModel(null);
      } else if (options.length === 1) {
        setResolvedModel(options[0]);
        setModelStatus('resolved');
        loadAbsProgram(options[0]);
      } else {
        setModelVariants(options);
      }
    } catch (e) {
      addLog(`ERR: model lookup failed — ${String(e)}`);
      setModelStatus('unknown');
    }
  };

  const pickAbsVariant = (option: AbsModelOption) => {
    setResolvedModel(option);
    setModelStatus('resolved');
    setModelVariants(null);
    loadAbsProgram(option);
  };

  // "Programs Cycle" — mirrors Program_Click: opens a Test/Canale picker
  // (SelectTestForm) scoped to whichever Test values actually have Cicli
  // data for the resolved ABS, then reloads just that slice of the
  // program once both are picked. Confirmed on real hardware that the
  // reload alone is inert — the board sits at "Ready", progress at 0,
  // right through "ABS caricato.". Confirmed from the decompiled source
  // (NameABS()) that what actually runs it is the board's *next* "Model:
  // <name>" line re-confirming the model: `if (TestFailed > 0) {
  // Send_Click(Cycle, ...); }` — handled in the listener below via
  // lastLoadWasScopedRef, not sent directly from here.
  const openProgramsCyclePicker = async () => {
    if (!resolvedModel) return;
    try {
      const groups = await invoke<TestChannelGroup[]>('hydraulic_list_test_channels', { idAbs: resolvedModel.id });
      setTestChannelGroups(groups);
      setPickedTest(null);
    } catch (e) {
      addLog(`ERR: hydraulic_list_test_channels failed — ${String(e)}`);
    }
  };

  const pickTestChannel = (test: number, canale: number) => {
    setTestChannelGroups(null);
    setPickedTest(null);
    if (resolvedModel) loadAbsProgram(resolvedModel, { test, canale });
  };

  // Forcibly unblocks the auto-sequence wherever it's currently awaiting,
  // then marks it aborted. Setting autoAbortRef alone isn't enough — the
  // loop only checks that flag *between* awaits, so if it's stuck inside
  // runTestAndWait / loadAbsProgramAndWait / the continue-prompt / the
  // progress watch, none of those hand control back until their own
  // resolver actually fires. Every pending resolver gets force-resolved
  // here so whichever one the loop is sitting on returns immediately
  // instead of waiting on a physical action the board may never perform
  // (e.g. it holds all test actions while any protection fault is active
  // — see the fault-triggered abort below).
  const abortAutoSequence = () => {
    autoAbortRef.current = true;
    if (autoPromptResolveRef.current) {
      autoPromptResolveRef.current(false);
      autoPromptResolveRef.current = null;
    }
    if (testDoneResolverRef.current) {
      const resolve = testDoneResolverRef.current;
      testDoneResolverRef.current = null;
      resolve();
    }
    if (programLoadResolverRef.current) {
      const resolve = programLoadResolverRef.current;
      programLoadResolverRef.current = null;
      resolve();
    }
    if (progressWatchRef.current) {
      const watch = progressWatchRef.current;
      progressWatchRef.current = null;
      watch.resolve(false);
    }
    setAutoPrompt(null);
    setActiveTest(null);
  };

  // Proactively re-sends ENABLESTATUS a beat after any H-RESET (the
  // board's own hardware DTR/RTS toggle, per the decompiled ResetBench())
  // so telemetry actually resumes streaming afterward. Observed on real
  // hardware: pressing Enable POD right after a reset "loads" but neither
  // the pod indicator nor the gauges ever update — the board doesn't
  // necessarily re-announce itself with a fresh discovery broadcast the
  // way it does after a real reconnect, which is the only thing that
  // otherwise re-triggers this handshake, leaving the bench silently
  // stuck until a manual disconnect/reconnect. The delay is a guess at
  // how long the board needs to reboot after the reset pulse, not a
  // confirmed number.
  const reestablishTelemetry = () => {
    setTimeout(() => send({ action: 'enable_status' }), 1000);
  };

  // Sends a hard reset — the only way to stop an in-progress Cycle/
  // Programs Cycle or test on this bench, there's no dedicated stop
  // command — and clears everything that implies client-side: model,
  // program, pod, live readings, same as a fresh reconnect. Only for a
  // reset that's meant to fully stand the bench down (the manual ABORT/
  // RESET button, a temperature/oil safety stop); the auto-repair flow's
  // own mid-round early-stop reset needs resolvedModel/programSteps to
  // stay intact to keep going, so it only calls reestablishTelemetry()
  // above directly rather than this.
  const hardReset = (reenablePod: boolean) => {
    queueRef.current = [];
    abortAutoSequence();
    setTelemetry(null);
    setLinked(false);
    setModelStatus(null);
    setResolvedModel(null);
    setModelVariants(null);
    setProgramLoading(false);
    setProgramError(null);
    setProgramSteps(null);
    setUploadInProgress(false);
    setUploadProgress(null);
    setValveOverrides({});
    if (uploadTimeoutRef.current) { clearTimeout(uploadTimeoutRef.current); uploadTimeoutRef.current = null; }
    tempWarnedRef.current = false;
    oilWarnedRef.current = false;
    lastLoadWasScopedRef.current = false;
    send({ action: 'reset' });
    if (reenablePod) send({ action: 'pod_enable' });
    reestablishTelemetry();
  };

  const dismissSafetyPrompt = () => setSafetyPrompt(null);

  const stopForSafety = () => {
    setSafetyPrompt(null);
    // Deliberately not re-enabling the pod here, unlike the auto-repair
    // flow's own early-stop — the underlying condition (heat, low oil) is
    // presumably still present immediately after stopping, so leaving it
    // disabled until the operator has actually addressed it (let it cool,
    // top up oil) is the safer default; they can re-enable manually once
    // it's actually safe to continue.
    hardReset(false);
  };

  useEffect(() => {
    const unsub = listen<string>('serial-data', async e => {
      const line = e.payload;
      let parsed: F2EvoEvent;
      try {
        parsed = await invoke<F2EvoEvent>('f2evo_parse_line', { line });
      } catch {
        return;
      }
      addLog(`RX: ${line}`);

      if (parsed.kind === 'discovery_broadcast' && 'board' in parsed && parsed.board === 'Hydraulics') {
        // The board keeps re-announcing itself until acked AND told to
        // start streaming telemetry — acking alone isn't enough (verified
        // on real hardware: it replies "OK" to the ack but then just
        // re-announces itself again). ENABLESTATUS is what actually moves
        // it into sending Status: frames. Queued, not fired together — the
        // queue only sends ENABLESTATUS once the board's "OK" for the ack
        // comes back.
        addLog('AUTO-ACK: sending ACK Hydraulics…');
        send({ action: 'ack_hydraulics' });
        send({ action: 'enable_status' });
        return;
      }
      if (parsed.kind === 'hydraulic_status' && 'telemetry' in parsed && parsed.telemetry) {
        const t = parsed.telemetry as Telemetry;
        setTelemetry(t);
        setLinked(true);

        // Any protection fault at all halts test actions board-side ("Test
        // actions held until the fault clears" — hasFault/actuationDisabled
        // below) — not just the Shield. If the auto-sequence is mid-run
        // when *any* of them appears (Wrong ABS comparison, ABS not
        // connected, Pressure loss, etc. — not only the door), it needs to
        // stop immediately rather than sit waiting on a test/repair action
        // the board is refusing to run. Previously only the Shield case
        // triggered this, which is what let an unrelated fault leave the
        // sequence stuck indefinitely, recoverable only by disconnecting
        // the COM port.
        // Exception: "Working pressure!" — a high-pressure protection trip
        // is exactly the symptom the auto-repair flow exists to fix, and
        // it can plausibly stay set for a while as a normal side effect of
        // the very failure that's why a repair round is running at all;
        // aborting the instant it's seen would make auto-repair useless
        // for its main use case. actuationDisabled (manual buttons) still
        // blocks on it same as any other fault — only the auto-sequence's
        // own abort trigger ignores it, relying on runTestAndWait /
        // waitForProgress's own 90s timeout as the bound if it genuinely
        // never clears.
        const abortWorthyFaults = t.protection_faults.filter(f => !f.startsWith('Working pressure'));
        if (abortWorthyFaults.length > 0 && autoSequenceRunningRef.current) {
          abortAutoSequence();
        }

        // Shield (the bench's safety guard) edge detection, purely for the
        // close-side recovery below — restore whichever model was loaded
        // before, then re-enable the pod once that reload actually
        // succeeds (see the 'abs_caricato' handler below). The board's own
        // 'Model: NONE' reset (handled further down) already covers the
        // open side; the auto-abort above now covers it too, regardless of
        // which specific fault caused it.
        const shieldOpen = t.protection_faults.some(f => f.startsWith('Shield:'));
        if (shieldOpen) {
          shieldOpenRef.current = true;
        } else if (shieldOpenRef.current) {
          shieldOpenRef.current = false;
          const restore = lastKnownModelRef.current;
          if (restore) {
            shieldRecoveryPendingRef.current = true;
            loadAbsProgram(restore.option, restore.scope);
          }
        }

        // Temperature approaching the loaded model's own enforced max —
        // the board stops the test itself once actually crossed, this is
        // just an earlier heads-up (max - 5°C) so the operator isn't
        // surprised by a sudden board-side stop mid-test.
        const model = resolvedModelRef.current;
        if (model?.temperatura != null) {
          const warnAt = model.temperatura - 5;
          if (t.temperature_c >= warnAt) {
            if (!tempWarnedRef.current) {
              tempWarnedRef.current = true;
              setSafetyPrompt({ kind: 'temperature', current: t.temperature_c, max: model.temperatura });
            }
          } else {
            tempWarnedRef.current = false;
          }
        }

        // Oil dropping low — same percentage the OIL bar itself shows
        // (see oilPercent below), just sampled here too since that memo
        // isn't reachable from this once-subscribed listener closure.
        const oilMax = Math.max(hydraulicOilMaxRef.current, 0.51);
        const oilPct = Math.max(0, Math.min(100, ((t.oil_level - 0.5) / (oilMax - 0.5)) * 100));
        if (oilPct <= 10) {
          if (!oilWarnedRef.current) {
            oilWarnedRef.current = true;
            setSafetyPrompt({ kind: 'oil', percent: oilPct });
          }
        } else {
          oilWarnedRef.current = false;
        }

        // Progress watch for a targeted outlet-test repair (see
        // waitForProgress below) — no pressure reading involved, just
        // whether progress has crossed the stop threshold yet.
        if (progressWatchRef.current && t.progress_percent >= progressWatchRef.current.minPercent) {
          const watch = progressWatchRef.current;
          progressWatchRef.current = null;
          watch.resolve(true);
        }

        if (t.progress_percent >= 100) {
          // Only start the completion timer once this specific test has
          // been confirmed to actually be running (see
          // testStartConfirmedRef) — otherwise a 100% reading here could
          // just be stale telemetry left over from whatever ran before
          // the current command was even sent, and starting the timer off
          // that would declare the brand-new test "done" before it ever
          // really started.
          if (testStartConfirmedRef.current && !activeTestClearTimerRef.current) {
            activeTestClearTimerRef.current = setTimeout(() => {
              setActiveTest(null);
              activeTestClearTimerRef.current = null;
              const resolveTestDone = testDoneResolverRef.current;
              testDoneResolverRef.current = null;
              resolveTestDone?.();
              // The repair action finished on its own before progress
              // ever crossed the stop threshold — fall through to the
              // caller's normal (non-early) path.
              if (progressWatchRef.current) {
                const watch = progressWatchRef.current;
                progressWatchRef.current = null;
                watch.resolve(false);
              }
            }, TEST_COMPLETE_DEBOUNCE_MS);
          }
        } else {
          // A genuine sub-100 reading — this test really is running now,
          // not just reporting leftover telemetry from before.
          testStartConfirmedRef.current = true;
          if (activeTestClearTimerRef.current) {
            // Progress dropped back below 100 — that "done" reading was
            // just the previous named step ending, not the whole test.
            clearTimeout(activeTestClearTimerRef.current);
            activeTestClearTimerRef.current = null;
          }
        }
      } else if (parsed.kind === 'model' && 'status' in parsed) {
        setLinked(true);
        if (parsed.status === 'NONE') {
          setModelStatus('none');
          setResolvedModel(null);
          setModelVariants(null);
          setProgramSteps(null);
          setProgramError(null);
          setUploadInProgress(false);
          setUploadProgress(null);
          setValveOverrides({});
          lastLoadWasScopedRef.current = false;
          if (uploadTimeoutRef.current) { clearTimeout(uploadTimeoutRef.current); uploadTimeoutRef.current = null; }
        } else if (parsed.status === 'Load program' && typeof parsed.param === 'string') {
          resolveAbsModel(parsed.param);
        } else if (lastLoadWasScopedRef.current) {
          // Any other status is a resolved model name reported directly
          // by the board — per the decompiled NameABS(), this is what
          // actually triggers "Cycle" for a scoped load (`if (TestFailed
          // > 0) { Send_Click(Cycle, ...); }`), not the upload finishing.
          // Fires once per scoped load, not on every subsequent
          // reconfirmation — see lastLoadWasScopedRef above.
          lastLoadWasScopedRef.current = false;
          addLog('AUTO: model reconfirmed after scoped load — sending Cycle');
          // Reflect it on screen the instant it's actually sent — the
          // board doesn't reliably confirm "yes, this is now running" any
          // other way, so this is the best available signal that
          // something is happening, both for the manual Programs Cycle
          // button (which never set this at all before) and the
          // auto-repair flow (which was already setting this earlier,
          // right after the reload — this is a second, later set at the
          // actual send, closer to what's physically true).
          setActiveTest('cycles');
          send({ action: 'cycles' });
        }
      } else if (parsed.kind === 'ack' && 'board' in parsed && parsed.board === 'Hydraulics') {
        setLinked(true);
      } else if (parsed.kind === 'ok') {
        advanceQueue();
      } else if (parsed.kind === 'abs_caricato') {
        if (uploadTimeoutRef.current) { clearTimeout(uploadTimeoutRef.current); uploadTimeoutRef.current = null; }
        setUploadInProgress(false);
        setUploadProgress(null);
        if (shieldRecoveryPendingRef.current) {
          shieldRecoveryPendingRef.current = false;
          send({ action: 'pod_enable' });
        }
        const resolveProgramLoad = programLoadResolverRef.current;
        programLoadResolverRef.current = null;
        resolveProgramLoad?.();
      } else if (parsed.kind === 'hydraulic_report' && 'text' in parsed) {
        setReportText(prev => prev + (parsed.text as string));
      }
    });
    return () => { unsub.then(u => u()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bench Report finding: this used to fire immediately on `!isConnected`
  // — a brief USB blip that self-heals a second later wiped telemetry,
  // the resolved model, the loaded program, and aborted any running
  // auto-repair sequence, exactly like a real, sustained disconnect,
  // with nothing on screen explaining why. `useClientSerialConnection`
  // already distinguishes "reconnecting" from "disconnected" (`Sidebar`/
  // `ConnectionBar` show it correctly); this dashboard just never
  // received that distinction — `isReconnecting` is now threaded through
  // from `F2EvoHydraulic.tsx`. A short grace window absorbs a genuine
  // blip either way (auto-reconnect's own `reconnecting` event usually
  // arrives well within it); a longer one while auto-reconnect is
  // actively retrying gives it real room to work; either window resets
  // the moment `isConnected` flips back true, and a stuck `isReconnecting`
  // (should that ever happen) still can't wedge stale state forever since
  // the longer window is a hard ceiling regardless.
  const disconnectWipeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const clearPendingWipe = () => {
      if (disconnectWipeTimerRef.current) {
        clearTimeout(disconnectWipeTimerRef.current);
        disconnectWipeTimerRef.current = null;
      }
    };

    if (isConnected) {
      clearPendingWipe();
      return;
    }

    const wipeConnectionState = () => {
      setLinked(false);
      setTelemetry(null);
      setModelStatus(null);
      setResolvedModel(null);
      setModelVariants(null);
      setProgramLoading(false);
      setProgramError(null);
      setProgramSteps(null);
      setUploadInProgress(false);
      setUploadProgress(null);
      setActiveTest(null);
      setValveOverrides({});
      queueRef.current = [];
      if (retryTimerRef.current) { clearInterval(retryTimerRef.current); retryTimerRef.current = null; }
      if (uploadTimeoutRef.current) { clearTimeout(uploadTimeoutRef.current); uploadTimeoutRef.current = null; }
      if (activeTestClearTimerRef.current) { clearTimeout(activeTestClearTimerRef.current); activeTestClearTimerRef.current = null; }
      testStartConfirmedRef.current = false;
      shieldOpenRef.current = false;
      shieldRecoveryPendingRef.current = false;
      lastKnownModelRef.current = null;
      lastLoadWasScopedRef.current = false;
      programLoadResolverRef.current = null;
      autoAbortRef.current = true;
      if (autoPromptResolveRef.current) { autoPromptResolveRef.current(false); autoPromptResolveRef.current = null; }
      testDoneResolverRef.current = null;
      if (progressWatchRef.current) { progressWatchRef.current.resolve(false); progressWatchRef.current = null; }
      setAutoSequenceRunning(false);
      setAutoRepairRound(null);
      setAutoPrompt(null);
      setSafetyPrompt(null);
      tempWarnedRef.current = false;
      oilWarnedRef.current = false;
    };

    clearPendingWipe();
    disconnectWipeTimerRef.current = setTimeout(wipeConnectionState, isReconnecting ? 60_000 : 3_000);
    return clearPendingWipe;
  }, [isConnected, isReconnecting]);

  useEffect(() => {
    if (!reportText) { setParsedReport(null); return; }
    let cancelled = false;
    invoke<ParsedReport>('f2evo_parse_hydraulic_report', { text: reportText })
      .then(r => { if (!cancelled) setParsedReport(r); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [reportText]);

  // Publish the latest hydraulic result cross-bench so the Signal HIL
  // page's Test Report card can fold it into a combined PDF without
  // reaching into this dashboard's state.
  useEffect(() => {
    if (!reportText && !parsedReport) return;
    setHydraulicSnapshot({
      parsed: parsedReport,
      rawText: reportText,
      jobRef: activeHydraulicJob?.reference,
      updatedAt: new Date().toISOString(),
    });
  }, [parsedReport, reportText, activeHydraulicJob, setHydraulicSnapshot]);

  // Ref mirrors so the once-subscribed event listener effect and the
  // long-running auto-sequence loop (both below) can read fresh values
  // instead of whatever was captured in their closure at creation time.
  useEffect(() => { parsedReportRef.current = parsedReport; }, [parsedReport]);
  useEffect(() => { autoSequenceRunningRef.current = autoSequenceRunning; }, [autoSequenceRunning]);
  useEffect(() => { resolvedModelRef.current = resolvedModel; }, [resolvedModel]);
  useEffect(() => { hydraulicOilMaxRef.current = hydraulicOilMax; }, [hydraulicOilMax]);
  // A new test just started — see testStartConfirmedRef above for why
  // this has to reset here, not just once at app startup.
  useEffect(() => { if (activeTest) testStartConfirmedRef.current = false; }, [activeTest]);

  const probe = async () => {
    try {
      const frame = await invoke<string>('f2evo_probe', { board: 'hydraulic' });
      addLog(`TX (probe): ${frame}`);
    } catch (e) {
      addLog(`ERR: ${String(e)}`);
    }
  };

  // Auto-probe on connect — in practice the board announces itself
  // unprompted (the auto-ack above handles that case already), but poking
  // it immediately on connect gets a faster response than waiting for its
  // own broadcast cycle, and removes the need to separately click Probe
  // every time. The button stays for manual retry if needed.
  useEffect(() => {
    if (isConnected) probe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // Belt-and-suspenders alongside the probe above, specifically for an
  // *unexpected* disconnect that auto-reconnects (see
  // useClientSerialConnection's isReconnecting) — observed on real
  // hardware: a board mid-cycle, pod still enabled, that just lost its
  // PC-side connection and came back, but the app stayed stuck with every
  // button disabled. Unlike a fresh boot, a board that never actually
  // reset has no obvious reason to spontaneously re-announce itself with
  // a new discovery_broadcast — the probe above tries to elicit one, but
  // isn't confirmed reliable while the board is mid-operation rather than
  // idle, so this also sends the full ack+enable_status handshake
  // directly, independent of whatever the probe gets back.
  useEffect(() => {
    if (isConnected) {
      const timeoutId = setTimeout(() => {
        send({ action: 'ack_hydraulics' });
        send({ action: 'enable_status' });
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const modelColor = useMemo(() => {
    if (modelStatus === 'resolved') return 'text-success';
    if (modelStatus === 'detecting') return 'text-warning';
    return 'text-danger';
  }, [modelStatus]);

  const modelLabel = resolvedModel
    ? resolvedModel.nome
    : modelStatus === 'detecting' ? t('f2evo.model_detecting')
    : modelStatus === 'unknown' ? t('f2evo.model_unknown')
    : modelStatus === 'none' ? 'NONE'
    : '—';

  const oilBadge = telemetry
    ? { ok: 'bg-success/15 text-success border-success/20', low: 'bg-warning/15 text-warning border-warning/20', critical: 'bg-danger/15 text-danger border-danger/20' }[telemetry.oil_status]
    : 'bg-elevated text-text-tertiary border-border';

  const btnCls = 'px-3 py-2.5 rounded-lg text-xs font-medium bg-elevated text-text-secondary border border-border hover:text-text-primary transition-colors disabled:opacity-40';
  // The board itself is what actually enforces the pressure cutoff (it
  // reports the fault via the Protection byte; the PC never computes this
  // independently) — but while a fault is showing, we still hold back on
  // sending it any more actuation commands as an extra margin.
  const hasFault = (telemetry?.protection_faults.length ?? 0) > 0;
  // Same gate the original enforces implicitly: the modal "Progress" dialog
  // blocks the whole window until a valid program has loaded (both the
  // local DB phase and the board upload that follows it), and testing never
  // becomes available if it errored out.
  // Also covers the auto-sequence: while it's driving bleeding/valves/
  // motor/hydraulic_test/cycles on its own timeline, the manual buttons
  // (which share this same flag) shouldn't be pressable in parallel.
  const actuationDisabled = !isConnected || hasFault || programLoading || uploadInProgress || !!programError || !programSteps || autoSequenceRunning;

  // Sign matters, not just non-zero: the decompiled source treats a
  // *positive* test_step_index as a test starting ("Start: " + name) and
  // *negative* as that same test having just ended ("End: " + name) —
  // confirmed as a real bug on real hardware, an idle bench with a
  // negative (finished) index was showing as "IN PROGRESS" because this
  // used to check `!== 0` and take the absolute value either way.
  const currentStepLabel = useMemo(() => {
    if (!telemetry || telemetry.test_step_index <= 0 || !programSteps) return null;
    return programSteps.find(s => s.test === telemetry.test_step_index)?.descrizione ?? null;
  }, [telemetry, programSteps]);

  // Generalized "what's running right now" label — currentStepLabel only
  // covers the step-indexed Hydraulic Test sequence; this covers every
  // test button (Valves, Motor, Bleeding, Cycle) so the top banner reflects
  // whichever one is actually active, not just Hydraulic Test.
  // Bench Report finding — see the Current tile's own doc comment below
  // for the full reasoning. Only ever flags out-of-spec once there's both
  // a real reading and a real model spec to check it against.
  const currentOutOfSpec = Boolean(
    telemetry && resolvedModel && (
      (resolvedModel.correnteMax !== null && telemetry.current_amps > resolvedModel.correnteMax) ||
      (resolvedModel.correnteMin !== null && telemetry.current_amps < resolvedModel.correnteMin)
    )
  );

  const activeTestLabel = useMemo(() => {
    if (currentStepLabel) return currentStepLabel;
    if (!activeTest) return null;
    const labels: Record<string, string> = {
      bleeding: t('f2evo.bleeding'),
      valves: t('f2evo.valves'),
      motor: t('f2evo.motor'),
      hydraulic_test: t('f2evo.hydraulic_test'),
      cycles: t('f2evo.cycle'),
    };
    const label = labels[activeTest] ?? null;
    if (!label) return null;
    if (!autoSequenceRunning) return label;
    return autoRepairRound
      ? t('f2evo.auto_sequence_repair_round', { round: autoRepairRound, label })
      : t('f2evo.auto_sequence_step', { label });
  }, [currentStepLabel, activeTest, t, autoSequenceRunning, autoRepairRound]);

  // Verdict from whatever's been parsed out of the accumulated report so
  // far — shown as a quick "did it pass" banner the moment a test finishes,
  // so the operator doesn't have to open the full report view for that.
  const lastVerdict: Verdict | null = useMemo(() => computeVerdict(parsedReport), [parsedReport]);

  // Runs one test action and resolves once it's genuinely finished — reuses
  // the same debounced "really done, not just a step boundary" signal the
  // banner above relies on (see testDoneResolverRef, resolved from the
  // activeTestClearTimerRef timeout in the event listener). Backstopped by
  // AUTO_STEP_TIMEOUT_MS: if that resolver never fires (a fault this code
  // doesn't specifically know about yet, a dropped frame, anything), this
  // still returns and aborts the whole sequence rather than hanging.
  const runTestAndWait = (action: 'bleeding' | 'valves' | 'motor' | 'hydraulic_test' | 'cycles'): Promise<void> => {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        testDoneResolverRef.current = null;
        addLog(`AUTO: "${action}" didn't finish within ${AUTO_STEP_TIMEOUT_MS / 1000}s — aborting auto-sequence`);
        abortAutoSequence();
        resolve();
      }, AUTO_STEP_TIMEOUT_MS);
      testDoneResolverRef.current = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      // Set synchronously here rather than relying only on the
      // activeTest-watching effect, which wouldn't run until after this
      // function returns — closes any window where a stale telemetry
      // frame could sneak in before the reset happens.
      testStartConfirmedRef.current = false;
      setActiveTest(action);
      send({ action });
    });
  };

  // Same completion-wait as runTestAndWait, but never sends anything
  // itself — for a targeted repair, "Cycle" isn't sent by this app at
  // all, it's auto-triggered by the board's own model-reconfirmation
  // (see lastLoadWasScopedRef and the 'model' event handling above,
  // mirroring the decompiled NameABS()). This just waits for whatever
  // that ends up running to finish.
  const waitForTriggeredCycle = (): Promise<void> => {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        testDoneResolverRef.current = null;
        addLog(`AUTO: triggered cycle didn't finish within ${AUTO_STEP_TIMEOUT_MS / 1000}s — aborting auto-sequence`);
        abortAutoSequence();
        resolve();
      }, AUTO_STEP_TIMEOUT_MS);
      testDoneResolverRef.current = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      testStartConfirmedRef.current = false;
      setActiveTest('cycles');
    });
  };

  // Awaitable wrapper around loadAbsProgram — it itself only returns once
  // the payload is enqueued, not once the board actually confirms it (see
  // programLoadResolverRef above). loadAbsProgram already has its own 20s
  // upload watchdog for the "no ABS caricato" case; this backstops the
  // earlier DB-fetch phase that watchdog doesn't cover, same reasoning as
  // runTestAndWait's timeout above.
  const loadAbsProgramAndWait = (option: AbsModelOption, scope?: { test: number; canale: number }): Promise<void> => {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        programLoadResolverRef.current = null;
        addLog(`AUTO: program load didn't finish within ${AUTO_STEP_TIMEOUT_MS / 1000}s — aborting auto-sequence`);
        abortAutoSequence();
        resolve();
      }, AUTO_STEP_TIMEOUT_MS);
      programLoadResolverRef.current = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      loadAbsProgram(option, scope);
    });
  };

  const stopAutoSequence = () => {
    abortAutoSequence();
  };

  // Progress watch (see the telemetry handler above) — set just before a
  // targeted outlet-test repair's scoped reload starts (the repair action
  // itself, not a separate step — see runAutoTestAndRepair), and resolved
  // either once progress crosses minPercent (true), or by the caller once
  // that reload finishes on its own first (false). No pressure reading
  // involved — this bench has no dedicated way to stop an in-progress
  // Cycle/Programs Cycle partway through except ABORT/RESET (H-RESET),
  // which always disables the pod, so the caller always re-enables it
  // right after an early stop. Backstopped by its own timeout — doesn't
  // route through testDoneResolverRef or programLoadResolverRef at all, so
  // it needs its own guarantee it can't hang forever.
  const waitForProgress = (minPercent: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        progressWatchRef.current = null;
        addLog(`AUTO: repair didn't finish within ${AUTO_STEP_TIMEOUT_MS / 1000}s — aborting auto-sequence`);
        abortAutoSequence();
        resolve(false);
      }, AUTO_STEP_TIMEOUT_MS);
      progressWatchRef.current = {
        minPercent,
        resolve: (reached: boolean) => {
          clearTimeout(timeoutId);
          resolve(reached);
        },
      };
    });
  };

  // Runs a Hydraulic Test and resolves the resulting verdict (or null if
  // aborted mid-run) — factored out since runAutoTestAndRepair needs this
  // exact same "run it, let the parser catch up, read the verdict"
  // sequence both before the repair loop starts and after every round.
  const runHydraulicTestAndGetVerdict = async (): Promise<Verdict | null> => {
    await runTestAndWait('hydraulic_test');
    if (autoAbortRef.current) return null;
    // Report: telemetry arrives in separate frames from the progress
    // counter that flips activeTest back to null, so give the parser a
    // moment to catch up on the tail of the report before trusting it.
    await new Promise(r => setTimeout(r, 1500));
    if (autoAbortRef.current) return null;
    return computeVerdict(parsedReportRef.current);
  };

  // Runs exactly one repair round: works through every currently faulted
  // channel (ascending, one at a time — repairing several at once isn't
  // possible, so this is the priority order when there's more than one),
  // running exactly *one* existing action per channel, the same one an
  // operator would click by hand — nothing layered on top:
  //  - A specific faulted channel: the same scoped reload the "Programs
  //    Cycle" picker does for that exact {Test, Channel}. That reload *is*
  //    the repair — no extra "Cycle" send after it, and no extra full
  //    reload afterward either. Test is looked up from the same
  //    hydraulic_list_test_channels data the Programs Cycle picker itself
  //    uses (the exact query the board's own IsCycleExist check runs) —
  //    not guessed from telemetry like an earlier version of this did,
  //    which meant it was targeting Test/Channel combinations with no
  //    matching Cicli data at all: the reload would fail with "Cicle not
  //    found!!!" and nothing would physically happen, i.e. "Programs
  //    Cycle doesn't work" — it never actually got a real Test number.
  //  - No specific channel resolvable, or no Test found containing it:
  //    falls back to a plain "Cycle".
  // Confirmed on real hardware and in the decompiled source: the scoped
  // reload alone is inert — the board sits at "Ready" with progress at 0
  // the whole time, right through "ABS caricato.". What actually runs it
  // is *not* a "Cycle" this app sends — it's the board's own next "Model:
  // <name>" line re-confirming the model, which the decompiled NameABS()
  // reacts to with `if (TestFailed > 0) { Send_Click(Cycle, ...); }`.
  // That's mirrored via lastLoadWasScopedRef and the 'model' event
  // handling above; loadAbsProgramAndWait below is only ever followed by
  // *waiting* for that triggered cycle (waitForTriggeredCycle /
  // waitForProgress), never sending one directly.
  // If the fault came from an "outlet test" cycle specifically, that
  // triggered cycle is interrupted partway through instead of left to run
  // to completion: once progress crosses CHANNEL_WATCH_MIN_PROGRESS, it
  // sends ABORT/RESET (H-RESET) — the only way to stop an in-progress
  // Cycle on this bench, since there's no dedicated stop command — then
  // re-enables the pod (H-RESET always disables it) before moving on to
  // the next Hydraulic Test, which is what actually judges whether the
  // repair worked; no pressure reading is taken here.
  const runRepairRound = async (round: number) => {
    setAutoRepairRound(round);
    const faultedChannels = [...(parsedReportRef.current?.pressure?.faulted_channels ?? [])].sort((a, b) => a - b);
    if (faultedChannels.length > 0 && resolvedModel) {
      let groups: TestChannelGroup[] = [];
      try {
        groups = await invoke<TestChannelGroup[]>('hydraulic_list_test_channels', { idAbs: resolvedModel.id });
      } catch (e) {
        addLog(`ERR: hydraulic_list_test_channels failed — ${String(e)}`);
      }

      for (const channel of faultedChannels) {
        if (autoAbortRef.current) return;
        const targetTest = groups.find(g => g.channels.includes(channel))?.test;
        if (targetTest === undefined) {
          addLog(`AUTO: no Test contains Channel ${channel} — falling back to plain Cycle`);
          await runTestAndWait('cycles');
          if (autoAbortRef.current) return;
          continue;
        }
        const isOutletFault = parsedReportRef.current?.pressure?.cycles.some(
          c => c.label.toLowerCase().includes('outlet') && c.faulted_channels.includes(channel)
        ) ?? false;
        addLog(`AUTO: targeted repair — Programs Cycle, Test ${targetTest} / Channel ${channel}${isOutletFault ? ` (stops at ${CHANNEL_WATCH_MIN_PROGRESS}%)` : ''}`);

        await loadAbsProgramAndWait(resolvedModel, { test: targetTest, canale: channel });
        if (autoAbortRef.current) return;
        // Cycle isn't sent directly here — the board's own model-
        // reconfirmation triggers it (see lastLoadWasScopedRef and the
        // 'model' event handling above). This just waits for it.

        if (isOutletFault) {
          const watchPromise = waitForProgress(CHANNEL_WATCH_MIN_PROGRESS);
          setActiveTest('cycles');
          const reachedThreshold = await watchPromise;
          if (autoAbortRef.current) return;
          if (reachedThreshold) {
            addLog(`AUTO: Channel ${channel} repair reached ${CHANNEL_WATCH_MIN_PROGRESS}% — stopping (ABORT/RESET)`);
            queueRef.current = [];
            setActiveTest(null);
            send({ action: 'reset' });
            send({ action: 'pod_enable' });
            reestablishTelemetry();
          }
          // Otherwise the cycle just finished naturally before reaching
          // the threshold — move on regardless, the next Hydraulic Test
          // still decides whether it actually worked.
        } else {
          await waitForTriggeredCycle();
          if (autoAbortRef.current) return;
        }
      }
    } else {
      await runTestAndWait('cycles');
      if (autoAbortRef.current) return;
    }
  };

  // Runs Bleeding -> Valves -> Motor -> Hydraulic Test unattended. A clean
  // Hydraulic Test result needs no repair at all. If it isn't clean
  // (REVIEW or FAIL), the *first* repair round runs automatically — no
  // prompt gates it, since a fresh failure always gets one repair attempt
  // — then Hydraulic Test re-runs; only if it's *still* not clean after
  // that does it ask whether to run another round, and every round after
  // the first works the same way (repair, retest, ask). Stops the moment
  // a Hydraulic Test comes back PASS or the operator declines another
  // round. Aborted immediately if the shield opens mid-run (see the
  // shieldOpen handling above) or the bench disconnects.
  const runAutoTestAndRepair = async () => {
    if (autoSequenceRunning || actuationDisabled) return;
    autoAbortRef.current = false;
    setAutoSequenceRunning(true);
    setAutoRepairRound(null);
    try {
      await runTestAndWait('bleeding');
      if (autoAbortRef.current) return;
      await runTestAndWait('valves');
      if (autoAbortRef.current) return;
      await runTestAndWait('motor');
      if (autoAbortRef.current) return;

      let verdict = await runHydraulicTestAndGetVerdict();
      if (autoAbortRef.current) return;

      let round = 0;
      while (verdict !== 'pass') {
        round += 1;
        await runRepairRound(round);
        if (autoAbortRef.current) return;

        verdict = await runHydraulicTestAndGetVerdict();
        if (autoAbortRef.current) return;
        if (verdict === 'pass') break;

        const shouldContinue = await new Promise<boolean>((resolve) => {
          autoPromptResolveRef.current = resolve;
          setAutoPrompt({ verdict: verdict ?? 'review', round });
        });
        setAutoPrompt(null);
        if (!shouldContinue || autoAbortRef.current) break;
      }

      if (verdict === 'pass') {
        toast.success(t('f2evo.auto_sequence_passed'));
      }
    } finally {
      setAutoSequenceRunning(false);
      setAutoRepairRound(null);
      testDoneResolverRef.current = null;
      progressWatchRef.current = null;
    }
  };

  // Drives the loading overlay below — three real phases instead of a
  // static placeholder bar. 0-10%: local DB validation. 10-90%: uploading
  // JSON payload lines, scaled to the actual sent/total count. 90-100%
  // (pulsing, indeterminate): every line acknowledged, waiting on the
  // board's own readback/validation before `ABS caricato.` arrives.
  const loadingPhase = useMemo(() => {
    if (programLoading) {
      return { label: t('f2evo.program_phase_validating'), percent: 8, indeterminate: false };
    }
    if (uploadInProgress) {
      // total === 0 covers both "not fetched yet" and the brief instant
      // right as setUploadInProgress(true) fires — without this, that gap
      // would fall through to the "sent >= total" case below and briefly
      // flash "confirming" before the upload has even started.
      if (!uploadProgress || uploadProgress.total === 0) {
        return { label: t('f2evo.program_phase_preparing'), percent: 10, indeterminate: false };
      }
      if (uploadProgress.sent < uploadProgress.total) {
        return {
          label: t('f2evo.program_phase_uploading', { sent: uploadProgress.sent, total: uploadProgress.total }),
          percent: 10 + (uploadProgress.sent / uploadProgress.total) * 80,
          indeterminate: false,
        };
      }
      return { label: t('f2evo.program_phase_confirming'), percent: 95, indeterminate: true };
    }
    return null;
  }, [programLoading, uploadInProgress, uploadProgress, t]);

  const oilPercent = useMemo(() => {
    if (!telemetry) return 0;
    const min = 0.5;
    const max = Math.max(hydraulicOilMax, 0.51); // prevent division by zero
    return Math.max(0, Math.min(100, ((telemetry.oil_level - min) / (max - min)) * 100));
  }, [telemetry, hydraulicOilMax]);

  // Turns any manual valve overrides into wire-format lines ("Valve3:
  // Fault;5") appended after the board's own telemetry — parse_report's
  // dedup already treats the latest line for a given valve as the current
  // reading (the same mechanism a real re-run relies on), so re-parsing
  // this saved text later naturally reflects the override without any
  // separate storage format.
  const buildValveOverrideLines = (): string => {
    if (!parsedReport) return '';
    const lines: string[] = [];
    for (const [idxStr, status] of Object.entries(valveOverrides)) {
      const original = parsedReport.valves[Number(idxStr)];
      if (!original) continue;
      const key = original.label.split(':')[0].trim();
      const wire = status === 'ok' ? `${key}: Ok` : status === 'marginal' ? `${key}: Fault;11` : `${key}: Fault;5`;
      lines.push(wire);
    }
    return lines.join('\n');
  };

  const handleSaveReport = async (reportType: string) => {
    if (!activeHydraulicJob) return;
    // Saves the actual board Report: telemetry (what HydraulicTestReport
    // parses and displays) plus any manual overrides, not the sticky log
    // — the log is a noisy TX/RX/ERR trace for debugging, not the report.
    const overrideLines = buildValveOverrideLines();
    const boardText = reportText + (overrideLines ? `\n${overrideLines}\n` : '');
    const header = [
      `=== HYDRAULIC BENCH REPORT ===`,
      `Client: ${activeHydraulicJob.clientName}`,
      `Job Ref: ${activeHydraulicJob.reference}`,
      `Vehicle: ${activeHydraulicJob.vehiclePlate} ${activeHydraulicJob.vehicleModel}`,
      `==============================`,
      ``
    ].join('\n');
    const savedText = header + boardText;

    try {
      await invoke('reman_save_hydraulic_report', {
        ligcdeId: activeHydraulicJob.ligcdeId,
        reportType,
        reportText: savedText,
      });
      toast.success('Report saved successfully to Postgres');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const programReady = !!programSteps && !uploadInProgress && !programError && !currentStepLabel;

  return (
    <div className="flex flex-col gap-3">
      {/* Bench Report finding: a reconnect used to look identical to a
          full disconnect — nothing on screen said "hang on, it's coming
          back," so a brief USB blip read as everything having just been
          wiped for no visible reason. */}
      {!isConnected && isReconnecting && (
        <div className="bg-warning/10 border border-warning/20 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-warning">
          <SignalIcon className="w-4 h-4 shrink-0 animate-pulse" />
          Reconnecting to the bench{reconnectAttempt ? ` (attempt ${reconnectAttempt})` : ''}…
        </div>
      )}
      {activeHydraulicJob && (
        <div className="bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="text-sm">
            <span className="font-semibold text-accent">Linked Job: </span>
            <span className="text-text-primary ml-1">{activeHydraulicJob.clientName} ({activeHydraulicJob.reference})</span>
            <span className="text-text-tertiary ml-2 text-xs">
              {[activeHydraulicJob.vehiclePlate, activeHydraulicJob.vehicleModel].filter(Boolean).join(' · ')}
            </span>
          </div>
          <button
            onClick={() => setActiveHydraulicJob(null)}
            className="text-xs font-medium text-text-tertiary hover:text-danger transition-colors px-3 py-1.5 rounded-lg border border-border bg-elevated"
          >
            Unlink Job
          </button>
        </div>
      )}
      {!activeHydraulicJob && (
        <div className="relative">
          <input
            type="text"
            value={linkQuery}
            onChange={e => { setLinkQuery(e.target.value); setLinkOpen(true); }}
            onFocus={() => setLinkOpen(true)}
            onBlur={() => setTimeout(() => setLinkOpen(false), 150)}
            placeholder="Link a job — client, article, or reference"
            className="w-full text-sm bg-card border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent/40"
          />
          {linkOpen && linkQuery.trim().length >= 2 && (
            <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto bg-card border border-border rounded-xl shadow-lg">
              {linkSearching && <p className="text-xs text-text-tertiary px-4 py-2">Searching…</p>}
              {!linkSearching && linkResults.length === 0 && (
                <p className="text-xs text-text-tertiary px-4 py-2">No open jobs match.</p>
              )}
              {!linkSearching && linkResults.map(job => (
                <button
                  key={job.id}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => linkJob(job)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-elevated transition-colors border-b border-border last:border-0"
                >
                  <span className="text-text-primary font-medium">{job.clientName || `#${job.id}`}</span>
                  <span className="text-text-tertiary ml-2 text-xs">
                    {[job.reference, job.vehiclePlate, job.vehicleModel].filter(Boolean).join(' · ')}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      
      <div className="card w-full relative">
      {/* Blocking "Progress" overlay — the original's modal dialog stops
          you touching anything else in the window while the program
          loads; this does the same, scoped to the dashboard card, across
          three real phases (not a fake static bar): local DB validation,
          uploading the JSON payload lines (tracked against the actual
          sent/total count via uploadProgress), and — once every line is
          acknowledged — waiting on the board's own readback/validation
          before it sends `ABS caricato.`. That last phase is genuinely
          indeterminate (the board decides how long it takes), so only that
          part pulses; the upload phase reflects real progress. */}
      <AnimatePresence>
        {loadingPhase && (
          <motion.div
            key="loading-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-app/80 backdrop-blur-sm rounded-2xl"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="w-72 bg-elevated border border-border rounded-xl p-4 shadow-lg"
            >
              <div className="text-xs font-semibold text-text-primary mb-1">{t('f2evo.program_loading')}</div>
              <div className="text-[11px] text-text-tertiary mb-3">{loadingPhase.label}</div>
              <div className="h-2 bg-app border border-border rounded-full overflow-hidden">
                <div
                  className={['h-full bg-success transition-all duration-300 ease-out', loadingPhase.indeterminate ? 'animate-pulse' : ''].join(' ')}
                  style={{ width: `${loadingPhase.percent}%` }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <h2 className="card-header flex items-center justify-between">
        <span className="flex items-center gap-2">
          <BeakerIcon className="h-4 w-4 text-accent" />
          {t('f2evo.hydraulic_dashboard')}
        </span>
        <div className="flex items-center gap-2">
          <span className={[
            'text-[10px] font-semibold px-2 py-1 rounded-md border flex items-center gap-1.5',
            linked ? 'bg-success/15 text-success border-success/20' : 'bg-elevated text-text-tertiary border-border',
          ].join(' ')}>
            <span className={['w-1.5 h-1.5 rounded-full', linked ? 'bg-success animate-pulse-slow' : 'bg-text-tertiary'].join(' ')} />
            {linked ? t('f2evo.linked') : t('f2evo.waiting_for_board')}
          </span>
          <button disabled={!isConnected} onClick={probe} className="flex items-center gap-1.5 text-xs btn-secondary px-2.5 py-1.5 disabled:opacity-40">
            <SignalIcon className="w-3.5 h-3.5" />
            {t('f2evo.probe')}
          </button>
        </div>
      </h2>

      {/* Model + OIL + Ready state */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <span className="text-[10px] text-text-tertiary block">{t('f2evo.abs_model')}</span>
          <span className={['text-sm font-semibold', modelColor].join(' ')}>{modelLabel}</span>
        </div>
        {resolvedModel && (
          <div className="flex flex-wrap gap-1.5">
            {resolvedModel.pressioneLavoro !== null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-elevated border border-border text-text-tertiary">
                {t('f2evo.spec_pressure')}: {resolvedModel.pressioneLavoro} bar
              </span>
            )}
            {resolvedModel.correnteMax !== null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-elevated border border-border text-text-tertiary">
                {t('f2evo.spec_current')}: {resolvedModel.correnteMax} A
              </span>
            )}
            {resolvedModel.resistenza !== null && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-elevated border border-border text-text-tertiary">
                {t('f2evo.spec_resistance')}: {resolvedModel.resistenza} Ω
              </span>
            )}
          </div>
        )}
        <div className={['flex items-center gap-2 px-2 py-1 rounded-md border', oilBadge].join(' ')}>
          <span className="text-[10px] font-bold">OIL</span>
          <div className="w-16 h-1.5 bg-text-primary/10 rounded-full overflow-hidden">
            <div className="h-full bg-current transition-all duration-300" style={{ width: `${oilPercent}%` }} />
          </div>
          <span className="text-[10px] font-medium tabular-nums">{oilPercent.toFixed(0)}%</span>
          {telemetry && (
            <button
              onClick={() => setHydraulicOilMax(telemetry.oil_level)}
              title="Set current level as 100% max"
              className="ml-1 px-1.5 py-0.5 text-[9px] font-semibold rounded bg-text-primary/10 hover:bg-text-primary/20 transition-colors"
            >
              Set Max
            </button>
          )}
        </div>
        {telemetry && (
          <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-elevated text-text-secondary border border-border">
            {telemetry.ready_state}
          </span>
        )}
        {telemetry && telemetry.valve_under_test > -1 && (
          <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-accent/15 text-accent border border-accent/20">
            {t('f2evo.valve_under_test')} {telemetry.valve_under_test}
          </span>
        )}
      </div>

      {/* ABS variant picker — the board can identify the base unit but not
          which variant is mounted (SelectABSForm.cs's IsGruppo case) */}
      {modelVariants && (
        <div className="mb-4 px-3 py-3 rounded-lg bg-accent/5 border border-accent/20">
          <div className="text-xs font-semibold text-text-primary mb-2">{t('f2evo.select_variant')}</div>
          <div className="space-y-1.5">
            {modelVariants.map(opt => (
              <button
                key={opt.id}
                onClick={() => pickAbsVariant(opt)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm bg-elevated border border-border hover:border-accent/40 hover:text-accent transition-colors"
              >
                {opt.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* "Programs Cycle" test/channel picker — mirrors SelectTestForm's
          two-list cascade: pick a Test, then a Canale for that Test, to
          load just that slice of the program. */}
      {testChannelGroups && (
        <div className="mb-4 px-3 py-3 rounded-lg bg-accent/5 border border-accent/20">
          <div className="text-xs font-semibold text-text-primary mb-2">
            {t('f2evo.select_test_channel')}
          </div>
          {testChannelGroups.length === 0 ? (
            <p className="text-xs text-text-tertiary">{t('f2evo.no_test_channels')}</p>
          ) : pickedTest === null ? (
            <div className="flex flex-wrap gap-1.5">
              {testChannelGroups.map(g => (
                <button
                  key={g.test}
                  onClick={() => setPickedTest(g.test)}
                  className="px-3 py-1.5 rounded-lg text-sm bg-elevated border border-border hover:border-accent/40 hover:text-accent transition-colors"
                >
                  {t('f2evo.test_n', { n: g.test })}
                </button>
              ))}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setPickedTest(null)} className="text-[11px] text-text-tertiary hover:text-text-primary">
                  ← {t('f2evo.test_n', { n: pickedTest })}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {testChannelGroups.find(g => g.test === pickedTest)?.channels.map(ch => (
                  <button
                    key={ch}
                    onClick={() => pickTestChannel(pickedTest, ch)}
                    className="px-3 py-1.5 rounded-lg text-sm bg-elevated border border-border hover:border-accent/40 hover:text-accent transition-colors"
                  >
                    {t('f2evo.channel_n', { n: ch })}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => { setTestChannelGroups(null); setPickedTest(null); }}
            className="mt-3 text-[11px] text-text-tertiary hover:text-text-primary"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

      {/* Temperature/oil safety heads-up — the board enforces its own
          limits and will stop the test on its own once actually crossed;
          this fires a bit earlier so that isn't a surprise, and offers a
          way to stop right now instead of waiting for the board to do it.
          Stopping never re-enables the pod afterward (see stopForSafety)
          — unlike other hard-reset call sites, the underlying condition
          is presumably still present immediately after stopping. */}
      {safetyPrompt && (
        <div className="mb-4 px-3 py-3 rounded-lg bg-danger/5 border border-danger/20">
          <div className="flex items-center gap-2 mb-1">
            <ExclamationTriangleIcon className="w-4 h-4 text-danger shrink-0" />
            <span className="text-xs font-semibold text-text-primary">
              {safetyPrompt.kind === 'temperature' ? t('f2evo.safety_temperature_title') : t('f2evo.safety_oil_title')}
            </span>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            {safetyPrompt.kind === 'temperature'
              ? t('f2evo.safety_temperature_body', { current: safetyPrompt.current.toFixed(0), max: safetyPrompt.max })
              : t('f2evo.safety_oil_body', { percent: safetyPrompt.percent.toFixed(0) })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={stopForSafety}
              className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-danger text-white hover:bg-danger/90 transition-colors"
            >
              {t('f2evo.safety_stop_now')}
            </button>
            <button
              onClick={dismissSafetyPrompt}
              className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('f2evo.safety_dismiss')}
            </button>
          </div>
        </div>
      )}

      {/* Auto Test & Repair's "continue or stop" gate — shown before every
          repair round, never run unprompted, since it's physically
          cycling the valves. */}
      {autoPrompt && (
        <div className="mb-4 px-3 py-3 rounded-lg bg-warning/5 border border-warning/20">
          <div className="flex items-center gap-2 mb-1">
            <ExclamationTriangleIcon className="w-4 h-4 text-warning shrink-0" />
            <span className="text-xs font-semibold text-text-primary">
              {t('f2evo.auto_prompt_title', { round: autoPrompt.round })}
            </span>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            {t('f2evo.auto_prompt_body', {
              verdict: autoPrompt.verdict === 'fail' ? t('f2evo.report_verdict_fail') : t('f2evo.report_verdict_review'),
            })}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { autoPromptResolveRef.current?.(true); autoPromptResolveRef.current = null; }}
              className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              {t('f2evo.auto_prompt_continue')}
            </button>
            <button
              onClick={() => { autoPromptResolveRef.current?.(false); autoPromptResolveRef.current = null; }}
              className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg bg-elevated border border-border text-text-secondary hover:text-text-primary transition-colors"
            >
              {t('f2evo.auto_prompt_stop')}
            </button>
          </div>
        </div>
      )}

      {/* Program-load error — same wording the original shows (MessageBox
          "ABS not found!!!" / "Cicle not found!!!") after EndLoad(err: true) */}
      {programError && (
        <div className="flex items-start gap-2 mb-4 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
          <ExclamationTriangleIcon className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <div className="text-xs text-danger">{programError}</div>
        </div>
      )}

      {/* "IN PROGRESS / <test>" banner, generalized to cover every test
          button (not just the step-indexed Hydraulic Test) — and, once
          that test finishes, replaced in the same slot by a quick
          pass/review/fail verdict from whatever's parsed out of the
          report so far, so there's no need to open the full report view
          just to see whether it passed. Styled as an active/neutral state
          (accent, not danger-red) while running — red specifically read as
          an error to some users even though nothing had failed. Smooth
          fade in/out (mode="wait" so one fully leaves before the next
          enters) instead of an abrupt pop. The wrapper reserves a fixed
          height across all three states (in-progress / verdict / empty) so
          switching between them doesn't reflow everything underneath. */}
      <div className="mb-4 h-[60px]">
        <AnimatePresence mode="wait">
          {activeTestLabel ? (
            <motion.div
              key="in-progress"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="h-full flex flex-col items-center justify-center px-4 py-2 rounded-lg bg-accent/10 border border-accent/20 text-center"
            >
              <div className="text-xs font-bold text-accent tracking-wide">{t('f2evo.in_progress')}</div>
              <div className="text-sm font-semibold text-accent mt-0.5">{activeTestLabel}</div>
            </motion.div>
          ) : lastVerdict && (
            <motion.div
              key="last-result"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className={[
                'h-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border text-center',
                lastVerdict === 'pass' ? 'bg-success/10 border-success/20' :
                lastVerdict === 'review' ? 'bg-warning/10 border-warning/20' :
                'bg-danger/10 border-danger/20',
              ].join(' ')}
            >
              {lastVerdict === 'pass' ? <CheckCircleIcon className="w-5 h-5 text-success shrink-0" /> :
               lastVerdict === 'review' ? <ExclamationTriangleIcon className="w-5 h-5 text-warning shrink-0" /> :
               <XCircleIcon className="w-5 h-5 text-danger shrink-0" />}
              <span className={[
                'text-sm font-bold tracking-wide',
                lastVerdict === 'pass' ? 'text-success' : lastVerdict === 'review' ? 'text-warning' : 'text-danger',
              ].join(' ')}>
                {lastVerdict === 'pass' ? t('f2evo.report_verdict_pass') : lastVerdict === 'review' ? t('f2evo.report_verdict_review') : t('f2evo.report_verdict_fail')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Explicit "loaded, ready to test" confirmation — the original just
          silently unlocks the buttons once loading finishes; that read as
          "nothing happened" without a positive signal of its own. */}
      {programReady && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-success/10 border border-success/20">
          <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />
          <span className="text-xs font-medium text-success">{t('f2evo.program_ready')}</span>
        </div>
      )}

      {/* Fault banner */}
      {hasFault && (
        <div className="flex items-start gap-2 mb-4 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
          <ExclamationTriangleIcon className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <div className="text-xs text-danger space-y-0.5">
            {telemetry!.protection_faults.map((f, i) => <div key={i}>{f}</div>)}
            <div className="text-danger/70">{t('f2evo.actions_held')}</div>
          </div>
        </div>
      )}

      {/* Gauges. Bench Report findings: (1) these always read a confident
          "0" before any telemetry arrived, indistinguishable from a real
          zero-bar reading — the Current/Temperature tiles right below
          already show "—" for the same case, `noData` brings the gauges
          in line. (2) the board's own per-channel fault flags
          (parsedReport.pressure.faulted_channels — already parsed and
          already used to target the auto-repair flow, see ~line 1181)
          never reached these live gauges at all; a faulting channel just
          looked like an ordinary number mid-test until the report opened
          afterward. */}
      {/* Bench Report finding: five gauges at 140px with 9px tick labels
          is fine up close but small for a hands-busy, glance-from-a-
          distance bench workflow — a modest size/spacing bump (not the
          bigger "bench view" display mode the report separately proposes
          as its own next-level feature). */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
        <PressureGauge label={t('f2evo.channel_1')} value={telemetry?.channel1.primary ?? 0} secondary={telemetry?.channel1.secondary} showSecondary noData={!telemetry} error={parsedReport?.pressure?.faulted_channels.includes(1) ?? false} dangerThreshold={resolvedModel?.pressioneMax ?? undefined} />
        <PressureGauge label={t('f2evo.channel_2')} value={telemetry?.channel2.primary ?? 0} secondary={telemetry?.channel2.secondary} showSecondary noData={!telemetry} error={parsedReport?.pressure?.faulted_channels.includes(2) ?? false} dangerThreshold={resolvedModel?.pressioneMax ?? undefined} />
        <PressureGauge label={t('f2evo.pump')} value={telemetry?.pump_pressure ?? 0} noData={!telemetry} dangerThreshold={resolvedModel?.pressioneMax ?? undefined} />
        <PressureGauge label={t('f2evo.channel_3')} value={telemetry?.channel3.primary ?? 0} secondary={telemetry?.channel3.secondary} showSecondary noData={!telemetry} error={parsedReport?.pressure?.faulted_channels.includes(3) ?? false} dangerThreshold={resolvedModel?.pressioneMax ?? undefined} />
        <PressureGauge label={t('f2evo.channel_4')} value={telemetry?.channel4.primary ?? 0} secondary={telemetry?.channel4.secondary} showSecondary noData={!telemetry} error={parsedReport?.pressure?.faulted_channels.includes(4) ?? false} dangerThreshold={resolvedModel?.pressioneMax ?? undefined} />
      </div>

      {/* Current / Temperature. Bench Report finding: temperature and oil
          both get a proactive safetyPrompt heads-up ahead of the board's
          own hard cutoff (using resolvedModel.temperatura, see the effect
          above) — current draw got no threshold treatment at all despite
          resolvedModel.correnteMax/correnteMin being fetched and already
          shown as a static spec badge elsewhere on this page. A lighter
          touch than a full safetyPrompt clone: just color the tile itself
          out-of-spec-red the same way the pressure gauges do, rather than
          adding a second proactive-dialog flow for this pass. */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className={[
          'rounded-xl p-3 text-center border',
          currentOutOfSpec ? 'bg-danger/10 border-danger/30' : 'bg-elevated border-border',
        ].join(' ')}>
          <div className={['text-[10px] font-semibold tracking-wide', currentOutOfSpec ? 'text-danger' : 'text-text-tertiary'].join(' ')}>
            {t('f2evo.current')}
          </div>
          <div className={['text-xl font-bold tabular-nums mt-0.5', currentOutOfSpec ? 'text-danger' : 'text-text-primary'].join(' ')}>
            {telemetry ? telemetry.current_amps.toFixed(1) : '—'}<span className={currentOutOfSpec ? 'text-sm text-danger/70 ml-1' : 'text-sm text-text-tertiary ml-1'}>A</span>
          </div>
        </div>
        <div className="rounded-xl p-3 text-center bg-elevated border border-border">
          <div className="text-[10px] font-semibold text-text-tertiary tracking-wide">{t('f2evo.temperature')}</div>
          <div className="text-xl font-bold tabular-nums text-text-primary mt-0.5">
            {telemetry ? telemetry.temperature_c.toFixed(0) : '—'}<span className="text-sm text-text-tertiary ml-1">°C</span>
          </div>
        </div>
      </div>

      {/* Progress bar — the board's own progress fields (wire protocol
          array[20]/array[21]) only seem to move meaningfully during Valve
          testing; other test types can stay near 0% while genuinely
          running (unconfirmed from decompiled source alone whether that's
          a firmware limitation specific to valve cycles or something else
          — no live capture from an active Motor/Hydraulic Test run to
          compare against). Rather than a bar that then looks stuck/broken,
          this switches to an indeterminate pulse whenever a test is active
          but the board isn't reporting real movement for it, and switches
          back the moment real progress does show up. */}
      {(() => {
        const noRealProgress = !!activeTest && (telemetry?.progress_percent ?? 0) < 5;
        return (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-text-secondary">{t('f2evo.test_progress', { defaultValue: 'Test Progress' })}</span>
              {!noRealProgress && (
                <span className="text-xs font-bold text-text-primary">{Math.round(telemetry?.progress_percent ?? 0)}%</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-text-tertiary shrink-0">0%</span>
              <div className="flex-1 relative h-4 bg-elevated border border-border rounded-full overflow-hidden">
                {noRealProgress ? (
                  <div className="absolute inset-0 bg-accent/40 animate-pulse" />
                ) : (
                  <div className="absolute top-0 left-0 bottom-0 bg-success transition-all duration-300 ease-out" style={{ width: `${telemetry?.progress_percent ?? 0}%` }} />
                )}
              </div>
              <span className="text-[10px] font-medium text-text-tertiary shrink-0">100%</span>
            </div>
          </div>
        );
      })()}

      {/* Actions */}
      {/* Primary Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-border mb-4">
        <button
          disabled={!isConnected}
          onClick={() => hardReset(false)}
          className={[btnCls, '!bg-danger/20 !text-danger !border-danger/40 !font-bold col-span-2 sm:col-span-4 py-2.5'].join(' ')}
        >
          ABORT / RESET
        </button>
        <button
          disabled={!isConnected || hasFault}
          onClick={() => send({ action: telemetry?.pod_enabled ? 'pod_disable' : 'pod_enable' })}
          className={[btnCls, '!font-bold col-span-2 sm:col-span-4 py-2.5', telemetry?.pod_enabled ? '!bg-danger/10 !text-danger !border-danger/20' : '!bg-success/10 !text-success !border-success/20'].join(' ')}
        >
          {telemetry?.pod_enabled ? t('f2evo.disable_pod') : t('f2evo.enable_pod')}
        </button>
        {/* Runs Bleeding -> Valves -> Motor -> Hydraulic Test unattended,
            repairing (Cycle) and retesting only if the Hydraulic Test
            isn't clean, asking before every repair round — see
            runAutoTestAndRepair above. */}
        {autoSequenceRunning ? (
          <button
            onClick={stopAutoSequence}
            className={[btnCls, '!bg-danger/10 !text-danger !border-danger/20 !font-bold col-span-2 sm:col-span-4 py-2.5'].join(' ')}
          >
            {t('f2evo.auto_sequence_stop_button')}
          </button>
        ) : (
          <button
            disabled={actuationDisabled}
            onClick={runAutoTestAndRepair}
            className={[btnCls, '!bg-accent/10 !text-accent !border-accent/20 !font-bold col-span-2 sm:col-span-4 py-2.5'].join(' ')}
          >
            {t('f2evo.auto_test_repair')}
          </button>
        )}
        <button disabled={actuationDisabled} onClick={() => { setActiveTest('bleeding'); send({ action: 'bleeding' }); }} className={[btnCls, activeTest === 'bleeding' ? '!bg-accent !text-white' : ''].join(' ')}>
          {activeTest === 'bleeding' ? t('f2evo.bleeding_in_progress', { defaultValue: 'Bleeding in progress...' }) : t('f2evo.bleeding')}
        </button>
        <button disabled={actuationDisabled} onClick={() => { setActiveTest('valves'); send({ action: 'valves' }); }} className={[btnCls, activeTest === 'valves' ? '!bg-accent !text-white' : ''].join(' ')}>
          {activeTest === 'valves' ? t('f2evo.valves_in_progress', { defaultValue: 'Valve testing in progress...' }) : t('f2evo.valves')}
        </button>
        <button disabled={actuationDisabled} onClick={() => { setActiveTest('motor'); send({ action: 'motor' }); }} className={[btnCls, activeTest === 'motor' ? '!bg-accent !text-white' : ''].join(' ')}>
          {activeTest === 'motor' ? t('f2evo.motor_in_progress', { defaultValue: 'Motor testing in progress...' }) : t('f2evo.motor')}
        </button>
        <button disabled={actuationDisabled} onClick={() => { setActiveTest('hydraulic_test'); send({ action: 'hydraulic_test' }); }} className={[btnCls, activeTest === 'hydraulic_test' ? '!bg-accent !text-white' : ''].join(' ')}>
          {activeTest === 'hydraulic_test' ? t('f2evo.hydraulic_test_in_progress', { defaultValue: 'Hydraulic testing in progress...' }) : t('f2evo.hydraulic_test')}
        </button>
        <button disabled={actuationDisabled} onClick={() => { setActiveTest('cycles'); send({ action: 'cycles' }); }} className={[btnCls, activeTest === 'cycles' ? '!bg-accent !text-white' : ''].join(' ')}>
          {activeTest === 'cycles' ? t('f2evo.cycles_in_progress', { defaultValue: 'Cycles in progress...' }) : t('f2evo.cycle')}
        </button>
        {/* Not a fire-and-wait actuation command like the buttons around
            it — Program_Click in the original opens a Test/Canale picker
            (SelectTestForm) and reloads just that slice of the program;
            it never actually sends a "SHORTCYCLES" wire command itself
            (that Tag value turned out to be vestigial, unused by this
            button's actual click handler). Gated on having a resolved
            model rather than actuationDisabled, since picking a program
            to load doesn't require one already being loaded. */}
        <button disabled={!isConnected || !resolvedModel || hasFault} onClick={openProgramsCyclePicker} className={btnCls}>
          {t('f2evo.programs_cycle')}
        </button>
        <button
          disabled={!isConnected}
          onClick={() => { send({ action: 'print_report' }); setShowReport(true); }}
          className={[btnCls, 'col-span-2'].join(' ')}
        >
          {t('f2evo.report')}
        </button>
      </div>

      {reportText && !showReport && (
        <div className="flex justify-center mb-4">
          <button
            onClick={() => setShowReport(true)}
            className="text-xs font-semibold text-accent hover:underline"
          >
            {t('f2evo.report_view')}
          </button>
        </div>
      )}

      {showReport && (
        <div className="mb-4">
          <HydraulicTestReport
            parsed={parsedReport}
            jobLabel={activeHydraulicJob ? `${activeHydraulicJob.clientName} (${activeHydraulicJob.reference})` : undefined}
            jobNumber={activeHydraulicJob?.reference}
            onClose={() => setShowReport(false)}
            valveOverrides={valveOverrides}
            onValveOverridesChange={setValveOverrides}
            onSave={activeHydraulicJob ? handleSaveReport : undefined}
          />
        </div>
      )}

      <div className="flex justify-center mb-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-xs font-semibold text-text-tertiary hover:text-text-primary transition-colors px-3 py-1.5 rounded-full bg-elevated/50 hover:bg-elevated border border-border"
        >
          {showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}
        </button>
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 p-3 rounded-lg bg-elevated/50 border border-border">
          <button disabled={actuationDisabled} onClick={() => send({ action: 'unlock', channel: 1 })} className={btnCls}>C1 Unlock</button>
          <button disabled={actuationDisabled} onClick={() => send({ action: 'unlock', channel: 2 })} className={btnCls}>C2 Unlock</button>
          <button disabled={actuationDisabled} onClick={() => send({ action: 'unlock', channel: 3 })} className={btnCls}>C3 Unlock</button>
          <button disabled={actuationDisabled} onClick={() => send({ action: 'unlock', channel: 4 })} className={btnCls}>C4 Unlock</button>
          <button disabled={actuationDisabled} onClick={() => send({ action: 'pump', on: true })} className={[btnCls, '!bg-success/10 !text-success !border-success/20'].join(' ')}>{t('f2evo.pump')} ON</button>
          <button disabled={!isConnected} onClick={() => send({ action: 'pump', on: false })} className={[btnCls, '!bg-danger/10 !text-danger !border-danger/20'].join(' ')}>{t('f2evo.pump')} OFF</button>
          <button disabled={!isConnected} onClick={() => send({ action: 'oil' })} className={btnCls}>{t('f2evo.oil_check')}</button>
          <button disabled={!isConnected} onClick={() => send({ action: 'reset' })} className={btnCls}>{t('common.reset')}</button>
          <button disabled={!isConnected} onClick={() => send({ action: 'get_model' })} className={btnCls}>{t('f2evo.get_model')}</button>
          <button disabled={!isConnected} onClick={() => send({ action: 'get_serial_number' })} className={btnCls}>{t('f2evo.get_serial')}</button>
          <button disabled={!isConnected} onClick={() => send({ action: 'enable_status' })} className={btnCls}>{t('f2evo.enable_status')}</button>
          <button disabled={!isConnected} onClick={() => send({ action: 'disable_status' })} className={btnCls}>{t('f2evo.disable_status')}</button>
          <button disabled={!isConnected} onClick={() => send({ action: 'ack_hydraulics' })} className={btnCls}>{t('f2evo.ack')}</button>
        </div>
      )}

      {/* Log */}
      <div className="pt-3 mt-4 border-t border-border">
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
            className="bg-elevated border border-border rounded-xl p-3 font-mono text-[11px] overflow-y-auto overscroll-y-contain h-40 space-y-0.5"
          >
            {log.length === 0
              ? <span className="text-text-tertiary">{t('f2evo.no_messages')}</span>
              : log.map((line, i) => (
                <div key={i} className={
                  line.startsWith('TX') ? 'text-accent' :
                  line.startsWith('ERR:') ? 'text-danger' : 'text-success'
                }>{line}</div>
              ))
            }
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
