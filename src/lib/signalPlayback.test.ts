import { describe, it, expect } from 'vitest';
import { buildPlaybackSchedule, type ProfilePoint } from './signalPlayback';

// One accel/brake cycle: 0→200 Hz over 5s, 200→0 Hz over the next 5s.
const CYCLE: ProfilePoint[] = [
  { time: 0, frequency: 0 },
  { time: 5, frequency: 200 },
  { time: 10, frequency: 0 },
];

describe('buildPlaybackSchedule', () => {
  it('returns nothing for fewer than 2 points', () => {
    expect(buildPlaybackSchedule([{ time: 0, frequency: 0 }], { totalDurationSeconds: 60 })).toEqual([]);
    expect(buildPlaybackSchedule([], { totalDurationSeconds: 60 })).toEqual([]);
  });

  it('returns nothing for a non-positive duration', () => {
    expect(buildPlaybackSchedule(CYCLE, { totalDurationSeconds: 0 })).toEqual([]);
    expect(buildPlaybackSchedule(CYCLE, { totalDurationSeconds: -5 })).toEqual([]);
  });

  it('returns nothing for a degenerate (zero-length) recording', () => {
    const instant: ProfilePoint[] = [{ time: 3, frequency: 50 }, { time: 3, frequency: 80 }];
    expect(buildPlaybackSchedule(instant, { totalDurationSeconds: 60 })).toEqual([]);
  });

  it('plays a single loop verbatim when the duration exactly fits one cycle + pause', () => {
    // cycle = 10s, pause = 4s → loop length 14s; a second loop would start
    // at t=14, which isn't < 14, so only one loop runs.
    const schedule = buildPlaybackSchedule(CYCLE, { totalDurationSeconds: 14, loopPauseSeconds: 4 });
    expect(schedule).toEqual([
      { atSeconds: 0, frequency: 0 },
      { atSeconds: 5, frequency: 200 },
      { atSeconds: 10, frequency: 0 },
    ]);
  });

  it('loops with the ABS-reaction pause and collapses repeated 0 Hz at loop boundaries', () => {
    const schedule = buildPlaybackSchedule(CYCLE, { totalDurationSeconds: 30, loopPauseSeconds: 4 });
    // Loop 1: 0,0 / 5,200 / 10,0. Loop 2 starts at 14 (0Hz, deduped against
    // the trailing 0 from loop 1): 19,200 / 24,0. Loop 3 starts at 28 (0Hz,
    // deduped again); its next point (33) is past the 30s duration.
    expect(schedule).toEqual([
      { atSeconds: 0, frequency: 0 },
      { atSeconds: 5, frequency: 200 },
      { atSeconds: 10, frequency: 0 },
      { atSeconds: 19, frequency: 200 },
      { atSeconds: 24, frequency: 0 },
    ]);
  });

  it('respects a custom pause length', () => {
    // pause=2 → loop length 12s; loop 2 starts at 12.
    const schedule = buildPlaybackSchedule(CYCLE, { totalDurationSeconds: 24, loopPauseSeconds: 2 });
    expect(schedule.map(s => s.atSeconds)).toEqual([0, 5, 10, 17, 22]);
  });

  it('always forces a final stop at 0 Hz when cut off mid-ramp', () => {
    // Loop 3 (start 28) reaches its accel point at t=33, still < 34 → kept.
    // The terminal safety stop at t=34 then differs from 200, so it's kept too.
    const schedule = buildPlaybackSchedule(CYCLE, { totalDurationSeconds: 34, loopPauseSeconds: 4 });
    expect(schedule).toEqual([
      { atSeconds: 0, frequency: 0 },
      { atSeconds: 5, frequency: 200 },
      { atSeconds: 10, frequency: 0 },
      { atSeconds: 19, frequency: 200 },
      { atSeconds: 24, frequency: 0 },
      { atSeconds: 33, frequency: 200 },
      { atSeconds: 34, frequency: 0 },
    ]);
  });

  it('normalizes a profile that does not start at time 0', () => {
    const shifted: ProfilePoint[] = [
      { time: 2, frequency: 0 },
      { time: 7, frequency: 200 },
      { time: 12, frequency: 0 },
    ];
    const schedule = buildPlaybackSchedule(shifted, { totalDurationSeconds: 14, loopPauseSeconds: 4 });
    expect(schedule).toEqual([
      { atSeconds: 0, frequency: 0 },
      { atSeconds: 5, frequency: 200 },
      { atSeconds: 10, frequency: 0 },
    ]);
  });

  it('sorts an out-of-order profile before scheduling', () => {
    const shuffled: ProfilePoint[] = [
      { time: 10, frequency: 0 },
      { time: 0, frequency: 0 },
      { time: 5, frequency: 200 },
    ];
    const schedule = buildPlaybackSchedule(shuffled, { totalDurationSeconds: 14, loopPauseSeconds: 4 });
    expect(schedule).toEqual([
      { atSeconds: 0, frequency: 0 },
      { atSeconds: 5, frequency: 200 },
      { atSeconds: 10, frequency: 0 },
    ]);
  });
});
