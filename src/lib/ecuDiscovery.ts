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
import { describeDtc } from '@/lib/dtcGeneric';
import { SESSION_DEFAULT, SESSION_EXTENDED, SESSION_MANUFACTURER } from '@/lib/udsSession';

export type DiscoveryTier = 'db' | 'renault' | 'full';

/**
 * DiagnosticSessionControl probes, tried in order per candidate ID.
 * 0xC0 (manufacturer session) first — that is what a working commercial-tool
 * capture used on a Renault/Bosch MK61. 0x03 (standard extended session)
 * second. 0x01 (standard default session) last — every UDS ECU must accept
 * it, and it's what a Ford/ATE unit (10.0915-0108.3, 0x760→0x768, captured
 * 2026-09-04) turned out to use instead of 0xC0. A probe that opens a
 * session is also the connect step, so the sweep leaves the bench talking to
 * the ECU rather than merely knowing its address.
 */
export const SESSION_PROBES = [
  [0x10, SESSION_MANUFACTURER],
  [0x10, SESSION_EXTENDED],
  [0x10, SESSION_DEFAULT],
];

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
  /** Session subfunction that produced the answer (0xC0 or 0x03). */
  subFunction: number;
  /**
   * True when the ECU accepted the session (50 xx) — the caller can hold it
   * open. False when it answered 7F: the address is right and something is
   * alive there, but it refused the session.
   */
  sessionOpen: boolean;
  /** Negative response code, when the session was refused. */
  nrc?: number;
}

export interface DiscoveryOptions {
  send: SendFn;
  probes: DiscoveryProbe[];
  /** Probe payloads tried per candidate, in order. Defaults to SESSION_PROBES. */
  probeSets?: number[][];
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
  const positive = payload[0] === 0x50;
  return positive && payload.length >= 6 ? 'UDS' : 'KWP2000';
}

/** Drop candidates already covered by an earlier (higher-priority) tier. */
export function dedupeProbes(probes: DiscoveryProbe[]): DiscoveryProbe[] {
  const seen = new Set<number>();
  return probes.filter(p => !seen.has(p.sendId) && (seen.add(p.sendId), true));
}

/**
 * Worst case: every candidate stays silent, so each one costs the full
 * timeout once per probe subfunction. A responding ECU is found sooner.
 */
export function estimateSweepSeconds(
  count: number,
  probesPerCandidate = SESSION_PROBES.length,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  gapMs = DEFAULT_GAP_MS,
): number {
  return Math.round((count * probesPerCandidate * (timeoutMs + gapMs)) / 1000);
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

/**
 * Run the sweep, resolving on the first ID that answers session control.
 *
 * A 50 xx answer is the real prize: the ECU accepted the session, so the
 * caller can hold it open and start working immediately. A 7F still identifies
 * the address — something diagnostic is alive there — and is reported with
 * `sessionOpen: false` rather than discarded as "nothing found".
 */
export async function runDiscovery(opts: DiscoveryOptions): Promise<DiscoveryHit | null> {
  const {
    send, probes,
    probeSets = SESSION_PROBES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    gapMs = DEFAULT_GAP_MS,
    isCancelled,
    onProgress,
  } = opts;

  const total = probes.length;
  if (!total) return null;

  for (let i = 0; i < total; i++) {
    if (isCancelled?.()) return null;
    const probe = probes[i];
    onProgress?.(i, total, probe);

    for (const probeBytes of probeSets) {
      if (isCancelled?.()) return null;

      const res = await isoTpRequest({
        send,
        sendId: probe.sendId,
        recvIds: probe.recvIds,
        data: probeBytes,
        timeoutMs,
        waitForPending: false,  // a "busy" reply still proves the ECU is there
        accept: makeAccept(probeBytes),
      });

      if (!res) {
        if (gapMs > 0) await delay(gapMs);
        continue;               // silent for this subfunction — try the next
      }

      const accepted = res.payload[0] === ((probeBytes[0] + 0x40) & 0xff);
      if (!accepted && res.payload[0] === 0x7f) {
        // Refused this subfunction; another may still be accepted.
        const isLastProbe = probeBytes === probeSets[probeSets.length - 1];
        if (!isLastProbe) { if (gapMs > 0) await delay(gapMs); continue; }
      }

      onProgress?.(i + 1, total, probe);
      return {
        sendId: probe.sendId,
        recvId: res.fromId,
        payload: res.payload,
        tier: probe.tier,
        label: probe.label,
        subFunction: probeBytes[1],
        sessionOpen: accepted,
        nrc: accepted ? undefined : res.payload[2],
      };
    }
  }

  onProgress?.(total, total, probes[total - 1]);
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
   DEEP PROFILE — talk to a known address and enumerate what the ECU exposes,
   without any prior database. Same technique set as CaringCaribou / SavvyCAN:
     sessions  →  10 xx sweep, classify 50 / 7F-12 / 7F-22
     services  →  poke each diagnostic SID, classify by NRC
     DTCs      →  19 02 FF (UDS) / 18 02 FF 00 (KWP) / 17 FF 00, parse raw
     DIDs      →  22 xxxx sweep over bounded ranges, keep the 62 answers
     routines  →  31 03 xxxx sweep — requestRoutineResults ONLY (read-only)
     security  →  27 01/03/… seed probe (never sends a key)
   Nothing here starts a routine, writes, resets or clears. `31 01`/`2E`/`14`/
   `11`/`27 02` are deliberately not swept.
   ══════════════════════════════════════════════════════════════════════════ */

export interface DeepOptions {
  send: SendFn;
  sendId: number;
  recvIds: number[];
  timeoutMs?: number;
  gapMs?: number;
  isCancelled?: () => boolean;
  /** (done, total, label) — fired per probe so a UI can show a bar. */
  onProgress?: (done: number, total: number, label: string) => void;
}

const D_TIMEOUT = 90;
const D_GAP = 8;

/** One request; returns the assembled payload, or null on silence. */
async function ask(
  o: DeepOptions, data: number[], timeoutMs = o.timeoutMs ?? D_TIMEOUT, waitForPending = false,
): Promise<number[] | null> {
  const res = await isoTpRequest({
    send: o.send, sendId: o.sendId, recvIds: o.recvIds, data,
    timeoutMs, waitForPending, accept: makeAccept(data),
  });
  if (o.gapMs ?? D_GAP) await delay(o.gapMs ?? D_GAP);
  return res?.payload ?? null;
}

const isPos = (p: number[] | null, sid: number) => !!p && p[0] === ((sid + 0x40) & 0xff);
const isNeg = (p: number[] | null, sid: number) => !!p && p[0] === 0x7f && p[1] === sid;
const nrcOf = (p: number[] | null) => (p && p[0] === 0x7f ? p[2] : undefined);

/* ── sessions ─────────────────────────────────────────────────────────── */
export interface SessionInfo {
  sub: number;
  /** ECU answered 50 xx — session can be entered. */
  open: boolean;
  /** present but refused now (7F 10 22 / 7F 10 33). */
  blocked: boolean;
  nrc?: number;
  /** P2 / P2* server timing (ms) from a UDS 50 xx answer. */
  p2Ms?: number;
  p2StarMs?: number;
}

export const SESSION_SUBS = [
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
  0x10, 0x20, 0x40, 0x50, 0x60, 0x7e,
  0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x89, 0x8a, 0x8b,
  0xc0, 0xc1, 0xc2, 0xc3, 0xc8,
];

export async function enumerateSessions(o: DeepOptions, subs = SESSION_SUBS): Promise<SessionInfo[]> {
  const found: SessionInfo[] = [];
  for (let i = 0; i < subs.length; i++) {
    if (o.isCancelled?.()) break;
    const sub = subs[i];
    o.onProgress?.(i, subs.length, `session 10 ${hx2(sub)}`);
    const p = await ask(o, [0x10, sub]);
    if (isPos(p, 0x10)) {
      const info: SessionInfo = { sub, open: true, blocked: false };
      if (p && p.length >= 6) {
        info.p2Ms = (p[2] << 8) | p[3];
        info.p2StarMs = ((p[4] << 8) | p[5]) * 10;
      }
      found.push(info);
      // leave the ECU in default session between probes
      if (sub !== 0x01) await ask(o, [0x10, 0x01]);
    } else if (isNeg(p, 0x10)) {
      const nrc = nrcOf(p)!;
      if (nrc === 0x22 || nrc === 0x33 || nrc === 0x7e || nrc === 0x7f)
        found.push({ sub, open: false, blocked: true, nrc });
      // 0x12 subFunctionNotSupported → session genuinely absent, skip
    }
  }
  return found;
}

/* ── services ─────────────────────────────────────────────────────────── */
export const SID_NAMES: Record<number, string> = {
  0x10: 'DiagnosticSessionControl', 0x11: 'ECUReset', 0x14: 'ClearDiagnosticInformation',
  0x17: 'ReadStatusOfDTC (KWP)', 0x18: 'ReadDTCByStatus (KWP)', 0x19: 'ReadDTCInformation',
  0x1a: 'ReadECUIdentification (KWP)', 0x21: 'ReadDataByLocalId (KWP)', 0x22: 'ReadDataByIdentifier',
  0x23: 'ReadMemoryByAddress', 0x24: 'ReadScalingByIdentifier', 0x27: 'SecurityAccess',
  0x28: 'CommunicationControl', 0x2a: 'ReadDataByPeriodicId', 0x2c: 'DynamicallyDefineDataId',
  0x2e: 'WriteDataByIdentifier', 0x2f: 'InputOutputControlById', 0x30: 'InputOutputControlByLocalId (KWP)',
  0x31: 'RoutineControl', 0x34: 'RequestDownload', 0x35: 'RequestUpload', 0x36: 'TransferData',
  0x37: 'RequestTransferExit', 0x38: 'RequestFileTransfer', 0x3b: 'WriteDataByLocalId (KWP)',
  0x3d: 'WriteMemoryByAddress', 0x3e: 'TesterPresent', 0x83: 'AccessTimingParameter',
  0x84: 'SecuredDataTransmission', 0x85: 'ControlDTCSetting', 0x86: 'ResponseOnEvent',
  0x87: 'LinkControl',
};
/** Diagnostic SIDs worth probing — reading/enumeration first, never a writer. */
export const PROBE_SIDS = [
  0x10, 0x11, 0x14, 0x17, 0x18, 0x19, 0x1a, 0x21, 0x22, 0x23, 0x24, 0x27, 0x28,
  0x2a, 0x2c, 0x2f, 0x30, 0x31, 0x34, 0x35, 0x3b, 0x3e, 0x83, 0x85, 0x86, 0x87,
];

export interface ServiceInfo { sid: number; name: string; supported: boolean; worked: boolean; nrc?: number; }

export async function enumerateServices(o: DeepOptions, sids = PROBE_SIDS): Promise<ServiceInfo[]> {
  const out: ServiceInfo[] = [];
  for (let i = 0; i < sids.length; i++) {
    if (o.isCancelled?.()) break;
    const sid = sids[i];
    o.onProgress?.(i, sids.length, `service ${hx2(sid)} ${SID_NAMES[sid] ?? ''}`);
    // a bare SID: an unsupported service → 7F sid 11; a supported one → 7F sid
    // 12/13/22/… (we sent it wrong) or, harmlessly, a positive (10/3E/19…).
    const p = await ask(o, [sid]);
    if (!p) continue;
    const nrc = nrcOf(p);
    if (isPos(p, sid)) { out.push({ sid, name: SID_NAMES[sid] ?? `SID ${hx2(sid)}`, supported: true, worked: true }); continue; }
    if (nrc === undefined) continue;
    const absent = nrc === 0x11; // serviceNotSupported
    out.push({ sid, name: SID_NAMES[sid] ?? `SID ${hx2(sid)}`, supported: !absent, worked: false, nrc });
  }
  return out;
}

/* ── DTCs ─────────────────────────────────────────────────────────────── */
export interface RawDtc {
  bytes: [number, number, number];
  status: number;
  code: string;   // SAE best-effort, e.g. "C0044"
  text: string;   // generic decode + failure-type byte
  raw: number;    // matches EcuDtc.dtc_raw
}
export interface DtcReadResult { service: number; request: string; dtcs: RawDtc[]; }

function parseDtc19(payload: number[]): RawDtc[] {
  // 59 02 <availabilityMask> then N × { DTC[3], status }
  const out: RawDtc[] = [];
  for (let i = 3; i + 3 < payload.length; i += 4) {
    const b1 = payload[i], b2 = payload[i + 1], b3 = payload[i + 2], status = payload[i + 3];
    if ((b1 | b2 | b3) === 0) continue;
    const d = describeDtc(b1, b2, b3);
    out.push({ bytes: [b1, b2, b3], status, code: d.code, text: d.text, raw: d.raw });
  }
  return out;
}
function parseDtc18(payload: number[]): RawDtc[] {
  // 58 <count> then N × { DTC[2], statusByte } (KWP2000-on-CAN)
  const out: RawDtc[] = [];
  const n = payload[1] ?? 0;
  for (let k = 0; k < n; k++) {
    const b1 = payload[2 + k * 3], b2 = payload[3 + k * 3], st = payload[4 + k * 3];
    if (b1 === undefined || b2 === undefined) break;
    if ((b1 | b2) === 0) continue;
    const d = describeDtc(b1, b2);
    out.push({ bytes: [b1, b2, 0], status: st ?? 0, code: d.code, text: d.text, raw: d.raw });
  }
  return out;
}

export async function readAllDtcs(o: DeepOptions): Promise<DtcReadResult | null> {
  const tries: [number[], string, (p: number[]) => RawDtc[]][] = [
    [[0x19, 0x02, 0xff], '19 02 FF', parseDtc19],
    [[0x19, 0x02, 0x08], '19 02 08', parseDtc19],
    [[0x19, 0x0a],       '19 0A',    parseDtc19],
    [[0x18, 0x02, 0xff, 0x00], '18 02 FF 00', parseDtc18],
    [[0x18, 0x00, 0xff, 0x00], '18 00 FF 00', parseDtc18],
    [[0x17, 0xff, 0x00], '17 FF 00', parseDtc18],
  ];
  for (const [data, request, parse] of tries) {
    if (o.isCancelled?.()) return null;
    o.onProgress?.(0, 1, `read DTCs (${request})`);
    const p = await ask(o, data, (o.timeoutMs ?? D_TIMEOUT) * 6, true);
    if (!p) continue;
    if (p[0] === ((data[0] + 0x40) & 0xff)) return { service: data[0], request, dtcs: parse(p) };
  }
  return null;
}

/* ── DID sweep (22 xxxx) ──────────────────────────────────────────────── */
export interface DidInfo { did: number; bytes: number[]; ascii: string | null; }
export const DID_RANGES: [number, number][] = [
  [0xf180, 0xf1ff], // ISO standard identification block
  [0x0200, 0x02ff], // common OEM live-data window (Renault/Bosch ABS)
  [0x1000, 0x105f], // OEM state/measured values
  [0x2000, 0x20ff], // OEM measured values (Ford/ATE, VAG UDS)
];

function asciiOf(bytes: number[]): string | null {
  if (!bytes.length) return null;
  const printable = bytes.filter(b => b >= 0x20 && b < 0x7f).length;
  if (printable / bytes.length < 0.7) return null;
  return bytes.map(b => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·')).join('');
}

export async function sweepDids(o: DeepOptions, ranges = DID_RANGES, cap = 900): Promise<DidInfo[]> {
  const out: DidInfo[] = [];
  let done = 0;
  const total = Math.min(cap, ranges.reduce((s, [a, b]) => s + (b - a + 1), 0));
  for (const [from, to] of ranges) {
    for (let did = from; did <= to && done < cap; did++, done++) {
      if (o.isCancelled?.()) return out;
      o.onProgress?.(done, total, `DID 22 ${did.toString(16).toUpperCase().padStart(4, '0')}`);
      const p = await ask(o, [0x22, (did >> 8) & 0xff, did & 0xff], (o.timeoutMs ?? D_TIMEOUT), true);
      if (isPos(p, 0x22) && p) {
        const data = p.slice(3);
        out.push({ did, bytes: data, ascii: asciiOf(data) });
      }
    }
  }
  return out;
}

/* ── routine sweep (31 03 xxxx — requestRoutineResults, READ-ONLY) ─────── */
export interface RoutineInfo { rid: number; status: number | null; resultBytes: number[]; }
export const ROUTINE_RANGES: [number, number][] = [
  [0x0000, 0x00ff], // ISO/legacy + Renault CLIP short IDs (0002 = pressure offset, …)
  [0x0200, 0x02ff], // Bosch/ATE bleed & calibration blocks
  [0x0300, 0x03ff],
  [0xdf00, 0xdfff], // OEM
  [0xff00, 0xff03], // ISO reserved (erase memory / check prog dep) — results only
];

export async function sweepRoutines(o: DeepOptions, ranges = ROUTINE_RANGES, cap = 700): Promise<RoutineInfo[]> {
  const out: RoutineInfo[] = [];
  let done = 0;
  const total = Math.min(cap, ranges.reduce((s, [a, b]) => s + (b - a + 1), 0));
  for (const [from, to] of ranges) {
    for (let rid = from; rid <= to && done < cap; rid++, done++) {
      if (o.isCancelled?.()) return out;
      o.onProgress?.(done, total, `routine 31 03 ${rid.toString(16).toUpperCase().padStart(4, '0')}`);
      // sub-function 0x03 = requestRoutineResults only. NEVER 0x01 (start).
      const p = await ask(o, [0x31, 0x03, (rid >> 8) & 0xff, rid & 0xff], (o.timeoutMs ?? D_TIMEOUT), true);
      if (isPos(p, 0x31) && p) {
        out.push({ rid, status: p[4] ?? null, resultBytes: p.slice(5) });
      } else if (isNeg(p, 0x31) && nrcOf(p) === 0x24) {
        // requestSequenceError → the routine EXISTS, it just wants 31 01 first
        out.push({ rid, status: null, resultBytes: [] });
      }
    }
  }
  return out;
}

/* ── security-access seed probe (never sends a key) ───────────────────── */
export interface SecurityInfo { level: number; seed: number[]; alreadyUnlocked: boolean; }
export async function probeSecurity(o: DeepOptions, levels = [0x01, 0x03, 0x05, 0x07, 0x09, 0x0b]): Promise<SecurityInfo[]> {
  const out: SecurityInfo[] = [];
  for (const lvl of levels) {
    if (o.isCancelled?.()) break;
    o.onProgress?.(0, 1, `security 27 ${hx2(lvl)}`);
    const p = await ask(o, [0x27, lvl], (o.timeoutMs ?? D_TIMEOUT) * 3, true);
    if (isPos(p, 0x27) && p) {
      const seed = p.slice(2);
      out.push({ level: lvl, seed, alreadyUnlocked: seed.length > 0 && seed.every(b => b === 0) });
    }
  }
  return out;
}

/* ── orchestrator ─────────────────────────────────────────────────────── */
export interface EcuProfile {
  sendId: number;
  recvId: number;
  protocol: 'UDS' | 'KWP2000';
  sessions: SessionInfo[];
  services: ServiceInfo[];
  dtcRead: DtcReadResult | null;
  dids: DidInfo[];
  routines: RoutineInfo[];
  security: SecurityInfo[];
  /** best open session that was actually entered for the service/DID/routine passes. */
  workingSession: number | null;
}

export interface ProfileOptions extends DeepOptions {
  /** which passes to run (all default true except the two slow sweeps). */
  doSessions?: boolean;
  doServices?: boolean;
  doDtcs?: boolean;
  doSecurity?: boolean;
  doDidSweep?: boolean;      // slow (~1 min), opt-in
  doRoutineSweep?: boolean;  // slow, opt-in — read-only but still poke the ECU a lot
  didRanges?: [number, number][];
  routineRanges?: [number, number][];
}

/** Prefer a richer session (extended / manufacturer) over default. */
function pickSession(sessions: SessionInfo[]): number | null {
  const open = sessions.filter(s => s.open).map(s => s.sub);
  if (!open.length) return null;
  for (const pref of [SESSION_MANUFACTURER, SESSION_EXTENDED, ...open]) if (open.includes(pref)) return pref;
  return open[0];
}

export async function profileEcu(o: ProfileOptions): Promise<EcuProfile> {
  const {
    doSessions = true, doServices = true, doDtcs = true, doSecurity = true,
    doDidSweep = false, doRoutineSweep = false, didRanges, routineRanges,
  } = o;

  const sessions = doSessions ? await enumerateSessions(o) : [];
  const workingSession = pickSession(sessions);
  if (workingSession && workingSession !== SESSION_DEFAULT) await ask(o, [0x10, workingSession]);

  const services = (doServices && !o.isCancelled?.()) ? await enumerateServices(o) : [];
  const dtcRead  = (doDtcs && !o.isCancelled?.()) ? await readAllDtcs(o) : null;
  const security = (doSecurity && !o.isCancelled?.()) ? await probeSecurity(o) : [];
  const dids     = (doDidSweep && !o.isCancelled?.()) ? await sweepDids(o, didRanges) : [];
  const routines = (doRoutineSweep && !o.isCancelled?.()) ? await sweepRoutines(o, routineRanges) : [];

  // probe protocol from a fresh 10 03 (or whatever opened) answer
  const probeResp = await isoTpRequest({
    send: o.send, sendId: o.sendId, recvIds: o.recvIds, data: [0x3e, 0x00],
    timeoutMs: o.timeoutMs ?? D_TIMEOUT, waitForPending: false, accept: makeAccept([0x3e, 0x00]),
  });
  const protocol = probeResp && probeResp.payload.length >= 6 ? 'UDS' : 'KWP2000';

  return {
    sendId: o.sendId, recvId: o.recvIds[0], protocol,
    sessions, services, dtcRead, dids, routines, security, workingSession,
  };
}

const hx2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
