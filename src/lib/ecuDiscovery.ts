/* ── CAN ID discovery sweep ────────────────────────────────────
   Last resort for an ABS reference with no stored addressing: try a candidate
   tester ID, listen for an ISO-TP-shaped answer on the matching response ID,
   report the first hit. Same shape as `caringcaribou uds discovery` and
   Scapy's isotpscanner, on top of the ISO-TP helper in lib/isotp.ts.

   Tiers, cheapest and most likely first:
     1. 'db'      — addressing already proven for this hardware family / bench
     2. 'renault' — 0x700–0x7FF, the manufacturer diagnostic range
     3. 'full'    — every 11-bit ID; slow, only on explicit confirmation
   ─────────────────────────────────────────────────────────────────────── */

import { isoTpRequest, type SendFn } from '@/lib/isotp';
import type { DiscoveryCandidateRow } from '@/lib/ecu';
import { parseCanId } from '@/lib/ecu';

export type DiscoveryTier = 'db' | 'renault' | 'full';

/** DiagnosticSessionControl → extended session. Every UDS/KWP-on-CAN ECU
    answers it, positively or with a negative response — both prove presence. */
export const DEFAULT_PROBE = [0x10, 0x03];

/** Renault/Nissan/Mitsubishi CAN answers at send+0x20; OBD-II at send+8. */
const RECV_OFFSETS = [0x20, 0x08];

const CAN_ID_MAX = 0x7ff;

export interface DiscoveryProbe {
  sendId: number;
  recvIds: number[];
  tier: DiscoveryTier;
  /** Where the candidate came from, for the UI: 'saved' | 'family' | 'db'. */
  source?: string;
  label?: string;
}

export interface DiscoveryHit {
  sendId: number;
  recvId: number;
  payload: number[];
  tier: DiscoveryTier;
  label?: string;
}

export interface DiscoveryOptions {
  send: SendFn;
  probes: DiscoveryProbe[];
  probeBytes?: number[];
  /** Per-candidate listen window. 100–150 ms is enough on a bench harness. */
  timeoutMs?: number;
  /** Idle gap between probes so the Nano's serial buffer keeps up. */
  gapMs?: number;
  isCancelled?: () => boolean;
  onProgress?: (done: number, total: number, probe: DiscoveryProbe) => void;
}

export const DEFAULT_TIMEOUT_MS = 130;
export const DEFAULT_GAP_MS = 8;

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Probes for the known-good addressing returned by `get_discovery_candidates`. */
export function dbProbes(rows: DiscoveryCandidateRow[]): DiscoveryProbe[] {
  const probes: DiscoveryProbe[] = [];
  for (const row of rows) {
    const sendId = parseCanId(row.sendId);
    const recvId = parseCanId(row.recvId);
    if (sendId === null) continue;
    probes.push({
      sendId,
      recvIds: recvId !== null ? [recvId] : recvOffsetsFor(sendId),
      tier: 'db',
      source: row.source,
      label: row.label,
    });
  }
  return probes;
}

/** Probes for a blind range, listening on both the +0x20 and +8 conventions. */
export function rangeProbes(from: number, to: number, tier: DiscoveryTier): DiscoveryProbe[] {
  const probes: DiscoveryProbe[] = [];
  for (let id = from; id <= to; id++) {
    const recvIds = recvOffsetsFor(id);
    if (recvIds.length) probes.push({ sendId: id, recvIds, tier });
  }
  return probes;
}

function recvOffsetsFor(sendId: number): number[] {
  return RECV_OFFSETS.map(o => sendId + o).filter(id => id <= CAN_ID_MAX);
}

/**
 * Guess the diagnostic protocol from the probe's own answer: a UDS
 * (ISO 14229) DiagnosticSessionControl response carries the P2 timing
 * parameters after `50 03`, KWP2000-on-CAN answers with the two bytes alone.
 * A negative response says nothing, so KWP2000 stays the default for the
 * manufacturer-specific addressing these ABS units use.
 */
export function protocolFromProbe(payload: number[]): 'UDS' | 'KWP2000' {
  const positive = payload[0] === ((DEFAULT_PROBE[0] + 0x40) & 0xff);
  return positive && payload.length >= 6 ? 'UDS' : 'KWP2000';
}

/** Drop candidates already covered by an earlier (higher-priority) tier. */
export function dedupeProbes(probes: DiscoveryProbe[]): DiscoveryProbe[] {
  const seen = new Set<number>();
  return probes.filter(p => !seen.has(p.sendId) && (seen.add(p.sendId), true));
}

export function estimateSweepSeconds(
  count: number,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  gapMs = DEFAULT_GAP_MS,
): number {
  return Math.round((count * (timeoutMs + gapMs)) / 1000);
}

/**
 * Only a real answer to the probe counts as a hit: the positive response
 * (request SID + 0x40) or a negative response naming that SID. Anything else
 * on the same CAN ID is periodic bus traffic, not an ECU answering us.
 */
function makeAccept(probeBytes: number[]) {
  const sid = probeBytes[0];
  return (payload: number[]): boolean =>
    payload.length > 0 &&
    (payload[0] === ((sid + 0x40) & 0xff) ||
     (payload[0] === 0x7f && payload[1] === sid));
}

/** Run the sweep, resolving on the first responding ID (or null). */
export async function runDiscovery(opts: DiscoveryOptions): Promise<DiscoveryHit | null> {
  const {
    send, probes,
    probeBytes = DEFAULT_PROBE,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    gapMs = DEFAULT_GAP_MS,
    isCancelled,
    onProgress,
  } = opts;

  const accept = makeAccept(probeBytes);
  const total = probes.length;
  if (!total) return null;

  for (let i = 0; i < total; i++) {
    if (isCancelled?.()) return null;
    const probe = probes[i];
    onProgress?.(i, total, probe);

    const res = await isoTpRequest({
      send,
      sendId: probe.sendId,
      recvIds: probe.recvIds,
      data: probeBytes,
      timeoutMs,
      waitForPending: false,  // a "busy" reply still proves the ECU is there
      accept,
    });

    if (res) {
      onProgress?.(i + 1, total, probe);
      return {
        sendId: probe.sendId,
        recvId: res.fromId,
        payload: res.payload,
        tier: probe.tier,
        label: probe.label,
      };
    }
    if (gapMs > 0) await delay(gapMs);
  }

  onProgress?.(total, total, probes[total - 1]);
  return null;
}
