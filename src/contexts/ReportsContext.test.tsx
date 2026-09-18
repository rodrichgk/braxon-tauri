import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Give the passive CAN sniffer a controllable event source.
const { emit, listen } = vi.hoisted(() => {
  const handlers = new Map<string, (e: { payload: unknown }) => void>();
  return {
    listen: vi.fn(async (name: string, cb: (e: { payload: unknown }) => void) => {
      handlers.set(name, cb);
      return () => handlers.delete(name);
    }),
    emit: (name: string, payload: unknown) => handlers.get(name)?.({ payload }),
  };
});
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { ReportsProvider, useReports } from "@/contexts/ReportsContext";

const wrapper = ({ children }: { children: React.ReactNode }) => <ReportsProvider>{children}</ReportsProvider>;
const STORE_KEY = "braxon.ecuReportDraft";

beforeEach(() => {
  localStorage.clear();
  listen.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("ReportsContext", () => {
  it("starts from an empty draft and persists changes (minus the live CAN block)", () => {
    const { result } = renderHook(() => useReports(), { wrapper });
    expect(result.current.signalDraft.ident).toEqual({});
    act(() => result.current.patchIdent({ absRef: "10.0961-1464.3", ecuName: "ABS X95" }));
    expect(result.current.signalDraft.ident).toMatchObject({ absRef: "10.0961-1464.3", ecuName: "ABS X95" });
    const stored = JSON.parse(localStorage.getItem(STORE_KEY)!);
    expect(stored.ident.absRef).toBe("10.0961-1464.3");
    expect(stored.can).toBeNull();
  });

  it("patchIdent drops undefined / empty values so a weaker source can't blank a field", () => {
    const { result } = renderHook(() => useReports(), { wrapper });
    act(() => result.current.patchIdent({ absRef: "X" }));
    act(() => result.current.patchIdent({ absRef: undefined, ecuName: "" }));
    expect(result.current.signalDraft.ident).toEqual({ absRef: "X" });
  });

  it("loads a persisted draft but never trusts a stale CAN block", () => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ident: { absRef: "Z" }, can: { seen: true, frameCount: 9 }, manual: {} }));
    const { result } = renderHook(() => useReports(), { wrapper });
    expect(result.current.signalDraft.ident.absRef).toBe("Z");
    expect(result.current.signalDraft.can).toBeNull();
  });

  it("recovers from a corrupt persisted draft", () => {
    localStorage.setItem(STORE_KEY, "{not json");
    const { result } = renderHook(() => useReports(), { wrapper });
    expect(result.current.signalDraft.ident).toEqual({});
  });

  it("setDtc / resetSignalDraft mutate the draft", () => {
    const { result } = renderHook(() => useReports(), { wrapper });
    act(() => result.current.setDtc({ timestamp: "t", protocol: "UDS", brand: "Renault", gotPositive: true, codes: [] }));
    expect(result.current.signalDraft.dtc).not.toBeNull();
    act(() => result.current.resetSignalDraft());
    expect(result.current.signalDraft.dtc).toBeNull();
    expect(result.current.signalDraft.ident).toEqual({});
  });

  it("the passive CAN sniffer counts serial/kvaser frames into signalDraft.can", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useReports(), { wrapper });
    // two frames on 0x12E, one on 0x0C0 (id dlc b0.. — dlc must match count)
    emit("serial-data", "302 3 1 2 3");
    emit("serial-data", "302 3 4 5 6");
    emit("kvaser-data", "192 2 7 8");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.signalDraft.can).toMatchObject({ seen: true, frameCount: 3, uniqueIds: 2 });
  });

  it("useReports throws outside a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useReports())).toThrow(/within a ReportsProvider/);
    spy.mockRestore();
  });
});
