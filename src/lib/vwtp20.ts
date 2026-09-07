/* ── VW TP2.0 transport (the pre-UDS VAG diagnostic channel) ───────────────
   Renault/Bosch ABS talk KWP/UDS directly over ISO-TP (see lib/isotp.ts).
   Pre-2010 VW/Audi/Seat/Skoda modules (MK25/MK60/MK60EC1 ABS, and every other
   `0x0N` address) instead sit behind VW's own transport, "TP2.0":

     1. Channel setup   — broadcast a request to CAN 0x200 asking for a channel
                          to a logical address (ABS = 0x03). The ECU answers on
                          0x200+addr with the two CAN IDs to use from here on.
     2. Channel params  — exchange block size + timing (A0/A1 frames).
     3. Data transfer   — KWP2000 messages, each framed as
                          first:  [op|seq] [lenHi] [lenLo] payload…
                          cont.:  [op|seq] payload…
                          op 1/2 = data (2 also = "ACK me"), B = ACK(next seq),
                          A3 = channel test / keep-alive → A1 reply.
                          Message ends at the declared length (mask 0x0FFF).
     4. Keep-alive      — send A3 every ~1 s or the channel drops.

   Decoded from a VCDS↔MK60EC1 capture — see reference-data/vag-mk60ec1-tp20.md.
   This module owns steps 1-4 and exposes a persistent channel with a
   one-request-at-a-time `request()` that returns the reassembled KWP payload. */

import clientSerial, { type SerialEvent } from '@/lib/clientSerial';
import { type SendFn } from '@/lib/isotp';
import { toHex3 } from '@/lib/ecu';

export type { SendFn };

/**
 * TP2.0 frame line — the ECU's channel-setup/param handlers are DLC-sensitive
 * (VCDS sends the setup as a 7-byte frame), so unlike ISO-TP we do NOT pad to 8.
 * The board / Kvaser relay sends exactly the bytes on the line as the CAN DLC.
 */
function tp20Frame(canId: number, bytes: number[]): string {
  const hex = bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  return `CANTx : ${toHex3(canId)} ${hex}\n`;
}

const SETUP_ID = 0x200;
const SETUP_OPCODE = 0xc0;
const KEEPALIVE_MS = 1000;
const OP_ACK = 0xb; // high nibble: ACK, low nibble = next expected seq
const OP_TEST = 0xa3; // channel test (keep-alive)

export interface VwTp20Response {
  /** Reassembled KWP2000 payload (SID + data), no TP2.0 framing. */
  payload: number[];
  /** ECU sent `7F <sid> 78` (responsePending) at least once before answering. */
  pending: boolean;
}

export interface VwTp20Channel {
  readonly open: boolean;
  /** CAN ID we send requests on. */
  readonly txId: number;
  /** CAN ID the ECU answers on. */
  readonly rxId: number;
  /** Send one KWP request, resolve with the reassembled response (or null on timeout). */
  request(data: number[], opts?: { timeoutMs?: number }): Promise<VwTp20Response | null>;
  close(): void;
}

/** What `openVwTp20Channel` saw while trying to bring the channel up. */
export interface VwTp20OpenResult {
  channel: VwTp20Channel | null;
  /** Human trace of each step — always populated, shown by the UI on failure. */
  log: string[];
}

const hb = (b: number[]) => b.map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');

function parseCanLine(line: string): { id: number; bytes: number[] } | null {
  const p = line.trim().split(/\s+/);
  if (p.length < 3) return null;
  const id = parseInt(p[0], 10);
  const dlc = parseInt(p[1], 10);
  if (isNaN(id) || isNaN(dlc)) return null;
  const bytes: number[] = [];
  for (let i = 2; i < 2 + dlc && i < p.length; i++) {
    const b = parseInt(p[i], 10);
    if (!isNaN(b)) bytes.push(b);
  }
  return { id, bytes };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Open a TP2.0 channel to `logicalAddress` (0x03 = ABS/Brakes). Resolves with a
 * live channel or null if setup/params didn't complete in time.
 */
export async function openVwTp20Channel(opts: {
  send: SendFn;
  logicalAddress?: number;
  setupTimeoutMs?: number;
}): Promise<VwTp20OpenResult> {
  const { send, logicalAddress = 0x03, setupTimeoutMs = 1500 } = opts;
  const log: string[] = [];

  // ── 1. channel setup ──────────────────────────────────────────────────
  // request to 0x200: <addr> C0 <ourRxLo> <ourRxHi|0x10=don't-care> 00 <ourTxLo> <ourTxHi>
  const setupReq = [logicalAddress, SETUP_OPCODE, 0x00, 0x10, 0x00, 0x03, 0x01];
  const setupRespId = SETUP_ID + logicalAddress;
  log.push(`TX 0x200  ${hb(setupReq)}  (setup → addr 0x${logicalAddress.toString(16)})`);

  const setup = await waitForFrame(setupRespId, setupTimeoutMs, (b) => b[1] === 0xd0, () =>
    send(tp20Frame(SETUP_ID, setupReq)),
  );
  if (!setup) {
    log.push(`… no 0xD0 setup reply on 0x${setupRespId.toString(16)} within ${setupTimeoutMs} ms`);
    return { channel: null, log };
  }
  log.push(`RX 0x${setupRespId.toString(16)}  ${hb(setup)}  (setup OK)`);
  // response: 00 D0 <rxLo> <rxHi> <txLo> <txHi> <appType>
  const rxId = ((setup[3] << 8) | setup[2]) & 0x1fff;
  const txId = ((setup[5] << 8) | setup[4]) & 0x1fff;
  log.push(`→ rxId 0x${rxId.toString(16)} (listen), txId 0x${txId.toString(16)} (send)`);
  if (!rxId || !txId) {
    log.push('… setup reply gave a zero CAN id — byte order may be wrong for this ECU');
    return { channel: null, log };
  }

  // ── 2. channel parameters (block size + timing) ──────────────────────
  const paramReq = [0xa0, 0x0f, 0x8a, 0xff, 0x4a, 0xff];
  log.push(`TX 0x${txId.toString(16)}  ${hb(paramReq)}  (params)`);
  const paramResp = await waitForFrame(rxId, setupTimeoutMs, (b) => (b[0] & 0xf0) === 0xa0, () =>
    send(tp20Frame(txId, paramReq)),
  );
  if (!paramResp) {
    log.push(`… no A1 param reply on 0x${rxId.toString(16)} — channel half-open`);
    return { channel: null, log };
  }
  log.push(`RX 0x${rxId.toString(16)}  ${hb(paramResp)}  (params OK — channel up)`);
  return { channel: makeChannel(send, txId, rxId), log };
}

/** One-shot: install a listener on `id`, run `trigger`, resolve with the first
 *  frame passing `match` (or null at `timeoutMs`). */
function waitForFrame(
  id: number,
  timeoutMs: number,
  match: (bytes: number[]) => boolean,
  trigger: () => unknown,
): Promise<number[] | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: number[] | null) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      clientSerial.removeEventListener(listener);
      resolve(v);
    };
    const listener = (e: SerialEvent) => {
      if (done || e.type !== 'data' || !e.data) return;
      const f = parseCanLine(e.data);
      if (!f || f.id !== id || !match(f.bytes)) return;
      finish(f.bytes);
    };
    clientSerial.addEventListener(listener);
    const t = setTimeout(() => finish(null), timeoutMs);
    Promise.resolve(trigger()).catch(() => finish(null));
  });
}

function makeChannel(send: SendFn, txId: number, rxId: number): VwTp20Channel {
  let open = true;
  let txSeq = 0; // our running frame sequence
  let busy = false; // one request at a time
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const sendFrame = (bytes: number[]) => send(tp20Frame(txId, bytes));
  const PARAM_ECHO = [0x0f, 0x8a, 0xff, 0x4a, 0xff];

  // persistent RX listener state for the in-flight request
  let onFrame: ((bytes: number[]) => void) | null = null;
  const listener = (e: SerialEvent) => {
    if (e.type !== 'data' || !e.data) return;
    const f = parseCanLine(e.data);
    if (!f || f.id !== rxId) return;
    // TP2.0 keep-alive is mutual: either end may send A3, the other answers A1.
    if (f.bytes[0] === OP_TEST) {
      void sendFrame([0xa1, ...PARAM_ECHO]);
      return;
    }
    onFrame?.(f.bytes);
  };
  clientSerial.addEventListener(listener);
  const nextSeq = () => {
    const s = txSeq;
    txSeq = (txSeq + 1) & 0x0f;
    return s;
  };

  keepAlive = setInterval(() => {
    if (open && !busy) sendFrame([OP_TEST]);
  }, KEEPALIVE_MS);

  const close = () => {
    if (!open) return;
    open = false;
    if (keepAlive) clearInterval(keepAlive);
    clientSerial.removeEventListener(listener);
    // A8 = disconnect (best-effort)
    Promise.resolve(sendFrame([0xa8])).catch(() => {});
  };

  const request = (data: number[], o: { timeoutMs?: number } = {}) =>
    new Promise<VwTp20Response | null>((resolve) => {
      const timeoutMs = o.timeoutMs ?? 2000;
      if (!open || busy) return resolve(null);
      busy = true;

      let done = false;
      let buf: number[] = [];
      let need = -1;
      let pending = false;
      let ackTimer: ReturnType<typeof setTimeout> | null = null;

      const finish = (v: VwTp20Response | null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (ackTimer) clearTimeout(ackTimer);
        onFrame = null;
        busy = false;
        resolve(v);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);

      onFrame = (bytes: number[]) => {
        const op = bytes[0] >> 4;
        const seq = bytes[0] & 0x0f;
        if (op === OP_ACK || op === 0xa || op > 3) return; // ACK / channel-test / non-data

        let chunk: number[];
        if (need < 0) {
          need = ((bytes[1] << 8) | bytes[2]) & 0x0fff;
          chunk = bytes.slice(3);
          buf = [];
        } else {
          chunk = bytes.slice(1);
        }
        buf.push(...chunk);

        // op 1 = last frame of the ECU's message; op 2 = more follow. Length is
        // the primary end-of-message signal; op 1 is the belt-and-suspenders.
        if (!(need >= 0 && (buf.length >= need || op === 1))) return;

        const payload = buf.slice(0, need > 0 ? need : buf.length);
        sendFrame([(OP_ACK << 4) | ((seq + 1) & 0x0f)]); // ACK the whole message
        if (payload[0] === 0x7f && payload[2] === 0x78) {
          pending = true; // responsePending — keep listening for the real answer
          buf = [];
          need = -1;
          return;
        }
        finish({ payload, pending });
      };

      // ── send the request, framed. op 1 = last frame, op 2 = more follow
      //    (matches VCDS: single-frame messages go out with nibble 1). ──────
      void (async () => {
        const first = data.slice(0, 5);
        const rest = data.slice(5);
        const oneFrame = rest.length === 0;
        await sendFrame([((oneFrame ? 1 : 2) << 4) | nextSeq(), (data.length >> 8) & 0x0f, data.length & 0xff, ...first]);
        let off = 0;
        while (off < rest.length) {
          await sleep(8);
          const slice = rest.slice(off, off + 7);
          off += 7;
          const last = off >= rest.length;
          await sendFrame([((last ? 1 : 2) << 4) | nextSeq(), ...slice]);
        }
      })().catch(() => finish(null));
    });

  return {
    get open() {
      return open;
    },
    txId,
    rxId,
    request,
    close,
  };
}
