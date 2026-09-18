import { describe, it, expect } from 'vitest';
import {
  clusterBenchReduce,
  initialClusterBenchState,
  type ClusterBenchState,
} from '@/lib/clusterBench';
import { packFrameBytes, type ClusterCanProfile } from '@/lib/clusterCan';

const PROFILE: ClusterCanProfile = {
  id: 'test',
  label: 'Test profile',
  busSpeedKbps: 500,
  frames: [
    {
      id: 0x100,
      cycleMs: 100,
      signals: [{ name: 'fuel_pct', startBit: 0, lengthBits: 8, scale: 1, offset: 0 }],
    },
    {
      id: 0x101,
      cycleMs: 0, // send-on-demand only
      signals: [{ name: 'handbrake', startBit: 0, lengthBits: 1, scale: 1, offset: 0 }],
    },
  ],
};

function loaded(): ClusterBenchState {
  return clusterBenchReduce(initialClusterBenchState(), { action: 'load_profile', profile: PROFILE }).state;
}

describe('load_profile', () => {
  it('resets running state, values and cycle timers', () => {
    const state = loaded();
    expect(state.profile).toBe(PROFILE);
    expect(state.running).toBe(false);
    expect(state.values).toEqual({});
    expect(state.lastSentAt).toEqual({});
  });
});

describe('start / stop', () => {
  it('does nothing without a loaded profile', () => {
    const { state, frames } = clusterBenchReduce(initialClusterBenchState(), { action: 'start' });
    expect(state.running).toBe(false);
    expect(frames).toEqual([]);
  });

  it('arms transmission and clears stale cycle timers', () => {
    let state = loaded();
    state = { ...state, lastSentAt: { [0x100]: 12345 } };
    const step = clusterBenchReduce(state, { action: 'start' });
    expect(step.state.running).toBe(true);
    expect(step.state.lastSentAt).toEqual({});
  });

  it('stop disarms transmission and clears cycle timers', () => {
    const running = clusterBenchReduce(loaded(), { action: 'start' }).state;
    const step = clusterBenchReduce(running, { action: 'stop' });
    expect(step.state.running).toBe(false);
    expect(step.state.lastSentAt).toEqual({});
  });
});

describe('tick', () => {
  it('emits nothing while stopped', () => {
    const { frames } = clusterBenchReduce(loaded(), { action: 'tick', nowMs: 1000 });
    expect(frames).toEqual([]);
  });

  it('sends a periodic frame immediately on the first tick after start', () => {
    const running = clusterBenchReduce(loaded(), { action: 'start' }).state;
    const { frames } = clusterBenchReduce(running, { action: 'tick', nowMs: 1000 });
    expect(frames).toEqual([{ id: 0x100, bytes: packFrameBytes(PROFILE.frames[0], {}) }]);
  });

  it('never sends a cycleMs: 0 frame from a tick', () => {
    const running = clusterBenchReduce(loaded(), { action: 'start' }).state;
    const { frames } = clusterBenchReduce(running, { action: 'tick', nowMs: 1000 });
    expect(frames.some(f => f.id === 0x101)).toBe(false);
  });

  it('withholds a periodic frame until its cycle has elapsed, then resends', () => {
    let state = clusterBenchReduce(loaded(), { action: 'start' }).state;
    ({ state } = clusterBenchReduce(state, { action: 'tick', nowMs: 1000 })); // first send
    let step = clusterBenchReduce(state, { action: 'tick', nowMs: 1050 }); // only 50ms later
    expect(step.frames).toEqual([]);
    step = clusterBenchReduce(step.state, { action: 'tick', nowMs: 1100 }); // 100ms since last send
    expect(step.frames).toHaveLength(1);
  });
});

describe('set_value', () => {
  it('updates the value without transmitting while stopped', () => {
    const { state, frames } = clusterBenchReduce(loaded(), { action: 'set_value', name: 'fuel_pct', value: 75 });
    expect(state.values.fuel_pct).toBe(75);
    expect(frames).toEqual([]);
  });

  it('transmits every frame containing the changed signal immediately while running', () => {
    const running = clusterBenchReduce(loaded(), { action: 'start' }).state;
    const { frames } = clusterBenchReduce(running, { action: 'set_value', name: 'fuel_pct', value: 42 });
    expect(frames).toEqual([{ id: 0x100, bytes: packFrameBytes(PROFILE.frames[0], { fuel_pct: 42 }) }]);
  });

  it('does not transmit frames that do not contain the changed signal', () => {
    const running = clusterBenchReduce(loaded(), { action: 'start' }).state;
    const { frames } = clusterBenchReduce(running, { action: 'set_value', name: 'handbrake', value: 1 });
    expect(frames.every(f => f.id === 0x101)).toBe(true);
  });
});

describe('send_frame', () => {
  it('is a no-op while stopped', () => {
    const { frames } = clusterBenchReduce(loaded(), { action: 'send_frame', id: 0x101 });
    expect(frames).toEqual([]);
  });

  it('is a no-op for an unknown frame id', () => {
    const running = clusterBenchReduce(loaded(), { action: 'start' }).state;
    const { frames } = clusterBenchReduce(running, { action: 'send_frame', id: 0x999 });
    expect(frames).toEqual([]);
  });

  it('transmits the requested send-on-demand frame with current values', () => {
    let state = clusterBenchReduce(loaded(), { action: 'start' }).state;
    state = clusterBenchReduce(state, { action: 'set_value', name: 'handbrake', value: 1 }).state;
    const { frames } = clusterBenchReduce(state, { action: 'send_frame', id: 0x101 });
    expect(frames).toEqual([{ id: 0x101, bytes: packFrameBytes(PROFILE.frames[1], { handbrake: 1 }) }]);
  });
});
