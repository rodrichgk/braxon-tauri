/* ── ISO-TP (ISO 15765-2) request/response over the Nano CAN bridge ───
   The board takes `CANTx : <id_hex> <8 bytes hex>` and prints every frame it
   receives as `<id_dec> <dlc> <byte0_dec> …`. This module owns the one piece
   of protocol handling both the ECU identification and the discovery sweep
   need: send a short request, reassemble single/first/consecutive frames,
   answer the ECU's first frame with flow control. ─────────────────────── */

import clientSerial, { type SerialEvent } from '@/lib/clientSerial';
import { toHex3 } from '@/lib/ecu';

export type SendFn = (msg: string) => Promise<boolean | void>;

/** Continue-to-send, block size 0, no separation time. */
const FLOW_CONTROL = [0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

/** Negative response "response pending" — the ECU is busy, not absent. */
const NRC_RESPONSE_PENDING = 0x78;

export interface IsoTpResponse {
  /** Assembled service response, without the ISO-TP length prefix. */
  payload: number[];
  /** CAN ID the response actually came from. */
  fromId: number;
  /** True when the ECU only answered `7F <sid> 78` before the deadline. */
  pending: boolean;
}

export interface IsoTpRequestOptions {
  send: SendFn;
  /** Tester → ECU CAN ID. */
  sendId: number;
  /** ECU → tester CAN IDs to accept a response on. */
  recvIds: number[];
  /** Service bytes, max 7 (single frame requests only). */
  data: number[];
  timeoutMs?: number;
  /**
   * `7F <sid> 78` means "still working". Default true: keep waiting for the
   * real answer. The discovery sweep passes false — any reply at all proves
   * an ECU is listening on that address, which is all it needs to know.
   */
  waitForPending?: boolean;
  /**
   * Optional filter on the assembled payload. Frames that fail it are ignored
   * and listening continues until the timeout — used to tell a real answer to
   * our request apart from unrelated periodic traffic on the same CAN ID.
   */
  accept?: (payload: number[], fromId: number) => boolean;
}

/** Pad `bytes` to 8 and format as a CANTx line. */
export function buildFrame(canId: number, bytes: number[]): string {
  const padded = [...bytes.slice(0, 8)];
  while (padded.length < 8) padded.push(0x00);
  const hex = padded.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  return `CANTx : ${toHex3(canId)} ${hex}\n`;
}

/** ISO-TP single frame: length nibble, then up to 7 service bytes. */
export function buildSingleFrame(canId: number, data: number[]): string {
  return buildFrame(canId, [data.length, ...data]);
}

function isResponsePending(payload: number[]): boolean {
  return payload.length >= 3 && payload[0] === 0x7f && payload[2] === NRC_RESPONSE_PENDING;
}

/** Parse a `<id_dec> <dlc> <b0_dec> …` line from the Nano. */
function parseCanLine(line: string): { id: number; bytes: number[] } | null {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const id  = parseInt(parts[0], 10);
  const dlc = parseInt(parts[1], 10);
  if (isNaN(id) || isNaN(dlc)) return null;
  const bytes: number[] = [];
  for (let i = 2; i < 2 + dlc && i < parts.length; i++) {
    const b = parseInt(parts[i], 10);
    if (!isNaN(b)) bytes.push(b);
  }
  return bytes.length ? { id, bytes } : null;
}

/**
 * Send one ISO-TP request and resolve with the assembled response, or null if
 * nothing valid arrived before `timeoutMs`.
 */
export function isoTpRequest(opts: IsoTpRequestOptions): Promise<IsoTpResponse | null> {
  const {
    send, sendId, recvIds, data,
    timeoutMs = 2000,
    waitForPending = true,
    accept,
  } = opts;

  return new Promise<IsoTpResponse | null>(resolve => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let buf: number[] = [];
    let totalLen = 0;
    let nextSeq = 1;
    let multiFrameId = -1;
    let sawPending = false;

    const finish = (result: IsoTpResponse | null) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      clientSerial.removeEventListener(listener);
      resolve(result);
    };

    const listener = (event: SerialEvent) => {
      if (done || event.type !== 'data' || !event.data) return;
      const frame = parseCanLine(event.data);
      if (!frame || !recvIds.includes(frame.id)) return;

      const { id, bytes } = frame;
      const isoType = (bytes[0] >> 4) & 0x0f;

      if (isoType === 0) {
        const len = bytes[0] & 0x0f;
        const payload = bytes.slice(1, 1 + len);
        if (waitForPending && isResponsePending(payload)) {
          sawPending = true;   // ECU asked for more time — keep listening
          return;
        }
        if (accept && !accept(payload, id)) return;
        finish({ payload, fromId: id, pending: sawPending || isResponsePending(payload) });
      } else if (isoType === 1) {
        totalLen = ((bytes[0] & 0x0f) << 8) | bytes[1];
        buf = bytes.slice(2);
        nextSeq = 1;
        multiFrameId = id;
        send(buildFrame(sendId, FLOW_CONTROL));
      } else if (isoType === 2 && id === multiFrameId) {
        const seq = bytes[0] & 0x0f;
        if (seq !== nextSeq) return;         // out of order — drop, wait for retry
        buf.push(...bytes.slice(1));
        nextSeq = (seq + 1) % 16;
        if (buf.length >= totalLen) {
          const payload = buf.slice(0, totalLen);
          multiFrameId = -1;
          if (accept && !accept(payload, id)) return;
          finish({ payload, fromId: id, pending: sawPending });
        }
      }
    };

    clientSerial.addEventListener(listener);
    timer = setTimeout(() => finish(null), timeoutMs);

    Promise.resolve(send(buildSingleFrame(sendId, data)))
      .then(ok => { if (ok === false) finish(null); })
      .catch(() => finish(null));
  });
}
