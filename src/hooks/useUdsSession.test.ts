import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { openUdsSession } = vi.hoisted(() => ({ openUdsSession: vi.fn() }));
vi.mock("@/lib/udsSession", async (orig) => {
  const actual = await orig<typeof import("@/lib/udsSession")>();
  return { ...actual, openUdsSession };
});

import { useUdsSession } from "@/hooks/useUdsSession";

const handle = (over: Partial<{ sendId: number; recvId: number; subFunction: number }> = {}) => {
  const h = { sendId: 0x740, recvId: 0x760, subFunction: 0xc0, closed: false, close: vi.fn(() => { h.closed = true; }), ...over };
  return h;
};

beforeEach(() => openUdsSession.mockReset());
afterEach(() => vi.useRealTimers());

describe("useUdsSession", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useUdsSession(vi.fn(), true));
    expect(result.current.session.status).toBe("idle");
  });

  it("ensureSession opens a session and moves to 'open'", async () => {
    const h = handle();
    openUdsSession.mockResolvedValueOnce({ ok: true, session: h, payload: [0x50, 0xc0], subFunction: 0xc0 });
    const { result } = renderHook(() => useUdsSession(vi.fn(), true));

    let res!: Awaited<ReturnType<typeof result.current.ensureSession>>;
    await act(async () => { res = await result.current.ensureSession(0x740, 0x760); });

    expect(res).toEqual({ ok: true, reused: false, subFunction: 0xc0 });
    expect(result.current.session).toMatchObject({ status: "open", sendId: 0x740, recvId: 0x760, subFunction: 0xc0 });
    expect(result.current.hasSessionFor(0x740, 0x760)).toBe(true);
  });

  it("reuses the held session for the same address without re-opening", async () => {
    openUdsSession.mockResolvedValueOnce({ ok: true, session: handle(), payload: [], subFunction: 0xc0 });
    const { result } = renderHook(() => useUdsSession(vi.fn(), true));
    await act(async () => { await result.current.ensureSession(0x740, 0x760); });

    let res!: Awaited<ReturnType<typeof result.current.ensureSession>>;
    await act(async () => { res = await result.current.ensureSession(0x740, 0x760); });
    expect(res).toEqual({ ok: true, reused: true, subFunction: 0xc0 });
    expect(openUdsSession).toHaveBeenCalledTimes(1);
  });

  it("maps a rejection to status 'rejected' with the NRC", async () => {
    openUdsSession.mockResolvedValueOnce({ ok: false, reason: "rejected", nrc: 0x22, subFunction: 0xc0 });
    const { result } = renderHook(() => useUdsSession(vi.fn(), true));
    let res!: Awaited<ReturnType<typeof result.current.ensureSession>>;
    await act(async () => { res = await result.current.ensureSession(0x740, 0x760); });
    expect(res).toMatchObject({ ok: false, reason: "rejected", nrc: 0x22 });
    expect(result.current.session).toMatchObject({ status: "rejected", nrc: 0x22 });
  });

  it("maps no answer to status 'no_response'", async () => {
    openUdsSession.mockResolvedValueOnce({ ok: false, reason: "no_response" });
    const { result } = renderHook(() => useUdsSession(vi.fn(), true));
    await act(async () => { await result.current.ensureSession(0x740, 0x760); });
    expect(result.current.session.status).toBe("no_response");
  });

  it("closeSession() tears the held session down and returns to idle", async () => {
    const h = handle();
    openUdsSession.mockResolvedValueOnce({ ok: true, session: h, payload: [], subFunction: 0xc0 });
    const { result } = renderHook(() => useUdsSession(vi.fn(), true));
    await act(async () => { await result.current.ensureSession(0x740, 0x760); });
    act(() => result.current.closeSession());
    expect(h.close).toHaveBeenCalled();
    expect(result.current.session.status).toBe("idle");
  });

  it("drops the session ~1.8s after the transport goes away", async () => {
    vi.useFakeTimers();
    const h = handle();
    openUdsSession.mockResolvedValueOnce({ ok: true, session: h, payload: [], subFunction: 0xc0 });
    const { result, rerender } = renderHook(({ conn }) => useUdsSession(vi.fn(), conn), {
      initialProps: { conn: true },
    });
    await act(async () => { await result.current.ensureSession(0x740, 0x760); });
    expect(result.current.session.status).toBe("open");

    rerender({ conn: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
    expect(result.current.session.status).toBe("idle");
    expect(h.close).toHaveBeenCalled();
  });
});
