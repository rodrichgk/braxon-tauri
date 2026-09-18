/* ── Cluster-bench CAN codec ──────────────────────────────────────────
   The "virtual BSI" half of the planned dashboard/instrument-cluster bench
   (see docs/DASHBOARD-BENCH.md) — Phase 0, buildable with zero new hardware
   on BRAXON's existing CAN transport. This module only does signal-level
   packing: physical value <-> raw <-> bits in an 8-byte CAN frame. Building
   the actual `CANTx : …` wire line from the `{ id, bytes }` this produces is
   `buildFrame` in `@/lib/isotp` — kept separate so this file stays pure (no
   React/Tauri) and reusable for RX-side verification too (`unpackFrameBytes`).

   Bit numbering is Intel/little-endian: bit 0 is byte 0's LSB, bit 8 is byte
   1's LSB, and so on — `startBit` is a signal's least-significant bit in
   that scheme. This is BRAXON's own convention (no OEM DBC is involved
   here), chosen because it needs no per-signal byte-order flag. */

export interface ClusterCanSignal {
  name: string;
  /** Least-significant bit position, Intel bit order (see file header). */
  startBit: number;
  lengthBits: number;
  scale: number;
  offset: number;
}

export interface ClusterCanFrame {
  id: number;
  /** Transmit period in ms. 0 = send-on-demand only — never picked up by a
   *  `tick` scan in `clusterBench.ts`, only by an explicit send. */
  cycleMs: number;
  signals: ClusterCanSignal[];
}

export interface ClusterCanProfile {
  id: string;
  label: string;
  busSpeedKbps: number;
  frames: ClusterCanFrame[];
}

function maxRawFor(lengthBits: number): number {
  return lengthBits >= 32 ? 0xffffffff : (1 << lengthBits) - 1;
}

export function rawFromPhysical(value: number, signal: Pick<ClusterCanSignal, 'scale' | 'offset'>): number {
  const scale = signal.scale || 1;
  return Math.round((value - signal.offset) / scale);
}

export function physicalFromRaw(raw: number, signal: Pick<ClusterCanSignal, 'scale' | 'offset'>): number {
  return raw * (signal.scale || 1) + signal.offset;
}

/** Writes `raw` (clamped to what `lengthBits` can hold) into `bytes` at
 *  `startBit`. Bits landing past byte 7 are silently dropped — a malformed
 *  profile shouldn't throw mid-transmit, just truncate. */
export function packSignalRaw(bytes: number[], signal: ClusterCanSignal, raw: number): void {
  const max = maxRawFor(signal.lengthBits);
  const clamped = Math.min(max, Math.max(0, Math.round(raw)));
  for (let i = 0; i < signal.lengthBits; i++) {
    const bitPos = signal.startBit + i;
    const byteIdx = bitPos >> 3;
    if (byteIdx > 7) break;
    const bitInByte = bitPos & 7;
    const mask = 1 << bitInByte;
    if ((clamped >> i) & 1) bytes[byteIdx] |= mask;
    else bytes[byteIdx] &= ~mask & 0xff;
  }
}

export function unpackSignalRaw(bytes: readonly number[], signal: ClusterCanSignal): number {
  let raw = 0;
  for (let i = 0; i < signal.lengthBits; i++) {
    const bitPos = signal.startBit + i;
    const byteIdx = bitPos >> 3;
    if (byteIdx > 7) break;
    const bitInByte = bitPos & 7;
    const bit = (bytes[byteIdx] >> bitInByte) & 1;
    raw |= bit << i;
  }
  return raw >>> 0;
}

/** Packs every signal's current physical value into a fresh 8-byte frame.
 *  A signal with no entry in `values` defaults to its own `offset` (raw 0)
 *  — the "nothing commanded yet" reading. */
export function packFrameBytes(frame: ClusterCanFrame, values: Readonly<Record<string, number>>): number[] {
  const bytes = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const signal of frame.signals) {
    const physical = values[signal.name] ?? signal.offset;
    packSignalRaw(bytes, signal, rawFromPhysical(physical, signal));
  }
  return bytes;
}

/** Inverse of `packFrameBytes` — decodes every signal's physical value back
 *  out of a received frame, e.g. to verify a cluster echoed something back. */
export function unpackFrameBytes(frame: ClusterCanFrame, bytes: readonly number[]): Record<string, number> {
  const values: Record<string, number> = {};
  for (const signal of frame.signals) {
    values[signal.name] = physicalFromRaw(unpackSignalRaw(bytes, signal), signal);
  }
  return values;
}
