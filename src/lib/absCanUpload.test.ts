import { describe, it, expect } from 'vitest';
import {
  N_STRING,
  buildStartAbsFrames,
  buildFillTableFrames,
  batchCanFrames,
  buildCanUpload,
  canTurnOffMotor,
} from './absCanUpload';
import { canStringsFor } from './absCanStrings';
import type { CanStringRow, ModelCanStrings } from './absCanStrings';

const row = (address1: number, data: number[], type = 0, delayUs = 4000): CanStringRow => ({
  address1,
  delayUs,
  type,
  data,
});

describe('buildStartAbsFrames (ABS.cs StartABS)', () => {
  it('forces type 0, leaves pos 0, and numbers indx by position', () => {
    const frames = buildStartAbsFrames([
      row(1096, [131, 0, 0, 2, 112], 7),
      row(1096, [131, 0, 0, 3, 112], 7),
    ]);
    expect(frames).toEqual([
      { address1: '1096', indx: 0, pos: 0, type: 0, us: 4000, data: [131, 0, 0, 2, 112] },
      { address1: '1096', indx: 1, pos: 0, type: 0, us: 4000, data: [131, 0, 0, 3, 112] },
    ]);
  });
});

describe('buildFillTableFrames (ABS.cs FillTable)', () => {
  it('interleaves base then motor, numbering pos 0,1,2,…', () => {
    const base = [row(10, [1]), row(11, [2]), row(12, [3])];
    const motor = [row(20, [9]), row(21, [8])];
    const out = buildFillTableFrames(base, motor, N_STRING);
    // base[0], motor[0], base[1], motor[1], base[2] — pos runs 0..4, last negated.
    expect(out.map(f => [f.address1, f.pos])).toEqual([
      ['10', 0],
      ['20', 1],
      ['11', 2],
      ['21', 3],
      ['12', -4],
    ]);
    // motor indx counts within its own loop (StartABS already drained the
    // base queue, so the original's `+ BaseDataCAN.Count` is always + 0).
    expect(out.find(f => f.address1 === '21')?.indx).toBe(1);
  });

  it('drains the longer loop after the shorter runs out', () => {
    const out = buildFillTableFrames([row(1, [1])], [row(2, [2]), row(3, [3]), row(4, [4])], N_STRING);
    expect(out.map(f => f.address1)).toEqual(['1', '2', '3', '4']);
    expect(out.map(f => Math.abs(f.pos))).toEqual([0, 1, 2, 3]);
  });

  it('doubles the base loop when motor runs >2 rows longer (ABS.cs FillTable:1788)', () => {
    const out = buildFillTableFrames([row(10, [1])], [row(20, [2]), row(21, [3]), row(22, [4]), row(23, [5])], 5);
    // motor(4) - base(1) = 3 > 2 → base goes round twice: b, m, b, m, m, m
    expect(out.map(f => f.address1)).toEqual(['10', '20', '10', '21', '22', '23']);
    // both base copies keep indx 0 (the original's re-Fill repeats Order, not n..2n-1)
    expect(out.filter(f => f.address1 === '10').map(f => f.indx)).toEqual([0, 0]);
    // real bundled unit: Opel Corsa D Bosch 8.1 (id 6) — 61 base / 71 motor.
    const corsa = canStringsFor(6)!;
    expect(corsa.base).toHaveLength(61);
    expect(corsa.motor).toHaveLength(71);
    expect(buildFillTableFrames(corsa.base, corsa.motor, N_STRING)).toHaveLength(61 * 2 + 71);
  });

  it('does not double the base loop when the gap is 2 or less', () => {
    const out = buildFillTableFrames([row(1, [1]), row(2, [2])], [row(9, [9]), row(8, [8]), row(7, [7]), row(6, [6])], 5);
    expect(out.filter(f => ['1', '2'].includes(f.address1))).toHaveLength(2); // base NOT repeated
  });

  it('negates the last pos only when batching (N_STRING > 1)', () => {
    const args = [[row(1, [1]), row(2, [2])], [] as CanStringRow[]] as const;
    expect(buildFillTableFrames(...args, 5).map(f => f.pos)).toEqual([0, -1]);
    expect(buildFillTableFrames(...args, 1).map(f => f.pos)).toEqual([0, 1]);
  });
});

describe('batchCanFrames', () => {
  const frames = buildFillTableFrames(
    [row(1, [1]), row(2, [2]), row(3, [3]), row(4, [4]), row(5, [5]), row(6, [6])],
    [],
    5,
  );

  it('groups into N_STRING-sized JSON arrays, tail included as an array', () => {
    const msgs = batchCanFrames(frames, 5);
    expect(msgs).toHaveLength(2);
    expect(JSON.parse(msgs[0])).toHaveLength(5);
    expect(JSON.parse(msgs[1])).toHaveLength(1); // ABS.cs:1852 — tail is still an array
  });

  it('serialises fields in FRAME.cs order', () => {
    expect(batchCanFrames([{ address1: '520', indx: 3, pos: 7, type: 5, us: 4000, data: [1, 2] }], 5)[0])
      .toBe('[{"address1":"520","indx":3,"pos":7,"type":5,"us":4000,"data":[1,2]}]');
  });

  it('emits one bare object per message when N_STRING is 1', () => {
    const msgs = batchCanFrames([
      { address1: '1', indx: 0, pos: 0, type: 0, us: 4000, data: [1] },
      { address1: '2', indx: 1, pos: 1, type: 0, us: 4000, data: [2] },
    ], 1);
    expect(msgs).toEqual([
      '{"address1":"1","indx":0,"pos":0,"type":0,"us":4000,"data":[1]}',
      '{"address1":"2","indx":1,"pos":1,"type":0,"us":4000,"data":[2]}',
    ]);
  });
});

describe('buildCanUpload', () => {
  it('returns no commands and hadInit=false for a model with no strings', () => {
    expect(buildCanUpload(null)).toEqual({ commands: [], hadInit: false });
  });

  it('sends init frames individually + Start ABS, then the FillTable batches', () => {
    const strings: ModelCanStrings = {
      init: [row(1096, [1]), row(1096, [2])],
      base: [row(10, [1]), row(11, [2])],
      motor: [row(20, [3])],
    };
    const { commands, hadInit } = buildCanUpload(strings, 5);
    expect(hadInit).toBe(true);
    expect(commands[0]).toEqual({ action: 'can_frames', json: expect.stringContaining('"address1":"1096"') });
    expect(commands[1]).toEqual({ action: 'can_frames', json: expect.stringContaining('"address1":"1096"') });
    expect(commands[2]).toEqual({ action: 'start_abs' });
    // then the interleaved base/motor batch(es)
    expect(commands.slice(3).every(c => c.action === 'can_frames')).toBe(true);
    // init frames go out one per message (batched with N=1)
    expect(JSON.parse(commands[0].action === 'can_frames' ? commands[0].json : '[]')).not.toBeInstanceOf(Array);
  });

  it('builds the Mini MK60 (id 274) upload from the bundled catalogue', () => {
    const strings = canStringsFor(274);
    expect(strings).not.toBeNull();
    const { commands, hadInit } = buildCanUpload(strings, N_STRING);
    expect(hadInit).toBe(false); // no Test=3 rows survive the Component=0 filter
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every(c => c.action === 'can_frames')).toBe(true);
    // 80 base frames, no motor → ceil(80 / 5) = 16 batches.
    expect(commands).toHaveLength(16);
    const first = JSON.parse((commands[0] as { json: string }).json);
    expect(first[0]).toMatchObject({ address1: '1567', us: 4000, data: [255, 255, 11, 0, 108, 0, 0, 0] });
  });
});

describe('canTurnOffMotor', () => {
  it('is true when any motor row is Type 5 (ABS.cs FillTable EnableTurnOff)', () => {
    expect(canTurnOffMotor({ init: [], base: [], motor: [row(1, [1], 5)] })).toBe(true);
    expect(canTurnOffMotor({ init: [], base: [row(1, [1], 5)], motor: [row(2, [2], 1)] })).toBe(false);
  });
});
