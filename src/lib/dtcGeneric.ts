/* ── Generic DTC decoding (SAE J2012 / ISO 15031-6 / ISO 14229-1 Annex D) ──
   Turns a raw 2-byte (KWP/OBD) or 3-byte (UDS) diagnostic trouble code into a
   human string with ZERO database lookup — the SAE code letters are pure bit
   math, the generic C0xxx chassis meanings and the failure-type byte are static
   standard tables. This is the always-available baseline; a hit from `EcuDtc`
   (lookup_dtc) or a curated table overrides it. See reference-data/vag-abs-esp-*.
*/

/** `(high << 8) | low` — the same raw int `EcuDtc.dtc_raw` and lookup_dtc use. */
export function dtcRaw(high: number, low: number): number {
  return ((high & 0xff) << 8) | (low & 0xff);
}

/** Split a raw int back into its two bytes. */
export function dtcBytes(raw: number): [number, number] {
  return [(raw >> 8) & 0xff, raw & 0xff];
}

/** SAE/ISO code string from the first two DTC bytes: `0x40 0x44` → "C0044". */
export function saeCode(high: number, low: number): string {
  const type = ['P', 'C', 'B', 'U'][(high >> 6) & 0x03];
  const d1 = (high >> 4) & 0x03;
  const d2 = (high & 0x0f).toString(16).toUpperCase();
  const d3 = ((low >> 4) & 0x0f).toString(16).toUpperCase();
  const d4 = (low & 0x0f).toString(16).toUpperCase();
  return `${type}${d1}${d2}${d3}${d4}`;
}

/* ── ISO 14229-1 Annex D.2 / SAE J2012-DA failure-type byte (the "-xx") ──── */
export const FAILURE_TYPE: Record<number, string> = {
  0x00: 'no sub-type',
  0x01: 'general electrical failure',
  0x02: 'general signal failure',
  0x03: 'FMI 3',
  0x04: 'system internal failure',
  0x08: 'bus signal / message failure',
  0x09: 'component / system operation obstructed',
  0x0a: 'component / system over temperature',
  0x11: 'circuit short to ground',
  0x12: 'circuit short to battery',
  0x13: 'circuit open',
  0x14: 'circuit short to ground or open',
  0x15: 'circuit short to battery or open',
  0x16: 'circuit voltage below threshold',
  0x17: 'circuit voltage above threshold',
  0x18: 'circuit current below threshold',
  0x19: 'circuit current above threshold',
  0x1a: 'circuit resistance below threshold',
  0x1b: 'circuit resistance above threshold',
  0x1c: 'circuit voltage out of range',
  0x1d: 'circuit current out of range',
  0x1e: 'circuit resistance out of range',
  0x21: 'signal amplitude < minimum',
  0x22: 'signal amplitude > maximum',
  0x23: 'signal stuck low',
  0x24: 'signal stuck high',
  0x25: 'signal shape / waveform failure',
  0x26: 'signal rate of change below',
  0x27: 'signal rate of change above',
  0x28: 'signal bias level / offset error',
  0x29: 'signal invalid',
  0x2a: 'signal stuck in range',
  0x2b: 'signal cross-coupled',
  0x2c: 'signal erratic',
  0x2f: 'signal erratic / intermittent',
  0x31: 'no signal',
  0x32: 'signal low time < minimum',
  0x33: 'signal high time > maximum',
  0x36: 'signal above allowable range (frequency)',
  0x37: 'signal below allowable range (frequency)',
  0x38: 'signal frequency incorrect',
  0x39: 'signal frequency too high / too low',
  0x3a: 'incorrect component installed',
  0x3b: 'component protection fault',
  0x42: 'general checksum failure',
  0x43: 'special memory failure',
  0x44: 'data memory failure',
  0x45: 'program memory failure',
  0x46: 'calibration / parameter memory failure',
  0x47: 'watchdog / safety µC failure',
  0x48: 'supervision software failure',
  0x49: 'internal electronic failure',
  0x4a: 'incorrect assembly',
  0x4b: 'over-current / calibration not learned',
  0x54: 'missing calibration',
  0x55: 'not programmed',
  0x56: 'invalid / incompatible software',
  0x57: 'invalid / incompatible hardware',
  0x61: 'signal calculation failure',
  0x62: 'signal compare failure',
  0x63: 'plausibility failure (2 sources)',
  0x64: 'plausibility failure (system)',
  0x68: 'event information',
  0x69: 'timeout / no message',
  0x6a: 'K-line / bus off',
  0x71: 'actuator stuck',
  0x72: 'actuator stuck open',
  0x73: 'actuator stuck closed',
  0x77: 'commanded position not reachable',
  0x78: 'alignment / adjustment not complete',
  0x79: 'mechanical fault',
  0x7a: 'mechanical actuator jammed',
  0x81: 'invalid serial data received',
  0x82: 'alive / sequence counter incorrect',
  0x83: 'value of signal protection calc incorrect',
  0x84: 'signal below allowable range',
  0x85: 'signal above allowable range',
  0x86: 'signal invalid (SCP)',
  0x87: 'missing message',
  0x88: 'bus off',
  0x92: 'performance / incorrect operation',
  0x93: 'no operation',
  0x94: 'unexpected operation',
  0x95: 'incorrect operation',
  0x96: 'component internal failure — mechanical',
  0x97: 'component internal failure — electronic',
  0x98: 'component / system operation obstructed or blocked',
  0x9a: 'component or system operation — internal failure',
  0x9b: 'component or system operation — out of range',
  0xa1: 'malfunction (undefined)',
};

export function failureTypeText(ftb: number | null | undefined): string | null {
  if (ftb == null) return null;
  return FAILURE_TYPE[ftb & 0xff] ?? `failure-type 0x${(ftb & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

/* ── Generic SAE J2012 chassis (C0xxx) + brake P/U meanings ───────────────
   The standardized half — same meaning across all manufacturers. Manufacturer
   C1xxx/C2xxx/C3xxx are NOT here (they need EcuDtc / a curated table); a few
   very widely-shared C1xxx (GM/Ford wheel-speed & valve numbering) are kept
   because aftermarket databases treat them as quasi-generic. */
export const GENERIC_DTC: Record<string, string> = {
  // --- brake / speed P-codes ---
  P0500: 'Vehicle Speed Sensor A malfunction',
  P0501: 'Vehicle Speed Sensor A range / performance',
  P0502: 'Vehicle Speed Sensor A circuit low input',
  P0503: 'Vehicle Speed Sensor A intermittent / erratic / high',
  P0504: 'Brake Switch A / B correlation',
  P0571: 'Brake Switch A circuit malfunction',
  P0572: 'Brake Switch A circuit low',
  P0573: 'Brake Switch A circuit high',
  P0575: 'Cruise Control input circuit',
  U0121: 'Lost communication with ABS control module',
  U0415: 'Invalid data received from ABS control module',
  U0416: 'Invalid data received from Vehicle Dynamics control module',

  // --- C0xxx: wheel speed sensors (SAE J2012 standard block) ---
  C0031: 'Left Front Wheel Speed Sensor circuit',
  C0032: 'Left Front Wheel Speed Sensor circuit range / performance',
  C0034: 'Right Front Wheel Speed Sensor circuit',
  C0035: 'Left Front Wheel Speed Sensor circuit',
  C0036: 'Left Front Wheel Speed Sensor circuit range / performance',
  C0037: 'Right Front Wheel Speed Sensor circuit',
  C0038: 'Right Front Wheel Speed Sensor circuit range / performance',
  C0040: 'Right Front Wheel Speed Sensor circuit',
  C0041: 'Right Front Wheel Speed Sensor circuit range / performance',
  C0042: 'Left Rear Wheel Speed Sensor circuit',
  C0043: 'Left Rear Wheel Speed Sensor circuit range / performance',
  C0044: 'Brake pressure / temperature sensor circuit',
  C0045: 'Left Rear Wheel Speed Sensor circuit',
  C0046: 'Left Rear Wheel Speed Sensor circuit range / performance',
  C0047: 'Brake booster / vacuum pressure sensor circuit',
  C0050: 'Right Rear Wheel Speed Sensor circuit',
  C0051: 'Steering Wheel Angle Sensor',
  C0052: 'Right Rear Wheel Speed Sensor circuit range / performance',
  C0061: 'Lateral acceleration sensor',
  C0063: 'Yaw rate sensor',
  C0069: 'Longitudinal acceleration sensor',

  // --- C0xxx: solenoids / modulator / pump / relay ---
  C0060: 'LF ABS inlet solenoid circuit',
  C0062: 'LF ABS outlet solenoid circuit',
  C0065: 'RF ABS inlet solenoid circuit',
  C0067: 'RF ABS outlet solenoid circuit',
  C0070: 'LR ABS inlet solenoid circuit',
  C0072: 'LR ABS outlet solenoid circuit',
  C0075: 'RR ABS inlet solenoid circuit',
  C0077: 'RR ABS outlet solenoid circuit',
  C0080: 'ABS solenoid circuit',
  C0084: 'ABS solenoid circuit',
  C0088: 'ABS hydraulic system performance',
  C0110: 'ABS pump motor circuit',
  C0111: 'ABS pump motor circuit range / performance',
  C0112: 'ABS pump motor circuit low',
  C0113: 'ABS pump motor circuit high',
  C0121: 'ABS valve relay circuit',
  C0128: 'Brake fluid level low circuit',
  C0131: 'ABS / TCS system pressure circuit',
  C0136: 'Master cylinder pressure sensor circuit',
  C0141: 'TCS solenoid circuit',
  C0145: 'TCS solenoid circuit',
  C0148: 'Brake warning lamp circuit',
  C0158: 'Master cylinder isolation valve circuit',
  C0161: 'ABS / TCS brake switch circuit',
  C0186: 'Lateral accelerometer sensor performance',
  C0187: 'Lateral accelerometer sensor circuit low',
  C0188: 'Lateral accelerometer sensor circuit high',
  C0196: 'Yaw rate sensor performance',
  C0197: 'Yaw rate sensor circuit low',
  C0198: 'Yaw rate sensor circuit high',
  C0200: 'Right Front Wheel Speed Sensor circuit',
  C0205: 'Right Rear Wheel Speed Sensor circuit',
  C0210: 'Left Rear Wheel Speed Sensor circuit',
  C0215: 'Left Front Wheel Speed Sensor circuit',
  C0221: 'Right Front Wheel Speed Sensor input signal missing',
  C0222: 'Right Front Wheel Speed Sensor signal erratic',
  C0225: 'Left Front Wheel Speed Sensor input signal missing',
  C0226: 'Left Front Wheel Speed Sensor signal erratic',
  C0229: 'Wheel Speed Sensor frequency error / drop-out',
  C0231: 'Rear Wheel Speed Sensor input signal missing',
  C0235: 'Rear Wheel Speed Sensor signal erratic',
  C0238: 'Wheel Speed Sensor mismatch',
  C0240: 'ABS control valve circuit',
  C0245: 'Wheel Speed Sensor frequency error',
  C0250: 'ABS modulator valve fault',
  C0254: 'ABS pump motor over-current',
  C0265: 'EBCM relay circuit',
  C0266: 'EBCM pump motor circuit',
  C0267: 'EBCM pump motor circuit open',
  C0274: 'Solenoid power / valve relay circuit',
  C0277: 'Delivered pump speed error',
  C0281: 'Brake switch circuit',
  C0284: 'ABS / EBCM internal fault',
  C0286: 'ABS indicator lamp circuit',
  C0287: 'ABS / TCS system disabled',
  C0290: 'Lost communication with ABS control module',
  C0300: 'Rear Wheel Speed Sensor circuit',
  C0306: 'Rear axle / propshaft speed sensor circuit',
  C0323: 'Deceleration / G-sensor circuit',
  C0327: 'Transfer case / 4WD switch circuit',
  C0455: 'Steering position sensor circuit',
  C0460: 'Steering wheel position signal',
  C0550: 'ECU / control module internal failure',
  C0561: 'System configuration — not programmed / mismatch',
  C0710: 'Steering position sensor circuit',
  C0800: 'Device power circuit (battery / ignition)',
  C0899: 'Device voltage low',
  C0900: 'Device voltage high',

  // --- widely-shared "quasi-generic" C1xxx (GM/Ford numbering, aftermarket DBs) ---
  C1210: 'ABS warning lamp circuit open',
  C1214: 'System relay contact or coil circuit open',
  C1217: 'ABS pump motor shorted to ground',
  C1218: 'ABS pump motor circuit shorted to voltage',
  C1221: 'LF Wheel Speed Sensor input signal = 0',
  C1222: 'RF Wheel Speed Sensor input signal = 0',
  C1223: 'LR Wheel Speed Sensor input signal = 0',
  C1224: 'RR Wheel Speed Sensor input signal = 0',
  C1225: 'LF excessive wheel speed variation',
  C1226: 'RF excessive wheel speed variation',
  C1227: 'LR excessive wheel speed variation',
  C1228: 'RR excessive wheel speed variation',
  C1232: 'LF Wheel Speed circuit open / shorted',
  C1233: 'RF Wheel Speed circuit open / shorted',
  C1234: 'LR Wheel Speed circuit open / shorted',
  C1235: 'RR Wheel Speed circuit open / shorted',
  C1236: 'Low system supply voltage',
  C1237: 'High system supply voltage',
  C1241: 'ABS relay valve circuit open',
  C1242: 'ABS pump motor circuit open',
  C1243: 'ABS pump motor circuit short to ground',
  C1244: 'ABS pump motor circuit open',
  C1245: 'ECU hardware failure',
  C1246: 'Master cylinder pressure sensor — zero point',
  C1255: 'EBCM internal fault',
  C1261: 'LF inlet valve coil malfunction',
  C1262: 'LF outlet valve coil malfunction',
  C1263: 'RF inlet valve coil malfunction',
  C1264: 'RF outlet valve coil malfunction',
  C1265: 'LR inlet valve coil malfunction',
  C1266: 'LR outlet valve coil malfunction',
  C1267: 'RR inlet valve coil malfunction',
  C1268: 'RR outlet valve coil malfunction',
};

export interface DecodedDtc {
  /** SAE/ISO code string, e.g. "C0044". */
  code: string;
  /** best-effort human text (generic table + failure-type byte). */
  text: string;
  /** raw int matching EcuDtc.dtc_raw, e.g. 0x4044. */
  raw: number;
  /** true if `text` came from the generic standard table (not just the code letters). */
  known: boolean;
}

/**
 * Decode a DTC from its bytes. `ftb` = the ISO failure-type byte (3rd byte of a
 * UDS DTC record); omit for 2-byte KWP/OBD codes.
 */
export function describeDtc(high: number, low: number, ftb?: number | null): DecodedDtc {
  const code = saeCode(high, low);
  const base = GENERIC_DTC[code];
  const ft = failureTypeText(ftb);
  const known = base !== undefined;
  const withFt = ft && (ftb ?? 0) !== 0;
  let text: string;
  if (base && withFt) text = `${base} · ${ft}`;
  else if (base) text = base;
  else if (withFt) text = `manufacturer-specific · ${ft}`;
  else text = 'manufacturer-specific';
  return { code, text, raw: dtcRaw(high, low), known };
}
