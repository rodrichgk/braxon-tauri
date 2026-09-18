import { describe, it, expect } from 'vitest';
import {
  wssReadSpecFor,
  wheelRequestBytes,
  decodeWheelValue,
  hzToKmh,
  evaluateWheel,
  BUILTIN_WSS_READ,
} from './wssReadback';

const FORD = BUILTIN_WSS_READ['10096101913'];
const RENAULT_476601KD2A = BUILTIN_WSS_READ['476601KD2A'];
const MK61_X95 = BUILTIN_WSS_READ['10096114643'];

describe('wssReadSpecFor', () => {
  it('resolves the Ford ref through any punctuation', () => {
    expect(wssReadSpecFor('10.0961-0191.3')).toBe(FORD);
    expect(wssReadSpecFor('10096101913')).toBe(FORD);
    expect(wssReadSpecFor(' 10.0961 0191 3 ')).toBe(FORD);
  });
  it('resolves the Renault ref 476601KD2A (X45-platform)', () => {
    expect(wssReadSpecFor('476601KD2A')).toBe(RENAULT_476601KD2A);
    expect(wssReadSpecFor('4766.01-KD2.A')).toBe(RENAULT_476601KD2A);
  });
  it('resolves the MK61/X95 ref 10.0961-1464.3 through any punctuation', () => {
    expect(wssReadSpecFor('10.0961-1464.3')).toBe(MK61_X95);
    expect(wssReadSpecFor('10096114643')).toBe(MK61_X95);
  });
  it('returns null for an unknown or empty ref', () => {
    expect(wssReadSpecFor('99.9999-9999.9')).toBeNull(); // no spec on file
    expect(wssReadSpecFor(null)).toBeNull();
    expect(wssReadSpecFor('')).toBeNull();
  });
});

describe('wheelRequestBytes', () => {
  it('builds the 22 <hi> <lo> request per wheel', () => {
    expect(wheelRequestBytes(FORD, 0)).toEqual([0x22, 0x2b, 0x06]);
    expect(wheelRequestBytes(FORD, 3)).toEqual([0x22, 0x2b, 0x09]);
  });
  it('drops the low byte for a 21 (KWP) spec', () => {
    const kwp = { ...FORD, service: '21' as const, dids: [[0x04, 0]] as [number, number][] };
    expect(wheelRequestBytes(kwp, 0)).toEqual([0x21, 0x04]);
  });
});

describe('decodeWheelValue', () => {
  it('reads the km/h byte out of 62 2B 0X <v>', () => {
    expect(decodeWheelValue([0x62, 0x2b, 0x06, 0x0a], FORD)).toBe(10);
    expect(decodeWheelValue([0x62, 0x2b, 0x08, 0x00], FORD)).toBe(0);
  });
  it('reads the 476601KD2A wheel speed byte the same way (captured 62 11 02 0C = 12 km/h)', () => {
    expect(decodeWheelValue([0x62, 0x11, 0x02, 0x0c], RENAULT_476601KD2A)).toBe(12);
    expect(wheelRequestBytes(RENAULT_476601KD2A, 0)).toEqual([0x22, 0x11, 0x02]);
    expect(wheelRequestBytes(RENAULT_476601KD2A, 3)).toEqual([0x22, 0x11, 0x05]);
  });
  it('applies scale/add and 2-byte width', () => {
    const spec = { ...FORD, length: 2 as const, scale: 0.01, add: 0, offset: 3 };
    expect(decodeWheelValue([0x62, 0x2b, 0x06, 0x03, 0xe8], spec)).toBeCloseTo(10, 6); // 0x03E8 = 1000
  });

  it('pulls each wheel from its own offset in one combined reply (MK61/X95 21 04)', () => {
    // 61 04 <pad> <FL hi/lo> <FR hi/lo> <RL hi/lo> <RR hi/lo> — from the
    // DDT4ALL layout: firstbyte 3/5/7/9, uint16 BE ÷100 km/h.
    const payload = [0x61, 0x04, 0x00, 0x03, 0xe8, 0x01, 0xf4, 0x00, 0x00, 0x02, 0x58];
    //                echo------ pad  FL(1000=10) FR(500=5)   RL(0)      RR(600=6)
    expect(decodeWheelValue(payload, MK61_X95, 0)).toBeCloseTo(10, 6); // FL
    expect(decodeWheelValue(payload, MK61_X95, 1)).toBeCloseTo(5, 6);  // FR
    expect(decodeWheelValue(payload, MK61_X95, 2)).toBeCloseTo(0, 6);  // RL
    expect(decodeWheelValue(payload, MK61_X95, 3)).toBeCloseTo(6, 6);  // RR
  });

  it('falls back to the shared offset when no wheel index is given, even with offsets set', () => {
    const payload = [0x61, 0x04, 0x00, 0x03, 0xe8];
    expect(decodeWheelValue(payload, MK61_X95)).toBeCloseTo(10, 6); // spec.offset = 3 = FL
  });

  it('all four wheels request the same LID for a combined-reply spec', () => {
    expect(wheelRequestBytes(MK61_X95, 0)).toEqual([0x21, 0x04]);
    expect(wheelRequestBytes(MK61_X95, 3)).toEqual([0x21, 0x04]);
  });
  it('returns null for a short or negative response', () => {
    expect(decodeWheelValue([0x62, 0x2b, 0x06], FORD)).toBeNull();
    expect(decodeWheelValue([0x7f, 0x22, 0x31], FORD)).toBeNull();
    expect(decodeWheelValue(null, FORD)).toBeNull();
  });
});

describe('hzToKmh', () => {
  it('is the inverse of SignalTesterMain kmhToHz (67 Hz, 2 m, 48 PPR ≈ 10 km/h)', () => {
    expect(hzToKmh(67, 2, 48)).toBeCloseTo(10.05, 1);
    // round-trip: kmhToHz(10) = round((10/3.6)/2*48) = 67 → back to ~10
    expect(hzToKmh(67, 2, 48)).toBeGreaterThan(9.5);
    expect(hzToKmh(67, 2, 48)).toBeLessThan(10.5);
  });
  it('guards divide-by-zero geometry', () => {
    expect(hzToKmh(100, 0, 48)).toBe(0);
    expect(hzToKmh(100, 2, 0)).toBe(0);
  });
});

describe('evaluateWheel', () => {
  it('is idle when nothing is being commanded', () => {
    expect(evaluateWheel({ measured: 0, commanded: 0 })).toEqual({ status: 'idle', deviationPct: 0, errorKmh: 0 });
    expect(evaluateWheel({ measured: 40, commanded: 0.5 }).status).toBe('idle');
  });
  it('flags a driven wheel that reports nothing', () => {
    expect(evaluateWheel({ measured: null, commanded: 10 }).status).toBe('no-signal');
    expect(evaluateWheel({ measured: 0, commanded: 10 }).status).toBe('no-signal');
  });
  it('is ok within 5% and off beyond it, once past the absolute floor', () => {
    // At 100 km/h the 5% band (±5) dominates the 1.5 km/h floor.
    expect(evaluateWheel({ measured: 100, commanded: 100 }).status).toBe('ok');
    expect(evaluateWheel({ measured: 105, commanded: 100 }).status).toBe('ok'); // exactly +5%
    expect(evaluateWheel({ measured: 95, commanded: 100 }).status).toBe('ok'); // exactly -5%
    expect(evaluateWheel({ measured: 106, commanded: 100 }).status).toBe('off');
    expect(evaluateWheel({ measured: 60, commanded: 100 }).status).toBe('off');
  });

  it('never flags off for less than the absolute floor of disagreement', () => {
    // A healthy 5 km/h wheel the ECU rounds to "6": 20% off but only 1 km/h.
    expect(evaluateWheel({ measured: 6, commanded: 5 }).status).toBe('ok');
    // Genuine 5 km/h disagreement at low speed → still flagged.
    expect(evaluateWheel({ measured: 8, commanded: 5 }).status).toBe('off');
    // The floor only lifts the low end — the 5% band still governs high speed.
    expect(evaluateWheel({ measured: 103, commanded: 100 }).status).toBe('ok'); // 3 km/h < 5%
  });
  it('reports the signed deviation as % and km/h', () => {
    expect(evaluateWheel({ measured: 12, commanded: 10 })).toMatchObject({ deviationPct: 20, errorKmh: 2 });
    expect(evaluateWheel({ measured: 8, commanded: 10 })).toMatchObject({ deviationPct: -20, errorKmh: -2 });
    expect(evaluateWheel({ measured: null, commanded: 10 }).errorKmh).toBe(-10);
  });
  it('honours a custom tolerance', () => {
    expect(evaluateWheel({ measured: 10.8, commanded: 10, tolerancePct: 10 }).status).toBe('ok');
  });

  it('is unknown — never off — when the commanded speed is not known', () => {
    // Manually-wired generator / hand-spun wheel: BRAXON has no idea what
    // frequency is really being injected, so a mismatch against a stale or
    // default "commanded" value must not read as a wheel-speed fault.
    expect(evaluateWheel({ measured: 12, commanded: null })).toEqual({ status: 'unknown', deviationPct: 0, errorKmh: 0 });
    expect(evaluateWheel({ measured: 0, commanded: null }).status).toBe('unknown');
    expect(evaluateWheel({ measured: null, commanded: null }).status).toBe('unknown');
    // A wildly "different" reading still doesn't get flagged off.
    expect(evaluateWheel({ measured: 250, commanded: null }).status).not.toBe('off');
  });
});
