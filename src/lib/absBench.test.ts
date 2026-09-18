import { describe, it, expect } from 'vitest';
import {
  benchReduce,
  initialBenchState,
  frequencyToKmh,
  kmhToFrequency,
  nextRampFrequency,
  wheelSpeedKmh,
  lockedWheelBitmask,
  parseFrequencyRaw,
  clampSignalChannel,
  eventAnswersCommand,
  voltageBand,
  batteryOnCommands,
  batteryOffCommands,
  keyPowerOnCommands,
  speedTestOnCommands,
  electronicsReleaseCommands,
  RAMP_MAX_HZ,
  RAMP_STEP_HZ,
  RAMP_AUTO_TARGET_KMH,
  DEFAULT_COEFFICIENT,
  type BenchState,
  type BenchMsg,
  type ElectronicsCmd,
} from './absBench';

// A bench that's connected, battery on, key power on, test armed — the
// state most operator actions actually run from.
function armed(overrides?: Partial<BenchState>): BenchState {
  return initialBenchState({
    linked: true,
    batteryOn: true,
    keyPowerOn: true,
    testStarted: true,
    comms: 'Active',
    commsOk: true,
    ...overrides,
  });
}

describe('unit conversions', () => {
  it('maps Hz to km/h with the default coefficient', () => {
    expect(frequencyToKmh(500)).toBeCloseTo(80, 6); // 500 * 0.16
    expect(frequencyToKmh(0)).toBe(0);
  });

  it('round-trips km/h back to Hz', () => {
    expect(kmhToFrequency(80)).toBe(500);
    expect(kmhToFrequency(0)).toBe(0);
  });

  it('guards a non-positive coefficient', () => {
    expect(kmhToFrequency(80, 0)).toBe(0);
    expect(kmhToFrequency(80, -1)).toBe(0);
  });

  it('parses the board frequency string like ABS.cs does', () => {
    expect(parseFrequencyRaw('500Hz')).toBe(500);
    expect(parseFrequencyRaw('500:')).toBe(500);
    expect(parseFrequencyRaw('')).toBe(0);
    expect(parseFrequencyRaw('garbage')).toBe(0);
  });
});

describe('speed ramp', () => {
  it('adds one step per tick while accelerating', () => {
    expect(nextRampFrequency(0)).toBe(RAMP_STEP_HZ);
    expect(nextRampFrequency(100)).toBe(120);
  });

  it('subtracts a step while braking and never goes below zero', () => {
    expect(nextRampFrequency(30, { braking: true })).toBe(10);
    expect(nextRampFrequency(10, { braking: true })).toBe(0);
    expect(nextRampFrequency(0, { braking: true })).toBe(0);
  });

  it('clamps at the 1050 Hz ceiling', () => {
    expect(nextRampFrequency(RAMP_MAX_HZ)).toBe(RAMP_MAX_HZ);
    expect(nextRampFrequency(RAMP_MAX_HZ - 5)).toBe(RAMP_MAX_HZ);
  });
});

describe('wheel speed under an active brake test', () => {
  it('reduces a held wheel to the brake-speed fraction', () => {
    expect(wheelSpeedKmh(100, { locked: true, brakingActive: true })).toBeCloseTo(70, 6);
  });
  it('leaves a rolling wheel (or an unbraked hold) at line speed', () => {
    expect(wheelSpeedKmh(100, { locked: false, brakingActive: true })).toBe(100);
    expect(wheelSpeedKmh(100, { locked: true, brakingActive: false })).toBe(100);
  });
});

describe('locked-wheel bitmask (ABS.cs Sensor_Click)', () => {
  it('sums 1/2/4/8 for held wheels', () => {
    expect(lockedWheelBitmask([{ locked: false }, { locked: false }, { locked: false }, { locked: false }])).toBe(0);
    expect(lockedWheelBitmask([{ locked: true }, { locked: false }, { locked: false }, { locked: false }])).toBe(1);
    expect(lockedWheelBitmask([{ locked: false }, { locked: true }, { locked: false }, { locked: true }])).toBe(10);
    expect(lockedWheelBitmask([{ locked: true }, { locked: true }, { locked: true }, { locked: true }])).toBe(15);
  });
});

describe('misc helpers', () => {
  it('clamps the signal channel into 0..15', () => {
    expect(clampSignalChannel(-3)).toBe(0);
    expect(clampSignalChannel(99)).toBe(15);
    expect(clampSignalChannel(2.6)).toBe(3);
    expect(clampSignalChannel(NaN)).toBe(0);
  });
  it('bands the voltage readout', () => {
    expect(voltageBand(null)).toBe('none');
    expect(voltageBand(12.4)).toBe('ok');
    expect(voltageBand(10)).toBe('warn');
    expect(voltageBand(6)).toBe('bad');
    expect(voltageBand(18)).toBe('bad');
  });

  it('recognises a board reply that stands in for a bare OK', () => {
    expect(eventAnswersCommand({ action: 'read_volt' }, 'volt')).toBe(true);
    expect(eventAnswersCommand({ action: 'read_current' }, 'current')).toBe(true);
    expect(eventAnswersCommand({ action: 'read_comunication' }, 'comunication')).toBe(true);
    expect(eventAnswersCommand({ action: 'check_code' }, 'check_ok')).toBe(true);
    expect(eventAnswersCommand({ action: 'motor_test_enable' }, 'motor_result')).toBe(true);
    expect(eventAnswersCommand({ action: 'ack_electronics' }, 'information')).toBe(true);
    expect(eventAnswersCommand({ action: 'ack_electronics' }, 'ack')).toBe(true);
    // Mismatches and undefined front don't advance.
    expect(eventAnswersCommand({ action: 'read_volt' }, 'current')).toBe(false);
    expect(eventAnswersCommand({ action: 'start_test' }, 'volt')).toBe(false);
    expect(eventAnswersCommand(undefined, 'volt')).toBe(false);
  });
});

describe('power-up sequence', () => {
  it('Battery Voltage engage sends a lone Check Code', () => {
    const s0 = initialBenchState({ linked: true });
    const { state, commands } = benchReduce(s0, { action: 'toggle_battery' });
    expect(state.batteryOn).toBe(true);
    expect(commands).toEqual(batteryOnCommands());
    expect(commands).toEqual([{ action: 'check_code' }]);
  });

  it('Check ok from the board arms the external relay — once', () => {
    const s = initialBenchState({ linked: true, batteryOn: true });
    const first = benchReduce(s, { inbound: { kind: 'check_ok' } });
    expect(first.commands).toEqual([{ action: 'set_relay_ext', on: true }]);
    expect(first.state.extRelayOn).toBe(true);
    // A repeated Check ok must not re-enqueue the command.
    const second = benchReduce(first.state, { inbound: { kind: 'check_ok' } });
    expect(second.commands).toEqual([]);
    // Battery disengage drops it, so a fresh engage re-arms.
    const off = benchReduce(first.state, { action: 'toggle_battery' });
    expect(off.state.extRelayOn).toBe(false);
    expect(benchReduce(off.state, { inbound: { kind: 'check_ok' } }).commands).toEqual([
      { action: 'set_relay_ext', on: true },
    ]);
  });

  it('Key Power is inert until the battery is engaged', () => {
    const s = initialBenchState({ linked: true });
    const { state, commands } = benchReduce(s, { action: 'toggle_key' });
    expect(state.keyPowerOn).toBe(false);
    expect(commands).toEqual([]);
  });

  it('Key Power engage sends Set Rele ON then the Start Test sequence', () => {
    const s = initialBenchState({ linked: true, batteryOn: true, signalChannel: 1, signalActive: false });
    const { state, commands } = benchReduce(s, { action: 'toggle_key' });
    expect(state.keyPowerOn).toBe(true);
    // No CAN preamble and not waiting on comms → the test arms right away.
    expect(state.testStarted).toBe(true);
    expect(commands).toEqual(keyPowerOnCommands({ signal: 1, active: false, startTest: true }));
    expect(commands).toEqual([
      { action: 'set_relay', on: true },
      { action: 'start_test' },
      { action: 'passive' },
      { action: 'select_out', channel: 1 },
    ]);
  });

  it('a WaitComunication model with a CAN preamble streams it and defers Start Test', () => {
    const canUpload = [
      { action: 'can_frames' as const, json: '[{"address1":"520","indx":0,"pos":0,"type":0,"us":4000,"data":[1]}]' },
    ];
    const s = initialBenchState({
      linked: true, batteryOn: true, signalChannel: 1,
      waitComunication: true, canUpload,
    });
    const keyed = benchReduce(s, { action: 'toggle_key' });
    // Set Rele ON + the CAN batch, but NOT Start Test yet.
    expect(keyed.state.testStarted).toBe(false);
    expect(keyed.commands).toEqual([{ action: 'set_relay', on: true }, ...canUpload]);

    // The bus comes alive → the deferred Start Test fires.
    const live = benchReduce(keyed.state, { inbound: { kind: 'comunication', state: 'Active CAN' } });
    expect(live.state.testStarted).toBe(true);
    expect(live.commands).toEqual([
      { action: 'start_test' },
      { action: 'passive' },
      { action: 'select_out', channel: 1 },
    ]);
  });

  it('Battery Voltage engage clears any latched comms state (ResultComunication = NO)', () => {
    const s = initialBenchState({ linked: true, comms: 'Active', commsOk: true });
    const { state } = benchReduce(s, { action: 'toggle_battery' });
    expect(state.batteryOn).toBe(true);
    expect(state.comms).toBe('');
    expect(state.commsOk).toBe(false);
  });

  it('Battery Voltage disengage stands down key power + speed test and vents', () => {
    const s = armed({ speedTestOn: true, rampHz: 300, brakeOn: true });
    const { state, commands } = benchReduce(s, { action: 'toggle_battery' });
    expect(state).toMatchObject({ batteryOn: false, keyPowerOn: false, speedTestOn: false, testStarted: false, rampHz: 0 });
    expect(commands).toEqual(batteryOffCommands());
  });

  it('drives Active vs Passive from the signal mode toggle', () => {
    const s = initialBenchState({ linked: true, batteryOn: true, signalActive: true });
    const { commands } = benchReduce(s, { action: 'toggle_key' });
    expect(commands).toEqual(keyPowerOnCommands({ signal: s.signalChannel, active: true, startTest: true }));
  });
});

describe('comms-driven auto start (ABS.cs Comunication handler)', () => {
  it('fires Start Test once comms come alive with key power engaged', () => {
    // Only a `waitComunication` model defers Start Test to this handler.
    const s = initialBenchState({
      linked: true, batteryOn: true, keyPowerOn: true, testStarted: false,
      waitComunication: true, signalChannel: 2,
    });
    const { state, commands } = benchReduce(s, { inbound: { kind: 'comunication', state: 'Active KWP' } });
    expect(state.testStarted).toBe(true);
    expect(state.commsOk).toBe(true);
    expect(commands).toEqual([
      { action: 'start_test' },
      { action: 'passive' },
      { action: 'select_out', channel: 2 },
    ]);
  });

  it('does nothing extra when comms read None', () => {
    const s = initialBenchState({ linked: true, batteryOn: true, keyPowerOn: true });
    const { state, commands } = benchReduce(s, { inbound: { kind: 'comunication', state: 'None' } });
    expect(state.testStarted).toBe(false);
    expect(commands).toEqual([]);
  });

  it('does not re-fire once the test is already armed', () => {
    const s = armed();
    const { commands } = benchReduce(s, { inbound: { kind: 'comunication', state: 'Active' } });
    expect(commands).toEqual([]);
  });

  it('skip_can_upload runs Start Test when Key Power was holding it, and clears the preamble', () => {
    const held = initialBenchState({
      linked: true, batteryOn: true, keyPowerOn: true, testStarted: false,
      waitComunication: true, signalChannel: 3,
      canUpload: [{ action: 'can_frames', json: '[]' }],
    });
    const { state, commands } = benchReduce(held, { action: 'skip_can_upload' });
    expect(state.testStarted).toBe(true);
    expect(state.waitComunication).toBe(false);
    expect(state.canUpload).toEqual([]);
    expect(commands).toEqual([
      { action: 'start_test' },
      { action: 'passive' },
      { action: 'select_out', channel: 3 },
    ]);
  });

  it('skip_can_upload is inert once the test is already started', () => {
    const s = armed({ canUpload: [{ action: 'can_frames', json: '[]' }] });
    const { state, commands } = benchReduce(s, { action: 'skip_can_upload' });
    expect(commands).toEqual([]);
    expect(state.canUpload).toEqual([]);
    expect(state.testStarted).toBe(true);
  });
});

describe('speed test + wheels', () => {
  it('Speed Test engage picks the signal output and drive mode, and zeroes the peaks', () => {
    const s = armed({ signalChannel: 3, signalActive: true, peakCurrent: 7.4, maxSpeedKmh: 55 });
    const { state, commands } = benchReduce(s, { action: 'toggle_speed' });
    expect(state.speedTestOn).toBe(true);
    expect(state.peakCurrent).toBe(0);
    expect(state.maxSpeedKmh).toBe(0);
    expect(commands).toEqual(speedTestOnCommands({ signal: 3, active: true }));
  });

  it('ramp_tick auto-climbs only to the ABS.cs cruise target, then holds', () => {
    const ceilingHz = Math.round(RAMP_AUTO_TARGET_KMH / DEFAULT_COEFFICIENT); // ~431
    let s = armed({ speedTestOn: true, rampHz: ceilingHz - RAMP_STEP_HZ + 5 });
    s = benchReduce(s, { action: 'ramp_tick' }).state;
    expect(s.rampHz).toBe(ceilingHz);
    s = benchReduce(s, { action: 'ramp_tick' }).state;
    expect(s.rampHz).toBe(ceilingHz); // held, not climbing past
  });

  it('ramp_tick holds a manually-set higher frequency instead of forcing it down', () => {
    const s = armed({ speedTestOn: true, rampHz: 800 }); // operator pushed past cruise via the slider
    const held = benchReduce(s, { action: 'ramp_tick' });
    expect(held.state.rampHz).toBe(800); // held where the operator left it, not clamped to cruise
    // ...but braking still winds it back down.
    const braking = benchReduce({ ...s, brakeOn: true }, { action: 'ramp_tick' });
    expect(braking.state.rampHz).toBe(780);
  });

  it('ramp_tick accelerates, tracks km/h and re-asserts held wheels', () => {
    let s = armed({ speedTestOn: true, rampHz: 100 });
    s = { ...s, wheels: [{ locked: true, kmh: 0 }, { locked: false, kmh: 0 }, { locked: false, kmh: 0 }, { locked: false, kmh: 0 }] };
    const { state, commands } = benchReduce(s, { action: 'ramp_tick' });
    expect(state.rampHz).toBe(120);
    expect(state.speedKmh).toBeCloseTo(120 * DEFAULT_COEFFICIENT, 6);
    expect(state.maxSpeedKmh).toBeCloseTo(state.speedKmh, 6);
    expect(commands).toEqual([
      { action: 'frequency', hz: 120 },
      { action: 'wheel_stop', wheel: 0 },
    ]);
  });

  it('ramp_tick while braking winds speed down and stops the test at rest', () => {
    const s = armed({ speedTestOn: true, brakeOn: true, rampHz: 10 });
    const { state, commands } = benchReduce(s, { action: 'ramp_tick' });
    expect(state.rampHz).toBe(0);
    expect(state.speedTestOn).toBe(false);
    expect(state.brakeOn).toBe(false);
    expect(commands).toContainEqual({ action: 'frequency', hz: 0 });
  });

  it('toggling a wheel emits Wheel Stop then Wheel Go', () => {
    let s = armed({ speedTestOn: true });
    let out = benchReduce(s, { action: 'toggle_wheel', wheel: 2 });
    expect(out.state.wheels[2].locked).toBe(true);
    expect(out.commands).toEqual([{ action: 'wheel_stop', wheel: 2 }]);
    s = out.state;
    out = benchReduce(s, { action: 'toggle_wheel', wheel: 2 });
    expect(out.state.wheels[2].locked).toBe(false);
    expect(out.commands).toEqual([{ action: 'wheel_go', wheel: 2 }]);
  });

  it('a board Frequency line updates line + per-wheel speed', () => {
    const s = armed({ speedTestOn: true, brakeOn: true, wheels: [
      { locked: true, kmh: 0 }, { locked: false, kmh: 0 }, { locked: false, kmh: 0 }, { locked: false, kmh: 0 },
    ] });
    const { state } = benchReduce(s, { inbound: { kind: 'frequency', raw: '500Hz' } });
    expect(state.speedKmh).toBeCloseTo(80, 6);
    expect(state.wheels[0].kmh).toBeCloseTo(80 * 0.7, 6); // held + braking -> reduced
    expect(state.wheels[1].kmh).toBeCloseTo(80, 6);
  });

  it('Speed Test is inert without key power', () => {
    const s = initialBenchState({ linked: true, batteryOn: true });
    const { state, commands } = benchReduce(s, { action: 'toggle_speed' });
    expect(state.speedTestOn).toBe(false);
    expect(commands).toEqual([]);
  });
});

describe('operator actions emit the exact wire commands', () => {
  const cases: Array<{ name: string; msg: BenchMsg; state?: Partial<BenchState>; expect: ElectronicsCmd[] }> = [
    { name: 'toggle_brake on -> Push', msg: { action: 'toggle_brake' }, expect: [{ action: 'push' }] },
    { name: 'toggle_brake off -> Release', msg: { action: 'toggle_brake' }, state: { brakeOn: true }, expect: [{ action: 'release' }] },
    { name: 'run_motor_test -> Motor Test Enable', msg: { action: 'run_motor_test' }, expect: [{ action: 'motor_test_enable' }] },
    { name: 'toggle_signal_mode (armed) -> Active', msg: { action: 'toggle_signal_mode' }, expect: [{ action: 'active' }] },
    { name: 'toggle_signal_mode back -> Passive', msg: { action: 'toggle_signal_mode' }, state: { signalActive: true }, expect: [{ action: 'passive' }] },
    { name: 'set_signal (armed) -> Select OUT', msg: { action: 'set_signal', channel: 5 }, expect: [{ action: 'select_out', channel: 5 }] },
    { name: 'set_frequency (armed) -> Frequency', msg: { action: 'set_frequency', hz: 240 }, expect: [{ action: 'frequency', hz: 240 }] },
    { name: 'set_frequency clamps above the slider ceiling', msg: { action: 'set_frequency', hz: 99999 }, expect: [{ action: 'frequency', hz: RAMP_MAX_HZ }] },
    { name: 'set_frequency clamps a negative value to zero', msg: { action: 'set_frequency', hz: -50 }, expect: [{ action: 'frequency', hz: 0 }] },
  ];
  it.each(cases)('$name', ({ msg, state, expect: want }) => {
    const { commands } = benchReduce(armed(state), msg);
    expect(commands).toEqual(want);
  });

  it('run_motor_test is a no-op while a run is already in flight', () => {
    const { state, commands } = benchReduce(armed({ motorTestBusy: true }), { action: 'run_motor_test' });
    expect(state.motorTestBusy).toBe(true);
    expect(commands).toEqual([]);
  });

  it('run_motor_test is a no-op before the test is armed', () => {
    const { commands } = benchReduce(initialBenchState({ linked: true, batteryOn: true }), { action: 'run_motor_test' });
    expect(commands).toEqual([]);
  });

  it('set_signal / set_frequency stay silent until the test is armed', () => {
    const idle = initialBenchState({ linked: true, batteryOn: true });
    expect(benchReduce(idle, { action: 'set_signal', channel: 4 }).commands).toEqual([]);
    expect(benchReduce(idle, { action: 'set_frequency', hz: 100 }).commands).toEqual([]);
    // ...but the chosen values are still remembered for the next Start Test.
    expect(benchReduce(idle, { action: 'set_signal', channel: 4 }).state.signalChannel).toBe(4);
  });
});

describe('inbound telemetry', () => {
  it('tracks voltage, current and the running peak', () => {
    let s = initialBenchState();
    s = benchReduce(s, { inbound: { kind: 'volt', volts: 13.8 } }).state;
    s = benchReduce(s, { inbound: { kind: 'current', amps: 4.2 } }).state;
    s = benchReduce(s, { inbound: { kind: 'current', amps: 2.1 } }).state;
    expect(s.voltage).toBe(13.8);
    expect(s.current).toBe(2.1);
    expect(s.peakCurrent).toBe(4.2);
    expect(s.linked).toBe(true);
  });

  it('acks an Electronics discovery broadcast', () => {
    const { commands } = benchReduce(initialBenchState(), {
      inbound: { kind: 'discovery_broadcast', board: 'Electronics' },
    });
    expect(commands).toEqual([{ action: 'ack_electronics' }]);
  });

  it('ignores a discovery broadcast for another board', () => {
    const { commands } = benchReduce(initialBenchState(), {
      inbound: { kind: 'discovery_broadcast', board: 'Hydraulics' },
    });
    expect(commands).toEqual([]);
  });

  it('clears the motor-test busy flag and toasts the result', () => {
    const s = armed({ motorTestBusy: true });
    const ok = benchReduce(s, { inbound: { kind: 'motor_result', state: 'ok' } });
    expect(ok.state.motorTestBusy).toBe(false);
    expect(ok.toast).toEqual({ kind: 'success', message: 'motor_ok', translate: true });
    const err = benchReduce(s, { inbound: { kind: 'motor_result', state: 'error' } });
    expect(err.toast).toEqual({ kind: 'error', message: 'motor_error', translate: true });
  });

  it('drops the battery on a low-voltage Error line', () => {
    const s = armed();
    const { state, toast } = benchReduce(s, { inbound: { kind: 'raw', key: 'Error', value: ' Volt too low' } });
    expect(state.batteryOn).toBe(false);
    expect(toast?.kind).toBe('error');
  });

  it('marks the board unlinked on a "Bench is busy" warning', () => {
    const s = armed();
    const { state } = benchReduce(s, { inbound: { kind: 'warning', text: 'Bench is busy.' } });
    expect(state.linked).toBe(false);
  });
});

describe('load_model (ABS.cs Model_Click)', () => {
  const msg = {
    action: 'load_model' as const,
    name: 'MK60 test',
    cable: 'GRM0137',
    signal: 3,
    active: true,
    coefficient: 0.2,
    payload: '{"Model":"MK60 test","Type":1}',
    waitComunication: false,
    canUpload: [] as const,
  };

  it('stands the test down, uploads the model, and records it', () => {
    const s = armed({ speedTestOn: true, voltage: 13, model: null });
    const { state, commands } = benchReduce(s, msg);
    expect(commands).toEqual([
      { action: 'stop_test' },
      { action: 'frequency', hz: 0 },
      { action: 'select_out', channel: 0 },
      { action: 'passive' },
      { action: 'load_model', json: msg.payload },
    ]);
    expect(state.model).toEqual({ name: 'MK60 test', cable: 'GRM0137' });
    expect(state.signalChannel).toBe(3);
    expect(state.signalActive).toBe(true);
    expect(state.coefficient).toBe(0.2);
    // power state is reset (operator re-engages Battery/Key afterwards)
    expect(state).toMatchObject({ batteryOn: false, keyPowerOn: false, speedTestOn: false, voltage: null });
    // link + release latch survive
    expect(state.linked).toBe(true);
  });

  it('is a no-op while the bench is released to hydraulic mode', () => {
    const s = initialBenchState({ released: true, linked: true });
    const { state, commands } = benchReduce(s, msg);
    expect(commands).toEqual([]);
    expect(state.model).toBeNull();
    expect(state).toEqual(s);
  });

  it('falls back to the default coefficient when the model has none', () => {
    const { state } = benchReduce(armed(), { ...msg, coefficient: 0 });
    expect(state.coefficient).toBe(DEFAULT_COEFFICIENT);
  });

  it('a connection loss clears the loaded model', () => {
    const loaded = benchReduce(armed(), msg).state;
    expect(benchReduce(loaded, { action: 'connection_lost' }).state.model).toBeNull();
  });

  it('stashes the CAN preamble + WaitComunication for Key Power to use', () => {
    const canUpload = [{ action: 'can_frames' as const, json: '[{"address1":"1"}]' }];
    const { state } = benchReduce(armed(), { ...msg, waitComunication: true, canUpload });
    expect(state.canUpload).toEqual(canUpload);
    expect(state.waitComunication).toBe(true);
    // and both are cleared again by a connection loss / release
    expect(benchReduce(state, { action: 'connection_lost' }).state.canUpload).toEqual([]);
    expect(benchReduce(state, { action: 'release' }).state.waitComunication).toBe(false);
  });
});

describe('release / reconnect (shared-bench hand-off)', () => {
  it('release stands the ECU outputs down and latches `released`', () => {
    const s = armed({ speedTestOn: true, rampHz: 300, voltage: 13, peakCurrent: 8 });
    const { state, commands } = benchReduce(s, { action: 'release' });
    expect(commands).toEqual(electronicsReleaseCommands());
    expect(commands).toEqual([
      { action: 'set_relay', on: false },
      { action: 'frequency', hz: 0 },
      { action: 'select_out', channel: 0 },
      { action: 'passive' },
      { action: 'stop_test' },
      { action: 'set_relay_ext', on: false },
    ]);
    expect(state.released).toBe(true);
    expect(state).toMatchObject({ linked: false, batteryOn: false, keyPowerOn: false, testStarted: false, speedTestOn: false, voltage: null, peakCurrent: 0 });
  });

  it('a released bench ignores everything on the wire', () => {
    const s = initialBenchState({ released: true });
    for (const ev of [
      { kind: 'discovery_broadcast', board: 'Electronics' },
      { kind: 'information' },
      { kind: 'volt', volts: 13 },
      { kind: 'comunication', state: 'Active' },
      { kind: 'check_ok' },
    ] as const) {
      const { state, commands } = benchReduce(s, { inbound: ev });
      expect(commands).toEqual([]);
      expect(state).toEqual(s);
    }
  });

  it('reconnect clears the latch without touching anything else', () => {
    const s = initialBenchState({ released: true, signalChannel: 4, signalActive: true });
    const { state, commands } = benchReduce(s, { action: 'reconnect' });
    expect(state.released).toBe(false);
    expect(state.signalChannel).toBe(4);
    expect(state.signalActive).toBe(true);
    expect(commands).toEqual([]);
  });

  it('poll_tick stays silent while released even if linked+battery somehow linger', () => {
    const s = initialBenchState({ released: true, linked: true, batteryOn: true });
    expect(benchReduce(s, { action: 'poll_tick' }).commands).toEqual([]);
  });

  it('connection_lost clears the release latch (a real cable drop resets intent)', () => {
    const { state } = benchReduce(initialBenchState({ released: true }), { action: 'connection_lost' });
    expect(state.released).toBe(false);
  });
});

describe('poll + connection loss', () => {
  it('poll_tick only queries once linked and powered', () => {
    expect(benchReduce(initialBenchState(), { action: 'poll_tick' }).commands).toEqual([]);
    expect(benchReduce(initialBenchState({ linked: true }), { action: 'poll_tick' }).commands).toEqual([]);
    const live = benchReduce(initialBenchState({ linked: true, batteryOn: true }), { action: 'poll_tick' });
    expect(live.commands).toEqual([
      { action: 'read_volt' },
      { action: 'read_current' },
      { action: 'read_comunication' },
    ]);
  });

  it('connection_lost resets everything but keeps operator preferences', () => {
    const s = armed({ speedTestOn: true, voltage: 13, peakCurrent: 9, signalChannel: 4, signalActive: true, coefficient: 0.2 });
    const { state } = benchReduce(s, { action: 'connection_lost' });
    expect(state.linked).toBe(false);
    expect(state.batteryOn).toBe(false);
    expect(state.voltage).toBeNull();
    expect(state.peakCurrent).toBe(0);
    expect(state.signalChannel).toBe(4);
    expect(state.signalActive).toBe(true);
    expect(state.coefficient).toBe(0.2);
  });
});
