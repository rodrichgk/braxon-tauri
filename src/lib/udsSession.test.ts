import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { isoTpRequest, buildSingleFrame, addEventListener, removeEventListener } = vi.hoisted(() => ({
  isoTpRequest: vi.fn(),
  buildSingleFrame: vi.fn((id: number, data: number[]) => `SF ${id} ${data.join(",")}`),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

vi.mock("@/lib/isotp", () => ({ isoTpRequest, buildSingleFrame }));
vi.mock("@/lib/clientSerial", () => ({ default: { addEventListener, removeEventListener } }));

import {
  openUdsSession,
  SESSION_MANUFACTURER,
  SESSION_EXTENDED,
  SESSION_DEFAULT,
  KEEP_ALIVE_MS,
} from "@/lib/udsSession";

const positive = (sub: number) => ({ payload: [0x50, sub], fromId: 0x760, pending: false });
const negative = (nrc: number) => ({ payload: [0x7f, 0x10, nrc], fromId: 0x760, pending: false });

const baseOpts = () => ({ send: vi.fn(), sendId: 0x740, recvId: 0x760 });

beforeEach(() => {
  isoTpRequest.mockReset();
  buildSingleFrame.mockClear();
  addEventListener.mockClear();
  removeEventListener.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("openUdsSession — subfunction negotiation", () => {
  it("opens on the manufacturer session (0xC0) when the ECU accepts it first", async () => {
    isoTpRequest.mockResolvedValueOnce(positive(SESSION_MANUFACTURER));
    const res = await openUdsSession(baseOpts());
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.subFunction).toBe(SESSION_MANUFACTURER);
    expect(res.session.closed).toBe(false);
    expect(isoTpRequest).toHaveBeenCalledTimes(1);
    // request payload is 10 C0
    expect(isoTpRequest.mock.calls[0][0]).toMatchObject({ data: [0x10, SESSION_MANUFACTURER] });
    res.session.close();
  });

  it("falls through 0xC0 (rejected) to the extended session 0x03", async () => {
    isoTpRequest.mockResolvedValueOnce(negative(0x22)).mockResolvedValueOnce(positive(SESSION_EXTENDED));
    const res = await openUdsSession(baseOpts());
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.subFunction).toBe(SESSION_EXTENDED);
    expect(isoTpRequest).toHaveBeenCalledTimes(2);
    res.session.close();
  });

  it("reports no_response when session control is never answered", async () => {
    isoTpRequest.mockResolvedValue(null);
    const res = await openUdsSession(baseOpts());
    expect(res).toMatchObject({ ok: false, reason: "no_response" });
    expect(isoTpRequest).toHaveBeenCalledTimes(3); // tried all three defaults
  });

  it("reports 'rejected' with the last NRC when every subfunction is refused", async () => {
    isoTpRequest.mockResolvedValue(negative(0x7e));
    const res = await openUdsSession(baseOpts());
    expect(res).toMatchObject({ ok: false, reason: "rejected", nrc: 0x7e, subFunction: SESSION_DEFAULT });
  });

  it("honours a custom subFunctions list", async () => {
    isoTpRequest.mockResolvedValueOnce(positive(SESSION_DEFAULT));
    const res = await openUdsSession({ ...baseOpts(), subFunctions: [SESSION_DEFAULT] });
    expect(res.ok).toBe(true);
    expect(isoTpRequest).toHaveBeenCalledTimes(1);
    expect(isoTpRequest.mock.calls[0][0]).toMatchObject({ data: [0x10, SESSION_DEFAULT] });
    if (res.ok) res.session.close();
  });
});

describe("openUdsSession — keep-alive", () => {
  it("sends TesterPresent (3E 01) on the keep-alive cadence and stops on close()", async () => {
    vi.useFakeTimers();
    const opts = baseOpts();
    isoTpRequest.mockResolvedValueOnce(positive(SESSION_MANUFACTURER));
    const res = await openUdsSession(opts);
    if (!res.ok) throw new Error("session did not open");

    expect(addEventListener).toHaveBeenCalledTimes(1); // passive ack watcher

    await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS);
    expect(buildSingleFrame).toHaveBeenCalledWith(0x740, [0x3e, 0x01]);
    expect(opts.send).toHaveBeenCalledTimes(1);

    res.session.close();
    expect(res.session.closed).toBe(true);
    expect(removeEventListener).toHaveBeenCalledTimes(1);

    opts.send.mockClear();
    await vi.advanceTimersByTimeAsync(KEEP_ALIVE_MS * 3);
    expect(opts.send).not.toHaveBeenCalled(); // interval cleared
  });

  it("close() is idempotent", async () => {
    isoTpRequest.mockResolvedValueOnce(positive(SESSION_MANUFACTURER));
    const res = await openUdsSession(baseOpts());
    if (!res.ok) throw new Error("session did not open");
    res.session.close();
    res.session.close();
    expect(removeEventListener).toHaveBeenCalledTimes(1);
  });
});
