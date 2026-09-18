import { describe, it, expect } from 'vitest';
import { canStringsFor, hasCanStrings } from './absCanStrings';

describe('canStringsFor', () => {
  it('returns null for a model with no Stringhe entry, or a nullish id', () => {
    expect(canStringsFor(999999)).toBeNull();
    expect(canStringsFor(null)).toBeNull();
    expect(canStringsFor(undefined)).toBeNull();
    expect(hasCanStrings(999999)).toBe(false);
  });

  it('decodes the compact [address1, delayUs, type, ...data] tuples', () => {
    const s = canStringsFor(1); // Mito Bosch 8.1 — one base + one motor frame
    expect(s).not.toBeNull();
    expect(hasCanStrings(1)).toBe(true);
    expect(s!.init).toEqual([]);
    expect(s!.base).toEqual([
      { address1: 416952561, delayUs: 4000, type: 0, data: [4, 47, 80, 117, 3, 0, 0, 0] },
    ]);
    expect(s!.motor).toEqual([
      { address1: 416952561, delayUs: 4000, type: 0, data: [3, 34, 10, 219] },
    ]);
  });

  it('gives every list (init/base/motor) even when the source omits it', () => {
    const s = canStringsFor(274); // Mini MK60 — base only
    expect(s).toMatchObject({ init: [], motor: [] });
    expect(s!.base.length).toBe(80);
    expect(s!.base[0].data.length).toBeGreaterThan(0);
    expect(s!.base[0].data.length).toBeLessThanOrEqual(8);
  });
});
