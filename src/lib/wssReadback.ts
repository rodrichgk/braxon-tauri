// Live wheel-speed readback for the WSS HIL tester — decode the ABS ECU's
// *measured* speed per wheel and flag any that drifts from what the bench is
// injecting (the "bad sensor / wiring / ECU input" check the legacy Arduino
// bench had). Pure: no React, no Tauri — the tester component
// (`SignalTester/SignalTesterMain.tsx`) owns the poll loop and rendering.
//
// Two wire shapes are covered: most ECUs report each wheel on its own
// ReadDataByIdentifier (four different DIDs), but some (MK61/X95: `21 04`)
// answer one combined request with all four wheels packed into a single
// reply at fixed offsets — `offsets` on the spec covers that case. Either
// way the component polls round-robin (see `LiveData.tsx` for the same
// poll pattern); for a combined-reply ECU that just means requesting the
// same DID four times a cycle instead of four different ones.

import { normalizeAbsRef } from './ecu';

/** How to read one ABS unit's four wheel speeds over ISO-TP. */
export interface WheelReadSpec {
  /** Tester → ECU CAN id. */
  sendId: number;
  /** ECU → tester CAN id. */
  recvId: number;
  /** `'22'` (UDS ReadDataByIdentifier) or `'21'` (KWP ReadDataByLocalId). */
  service: '22' | '21';
  /** Request id bytes per wheel, order FL, FR, RL, RR. `22` → 2 bytes,
   *  `21` → 1 (the second entry is ignored). */
  dids: [number, number][];
  /** Byte index of the value in the assembled response, counting the
   *  `62 <hi> <lo>` / `61 <lid>` echo header. Used as-is for the common
   *  case (each wheel gets its own request); ignored per-wheel when
   *  `offsets` below is set. */
  offset: number;
  /** Overrides `offset` per wheel (FL, FR, RL, RR) for ECUs that answer one
   *  combined request with all four wheels packed into a single reply
   *  (e.g. MK61/X95's `21 04`) rather than one DID per wheel. */
  offsets?: [number, number, number, number];
  length: 1 | 2;
  signed: boolean;
  /** km/h = raw * scale + add. */
  scale: number;
  add: number;
}

// The byte-decode half of the Ford/ATE wheel-speed read: `62 2B 0X <v>`,
// one byte = km/h. Shared with `builtinLiveSignals.ts`'s `FORD_ATE` preset so
// the two definitions can't drift.
export const FORD_WHEEL_DECODE = {
  offset: 3,
  length: 1 as 1 | 2,
  signed: false,
  scale: 1,
  add: 0,
};

// Keyed by `normalizeAbsRef(reference)`. The layout (and the 0x760/0x768
// addressing) is per-reference, not per hardware family — `10.0961-0191.3`
// answers `22 2B 06..09` on 0x760/0x768 while other `10.0961-*` units are
// Renault MK61 (0x740, `21 04`). Decoded from an Autel↔ABS capture
// 2026-09-10: each DID returns one byte = km/h directly (all four read 0x0A
// at the operator's ~10 km/h / 67 Hz hold, matching the Autel reading).
export const BUILTIN_WSS_READ: Record<string, WheelReadSpec> = {
  // Ford / ATE ABS — ref 10.0961-0191.3
  '10096101913': {
    sendId: 0x760,
    recvId: 0x768,
    service: '22',
    dids: [
      [0x2b, 0x06], // FL
      [0x2b, 0x07], // FR
      [0x2b, 0x08], // RL
      [0x2b, 0x09], // RR
    ],
    ...FORD_WHEEL_DECODE,
  },

  // Bosch/ATE MK61 — Renault Scénic III, ref 10.0961-1464.3. Matches DDT4ALL
  // ecu_file `ABS___X95_Version_1.0.3` (obd.send_id=740, recv_id=760): one
  // combined KWP ReadDataByLocalIdentifier `21 04` returns all four wheels
  // plus vehicle speed in a single reply, not one DID per wheel —
  // `receivebyte_dataitems` firstbyte 3/5/7/9 for FL/FR/RL/RR (vehicle
  // speed follows at 11, unused here), each a big-endian uint16 ÷100 km/h
  // (`divideby: 100.0` on every "Vitesse roue … (CAN)" value in the file).
  // No live capture needed — read straight off the DDT4ALL JSON, unlike the
  // other entries here which were reverse-engineered from a bus trace.
  '10096114643': {
    sendId: 0x740,
    recvId: 0x760,
    service: '21',
    dids: [
      [0x04, 0x00], // FL — same LID for all four; one reply carries every wheel
      [0x04, 0x00], // FR
      [0x04, 0x00], // RL
      [0x04, 0x00], // RR
    ],
    offset: 3, // unused when a wheel index is passed — see `offsets` below
    offsets: [3, 5, 7, 9],
    length: 2,
    signed: false,
    scale: 0.01,
    add: 0,
  },

  // Renault X45-platform ABS — ref 476601KD2A. NOT X61: an X61 DDT4ALL ecu_file
  // was picked manually at the end of the capture session just to probe Active
  // Tests, got no response, and was never a real match (see EcuAbsRef — its
  // ecu_file is deliberately left null). DDT4ALL has no ABS file tagged X45
  // specifically, so the exact ecu_file is still unidentified; only the
  // addressing/DIDs below are confirmed, straight off the wire.
  //
  // Decoded from an Autel↔ABS capture 2026-09-15 (KWP-on-CAN, session 10 C0,
  // 0x740→0x760): the operator manually varied one WSS input up to ~12 km/h
  // while polling `22 11 02..05` through the generic Live Data panel — all
  // four DIDs tracked the same manual sweep (…00, 04, 05, 08, 0A, 0C…), 0x0C
  // = 12 matching "went to like 12 km/h". Same wire shape as the Ford ref
  // (`62 <hi> <lo> <v>`, one byte = km/h direct) — reused here under its own
  // name since the two units aren't related; only the encoding happens to
  // match. Wheel order FL/FR/RL/RR is the DDT4ALL convention (ascending DID,
  // same as the Ford ref) but NOT independently confirmed here — the capture
  // drove all four from one shared source, so which physical wheel is which
  // DID couldn't be told apart.
  '476601KD2A': {
    sendId: 0x740,
    recvId: 0x760,
    service: '22',
    dids: [
      [0x11, 0x02], // FL (unconfirmed order — see note above)
      [0x11, 0x03], // FR
      [0x11, 0x04], // RL
      [0x11, 0x05], // RR
    ],
    offset: 3,
    length: 1,
    signed: false,
    scale: 1,
    add: 0,
  },
};

/** The wheel-read spec for an ABS reference, or `null` when none is on file. */
export function wssReadSpecFor(absRef: string | null | undefined): WheelReadSpec | null {
  if (!absRef) return null;
  return BUILTIN_WSS_READ[normalizeAbsRef(absRef)] ?? null;
}

/** The request payload for wheel `i` (0..3) — `[sid, ...idBytes]`. */
export function wheelRequestBytes(spec: WheelReadSpec, wheel: number): number[] {
  const sid = spec.service === '22' ? 0x22 : 0x21;
  const [hi, lo] = spec.dids[wheel] ?? [0, 0];
  return spec.service === '22' ? [sid, hi, lo] : [sid, hi];
}

/** Decode km/h from an assembled positive response, or `null` if it's too
 *  short / a negative response. Mirrors `readVal` in `LiveData.tsx`. Pass
 *  `wheel` (0=FL..3=RR) for a spec with `offsets` — a combined-reply ECU
 *  needs it to know which wheel's value to pull out of the one response;
 *  omitted, it falls back to the shared `offset`. */
export function decodeWheelValue(payload: number[] | null | undefined, spec: WheelReadSpec, wheel?: number): number | null {
  const offset = (wheel !== undefined ? spec.offsets?.[wheel] : undefined) ?? spec.offset;
  if (!payload || payload.length < offset + spec.length) return null;
  if (payload[0] === 0x7f) return null; // negative response
  let v = 0;
  for (let k = 0; k < spec.length; k++) v = (v << 8) | payload[offset + k];
  if (spec.signed && v >= 1 << (8 * spec.length - 1)) v -= 1 << (8 * spec.length);
  return v * spec.scale + spec.add;
}

/** `SignalTesterMain.tsx`'s `kmhToHz` is `(kmh/3.6)/circ*ppr` — this is its
 *  inverse, so a per-wheel commanded Hz can be compared against a measured
 *  km/h on the same axis. */
export function hzToKmh(hz: number, circ: number, ppr: number): number {
  if (circ <= 0 || ppr <= 0) return 0;
  return (hz / ppr) * circ * 3.6;
}

export type WheelStatus = 'ok' | 'off' | 'no-signal' | 'idle' | 'unknown';

export interface WheelEval {
  status: WheelStatus;
  /** Signed % the measured value is away from commanded (0 when not applicable). */
  deviationPct: number;
  /** Signed km/h the measured value is away from commanded. Clearer than the
   *  % at low speed, where 1-count ECU rounding makes the % look alarming. */
  errorKmh: number;
}

/** Below this commanded km/h the wheel is treated as "not being driven", so a
 *  near-zero measured reading is normal rather than a fault. */
const IDLE_KMH = 1;

/** Absolute-error floor on the tolerance. The Ford ref reports wheel speed as
 *  1-byte integer km/h, and the commanded value round-trips through
 *  `kmhToHz`'s `Math.round`; at ~10 km/h the two together already span a
 *  percentage band, so a healthy wheel would false-flag `off` on quantization
 *  alone. `off` needs at least this many km/h of real disagreement. */
export const TOLERANCE_FLOOR_KMH = 1.5;

/**
 * Classify one wheel's measured speed against what the bench is injecting.
 *  - `unknown`   — `commanded` is `null`: the frequency driving the sensor
 *                  isn't something BRAXON knows (a manually-wired generator,
 *                  a hand-spun wheel, or any source it isn't actively
 *                  commanding). There is nothing to compare against, so the
 *                  wheel is *never* flagged `off` here — showing a "5 km/h
 *                  off" fault against an unknown target would be a false
 *                  positive on a perfectly good sensor.
 *  - `idle`      — commanded ≈ 0 (nothing to check)
 *  - `no-signal` — driven, but the ECU reports nothing / ≈ 0 (dead channel)
 *  - `off`       — disagreement exceeds BOTH `tolerancePct` and the
 *                  `TOLERANCE_FLOOR_KMH` absolute floor
 *  - `ok`        — within tolerance
 *
 * Note: below ~`TOLERANCE_FLOOR_KMH / (tol/100)` km/h (≈ 30 at the 5 % default)
 * the absolute floor always wins, so a tighter `tolerancePct` has no effect
 * there — that's the ECU's own 1-count resolution, not a bug. Feed a
 * definitive check a ≥ ~20 km/h target.
 */
export function evaluateWheel(opts: {
  measured: number | null;
  /** km/h actually being driven, or `null` when the source is unknown to
   *  BRAXON (manual wiring, or any generator it isn't commanding itself). */
  commanded: number | null;
  tolerancePct?: number;
}): WheelEval {
  const tol = opts.tolerancePct ?? 5;
  const cmd = opts.commanded;
  if (cmd === null) return { status: 'unknown', deviationPct: 0, errorKmh: 0 };
  if (cmd < IDLE_KMH) return { status: 'idle', deviationPct: 0, errorKmh: 0 };
  if (opts.measured == null || opts.measured < IDLE_KMH) {
    return { status: 'no-signal', deviationPct: -100, errorKmh: -cmd };
  }
  const signedErrKmh = opts.measured - cmd;
  const deviationPct = (signedErrKmh / cmd) * 100;
  const allowed = Math.max((cmd * tol) / 100, TOLERANCE_FLOOR_KMH);
  return {
    status: Math.abs(signedErrKmh) <= allowed ? 'ok' : 'off',
    deviationPct,
    errorKmh: signedErrKmh,
  };
}
