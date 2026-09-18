// Electronics / ABS test-bench state machine — the PC-side logic behind the
// "TEST BENCH - ABS" screen, ported from the decompiled `ABS.cs`
// (`reference-data/f2evo-decompiled/out_main/SC_F2_EVO/ABS.cs`) and
// `WorkinigProgress.cs`. Kept pure (no React, no Tauri) so the whole
// power-up / speed-ramp / wheel-lock sequence is unit-testable without a
// board on the wire — the component in
// `components/ElectronicsBenchDashboard.tsx` is just a thin shell over
// `benchReduce`.
//
// Wire commands go out as `electronics::Command` (see
// `src-tauri/src/f2evo.rs`); the STX framing the board needs is added
// Rust-side, so these are plain JSON action objects.

// ---- Wire command shape (mirrors `f2evo.rs`'s `electronics::Command`) ----

export type ElectronicsCmd =
  | { action: 'set_relay'; on: boolean }
  | { action: 'set_relay_ext'; on: boolean }
  | { action: 'frequency'; hz: number }
  | { action: 'select_out'; channel: number }
  | { action: 'active' }
  | { action: 'passive' }
  | { action: 'start_test' }
  | { action: 'stop_test' }
  | { action: 'check_code' }
  | { action: 'read_volt' }
  | { action: 'read_current' }
  | { action: 'read_comunication' }
  | { action: 'wheel_stop'; wheel: number }
  | { action: 'wheel_go'; wheel: number }
  | { action: 'push' }
  | { action: 'release' }
  | { action: 'motor_test_enable' }
  | { action: 'turn_off_motor' }
  | { action: 'load_model'; json: string }
  // The CAN init upload `ABS.cs` StartABS/FillTable run on Key Power — one
  // `Stringhe` frame or an N_STRING batch as serialized JSON (built by
  // `absCanUpload.ts`), and the `Start ABS` marker between the two phases.
  | { action: 'can_frames'; json: string }
  | { action: 'start_abs' }
  | { action: 'ack_electronics' };

// ---- Constants pulled straight from the decompiled source ----

/** `ABS.cs` `Coefficient = 0.16` — Hz→km/h scale when no model is loaded
 *  (a real model row overrides it, but BRAXON has no `ElectronicsData.accdb`
 *  model tables so this default always applies). */
export const DEFAULT_COEFFICIENT = 0.16;
/** `WorkinigProgress.SpeedTimer_Tick`: `short num = 20;` per 1 s tick. */
export const RAMP_STEP_HZ = 20;
/** Same tick: `if (Frequenza.Value > 1050) Frequenza.Value = 1050;` — the
 *  hard ceiling the operator's manual frequency slider is bounded by. */
export const RAMP_MAX_HZ = 1050;
export const RAMP_MIN_HZ = 0;
/** `ABS.cs SpeedTest_Click` ramps unattended to `TestSpeed = 69.0` km/h and
 *  *then* runs an automated wheel-lock + pressure-sampling sweep that also
 *  needs the hydraulic bench cross-link and the model DB — deliberately not
 *  replicated here. The auto `ramp_tick` climbs to this cruise speed and
 *  holds; the operator pushes past it by hand with the frequency slider
 *  (bounded by `RAMP_MAX_HZ`). `WorkinigProgress.SpeedTimer_Tick` has no
 *  such target — it just clamps at 1050 — so the two references diverge
 *  here and this follows `ABS.cs` (the screenshot form). */
export const RAMP_AUTO_TARGET_KMH = 69;
/** `ABS.cs` default `Car.BreakSpeed = 0.7` — a wheel held under an active
 *  brake / wheel-lock test reads back this fraction of line speed. */
export const BRAKE_SPEED_FACTOR = 0.7;
/** Nominal 12 V system — only used to colour the voltage readout. */
export const NOMINAL_BATTERY_V = 12;
/** `ABS.cs` reads `Car.Signal` from the model DB then does `Car.Signal++`;
 *  1 is the safe stand-in when there's no model row to read. */
export const DEFAULT_SIGNAL_CHANNEL = 1;
export const MAX_SIGNAL_CHANNEL = 15;

export type WheelId = 0 | 1 | 2 | 3;

/** `ABS.cs` `Sensor1..4` with `.Tag = "0".."3"` — the value that goes out
 *  in `Wheel Stop:<n>` / `Wheel Go:<n>`. */
export const WHEELS = [
  { id: 0, key: 'front_left' },
  { id: 1, key: 'front_right' },
  { id: 2, key: 'rear_left' },
  { id: 3, key: 'rear_right' },
] as const;

// ---- Pure helpers ----

export function frequencyToKmh(hz: number, coefficient = DEFAULT_COEFFICIENT): number {
  return hz * coefficient;
}

export function kmhToFrequency(kmh: number, coefficient = DEFAULT_COEFFICIENT): number {
  if (coefficient <= 0) return 0;
  return Math.max(0, Math.round(kmh / coefficient));
}

/** One step of the speed ramp — `WorkinigProgress.SpeedTimer_Tick`: add
 *  `num` (negative while braking), clamp to `[min, max]`. */
export function nextRampFrequency(
  currentHz: number,
  opts?: { braking?: boolean; step?: number; min?: number; max?: number },
): number {
  const step = opts?.step ?? RAMP_STEP_HZ;
  const min = opts?.min ?? RAMP_MIN_HZ;
  const max = opts?.max ?? RAMP_MAX_HZ;
  const next = currentHz + (opts?.braking ? -step : step);
  return Math.min(max, Math.max(min, next));
}

/** `ABS.cs` `SetSpeed`: a wheel that's held (`locked`) during an active
 *  brake / wheel-lock test shows a reduced speed — the wheel decelerating
 *  under ABS intervention. Otherwise it tracks line speed. */
export function wheelSpeedKmh(
  baseKmh: number,
  opts: { locked: boolean; brakingActive: boolean; factor?: number },
): number {
  const factor = opts.factor ?? BRAKE_SPEED_FACTOR;
  return opts.locked && opts.brakingActive ? baseKmh * factor : baseKmh;
}

/** `ABS.cs` `Sensor_Click`: `byte[] array = { 1, 2, 4, 8 }`, summed for
 *  every held wheel — the original picks `Car\Wheel<mask>.jpg` from it.
 *  Kept here for the SVG car's data attribute / debugging. */
export function lockedWheelBitmask(wheels: readonly { locked: boolean }[]): number {
  return wheels.reduce((mask, w, i) => (w.locked ? mask | (1 << i) : mask), 0);
}

/** `ABS.cs` frequency handler: `Value.Replace(".", ",").Replace(":", "")`
 *  then `double.TryParse`. The board can append `Hz` or a trailing `:`. */
export function parseFrequencyRaw(raw: string): number {
  const n = parseFloat(String(raw).replace(':', ''));
  return Number.isFinite(n) ? n : 0;
}

export function clampSignalChannel(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_SIGNAL_CHANNEL, Math.max(0, Math.round(n)));
}

// ---- Command sequence builders (each mirrors one `ABS.cs` handler) ----

/** `BatteryVoltage_Click` (engage): a lone `Check Code`. The board answers
 *  `Check ok` once the ABS code cable is right — see `checkOkCommands`. */
export function batteryOnCommands(): ElectronicsCmd[] {
  return [{ action: 'check_code' }];
}

/** `BatteryVoltage_Click` (disengage). */
export function batteryOffCommands(): ElectronicsCmd[] {
  return [
    { action: 'set_relay_ext', on: false },
    { action: 'frequency', hz: 0 },
    { action: 'select_out', channel: 0 },
    { action: 'passive' },
  ];
}

/** `ABS.cs` `case "Check ok": InviaComando(Electronic, "Set ReleExt ON")`. */
export function checkOkCommands(): ElectronicsCmd[] {
  return [{ action: 'set_relay_ext', on: true }];
}

/** `StartTest()` — fired from `KeyPower_Click` and, when the model wants it,
 *  from the `Comunication` handler once comms come alive. */
export function startTestCommands(opts: { signal: number; active: boolean }): ElectronicsCmd[] {
  return [
    { action: 'start_test' },
    opts.active ? { action: 'active' } : { action: 'passive' },
    { action: 'select_out', channel: opts.signal },
  ];
}

/** `KeyPower_Click` (engage): `Set Rele ON`, then the model's CAN init
 *  upload (`StartABS` → `Start ABS` → `FillTable`, prebuilt as `canUpload`
 *  by the component from `absCanStrings.ts`), then — only when the test
 *  isn't waiting on comms — `StartTest()`. `ABS.cs`:
 *  `Set Rele ON; StartABS(); FillTable(); if (!WaitComunication || flag) StartTest();`. */
export function keyPowerOnCommands(opts: {
  signal: number;
  active: boolean;
  canUpload?: readonly ElectronicsCmd[];
  startTest: boolean;
}): ElectronicsCmd[] {
  return [
    { action: 'set_relay', on: true },
    ...(opts.canUpload ?? []),
    ...(opts.startTest ? startTestCommands(opts) : []),
  ];
}

/** `KeyPower_Click` (disengage). */
export function keyPowerOffCommands(): ElectronicsCmd[] {
  return [{ action: 'set_relay', on: false }, { action: 'stop_test' }];
}

/** `SpeedTest_Click` (engage): `Select OUT:<signal>`, then `Active`/`Passive`. */
export function speedTestOnCommands(opts: { signal: number; active: boolean }): ElectronicsCmd[] {
  return [
    { action: 'select_out', channel: opts.signal },
    opts.active ? { action: 'active' } : { action: 'passive' },
  ];
}

/** `Routa_CheckedChanged` / `SpeedTimer_Tick`: held → `Wheel Stop`, released
 *  → `Wheel Go`. */
export function wheelCommand(wheel: WheelId, locked: boolean): ElectronicsCmd {
  return { action: locked ? 'wheel_stop' : 'wheel_go', wheel };
}

/** `BreakTest_Click`: `Push` on, `Release` off. */
export function brakeCommand(pushed: boolean): ElectronicsCmd {
  return pushed ? { action: 'push' } : { action: 'release' };
}

/** `Read_Tick` (1 s): `Volt`, `Current`, `Comunication`. */
export function pollCommands(): ElectronicsCmd[] {
  return [{ action: 'read_volt' }, { action: 'read_current' }, { action: 'read_comunication' }];
}

/** `MainMenuForm.cs:745-813` — stand the ECU outputs down before the bench
 *  is handed back to hydraulic mode (the `WriteLine("RELEASE")` in between,
 *  targeting the hydraulic brake actuator, is a separate concern and not
 *  included here). */
export function electronicsReleaseCommands(): ElectronicsCmd[] {
  return [
    { action: 'set_relay', on: false },
    { action: 'frequency', hz: 0 },
    { action: 'select_out', channel: 0 },
    { action: 'passive' },
    { action: 'stop_test' },
    { action: 'set_relay_ext', on: false },
  ];
}

/** `mode` argument values for `invoke('f2evo_bench_mode', { mode })` — the
 *  runtime keyword that switches the shared bench (`ELECTRONIC` /
 *  `HYDRAULIC`, see `f2evo.rs::f2evo_bench_mode`). */
export const BENCH_MODE = { electronic: 'electronic', hydraulic: 'hydraulic' } as const;

// ---- State + reducer ----

export interface WheelReadout {
  locked: boolean;
  kmh: number;
}

export interface BenchState {
  /** Board has answered (`Information` / `ACK Electronics` / any data line). */
  linked: boolean;
  /** `BatteryVoltage` engaged (`ForeColor == Control` in the original). */
  batteryOn: boolean;
  /** `KeyPower` engaged. */
  keyPowerOn: boolean;
  /** `TestEnable` — the `Start Test` sequence has gone out. */
  testStarted: boolean;
  speedTestOn: boolean;
  brakeOn: boolean;
  motorTestBusy: boolean;
  /** Last `Comunication:` value; `''` until the first one arrives. */
  comms: string;
  /** `ResultComunication == "YES"` — comms seen live & not "None". */
  commsOk: boolean;
  voltage: number | null;
  current: number | null;
  peakCurrent: number;
  /** Last commanded ramp frequency, Hz. */
  rampHz: number;
  speedKmh: number;
  maxSpeedKmh: number;
  coefficient: number;
  signalChannel: number;
  /** `Active` vs `Passive` sensor drive — `Car.Type == 1` in the original;
   *  no model here, so it's an operator toggle defaulting to `Passive`. */
  signalActive: boolean;
  /** The operator handed the shared bench back to hydraulic mode
   *  (`ABS.ReleaseElectronic`). While set, the component stops trying to
   *  pull it into ECU mode — a `reconnect` clears it. */
  released: boolean;
  /** `Set ReleExt ON/OFF` state — the external pump-power relay, switched
   *  on by the board's `Check ok` (`ABS.cs case "Check ok"`). Tracked so a
   *  bench that repeats `Check ok` doesn't re-enqueue the command. */
  extRelayOn: boolean;
  /** `Modelli.WaitComunication` for the loaded model — Key Power holds
   *  `Start Test` until a live `Comunication:` (`ABS.cs KeyPower_Click`).
   *  `false` with no model / no CAN preamble. */
  waitComunication: boolean;
  /** The loaded model's CAN init sequence as queue commands (`can_frames`
   *  batches + `start_abs`), prebuilt by the component from
   *  `absCanStrings.ts` / `absCanUpload.ts`. Streamed on Key Power between
   *  `Set Rele ON` and `Start Test`. Empty for the ~260 units without a
   *  `Stringhe` entry and for hand-filled models. */
  canUpload: readonly ElectronicsCmd[];
  /** The loaded ABS-unit model (`ABS.cs`'s `Car` / `Model.Text`). The bench
   *  won't answer commands until one is uploaded; every action button is
   *  gated on it. `null` until `load_model`. `cable` is the `GRM####`
   *  wiring-harness label to connect (see `absModel.ts::cableLabel`). */
  model: { name: string; cable: string } | null;
  wheels: [WheelReadout, WheelReadout, WheelReadout, WheelReadout];
}

export interface BenchToast {
  kind: 'success' | 'error' | 'warning';
  /** When `translate`, the component runs it through `t('f2evo.abs_bench.'+message)`;
   *  otherwise it's raw board text. */
  message: string;
  translate?: boolean;
}

export interface BenchStep {
  state: BenchState;
  commands: ElectronicsCmd[];
  toast?: BenchToast;
}

function freshWheels(): BenchState['wheels'] {
  return [
    { locked: false, kmh: 0 },
    { locked: false, kmh: 0 },
    { locked: false, kmh: 0 },
    { locked: false, kmh: 0 },
  ];
}

export function initialBenchState(overrides?: Partial<BenchState>): BenchState {
  return {
    linked: false,
    batteryOn: false,
    keyPowerOn: false,
    testStarted: false,
    speedTestOn: false,
    brakeOn: false,
    motorTestBusy: false,
    comms: '',
    commsOk: false,
    voltage: null,
    current: null,
    peakCurrent: 0,
    rampHz: 0,
    speedKmh: 0,
    maxSpeedKmh: 0,
    coefficient: DEFAULT_COEFFICIENT,
    signalChannel: DEFAULT_SIGNAL_CHANNEL,
    signalActive: false,
    released: false,
    extRelayOn: false,
    waitComunication: false,
    canUpload: [],
    model: null,
    wheels: freshWheels(),
    ...overrides,
  };
}

/** Shape of a parsed `f2evo.rs` `F2EvoEvent` (the fields this bench cares
 *  about). Unknown kinds are ignored. */
export type BenchInboundEvent =
  | { kind: 'discovery_broadcast'; board: string }
  | { kind: 'ack'; board: string }
  | { kind: 'information' }
  | { kind: 'version'; value: string }
  | { kind: 'volt'; volts: number }
  | { kind: 'current'; amps: number }
  | { kind: 'comunication'; state: string }
  | { kind: 'frequency'; raw: string }
  | { kind: 'check_ok' }
  | { kind: 'motor_result'; state: string }
  | { kind: 'warning'; text: string }
  | { kind: 'raw'; key: string; value?: string | null }
  | { kind: string; [k: string]: unknown };

export type BenchMsg =
  | { action: 'toggle_battery' }
  | { action: 'toggle_key' }
  | { action: 'toggle_speed' }
  | { action: 'toggle_brake' }
  | { action: 'toggle_wheel'; wheel: WheelId }
  | { action: 'toggle_signal_mode' }
  | { action: 'run_motor_test' }
  | { action: 'set_signal'; channel: number }
  | { action: 'set_frequency'; hz: number }
  | { action: 'ramp_tick' }
  | { action: 'poll_tick' }
  | { action: 'release' }
  | { action: 'reconnect' }
  // The operator abandoned a slow CAN init upload (the component drops the
  // queued frames); run `Start Test` now if Key Power was holding it.
  | { action: 'skip_can_upload' }
  | {
      action: 'load_model';
      /** Display name and `GRM####` cable label. */
      name: string;
      cable: string;
      /** `Car.Signal` after the `+1` — used for `Select OUT` and defaults. */
      signal: number;
      /** `Car.Type == 1` → drive sensors Active, else Passive. */
      active: boolean;
      /** Per-model Hz→km/h scale. */
      coefficient: number;
      /** The serialized `ModelComponent` JSON to upload
       *  (`absModel.ts::buildModelPayload`). */
      payload: string;
      /** `Modelli.WaitComunication` — Key Power defers `Start Test` until
       *  comms are live. Only pass `true` alongside a non-empty `canUpload`
       *  (nothing brings the bus up otherwise). */
      waitComunication: boolean;
      /** The model's CAN init sequence as queue commands, prebuilt by the
       *  component (`absCanUpload.ts`). `[]` when the unit has no `Stringhe`
       *  entry. */
      canUpload: readonly ElectronicsCmd[];
    }
  | { action: 'connection_lost' }
  | { inbound: BenchInboundEvent };

const NONE = (comms: string) => comms === '' || comms === 'None';

function applyLineSpeed(state: BenchState, hz: number): BenchState {
  const speedKmh = frequencyToKmh(hz, state.coefficient);
  const wheels = state.wheels.map(w => ({
    ...w,
    kmh: wheelSpeedKmh(speedKmh, { locked: w.locked, brakingActive: state.brakeOn }),
  })) as BenchState['wheels'];
  return { ...state, speedKmh, maxSpeedKmh: Math.max(state.maxSpeedKmh, speedKmh), wheels };
}

function reduceInbound(state: BenchState, ev: BenchInboundEvent): BenchStep {
  // Once the operator has handed the bench back to hydraulic mode, ignore
  // everything on the wire (it's hydraulic telemetry now, not ours) until a
  // `reconnect` — otherwise a stray re-announcement would silently re-link.
  if (state.released) return { state, commands: [] };

  switch (ev.kind) {
    case 'discovery_broadcast':
      return ev.board === 'Electronics'
        ? { state, commands: [{ action: 'ack_electronics' }] }
        : { state, commands: [] };
    case 'ack':
      return ev.board === 'Electronics'
        ? { state: { ...state, linked: true }, commands: [] }
        : { state, commands: [] };
    case 'information':
    case 'version':
      // The bench is talking (`Information: …` / the `ver X.X` line that
      // `MainMenuForm` treats as "board found"). The `ACK Electronics`
      // handshake is fired fire-and-forget by the component (not through
      // the retry queue — see the note there), so nothing to emit here.
      return { state: { ...state, linked: true }, commands: [] };
    case 'volt': {
      const volts = Number(ev.volts);
      return { state: { ...state, linked: true, voltage: Number.isFinite(volts) ? volts : state.voltage }, commands: [] };
    }
    case 'current': {
      const amps = Number(ev.amps);
      if (!Number.isFinite(amps)) return { state: { ...state, linked: true }, commands: [] };
      return {
        state: { ...state, linked: true, current: amps, peakCurrent: Math.max(state.peakCurrent, amps) },
        commands: [],
      };
    }
    case 'comunication': {
      const comms = String(ev.state ?? '');
      const commsOk = state.commsOk || (comms.includes('Active') && !comms.includes('None'));
      // `ABS.cs case "Comunication"`: `if (KeyPower engaged && WaitComunication
      // && Value != "None") StartTest();` — the deferred half of
      // `KeyPower_Click`'s `if (!WaitComunication || flag)`. Only a
      // `waitComunication` model that held back its `Start Test` on Key Power
      // reaches this; everything else already has `testStarted`.
      const shouldStart =
        state.waitComunication && state.keyPowerOn && !state.testStarted && !NONE(comms);
      return {
        state: { ...state, linked: true, comms, commsOk, testStarted: state.testStarted || shouldStart },
        commands: shouldStart
          ? startTestCommands({ signal: state.signalChannel, active: state.signalActive })
          : [],
      };
    }
    case 'frequency':
      return { state: applyLineSpeed({ ...state, linked: true }, parseFrequencyRaw(String(ev.raw ?? ''))), commands: [] };
    case 'check_ok':
      // Fire `Set ReleExt ON` only on the first `Check ok` — a bench that
      // repeats the line (or sends both `OK` and `Check ok`) mustn't
      // re-enqueue it.
      return state.extRelayOn
        ? { state: { ...state, linked: true }, commands: [] }
        : { state: { ...state, linked: true, extRelayOn: true }, commands: checkOkCommands() };
    case 'motor_result': {
      const st = String(ev.state);
      const toast: BenchToast | undefined =
        st === 'ok'
          ? { kind: 'success', message: 'motor_ok', translate: true }
          : st === 'error'
            ? { kind: 'error', message: 'motor_error', translate: true }
            : undefined;
      return { state: { ...state, linked: true, motorTestBusy: false }, commands: [], toast };
    }
    case 'warning': {
      const text = String(ev.text ?? '');
      const busy = /busy/i.test(text);
      return {
        state: busy ? { ...state, linked: false } : state,
        commands: [],
        toast: { kind: 'warning', message: text || 'warning' },
      };
    }
    case 'raw': {
      // `ABS.cs case "Error"` — `parse_line` has no typed `Error` arm, so an
      // `Error: ...` line arrives here as `Raw`. `Error: ...Volt...` is the
      // board's low-voltage bail-out (`ABS.cs:1015-1019` force-clicks the
      // battery off); every other `Error:` just surfaces as a toast.
      const key = String(ev.key ?? '');
      const val = String(ev.value ?? '');
      if (key === 'Error') {
        return {
          state: /volt/i.test(val) ? { ...state, batteryOn: false } : state,
          commands: [],
          toast: { kind: 'error', message: val || 'error' },
        };
      }
      return { state, commands: [] };
    }
    default:
      return { state, commands: [] };
  }
}

/**
 * The whole bench state machine in one place. `msg` is either an operator
 * action or an inbound (already-parsed) board event; the result carries the
 * next state, any wire commands to enqueue, and an optional toast.
 */
export function benchReduce(state: BenchState, msg: BenchMsg): BenchStep {
  if ('inbound' in msg) return reduceInbound(state, msg.inbound);

  switch (msg.action) {
    case 'toggle_battery': {
      if (!state.batteryOn) {
        // `ABS.cs BatteryVoltage_Click` engage: `ResultComunication = "NO"`
        // — a previously latched comms-confirmed state must not carry over
        // into a fresh power-up.
        return {
          state: { ...state, batteryOn: true, comms: '', commsOk: false },
          commands: batteryOnCommands(),
        };
      }
      return {
        state: {
          ...state,
          batteryOn: false,
          keyPowerOn: false,
          testStarted: false,
          speedTestOn: false,
          brakeOn: false,
          motorTestBusy: false,
          extRelayOn: false, // batteryOffCommands() sends `Set ReleExt OFF`
          rampHz: 0,
          speedKmh: 0,
          wheels: state.wheels.map(w => ({ ...w, kmh: 0 })) as BenchState['wheels'],
        },
        commands: batteryOffCommands(),
      };
    }

    case 'toggle_key': {
      if (!state.batteryOn) return { state, commands: [] };
      if (!state.keyPowerOn) {
        // `ABS.cs KeyPower_Click`: `if (!WaitComunication || flag) StartTest()`
        // — `flag` is the `StartABS` return (init frames were sent). A
        // `WaitComunication` model with a CAN preamble holds the test until
        // the `Comunication:` handler sees the bus come alive.
        const hadInit = state.canUpload.some(c => c.action === 'start_abs');
        const startNow = !state.waitComunication || hadInit;
        return {
          state: { ...state, keyPowerOn: true, testStarted: startNow },
          commands: keyPowerOnCommands({
            signal: state.signalChannel,
            active: state.signalActive,
            canUpload: state.canUpload,
            startTest: startNow,
          }),
        };
      }
      return {
        state: {
          ...state,
          keyPowerOn: false,
          testStarted: false,
          speedTestOn: false,
          brakeOn: false,
          rampHz: 0,
          speedKmh: 0,
          wheels: state.wheels.map(w => ({ ...w, kmh: 0 })) as BenchState['wheels'],
        },
        commands: keyPowerOffCommands(),
      };
    }

    case 'toggle_speed': {
      if (!state.keyPowerOn) return { state, commands: [] };
      if (!state.speedTestOn) {
        // `ABS.cs SpeedTest_Click:1235-1236` zeroes both `MaxSpeed` and
        // `MaxCurrent` at the start of every run.
        return {
          state: { ...state, speedTestOn: true, maxSpeedKmh: 0, peakCurrent: 0 },
          commands: speedTestOnCommands({ signal: state.signalChannel, active: state.signalActive }),
        };
      }
      return {
        state: {
          ...state,
          speedTestOn: false,
          brakeOn: false,
          rampHz: 0,
          speedKmh: 0,
          wheels: state.wheels.map(w => ({ ...w, kmh: 0 })) as BenchState['wheels'],
        },
        commands: [{ action: 'frequency', hz: 0 }],
      };
    }

    case 'toggle_brake': {
      const next = !state.brakeOn;
      return { state: { ...state, brakeOn: next }, commands: [brakeCommand(next)] };
    }

    case 'toggle_wheel': {
      const wheels = state.wheels.map((w, i) =>
        i === msg.wheel ? { ...w, locked: !w.locked } : w,
      ) as BenchState['wheels'];
      return {
        state: { ...state, wheels },
        commands: [wheelCommand(msg.wheel, wheels[msg.wheel].locked)],
      };
    }

    case 'toggle_signal_mode': {
      const active = !state.signalActive;
      const commands: ElectronicsCmd[] = state.testStarted
        ? [active ? { action: 'active' } : { action: 'passive' }]
        : [];
      return { state: { ...state, signalActive: active }, commands };
    }

    case 'run_motor_test': {
      if (!state.testStarted || state.motorTestBusy) return { state, commands: [] };
      return { state: { ...state, motorTestBusy: true }, commands: [{ action: 'motor_test_enable' }] };
    }

    case 'set_signal': {
      const channel = clampSignalChannel(msg.channel);
      return {
        state: { ...state, signalChannel: channel },
        commands: state.testStarted ? [{ action: 'select_out', channel }] : [],
      };
    }

    case 'set_frequency': {
      // Bounded to the same range as the operator's slider so a stray value
      // can't push `ramp_tick`'s auto-ceiling past `RAMP_MAX_HZ`.
      const hz = Math.min(RAMP_MAX_HZ, Math.max(RAMP_MIN_HZ, Math.round(msg.hz)));
      if (!state.testStarted && !state.speedTestOn) {
        return { state: { ...state, rampHz: hz }, commands: [] };
      }
      return {
        state: { ...applyLineSpeed(state, hz), rampHz: hz },
        commands: [{ action: 'frequency', hz }],
      };
    }

    case 'ramp_tick': {
      if (!state.speedTestOn) return { state, commands: [] };
      // Auto-climb only up to the `ABS.cs` cruise target — but never force a
      // frequency the operator has manually pushed *past* it back down; from
      // there the ramp just holds (or winds down while braking).
      const autoCeilingHz = Math.max(
        kmhToFrequency(RAMP_AUTO_TARGET_KMH, state.coefficient),
        state.rampHz,
      );
      const hz = nextRampFrequency(state.rampHz, { braking: state.brakeOn, max: autoCeilingHz });
      const commands: ElectronicsCmd[] = [{ action: 'frequency', hz }];
      // `SpeedTimer_Tick` re-asserts `Wheel Stop` for every held wheel each
      // tick — the board otherwise lets a stopped wheel spin back up.
      state.wheels.forEach((w, i) => {
        if (w.locked) commands.push(wheelCommand(i as WheelId, true));
      });
      const stopped = state.brakeOn && hz <= RAMP_MIN_HZ;
      const next = applyLineSpeed({ ...state, rampHz: hz }, hz);
      return {
        state: {
          ...next,
          speedTestOn: !stopped,
          brakeOn: stopped ? false : state.brakeOn,
        },
        commands,
      };
    }

    case 'poll_tick':
      return state.linked && state.batteryOn && !state.released
        ? { state, commands: pollCommands() }
        : { state, commands: [] };

    case 'release':
      // Stand the ECU outputs down (`ABS.ReleaseElectronic` + the
      // MainMenuForm close-up); the component then sends `HYDRAULIC` to
      // actually switch the bench back. `released` stays set so the connect
      // loop doesn't immediately pull it into ECU mode again.
      return {
        state: initialBenchState({
          released: true,
          coefficient: state.coefficient,
          signalChannel: state.signalChannel,
          signalActive: state.signalActive,
        }),
        commands: electronicsReleaseCommands(),
      };

    case 'reconnect':
      return { state: { ...state, released: false }, commands: [] };

    case 'skip_can_upload': {
      // Frames are dropped component-side; here just release the `Start Test`
      // that a `waitComunication` Key Power was holding, so the bench isn't
      // left keyed but idle.
      if (!state.keyPowerOn || state.testStarted) {
        return { state: { ...state, canUpload: [] }, commands: [] };
      }
      return {
        state: { ...state, testStarted: true, waitComunication: false, canUpload: [] },
        commands: startTestCommands({ signal: state.signalChannel, active: state.signalActive }),
      };
    }

    case 'load_model':
      // A released bench is in hydraulic mode — nothing to upload to.
      if (state.released) return { state, commands: [] };
      // `ABS.cs Model_Click`: stand any running test down, then upload the
      // serialized `Car`. Everything power-related resets (the operator
      // re-engages Battery / Key afterwards); the link is preserved.
      return {
        state: {
          ...initialBenchState({ linked: state.linked, released: state.released }),
          model: { name: msg.name, cable: msg.cable },
          signalChannel: clampSignalChannel(msg.signal),
          signalActive: msg.active,
          coefficient: msg.coefficient > 0 ? msg.coefficient : DEFAULT_COEFFICIENT,
          waitComunication: msg.waitComunication,
          canUpload: msg.canUpload,
        },
        commands: [
          { action: 'stop_test' },
          { action: 'frequency', hz: 0 },
          { action: 'select_out', channel: 0 },
          { action: 'passive' },
          { action: 'load_model', json: msg.payload },
        ],
      };

    case 'connection_lost':
      return {
        state: initialBenchState({
          coefficient: state.coefficient,
          signalChannel: state.signalChannel,
          signalActive: state.signalActive,
        }),
        commands: [],
      };
  }
}

// Which inbound event kinds count as the board *answering* a given command.
// The re-send-until-OK queue (`ABS.cs Polling_Tick` / `case "OK"`) assumes
// an `OK` after every command; real hardware often just sends the
// substantive reply (`Volt:1234`, `Check ok`, `Motor ok`) and no bare `OK`.
// Treating that reply as the ack keeps the queue from wedging.
//
// This assumes replies arrive in command order (the protocol has no
// sequence numbers). Worst case, a late `Volt:` from a previous poll cycle
// advances the current cycle's `read_volt` one step early — one dropped,
// idempotent poll command, self-correcting on the next cycle.
const COMMAND_ANSWERS: Partial<Record<ElectronicsCmd['action'], readonly string[]>> = {
  read_volt: ['volt'],
  read_current: ['current'],
  read_comunication: ['comunication'],
  check_code: ['check_ok'],
  motor_test_enable: ['motor_result'],
  ack_electronics: ['information', 'ack', 'version'],
};

export function eventAnswersCommand(cmd: ElectronicsCmd | undefined, kind: string): boolean {
  return !!cmd && (COMMAND_ANSWERS[cmd.action]?.includes(kind) ?? false);
}

/** Voltage-readout colour band — purely cosmetic. */
export function voltageBand(v: number | null): 'none' | 'ok' | 'warn' | 'bad' {
  if (v == null) return 'none';
  if (v >= 11 && v <= 15.5) return 'ok';
  if (v >= 9 && v < 16.5) return 'warn';
  return 'bad';
}
