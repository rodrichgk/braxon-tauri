import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { WheelReadSpec } from "@/lib/wssReadback";

const isoTpRequest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/isotp", () => ({ isoTpRequest }));

import { useWssReadback } from "@/hooks/useWssReadback";

// Ford/ATE-shaped spec — 1-byte-km/h direct decode (matches wssReadback.ts).
const SPEC: WheelReadSpec = {
  sendId: 0x760,
  recvId: 0x768,
  service: "22",
  dids: [[0x2b, 0x06], [0x2b, 0x07], [0x2b, 0x08], [0x2b, 0x09]],
  offset: 3,
  length: 1,
  signed: false,
  scale: 1,
  add: 0,
};

// NOTE: braces matter — a bare `() => mock.mockReset()` returns the mock fn,
// which vitest then runs as a teardown hook (calling isoTpRequest() with no args).
beforeEach(() => { isoTpRequest.mockReset(); });
afterEach(() => vi.useRealTimers());

describe("useWssReadback", () => {
  it("stays idle (all null, no error) when disabled, no spec, or no canSend", () => {
    const { result: a } = renderHook(() => useWssReadback({ readSpec: SPEC, canSend: vi.fn(), enabled: false }));
    expect(a.current.measured).toEqual([null, null, null, null]);

    const { result: b } = renderHook(() => useWssReadback({ readSpec: null, canSend: vi.fn(), enabled: true }));
    expect(b.current.measured).toEqual([null, null, null, null]);

    const { result: c } = renderHook(() => useWssReadback({ readSpec: SPEC, canSend: undefined, enabled: true }));
    expect(c.current.measured).toEqual([null, null, null, null]);

    expect(isoTpRequest).not.toHaveBeenCalled();
  });

  it("round-robins the four wheel DIDs and decodes each reply", async () => {
    isoTpRequest.mockImplementation(async (opts: { data: number[] }) => {
      const did = opts.data[2];
      const kmh = did === 0x06 ? 5 : did === 0x07 ? 6 : did === 0x08 ? 7 : 8;
      return { payload: [0x62, 0x2b, did, kmh], fromId: 0x768, pending: false };
    });
    const canSend = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useWssReadback({ readSpec: SPEC, canSend, enabled: true }));

    await waitFor(() => expect(result.current.measured).toEqual([5, 6, 7, 8]));
    expect(result.current.error).toBe('');
  });

  it("reports the no-response error and leaves that wheel null when the ECU stays silent", async () => {
    isoTpRequest.mockResolvedValue(null);
    const canSend = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useWssReadback({ readSpec: SPEC, canSend, enabled: true }));

    await waitFor(() => expect(result.current.error).toMatch(/no response/i));
    expect(result.current.measured).toEqual([null, null, null, null]);
  });

  it("resets to all-null the moment it's disabled", async () => {
    isoTpRequest.mockImplementation(async (opts: { data: number[] }) => {
      const did = opts.data[2];
      return { payload: [0x62, 0x2b, did, 5], fromId: 0x768, pending: false };
    });
    const canSend = vi.fn().mockResolvedValue(true);
    const { result, rerender } = renderHook(
      ({ enabled }) => useWssReadback({ readSpec: SPEC, canSend, enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.measured[0]).toBe(5));

    rerender({ enabled: false });
    expect(result.current.measured).toEqual([null, null, null, null]);
  });

  it("pulls each wheel from its own offset when the spec answers one combined reply (MK61/X95 21 04)", async () => {
    const COMBINED_SPEC: WheelReadSpec = {
      sendId: 0x740,
      recvId: 0x760,
      service: "21",
      dids: [[0x04, 0], [0x04, 0], [0x04, 0], [0x04, 0]], // same LID every wheel
      offset: 3,
      offsets: [3, 5, 7, 9],
      length: 2,
      signed: false,
      scale: 0.01,
      add: 0,
    };
    // 61 04 <pad> <FL> <FR> <RL> <RR>, uint16 BE — identical reply every poll.
    const REPLY = [0x61, 0x04, 0x00, 0x03, 0xe8, 0x01, 0xf4, 0x00, 0x00, 0x02, 0x58];
    isoTpRequest.mockResolvedValue({ payload: REPLY, fromId: 0x760, pending: false });
    const canSend = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useWssReadback({ readSpec: COMBINED_SPEC, canSend, enabled: true }));

    await waitFor(() => expect(result.current.measured).toEqual([10, 5, 0, 6]));
  });
});
