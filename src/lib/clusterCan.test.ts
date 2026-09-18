import { describe, it, expect } from 'vitest';
import {
  rawFromPhysical,
  physicalFromRaw,
  packSignalRaw,
  unpackSignalRaw,
  packFrameBytes,
  unpackFrameBytes,
  type ClusterCanFrame,
  type ClusterCanSignal,
} from '@/lib/clusterCan';

describe('rawFromPhysical / physicalFromRaw', () => {
  it('round-trips through scale and offset', () => {
    const signal = { scale: 0.5, offset: -40 };
    const raw = rawFromPhysical(85, signal); // (85 - -40) / 0.5 = 250
    expect(raw).toBe(250);
    expect(physicalFromRaw(raw, signal)).toBe(85);
  });

  it('treats a zero scale as 1 rather than dividing by zero', () => {
    const signal = { scale: 0, offset: 0 };
    expect(rawFromPhysical(7, signal)).toBe(7);
    expect(physicalFromRaw(7, signal)).toBe(7);
  });
});

describe('packSignalRaw / unpackSignalRaw', () => {
  it('round-trips a single-bit flag', () => {
    const signal: ClusterCanSignal = { name: 'handbrake', startBit: 3, lengthBits: 1, scale: 1, offset: 0 };
    const bytes = [0, 0, 0, 0, 0, 0, 0, 0];
    packSignalRaw(bytes, signal, 1);
    expect(bytes[0]).toBe(0b1000);
    expect(unpackSignalRaw(bytes, signal)).toBe(1);

    packSignalRaw(bytes, signal, 0);
    expect(bytes[0]).toBe(0);
    expect(unpackSignalRaw(bytes, signal)).toBe(0);
  });

  it('round-trips a multi-bit value that crosses a byte boundary', () => {
    // bits 4..15: upper nibble of byte 0 + all of byte 1.
    const signal: ClusterCanSignal = { name: 'rpm', startBit: 4, lengthBits: 12, scale: 1, offset: 0 };
    const bytes = [0, 0, 0, 0, 0, 0, 0, 0];
    packSignalRaw(bytes, signal, 0xabc);
    expect(bytes[0]).toBe(0xc0); // low nibble of value (0xc) in the high nibble of byte 0
    expect(bytes[1]).toBe(0xab); // remaining 8 bits
    expect(unpackSignalRaw(bytes, signal)).toBe(0xabc);
  });

  it('does not disturb neighbouring signals packed into the same byte', () => {
    const lo: ClusterCanSignal = { name: 'lo', startBit: 0, lengthBits: 4, scale: 1, offset: 0 };
    const hi: ClusterCanSignal = { name: 'hi', startBit: 4, lengthBits: 4, scale: 1, offset: 0 };
    const bytes = [0, 0, 0, 0, 0, 0, 0, 0];
    packSignalRaw(bytes, lo, 0xf);
    packSignalRaw(bytes, hi, 0x3);
    expect(bytes[0]).toBe(0x3f);
    expect(unpackSignalRaw(bytes, lo)).toBe(0xf);
    expect(unpackSignalRaw(bytes, hi)).toBe(0x3);
  });

  it('clamps raw values to what lengthBits can hold', () => {
    const signal: ClusterCanSignal = { name: 'pct', startBit: 0, lengthBits: 8, scale: 1, offset: 0 };
    const bytes = [0, 0, 0, 0, 0, 0, 0, 0];
    packSignalRaw(bytes, signal, 999);
    expect(bytes[0]).toBe(0xff);

    packSignalRaw(bytes, signal, -50);
    expect(bytes[0]).toBe(0);
  });

  it('drops bits that would land past byte 7 instead of throwing', () => {
    const signal: ClusterCanSignal = { name: 'overflow', startBit: 60, lengthBits: 8, scale: 1, offset: 0 };
    const bytes = [0, 0, 0, 0, 0, 0, 0, 0];
    expect(() => packSignalRaw(bytes, signal, 0xff)).not.toThrow();
    expect(bytes).toHaveLength(8);
    // Only bits 60..63 (nibble of byte 7) exist in-frame; the rest are dropped.
    expect(bytes[7]).toBe(0xf0);
  });
});

describe('packFrameBytes / unpackFrameBytes', () => {
  const frame: ClusterCanFrame = {
    id: 0x520,
    cycleMs: 100,
    signals: [
      { name: 'fuel_pct', startBit: 0, lengthBits: 8, scale: 100 / 255, offset: 0 },
      { name: 'coolant_temp_c', startBit: 8, lengthBits: 8, scale: 1, offset: -40 },
    ],
  };

  it('packs every signal at its own bit position', () => {
    const bytes = packFrameBytes(frame, { fuel_pct: 100, coolant_temp_c: 90 });
    expect(bytes).toHaveLength(8);
    expect(bytes[0]).toBe(255); // 100% -> full-scale raw
    expect(bytes[1]).toBe(130); // 90 - (-40)
  });

  it('defaults an unset signal to its own offset', () => {
    const bytes = packFrameBytes(frame, {});
    expect(bytes[0]).toBe(0); // fuel_pct offset 0 -> raw 0
    expect(bytes[1]).toBe(0); // coolant_temp_c offset -40 -> raw 0 -> physical -40
  });

  it('round-trips through unpackFrameBytes', () => {
    const bytes = packFrameBytes(frame, { fuel_pct: 50, coolant_temp_c: 20 });
    const values = unpackFrameBytes(frame, bytes);
    expect(values.coolant_temp_c).toBe(20);
    expect(values.fuel_pct).toBeCloseTo(50, 0);
  });

  it('leaves bytes outside any signal at zero', () => {
    const bytes = packFrameBytes(frame, { fuel_pct: 10, coolant_temp_c: 10 });
    expect(bytes.slice(2)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
