/* ── KWP2000 payload helpers for VW TP2.0 units (MK25/MK60/MK60EC1 ABS …) ──
   Runs on top of lib/vwtp20.ts. The wire format differs from the ISO-TP
   Renault/Bosch stack in two ways that matter:

   • DTCs (`18 02 FF 00` → `58 <n> {hi lo status}`) carry the VAG **5-digit**
     fault number as a big-endian uint16 — NOT an SAE-packed C/P/U code. So
     `(hi<<8)|lo` is the number you look up in EcuDtc `ecu_file='VAG_WIKI'`
     verbatim. The status byte is `0x60 | elaboration` (bit 7 = currently
     present); VCDS's "-0NN" suffix = `(status & 0x7F) - 0x60`.

   • Live values (`21 <NN>` → `61 <NN> {fmt a b}×≤4`) are VW "measuring value"
     triplets: a one-byte formula id then two data bytes.

   Verified against a VCDS↔MK60EC1 capture — reference-data/vag-mk60ec1-tp20.md. */

export interface VwDtc {
  /** 5-digit VAG code as an int — matches EcuDtc.dtc_raw for VAG_WIKI / VAG_ABS. */
  raw: number;
  /** Zero-padded 5-digit string, e.g. "16352". */
  code: string;
  /** Elaboration/symptom code, e.g. 14 → shown by VCDS as "-014". */
  elaboration: number;
  /** Best-effort elaboration text ("Defective", "No Signal/Communication", …). */
  elaborationText: string;
  /** Fault is currently present (status bit 7), not just stored. */
  present: boolean;
  /** Raw status byte. */
  status: number;
}

/** The common VW KWP elaboration codes (the "-0NN" VCDS shows after the code). */
const ELABORATION: Record<number, string> = {
  0: 'no sub-type',
  1: 'upper limit exceeded',
  2: 'lower limit exceeded / short to ground',
  3: 'open circuit',
  4: 'no signal / communication',
  5: 'mechanical fault',
  6: 'signal too low',
  7: 'short to plus',
  8: 'implausible signal',
  9: 'signal invalid',
  10: 'open circuit / short to ground',
  11: 'open circuit / short to plus',
  12: 'short to ground',
  13: 'short to plus',
  14: 'defective',
  16: 'adaptation limit not reached',
  17: 'adaptation limit exceeded',
  32: 'no or incorrect basic setting / adaptation',
};

/** Decode a `58` (ReadDTCByStatus) response payload into DTC records. */
export function decodeVwDtcs(payload: number[]): VwDtc[] {
  if (payload[0] !== 0x58) return [];
  const n = payload[1] ?? 0;
  const out: VwDtc[] = [];
  for (let i = 0; i < n; i++) {
    const hi = payload[2 + i * 3];
    const lo = payload[3 + i * 3];
    const status = payload[4 + i * 3];
    if (hi === undefined || lo === undefined || status === undefined) break;
    const raw = (hi << 8) | lo;
    const elaboration = (status & 0x7f) - 0x60;
    out.push({
      raw,
      code: raw.toString().padStart(5, '0'),
      elaboration: elaboration >= 0 ? elaboration : status & 0x7f,
      elaborationText: ELABORATION[elaboration] ?? `type ${elaboration >= 0 ? elaboration : '0x' + status.toString(16)}`,
      present: !!(status & 0x80),
      status,
    });
  }
  return out;
}

export interface VwMeasuredValue {
  fmt: number;
  a: number;
  b: number;
  /** Scaled value (number) or a bit string for bitfield formats. */
  value: number | string;
  unit: string;
}

/**
 * VW KWP measuring-value formulas. `verified` are confirmed byte-for-byte
 * against the MK60EC1 capture (block 01 = 0 km/h at rest, block 06 = 11.86 V);
 * the rest are the widely-documented VAG-COM table and should be spot-checked
 * with a known input before trusting a number.
 */
const FORMULA: Record<number, { f: (a: number, b: number) => number | string; unit: string }> = {
  0x01: { f: (a, b) => (a * b) / 5, unit: 'rpm' },
  0x02: { f: (a, b) => a * 0.002 * b, unit: '%' },
  0x03: { f: (a, b) => a * 0.002 * b, unit: '°' },
  0x04: { f: (a, b) => Math.abs(b - 127) * 0.01 * a, unit: '° ATDC' },
  0x05: { f: (a, b) => a * (b - 100) * 0.1, unit: '°C' },
  0x06: { f: (a, b) => a * b * 0.001, unit: 'V' }, // verified
  0x07: { f: (a, b) => a * b * 0.01, unit: 'km/h' }, // verified
  0x08: { f: (a, b) => a * b * 0.1, unit: '' },
  0x09: { f: (a, b) => a * (b - 127) * 0.1, unit: '°' },
  0x0a: { f: (_a, b) => (b === 0 ? 'cold' : b === 1 ? 'lockmg' : 'warm'), unit: '' },
  0x0b: { f: (a, b) => a * 0.0001 * (b - 128) + 1, unit: '' },
  0x0c: { f: (a, b) => a * b * 0.001, unit: 'Ω' },
  0x0d: { f: (a, b) => (b - 127) * 0.001 * a, unit: 'mm' },
  0x0e: { f: (a, b) => a * b * 0.005, unit: 'bar' },
  0x0f: { f: (a, b) => a * b * 0.01, unit: 'ms' },
  0x10: { f: (_a, b) => b.toString(2).padStart(8, '0'), unit: '' }, // bitfield
  0x12: { f: (a, b) => a * b * 0.04, unit: 'mbar' },
  0x14: { f: (a, b) => a * (b - 128) * 0.01, unit: '%' },
  0x15: { f: (a, b) => a * (b - 127) * 0.01, unit: 'V' },
  0x17: { f: (a, b) => a * b * 0.1, unit: '%' },
  0x18: { f: (a, b) => a * b * 0.001, unit: 'A' },
  0x21: { f: (a, b) => (a === 0 ? b : (b * 100) / a), unit: '%' },
  0x22: { f: (a, b) => b - a, unit: 'kW' },
  0x25: { f: (a, b) => ((a << 8) | b).toString(2).padStart(16, '0'), unit: '' }, // bitfield / status
  0x2f: { f: (a, b) => a * b * 0.01, unit: '' },
  0x31: { f: (a, b) => a * b * 0.01, unit: 'm/s²' },
  0x36: { f: (a, b) => a * 256 + b, unit: '' }, // counter (also freeze-frame)
};

/** Decode a `61 <NN> …` (ReadDataByLocalID) response into up to 4 measured values. */
export function decodeVwMeasuringBlock(payload: number[]): { slot: number; values: VwMeasuredValue[] } | null {
  if (payload[0] !== 0x61) return null;
  const slot = payload[1];
  const values: VwMeasuredValue[] = [];
  for (let i = 2; i + 2 < payload.length; i += 3) {
    const fmt = payload[i];
    const a = payload[i + 1];
    const b = payload[i + 2];
    const spec = FORMULA[fmt];
    values.push({
      fmt,
      a,
      b,
      value: spec ? spec.f(a, b) : (a << 8) | b,
      unit: spec ? spec.unit : `fmt${fmt.toString(16).toUpperCase().padStart(2, '0')}`,
    });
  }
  return { slot, values };
}

/** ASCII string from a byte run, non-printables → '·'. */
export function vwAscii(bytes: number[]): string {
  return bytes.map((x) => (x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : '·')).join('');
}

/** Pull the VW ident fields out of a `62 F1 87 …` multi-DID response. */
export function parseVwIdent(payload: number[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (payload[0] !== 0x62) return out;
  const names: Record<number, string> = {
    0xf187: 'partNumber', 0xf189: 'swVersion', 0xf191: 'hwNumber',
    0xf197: 'systemName', 0xf1a3: 'hwVersion', 0xf1a5: 'repairShopCode',
  };
  let i = 1;
  while (i + 1 < payload.length) {
    const did = (payload[i] << 8) | payload[i + 1];
    const key = names[did];
    if (!key) break;
    i += 2;
    const start = i;
    while (i + 1 < payload.length && !names[(payload[i] << 8) | payload[i + 1]]) i++;
    out[key] = vwAscii(payload.slice(start, i)).trim();
  }
  return out;
}
