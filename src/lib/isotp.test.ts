import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

import { buildFrame, buildSingleFrame, isoTpRequest } from "@/lib/isotp";

const rx = (id: number, bytes: number[]) =>
  emit({ type: "data", data: `${id} ${bytes.length} ${bytes.join(" ")}` });

const opts = (over: Partial<Parameters<typeof isoTpRequest>[0]> = {}) => ({
  send: vi.fn().mockResolvedValue(true),
  sendId: 0x740,
  recvIds: [0x760],
  data: [0x10, 0xc0],
  ...over,
});

beforeEach(() => {
  addEventListener.mockClear();
  removeEventListener.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("buildFrame / buildSingleFrame", () => {
  it("pads to 8 bytes, hex, uppercase, with the CANTx prefix", () => {
    expect(buildFrame(0x740, [0x02, 0x10, 0xc0])).toBe("CANTx : 740 02 10 C0 00 00 00 00 00\n");
  });

  it("truncates anything past 8 bytes", () => {
    expect(buildFrame(0x18, [1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe("CANTx : 018 01 02 03 04 05 06 07 08\n");
  });

  it("buildSingleFrame prepends the length nibble", () => {
    expect(buildSingleFrame(0x740, [0x10, 0xc0])).toBe("CANTx : 740 02 10 C0 00 00 00 00 00\n");
  });
});

describe("isoTpRequest — single frame", () => {
  it("sends the request and resolves the assembled payload", async () => {
    const o = opts();
    const p = isoTpRequest(o);
    expect(o.send).toHaveBeenCalledWith("CANTx : 740 02 10 C0 00 00 00 00 00\n");
    rx(0x760, [0x03, 0x50, 0xc0, 0x00, 0, 0, 0, 0]); // SF, len 3
    await expect(p).resolves.toEqual({ payload: [0x50, 0xc0, 0x00], fromId: 0x760, pending: false });
    expect(listenerCount()).toBe(0); // listener removed on finish
  });

  it("ignores frames from a CAN id that is not in recvIds", async () => {
    vi.useFakeTimers();
    const p = isoTpRequest(opts({ timeoutMs: 100 }));
    rx(0x123, [0x03, 0x50, 0xc0, 0x00]);
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBeNull();
  });

  it("applies the accept() filter, waiting past non-matching traffic", async () => {
    const p = isoTpRequest(opts({ accept: (payload) => payload[0] === 0x62 }));
    rx(0x760, [0x03, 0x50, 0xc0, 0x00]); // periodic noise on the same id — rejected
    rx(0x760, [0x02, 0x62, 0x11, 0x00]); // the real answer
    await expect(p).resolves.toMatchObject({ payload: [0x62, 0x11] });
  });
});

describe("isoTpRequest — response pending (7F xx 78)", () => {
  it("keeps waiting for the real answer by default and flags pending", async () => {
    const p = isoTpRequest(opts());
    rx(0x760, [0x03, 0x7f, 0x22, 0x78]); // responsePending
    rx(0x760, [0x03, 0x62, 0x22, 0x00]); // real answer
    await expect(p).resolves.toEqual({ payload: [0x62, 0x22, 0x00], fromId: 0x760, pending: true });
  });

  it("with waitForPending:false, returns on the first reply (discovery sweep)", async () => {
    const p = isoTpRequest(opts({ waitForPending: false }));
    rx(0x760, [0x03, 0x7f, 0x22, 0x78]);
    await expect(p).resolves.toEqual({ payload: [0x7f, 0x22, 0x78], fromId: 0x760, pending: true });
  });
});

describe("isoTpRequest — multi-frame", () => {
  it("answers the first frame with flow control and reassembles consecutive frames", async () => {
    const o = opts();
    const p = isoTpRequest(o);
    vi.mocked(o.send).mockClear();

    // FF: type 1, total length 10, first 6 payload bytes
    rx(0x760, [0x10, 0x0a, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
    expect(o.send).toHaveBeenCalledWith("CANTx : 740 30 00 00 00 00 00 00 00\n"); // flow control

    // CF: type 2, seq 1, remaining 4 bytes
    rx(0x760, [0x21, 0x11, 0x22, 0x33, 0x44]);
    await expect(p).resolves.toEqual({
      payload: [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x11, 0x22, 0x33, 0x44],
      fromId: 0x760,
      pending: false,
    });
  });

  it("drops an out-of-order consecutive frame and waits for the retry", async () => {
    vi.useFakeTimers();
    const p = isoTpRequest(opts({ timeoutMs: 500 }));
    rx(0x760, [0x10, 0x0a, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
    rx(0x760, [0x22, 0x99, 0x99, 0x99, 0x99]); // seq 2, expected 1 -> dropped
    rx(0x760, [0x21, 0x11, 0x22, 0x33, 0x44]); // correct seq 1
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toMatchObject({
      payload: [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x11, 0x22, 0x33, 0x44],
    });
  });
});

describe("isoTpRequest — failure paths", () => {
  it("resolves null on timeout", async () => {
    vi.useFakeTimers();
    const p = isoTpRequest(opts({ timeoutMs: 50 }));
    await vi.advanceTimersByTimeAsync(50);
    await expect(p).resolves.toBeNull();
    expect(listenerCount()).toBe(0);
  });

  it("resolves null when the send function reports failure", async () => {
    const p = isoTpRequest(opts({ send: vi.fn().mockResolvedValue(false) }));
    await expect(p).resolves.toBeNull();
  });

  it("resolves null when the send function throws", async () => {
    const p = isoTpRequest(opts({ send: vi.fn().mockRejectedValue(new Error("no port")) }));
    await expect(p).resolves.toBeNull();
  });
});
