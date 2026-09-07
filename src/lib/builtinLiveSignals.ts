/* ── Built-in live-data presets ───────────────────────────────
   Per hardware family: which request (or CAN broadcast) carries the useful
   measured values, and how to decode its bytes. Auto-applied by the Live Data
   panel when the selected ABS reference resolves to a matching family and the
   operator hasn't already saved their own map for it.

   Decoded from Autel↔ABS captures — grow as more units are worked. ────────── */

export type LiveSvc = '21' | '22' | '01' | 'can';

export interface LiveSignalDef {
  name: string;
  offset: number;      // byte index into the payload (CAN: raw frame; 21/22/01: incl. the 61/62/41 header)
  length: 1 | 2;
  signed: boolean;
  scale: number;
  add: number;
  unit: string;
}

export interface LivePreset {
  service: LiveSvc;
  id: string;          // LID / DID (hex) or CAN ID (hex)
  label: string;
  signals: LiveSignalDef[];
}

/** Renault X95/X84 wheel speed: 16-bit big-endian, ÷100 = km/h (DDT4ALL
    `Vitesse roue …` = bitscount 16, bytescount 2, divideby 100). */
const kmh100 = (name: string, offset: number): LiveSignalDef => ({
  name, offset, length: 2, signed: false, scale: 0.01, add: 0, unit: 'km/h',
});

export const BUILTIN_LIVE: Record<string, LivePreset[]> = {
  // Bosch/ATE MK61 — Renault Scénic III / Mégane III platform (X95),
  // e.g. 10.0961-1464.3. Session 10 C0, 0x740→0x760.
  //
  // Wheel speeds — cross-checked between an Autel↔ABS capture (2026-09-03) and
  // the DDT4ALL `ABS___X95_Version_1.0.3` JSON:
  //   • KWP  21 04  "Read - Speeds" → 61 04 + 5×uint16 BE = FL, FR, RL, RR,
  //     vehicle, each ÷100 = km/h. One request, all wheels — preset[0].
  //   • UDS  22 02 00/01/02/03  = FL/FR/RL/RR WSS, 22 02 04 = vehicle speed —
  //     same uint16-BE ÷100 (DDT4ALL request names + `Vitesse roue …` data).
  // The Autel capture showed 22 02 0X returning a 1-byte 0xFF — that is the
  // truncated *invalid* response (bench sensors disconnected → confirmed
  // C0031/C0034 WSS DTCs); a valid read returns the 2-byte value.
  // 0x12E is NOT wheel speed (static C8 7F FD 7F F0 FF FF 00). Wheel order
  // FL/FR/RL/RR = AVG/AVD/ARG/ARD, per DDT4ALL names — confirm with a real
  // signal fed in.
  MK61: [
    {
      service: '21', id: '04', label: 'Wheel speeds (21 04)',
      signals: [
        kmh100('Wheel FL', 2), kmh100('Wheel FR', 4),
        kmh100('Wheel RL', 6), kmh100('Wheel RR', 8),
        kmh100('Vehicle', 10),
      ],
    },
    { service: '22', id: '0200', label: 'Wheel FL (22 02 00)', signals: [kmh100('Wheel FL', 3)] },
    { service: '22', id: '0201', label: 'Wheel FR (22 02 01)', signals: [kmh100('Wheel FR', 3)] },
    { service: '22', id: '0202', label: 'Wheel RL (22 02 02)', signals: [kmh100('Wheel RL', 3)] },
    { service: '22', id: '0203', label: 'Wheel RR (22 02 03)', signals: [kmh100('Wheel RR', 3)] },
    { service: '22', id: '0204', label: 'Vehicle speed (22 02 04)', signals: [kmh100('Vehicle', 3)] },
  ],
};

export function builtinLiveFor(family: string | null | undefined): LivePreset[] {
  return (family && BUILTIN_LIVE[family]) || [];
}
