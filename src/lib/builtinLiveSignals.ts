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

const spd = (name: string, offset: number): LiveSignalDef => ({
  name, offset, length: 1, signed: false, scale: 1, add: 0, unit: 'km/h',
});

export const BUILTIN_LIVE: Record<string, LivePreset[]> = {
  // Bosch/ATE MK61 — Renault/Dacia (e.g. 10.0961-1464.3).
  // The diagnostic 21 LIDs the Autel polls (07/05/10/0F/02) carry ECU state,
  // not wheel speed. Wheel speeds are on the ABS broadcast CAN 0x12E, bytes
  // 0-3 (1 byte per wheel; 0xFF = sensor open). Scale 1 is a first guess —
  // confirm against the Autel with a real signal fed in.
  MK61: [
    {
      service: 'can',
      id: '12E',
      label: 'Wheel speeds (CAN 0x12E)',
      signals: [
        spd('Wheel FL', 0),
        spd('Wheel FR', 1),
        spd('Wheel RL', 2),
        spd('Wheel RR', 3),
      ],
    },
  ],
};

export function builtinLiveFor(family: string | null | undefined): LivePreset[] {
  return (family && BUILTIN_LIVE[family]) || [];
}
