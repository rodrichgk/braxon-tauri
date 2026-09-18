import { describe, it, expect } from 'vitest';
import {
  ABS_MODEL_CATALOG,
  CATALOG_MANUFACTURERS,
  catalogModelsFor,
  catalogToModel,
} from './absModelCatalog';
import { buildModelPayload, cableLabel } from './absModel';

describe('ABS model catalog', () => {
  it('is a non-trivial, well-formed list', () => {
    expect(ABS_MODEL_CATALOG.length).toBeGreaterThan(100);
    for (const m of ABS_MODEL_CATALOG) {
      expect(m.manufacturer).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect([0, 1]).toContain(m.type);
      expect(m.wheelRes).toHaveLength(4);
      expect(m.alfa).toHaveLength(4);
      expect(Number.isFinite(m.code)).toBe(true);
      expect(m.coefficient).toBeGreaterThan(0);
    }
    // The original hides the '00' / manufacturer '0' placeholder rows.
    expect(ABS_MODEL_CATALOG.some(m => m.name === '00' || m.manufacturer === '0')).toBe(false);
  });

  it('exposes distinct, locale-sorted manufacturers, each with contiguous name-sorted models', () => {
    expect(CATALOG_MANUFACTURERS.length).toBeGreaterThan(10);
    expect(new Set(CATALOG_MANUFACTURERS).size).toBe(CATALOG_MANUFACTURERS.length);
    expect([...CATALOG_MANUFACTURERS]).toEqual([...CATALOG_MANUFACTURERS].sort((a, b) => a.localeCompare(b)));

    const cmp = new Intl.Collator('en', { sensitivity: 'base', numeric: true }).compare;
    for (const man of CATALOG_MANUFACTURERS) {
      const list = catalogModelsFor(man);
      expect(list.length).toBeGreaterThan(0);
      expect(list.every(m => m.manufacturer === man)).toBe(true);
      const names = list.map(m => m.name);
      expect(names).toEqual([...names].sort(cmp)); // sorted within the manufacturer
    }
    // Manufacturers appear as one contiguous run each (CATALOG_MANUFACTURERS
    // is derived from a Set but the picker filters the flat list).
    const runs = ABS_MODEL_CATALOG.map(m => m.manufacturer).filter((v, i, a) => v !== a[i - 1]);
    expect(new Set(runs).size).toBe(runs.length);
  });

  it('catalogToModel yields a payload the board would accept', () => {
    const c = ABS_MODEL_CATALOG.find(m => m.code > 2000)!;
    const model = catalogToModel(c);
    expect(model.name).toContain(c.manufacturer);
    expect(model.code).toBe(c.code);
    expect(model.type).toBe(c.type);
    const payload = JSON.parse(buildModelPayload(model));
    expect(payload.Model).toBe(model.name);
    expect(payload.Code).toBe(c.code);
    expect(payload.Component).toBe(0);
    expect(payload.Signal).toBe(c.signal + 1);
  });

  it('every catalog entry produces a payload under the board length limit', () => {
    const tooLong = ABS_MODEL_CATALOG.filter(m => buildModelPayload(catalogToModel(m)).length >= 400);
    expect(tooLong).toEqual([]);
  });

  it('a stubbed code still yields the GRM0000 "pick a cable" label', () => {
    const stub = ABS_MODEL_CATALOG.find(m => m.code === 2000);
    if (stub) expect(cableLabel(catalogToModel(stub).code)).toBe('GRM0000');
  });

  it('has the Mini MK60 entry the shop last tested, with its real params', () => {
    const mini = ABS_MODEL_CATALOG.find(m => m.manufacturer === 'Mini' && m.name === 'Mini MK60');
    expect(mini).toBeTruthy();
    expect(mini!.code).toBe(2019);          // -> GRM0019
    expect(mini!.coefficient).toBeCloseTo(0.155, 3);
    expect(mini!.wheelRes[0]).toEqual([2100, 1450]);
  });
});
