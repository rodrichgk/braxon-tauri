/* ── Cluster bench state machine ────────────────────────────────────────
   Pure scheduler behind the "virtual BSI" CAN transmitter (Phase 0 of
   docs/DASHBOARD-BENCH.md) — no React, no Tauri, no timers. The component
   (`ClusterBenchDashboard.tsx`) owns the `setInterval` and turns every msg
   into a `dispatch()` call; this just decides, given the current state and
   the wall-clock time it's handed, which frames go out.

   Nothing transmits unless `running` — same "armed" gate the F2-EVO benches
   use before anything hits the wire (see `absBench.ts`'s Battery/Key power
   toggles). */

import {
  packFrameBytes,
  type ClusterCanFrame,
  type ClusterCanProfile,
} from '@/lib/clusterCan';

export interface ClusterBenchState {
  profile: ClusterCanProfile | null;
  running: boolean;
  /** Current physical value per signal name, across every frame in the
   *  loaded profile. Unset signals pack at their own `offset` (see
   *  `packFrameBytes`). */
  values: Record<string, number>;
  /** Wall-clock ms a given frame id was last transmitted — drives the
   *  per-frame cycle timer in `tick`. */
  lastSentAt: Record<number, number>;
}

export function initialClusterBenchState(): ClusterBenchState {
  return { profile: null, running: false, values: {}, lastSentAt: {} };
}

export type ClusterBenchMsg =
  | { action: 'load_profile'; profile: ClusterCanProfile }
  | { action: 'start' }
  | { action: 'stop' }
  | { action: 'set_value'; name: string; value: number }
  /** One-shot transmit of a specific frame's current values — e.g. a "flash
   *  all telltales once" button for a `cycleMs: 0` frame. */
  | { action: 'send_frame'; id: number }
  | { action: 'tick'; nowMs: number };

export interface ClusterBenchStep {
  state: ClusterBenchState;
  /** Frames to transmit right now, in order. */
  frames: { id: number; bytes: number[] }[];
}

function packFrame(frame: ClusterCanFrame, values: Readonly<Record<string, number>>) {
  return { id: frame.id, bytes: packFrameBytes(frame, values) };
}

export function clusterBenchReduce(state: ClusterBenchState, msg: ClusterBenchMsg): ClusterBenchStep {
  switch (msg.action) {
    case 'load_profile':
      return { state: { profile: msg.profile, running: false, values: {}, lastSentAt: {} }, frames: [] };

    case 'start':
      if (!state.profile) return { state, frames: [] };
      // Clear the cycle timers so every periodic frame goes out on the very
      // first `tick` after start, instead of waiting out a stale interval
      // left over from a previous run.
      return { state: { ...state, running: true, lastSentAt: {} }, frames: [] };

    case 'stop':
      return { state: { ...state, running: false, lastSentAt: {} }, frames: [] };

    case 'set_value': {
      const values = { ...state.values, [msg.name]: msg.value };
      const next = { ...state, values };
      if (!state.running || !state.profile) return { state: next, frames: [] };
      // Send-on-change: an operator moving a gauge slider wants the cluster
      // to react now, not on the next periodic tick.
      const frames = state.profile.frames
        .filter(f => f.signals.some(s => s.name === msg.name))
        .map(f => packFrame(f, values));
      return { state: next, frames };
    }

    case 'send_frame': {
      if (!state.running || !state.profile) return { state, frames: [] };
      const frame = state.profile.frames.find(f => f.id === msg.id);
      return frame ? { state, frames: [packFrame(frame, state.values)] } : { state, frames: [] };
    }

    case 'tick': {
      if (!state.running || !state.profile) return { state, frames: [] };
      const lastSentAt = { ...state.lastSentAt };
      const frames: { id: number; bytes: number[] }[] = [];
      for (const frame of state.profile.frames) {
        if (frame.cycleMs <= 0) continue; // send-on-demand only
        const last = lastSentAt[frame.id] ?? -Infinity;
        if (msg.nowMs - last >= frame.cycleMs) {
          frames.push(packFrame(frame, state.values));
          lastSentAt[frame.id] = msg.nowMs;
        }
      }
      return { state: { ...state, lastSentAt }, frames };
    }
  }
}
