import { describe, it, expect, vi, beforeEach } from "vitest";

const { addEventListener, removeEventListener, emit, listenerCount } = vi.hoisted(() => {
  const ls = new Set<(e: unknown) => void>();
  return {
    addEventListener: vi.fn((cb: (e: unknown) => void) => ls.add(cb)),
    removeEventListener: vi.fn((cb: (e: unknown) => void) => ls.delete(cb)),
    emit: (e: unknown) => [...ls].forEach((cb) => cb(e)),
    listenerCount: () => ls.size,
  };
});
vi.mock("@/lib/clientSerial", () => ({ default: { addEventListener, removeEventListener } }));

import { openVwTp20Channel } from "@/lib/vwtp20";

/** Serial line the board prints for one received CAN frame: `<id> <dlc> <b…>` (decimals). */
const line = (id: number, bytes: number[]) => `${id} ${bytes.length} ${bytes.join(" ")}`;
const dataEvent = (id: number, bytes: number[]) => emit({ type: "data", data: line(id, bytes) });

// setup reply on 0x203: 00 D0 <rxLo rxHi> <txLo txHi> <appType>  → rx 0x300, tx 0x740
const SETUP_OK = [0x00, 0xd0, 0x00, 0x03, 0x40, 0x07, 0x01];
const PARAM_OK = [0xa1, 0x0f, 0x8a, 0xff, 0x4a, 0xff];

beforeEach(() => {
  addEventListener.mockClear();
  removeEventListener.mockClear();
});

async function openChannel(send = vi.fn()) {
  const p = openVwTp20Channel({ send, setupTimeoutMs: 200 });
  // The setup waiter registers synchronously; answer it, then the param waiter.
  await Promise.resolve();
  dataEvent(0x203, SETUP_OK);
  await Promise.resolve();
  dataEvent(0x300, PARAM_OK);
  return { res: await p, send };
}

describe("openVwTp20Channel", () => {
  it("decodes the tx/rx CAN ids from the 0xD0 setup reply (little-endian, 13-bit)", async () => {
    const { res, send } = await openChannel();
    expect(res.channel).not.toBeNull();
    expect(res.channel!.rxId).toBe(0x300);
    expect(res.channel!.txId).toBe(0x740);
    expect(res.channel!.open).toBe(true);
    // channel setup frame goes out on 0x200, unpadded (DLC 7)
    expect(send.mock.calls[0][0]).toBe("CANTx : 200 03 C0 00 10 00 03 01\n");
    res.channel!.close();
  });

  it("keeps a human trace of every step", async () => {
    const { res } = await openChannel();
    expect(res.log.join("\n")).toMatch(/setup OK/);
    expect(res.log.join("\n")).toMatch(/params OK — channel up/);
    res.channel!.close();
  });

  it("returns a null channel and logs the miss when no 0xD0 reply arrives", async () => {
    const res = await openVwTp20Channel({ send: vi.fn(), setupTimeoutMs: 20 });
    expect(res.channel).toBeNull();
    expect(res.log.join("\n")).toMatch(/no 0xD0 setup reply/);
  });

  it("bails when the setup reply carries a zero CAN id", async () => {
    const send = vi.fn();
    const p = openVwTp20Channel({ send, setupTimeoutMs: 200 });
    await Promise.resolve();
    dataEvent(0x203, [0x00, 0xd0, 0x00, 0x00, 0x00, 0x00, 0x01]);
    const res = await p;
    expect(res.channel).toBeNull();
    expect(res.log.join("\n")).toMatch(/zero CAN id/);
  });
});

describe("VwTp20Channel.request", () => {
  it("frames a single-frame KWP request (op nibble 1) and reassembles the reply", async () => {
    const { res, send } = await openChannel();
    const ch = res.channel!;
    send.mockClear();

    const pending = ch.request([0x22, 0xf1, 0x87]);
    // first (and only) frame: [10|seq, lenHi, lenLo, 22 F1 87]
    expect(send.mock.calls[0][0]).toBe("CANTx : 740 10 00 03 22 F1 87\n");

    // ECU answers: op 1 (last), seq 0, len 3, payload 62 F1 87
    dataEvent(0x300, [0x10, 0x00, 0x03, 0x62, 0xf1, 0x87]);
    const reply = await pending;
    expect(reply).toEqual({ payload: [0x62, 0xf1, 0x87], pending: false });
    // a whole-message ACK (op B, next seq) went back
    expect(send.mock.calls.some((c) => String(c[0]).includes("CANTx : 740 B1"))).toBe(true);
    ch.close();
  });

  it("keeps listening through a 7F xx 78 responsePending, then resolves pending:true", async () => {
    const { res } = await openChannel();
    const ch = res.channel!;

    const pending = ch.request([0x22, 0xf1, 0x87]);
    dataEvent(0x300, [0x10, 0x00, 0x03, 0x7f, 0x22, 0x78]); // responsePending
    dataEvent(0x300, [0x10, 0x00, 0x03, 0x62, 0xf1, 0x87]); // the real answer
    const reply = await pending;
    expect(reply).toEqual({ payload: [0x62, 0xf1, 0x87], pending: true });
    ch.close();
  });

  it("rejects a second concurrent request", async () => {
    const { res } = await openChannel();
    const ch = res.channel!;
    const first = ch.request([0x22, 0xf1, 0x87]);
    expect(await ch.request([0x22, 0xf1, 0x88])).toBeNull(); // busy
    dataEvent(0x300, [0x10, 0x00, 0x03, 0x62, 0xf1, 0x87]);
    await first;
    ch.close();
  });
});

describe("VwTp20Channel.close", () => {
  it("marks the channel closed, drops its listener and sends A8 disconnect", async () => {
    const { res, send } = await openChannel();
    const ch = res.channel!;
    const before = listenerCount();
    send.mockClear();
    ch.close();
    expect(ch.open).toBe(false);
    expect(listenerCount()).toBe(before - 1);
    expect(send.mock.calls.some((c) => String(c[0]).includes("CANTx : 740 A8"))).toBe(true);
    ch.close(); // idempotent
  });
});
