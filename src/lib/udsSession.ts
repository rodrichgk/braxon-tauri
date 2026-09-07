/* ── Diagnostic session management ─────────────────────────────
   Some of these ECUs ignore diagnostic requests sent outside an open session
   — no negative response, just silence — which is why a correct address could
   still look dead. Captured from a working commercial-tool session on a
   Renault/Bosch MK61:

     10 C0            DiagnosticSessionControl, manufacturer session
     50 C0            ECU accepts
     3E 01  ~every 2s TesterPresent, for as long as the session is needed
     7E               ECU acks each one
     …                only now does 19 02 / 14 FF FF FF / 30 01 … get answered

   A Ford/ATE unit captured 2026-09-04 (10.0915-0108.3, 0x760→0x768) needed
   none of that — 22 D1 00 / 19 02 / 14 xx all answered before any session
   control frame appeared, and the one `10 xx` the Autel did send used
   subfunction 0x01 (default session), not 0xC0. So: open the session, hold
   it open with the 2 s cadence the Renault capture proved, and try more than
   one subfunction — which one an ECU accepts is manufacturer-specific. ───── */

import clientSerial, { type SerialEvent } from '@/lib/clientSerial';
import { buildSingleFrame, isoTpRequest, type SendFn } from '@/lib/isotp';

/** Manufacturer-specific session — confirmed working on Renault/Bosch MK61. */
export const SESSION_MANUFACTURER = 0xc0;
/** Standard extended session, for units that want ISO 14229 subfunctions. */
export const SESSION_EXTENDED = 0x03;
/** Standard default session — every UDS ECU must support this one (ISO
 *  14229 mandates it), so it's the safety net when the others are refused.
 *  Confirmed on a Ford/ATE unit that rejects/doesn't need 0xC0. */
export const SESSION_DEFAULT = 0x01;

/** Keep-alive cadence. 2 s is what the working capture used — not a guess. */
export const KEEP_ALIVE_MS = 2000;

const SID_SESSION_CONTROL = 0x10;
const SID_TESTER_PRESENT  = 0x3e;
const TESTER_PRESENT      = [SID_TESTER_PRESENT, 0x01];
const POSITIVE_TESTER_PRESENT = 0x7e;

/** Missed acks tolerated before a proven-acking ECU counts as gone. */
const LOST_AFTER_MISSED_ACKS = 3;

/**
 * Quiet period on the response ID that means "the ECU is mid-answer". A
 * TesterPresent landing between consecutive frames of a multi-frame DTC read
 * can make the ECU abandon the transfer, so the tick yields instead. Only ever
 * one tick in a row, so a chatty bus cannot starve the session to death.
 */
const BUSY_WINDOW_MS = 300;

export type SessionFailure =
  /** Nothing came back from session control itself — wrong address, no power,
      no bus. A different problem from "the request went unanswered". */
  | 'no_response'
  /** The ECU answered, but refused to enter the session (7F 10 <nrc>). */
  | 'rejected';

export interface UdsSessionHandle {
  sendId: number;
  recvId: number;
  /** Subfunction that was accepted (0xC0, 0x03, or 0x01). */
  subFunction: number;
  readonly closed: boolean;
  /** Stops the keep-alive and lets the session lapse. Idempotent. */
  close(): void;
}

export type OpenSessionResult =
  | { ok: true;  session: UdsSessionHandle; payload: number[]; subFunction: number }
  | { ok: false; reason: SessionFailure; nrc?: number; subFunction?: number };

export interface OpenSessionOptions {
  send: SendFn;
  sendId: number;
  recvId: number;
  /** Tried in order until one is accepted. Defaults to manufacturer → extended
   *  → default, so a Renault-style ECU still opens on its first probe (0xC0)
   *  and a Ford/ATE-style one that only accepts the standard default session
   *  still gets in, on the third. */
  subFunctions?: number[];
  timeoutMs?: number;
  keepAliveMs?: number;
  /** Fired when a previously acking ECU stops acking — session went away. */
  onLost?: () => void;
}

/**
 * Open a diagnostic session and keep it alive until the handle is closed.
 * Resolves with a distinct reason when session control itself gets no answer,
 * so callers can tell "cannot reach the ECU" from "ECU ignored my request".
 */
export async function openUdsSession(opts: OpenSessionOptions): Promise<OpenSessionResult> {
  const {
    send, sendId, recvId,
    subFunctions = [SESSION_MANUFACTURER, SESSION_EXTENDED, SESSION_DEFAULT],
    timeoutMs = 1200,
    keepAliveMs = KEEP_ALIVE_MS,
    onLost,
  } = opts;

  let failure: OpenSessionResult = { ok: false, reason: 'no_response' };

  for (const subFunction of subFunctions) {
    const res = await isoTpRequest({
      send,
      sendId,
      recvIds: [recvId],
      data: [SID_SESSION_CONTROL, subFunction],
      timeoutMs,
      // Only session control's own answer counts — an ack from a keep-alive
      // still winding down must not be read as a session opening.
      accept: (payload) =>
        payload[0] === ((SID_SESSION_CONTROL + 0x40) & 0xff) ||
        (payload[0] === 0x7f && payload[1] === SID_SESSION_CONTROL),
    });

    if (!res) {
      failure = { ok: false, reason: 'no_response', subFunction };
      continue;
    }
    if (res.payload[0] === ((SID_SESSION_CONTROL + 0x40) & 0xff)) {
      const session = holdSession({ send, sendId, recvId, subFunction, keepAliveMs, onLost });
      return { ok: true, session, payload: res.payload, subFunction };
    }
    if (res.payload[0] === 0x7f) {
      failure = { ok: false, reason: 'rejected', nrc: res.payload[2], subFunction };
      continue;   // a different subfunction may still be accepted
    }
    failure = { ok: false, reason: 'no_response', subFunction };
  }

  return failure;
}

interface HoldOptions {
  send: SendFn;
  sendId: number;
  recvId: number;
  subFunction: number;
  keepAliveMs: number;
  onLost?: () => void;
}

function holdSession(o: HoldOptions): UdsSessionHandle {
  const { send, sendId, recvId, subFunction, keepAliveMs, onLost } = o;

  let closed = false;
  let sawAck = false;
  let lastAckAt = Date.now();
  let lastRxAt = 0;
  let yieldedLastTick = false;

  // Ack watcher is deliberately passive — it never transmits. A keep-alive
  // built on isoTpRequest would answer a first frame with its own flow
  // control, and a DTC read running at the same time would then get two FCs
  // for one exchange.
  const listener = (event: SerialEvent) => {
    if (closed || event.type !== 'data' || !event.data) return;
    const parts = event.data.trim().split(/\s+/);
    if (parts.length < 3) return;
    if (parseInt(parts[0], 10) !== recvId) return;
    lastRxAt = Date.now();
    const b0 = parseInt(parts[2], 10);
    const b1 = parseInt(parts[3], 10);
    // Single frame carrying the positive TesterPresent response.
    if (((b0 >> 4) & 0x0f) === 0 && b1 === POSITIVE_TESTER_PRESENT) {
      sawAck = true;
      lastAckAt = Date.now();
    }
  };
  clientSerial.addEventListener(listener);

  const handle: UdsSessionHandle = {
    sendId,
    recvId,
    subFunction,
    get closed() { return closed; },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      clientSerial.removeEventListener(listener);
    },
  };

  const timer = setInterval(() => {
    if (closed) return;
    // Liveness is only judged for ECUs that have proven they ack, so a unit
    // that simply stays quiet is never wrongly reported as lost.
    if (sawAck && Date.now() - lastAckAt > keepAliveMs * LOST_AFTER_MISSED_ACKS) {
      handle.close();
      onLost?.();
      return;
    }
    if (!yieldedLastTick && Date.now() - lastRxAt < BUSY_WINDOW_MS) {
      yieldedLastTick = true;   // ECU is mid-answer — don't interrupt it
      return;
    }
    yieldedLastTick = false;
    send(buildSingleFrame(sendId, TESTER_PRESENT));
  }, keepAliveMs);

  return handle;
}
