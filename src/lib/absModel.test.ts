import { describe, it, expect } from 'vitest';
import {
  defaultModel,
  buildModelPayload,
  cableLabel,
  modelPayloadTooLong,
  MODEL_PRESETS,
} from './absModel';

describe('cableLabel', () => {
  it('formats GRM<code-2000> zero-padded to 4', () => {
    expect(cableLabel(2137)).toBe('GRM0137');
    expect(cableLabel(2000)).toBe('GRM0000'); // the "unset" sentinel
    expect(cableLabel(12345)).toBe('GRM10345');
  });
  it('clamps codes below the 2000 base', () => {
    expect(cableLabel(1999)).toBe('GRM0000');
    expect(cableLabel(0)).toBe('GRM0000');
  });
});

describe('buildModelPayload', () => {
  it('serialises ModelComponent fields in declaration order with a Model key', () => {
    const m = defaultModel({
      name: 'MK60 test',
      type: 1,
      speedCan: 5,
      signal: 2,       // -> payload Signal = 3
      code: 2137,
      pausa: 40,
      breakSpeed: 0.65,
      wheelRes: [[1400, 190], [1400, 190], [1600, 210], [1600, 210]],
      alfa: [1, 1, 0.98, 1.02],
      deltaSpeed: 1,
      spike: true,
    });
    const json = buildModelPayload(m);
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed)).toEqual([
      'Model', 'Type', 'Speed', 'Signal', 'Component', 'Code', 'Pausa', 'BreakSpeed',
      'Wheel1Res1', 'Wheel1Res2', 'Wheel2Res1', 'Wheel2Res2',
      'Wheel3Res1', 'Wheel3Res2', 'Wheel4Res1', 'Wheel4Res2',
      'Speed1', 'Speed2', 'Speed3', 'Speed4',
      'Alfa1', 'Alfa2', 'Alfa3', 'Alfa4', 'DeltaSpeed', 'Spike',
    ]);
    expect(parsed.Model).toBe('MK60 test');
    expect(parsed.Signal).toBe(3);          // signal + 1
    expect(parsed.Component).toBe(0);       // always ABS
    expect(parsed.Code).toBe(2137);
    expect(parsed).toMatchObject({ Speed1: 0, Speed2: 0, Speed3: 0, Speed4: 0 });
    expect(parsed.Wheel1Res1).toBe(1400);
    expect(parsed.Wheel3Res2).toBe(210);
    expect(parsed.Spike).toBe(true);
  });

  it('emits whole numbers without a trailing .0 (matches .NET JavaScriptSerializer)', () => {
    const json = buildModelPayload(defaultModel({ deltaSpeed: 1, breakSpeed: 0.7 }));
    expect(json).toContain('"DeltaSpeed":1');
    expect(json).toContain('"BreakSpeed":0.7');
    expect(json).not.toContain('.0');
  });

  it('clamps the signal channel into range', () => {
    expect(JSON.parse(buildModelPayload(defaultModel({ signal: 20 }))).Signal).toBe(15);
    expect(JSON.parse(buildModelPayload(defaultModel({ signal: -5 }))).Signal).toBe(0);
  });

  it('maps speedCan to the Speed key and clamps sbyte / short ranges', () => {
    expect(JSON.parse(buildModelPayload(defaultModel({ speedCan: 6 }))).Speed).toBe(6);
    expect(JSON.parse(buildModelPayload(defaultModel({ speedCan: 999 }))).Speed).toBe(127);
    expect(JSON.parse(buildModelPayload(defaultModel({ speedCan: -999 }))).Speed).toBe(-128);
    expect(JSON.parse(buildModelPayload(defaultModel({ code: 999999 }))).Code).toBe(32767);
    expect(JSON.parse(buildModelPayload(defaultModel({ code: -10 }))).Code).toBe(0);
  });

  it('carries a name with special characters through verbatim', () => {
    const json = buildModelPayload(defaultModel({ name: "Peugeot's ABS <MK60>" }));
    expect(JSON.parse(json).Model).toBe("Peugeot's ABS <MK60>");
  });

  it('the default model payload is well under the board\'s length limit', () => {
    expect(modelPayloadTooLong(buildModelPayload(defaultModel()))).toBe(false);
  });
});

describe('modelPayloadTooLong', () => {
  it('flags 400+ chars (350 for single-frame firmware)', () => {
    expect(modelPayloadTooLong('x'.repeat(399))).toBe(false);
    expect(modelPayloadTooLong('x'.repeat(400))).toBe(true);
    expect(modelPayloadTooLong('x'.repeat(350), true)).toBe(true);
    expect(modelPayloadTooLong('x'.repeat(349), true)).toBe(false);
  });
});

describe('MODEL_PRESETS', () => {
  it('cover passive / active / spike, all with the unset code sentinel', () => {
    expect(MODEL_PRESETS.map(p => p.id)).toEqual(['passive', 'active', 'spike']);
    expect(MODEL_PRESETS.find(p => p.id === 'active')!.model.type).toBe(1);
    expect(MODEL_PRESETS.find(p => p.id === 'spike')!.model.spike).toBe(true);
    for (const p of MODEL_PRESETS) expect(p.model.code).toBe(2000);
  });
});
