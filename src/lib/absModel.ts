// The ABS-unit "model" the electronics/ABS bench needs before it will do
// anything — the `ModelComponent` (`Car`) the original app builds in
// `ABS.cs Model_Click` from its `ElectronicsData.accdb` `Modelli` table and
// uploads to the board (`InviaComando(Electronic, Serialize(Car))`).
//
// BRAXON has no `ElectronicsData.accdb`, so instead of a manufacturer/model
// tree this is a small set of electrical-parameter presets plus a form the
// operator fills from the unit's paperwork. The one field that genuinely
// matters and can't be guessed is `code` — it picks the bench cable
// (`GRM<code-2000>`) and is what `Check Code` compares against.
//
// Pure: no React, no Tauri. `buildModelPayload` produces the exact JSON the
// board expects; `benchReduce` (absBench.ts) wraps it in `LoadModel`.

import { clampSignalChannel, DEFAULT_COEFFICIENT } from './absBench';

export interface AbsElectronicsModel {
  name: string;
  /** `Modelli.ID` when this came from the catalog — the key into the
   *  `Stringhe` CAN-init table (`absCanStrings.ts`). Absent for a
   *  hand-filled model, which then has no CAN preamble. */
  id?: number;
  /** `ModelComponent.Type` — 0 = passive WSS drive, 1 = active. */
  type: 0 | 1;
  /** `ModelComponent.Speed` — the DB `SpeedCAN` bus-speed selector. */
  speedCan: number;
  /** DB `Signal` (0-based); the wire payload carries `signal + 1`
   *  (`ABS.cs Model_Click` does `Car.Signal++`). */
  signal: number;
  /** ABS ident code. Bench cable = `GRM` + `(code - 2000)` zero-padded to 4. */
  code: number;
  /** `ModelComponent.Pausa` — motor-off delay, ms. */
  pausa: number;
  /** Locked-wheel speed factor (`ModelComponent.BreakSpeed`). */
  breakSpeed: number;
  /** Hz → km/h scale (DB `Coefficient`). Applied PC-side, not a
   *  `ModelComponent` field, but it's per-model so it rides along here. */
  coefficient: number;
  /** Per-wheel sensor resistances `[Res1, Res2]`, order FL/FR/RL/RR
   *  (`ModelComponent.Wheel1Res1..Wheel4Res2`). */
  wheelRes: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  /** `ModelComponent.Alfa1..4` — per-wheel scale factors. */
  alfa: readonly [number, number, number, number];
  /** `ModelComponent.DeltaSpeed`. */
  deltaSpeed: number;
  /** `ModelComponent.Spike`. */
  spike: boolean;
  /** `Modelli.WaitComunication` — the unit needs its CAN bus up before the
   *  test can start, so Key Power holds `Start Test` until a non-`None`
   *  `Comunication:` comes back (`ABS.cs KeyPower_Click`:
   *  `if (!WaitComunication || flag) StartTest()`). Only meaningful with a
   *  CAN preamble to bring the bus alive; defaults off. */
  waitComunication?: boolean;
}

const GENERIC_RES: AbsElectronicsModel['wheelRes'] = [
  [1500, 200],
  [1500, 200],
  [1500, 200],
  [1500, 200],
];

/** `ABS.cs Model_Click`'s own fallbacks when a `Modelli` column is null:
 *  `Wheel1Res1 = 1500`, `Wheel1Res2 = 200`, `BreakSpeed = 0.7`,
 *  `Pausa = 30`, `Coefficient = 0.16`, `DeltaSpeed = 1.0`,
 *  `Alfa* = 1.0`, `Code = 0` (here 2000 → the "no cable picked" label). */
export function defaultModel(overrides?: Partial<AbsElectronicsModel>): AbsElectronicsModel {
  return {
    name: 'Generic ABS',
    type: 0,
    speedCan: 0,
    signal: 0,
    code: 2000,
    pausa: 30,
    breakSpeed: 0.7,
    coefficient: DEFAULT_COEFFICIENT,
    wheelRes: GENERIC_RES,
    alfa: [1, 1, 1, 1],
    deltaSpeed: 1,
    spike: false,
    ...overrides,
  };
}

/** Starting points — electrical params only, no invented `code`s. The
 *  operator sets `code` (and tweaks anything the unit's sheet disagrees
 *  with) before loading. */
export const MODEL_PRESETS: { id: string; label: string; model: AbsElectronicsModel }[] = [
  { id: 'passive', label: 'Generic — passive WSS', model: defaultModel({ name: 'Generic ABS (passive)', type: 0 }) },
  { id: 'active', label: 'Generic — active WSS', model: defaultModel({ name: 'Generic ABS (active)', type: 1 }) },
  { id: 'spike', label: 'Generic — passive, spike drive', model: defaultModel({ name: 'Generic ABS (spike)', type: 0, spike: true }) },
];

/** `ABS.cs Model_Click`: `"[GRM" + (Car.Code - 2000).ToString().PadLeft(4, '0') + "]"`.
 *  Codes below 2000 (incl. the 2000 "unset" sentinel → `GRM0000`) clamp at 0. */
export function cableLabel(code: number): string {
  const n = Math.max(0, Math.round(code) - 2000);
  return `GRM${String(n).padStart(4, '0')}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/** The exact JSON `ABS.cs Model_Click` uploads: `ModelComponent` fields in
 *  declaration order (what .NET's `JavaScriptSerializer` emits), with the
 *  `Name` key written straight as `Model` (the original does
 *  `.Replace("Name", "Model")` on the serialized string). `Signal` carries
 *  `signal + 1`; `Speed1..4` are 0 (ABS.cs never reads them from the DB).
 *  Numbers are emitted without forced decimals, matching .NET
 *  (`JSON.stringify(1.0)` → `"1"`). `Speed` (sbyte) and `Code` (short) are
 *  range-clamped to what the board's `sbyte.Parse` / `short.Parse` accept.
 *
 *  Note: .NET's serializer `\uXXXX`-escapes `< > & '` in string values;
 *  `JSON.stringify` does not. A JSON parser decodes both identically, so a
 *  name like `Peugeot's` is functionally equivalent on the wire. */
export function buildModelPayload(m: AbsElectronicsModel): string {
  const [[w1a, w1b], [w2a, w2b], [w3a, w3b], [w4a, w4b]] = m.wheelRes;
  const [a1, a2, a3, a4] = m.alfa;
  return JSON.stringify({
    Model: m.name,
    Type: m.type,
    Speed: clamp(m.speedCan, -128, 127),
    Signal: clampSignalChannel(m.signal + 1),
    Component: 0,
    Code: clamp(m.code, 0, 32767),
    Pausa: Math.max(0, Math.round(m.pausa)),
    BreakSpeed: m.breakSpeed,
    Wheel1Res1: w1a, Wheel1Res2: w1b,
    Wheel2Res1: w2a, Wheel2Res2: w2b,
    Wheel3Res1: w3a, Wheel3Res2: w3b,
    Wheel4Res1: w4a, Wheel4Res2: w4b,
    Speed1: 0, Speed2: 0, Speed3: 0, Speed4: 0,
    Alfa1: a1, Alfa2: a2, Alfa3: a3, Alfa4: a4,
    DeltaSpeed: m.deltaSpeed,
    Spike: m.spike,
  });
}

/** `ABS.cs Model_Click` rejects a payload of 400+ chars ("Data too long!",
 *  350 for single-frame `Test Centralina` firmware). */
export function modelPayloadTooLong(json: string, singleFrame = false): boolean {
  return json.length >= (singleFrame ? 350 : 400);
}
