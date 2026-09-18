import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { TestSessionProvider, useTestSession } from "@/contexts/TestSessionContext";
import { mockTauri } from "@/test/tauri";

const makeWrapper = (navigateTo = vi.fn()) =>
  ({ children }: { children: React.ReactNode }) => (
    <TestSessionProvider navigateTo={navigateTo}>{children}</TestSessionProvider>
  );

beforeEach(() => localStorage.clear());

describe("TestSessionContext", () => {
  it("loads this machine's client identity on mount", async () => {
    mockTauri({
      braxon_client_identity: () => ({ pcId: "pc-1", hostname: "BENCH-3", osUser: "gabhy", appVersion: "1.1.2" }),
    });
    const { result } = renderHook(() => useTestSession(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.clientIdentity).not.toBeNull());
    expect(result.current.clientIdentity).toMatchObject({ pcId: "pc-1", hostname: "BENCH-3" });
  });

  it("leaves clientIdentity null when the command fails", async () => {
    mockTauri({ braxon_client_identity: () => { throw "no registry"; } });
    const { result } = renderHook(() => useTestSession(), { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 5));
    expect(result.current.clientIdentity).toBeNull();
  });

  it("holds and clears the active hydraulic / signal jobs independently", () => {
    mockTauri({ braxon_client_identity: () => { throw "x"; } });
    const { result } = renderHook(() => useTestSession(), { wrapper: makeWrapper() });
    const job = { ligcdeId: "1", clientName: "C", reference: "R", vehiclePlate: "P", vehicleModel: "M" };
    act(() => result.current.setActiveHydraulicJob(job));
    expect(result.current.activeHydraulicJob).toEqual(job);
    expect(result.current.activeSignalJob).toBeNull();
    act(() => result.current.setActiveHydraulicJob(null));
    expect(result.current.activeHydraulicJob).toBeNull();
  });

  it("passes navigateTo straight through", () => {
    const nav = vi.fn();
    mockTauri({ braxon_client_identity: () => { throw "x"; } });
    const { result } = renderHook(() => useTestSession(), { wrapper: makeWrapper(nav) });
    act(() => result.current.navigateTo("reman"));
    expect(nav).toHaveBeenCalledWith("reman");
  });

  it("tracks the pending scan", () => {
    mockTauri({ braxon_client_identity: () => { throw "x"; } });
    const { result } = renderHook(() => useTestSession(), { wrapper: makeWrapper() });
    act(() => result.current.setPendingScan({ entity: "job", key: "17500101", ts: 1 }));
    expect(result.current.pendingScan).toMatchObject({ entity: "job", key: "17500101" });
    act(() => result.current.setPendingScan(null));
    expect(result.current.pendingScan).toBeNull();
  });

  it("useTestSession throws outside a provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useTestSession())).toThrow(/within a TestSessionProvider/);
    spy.mockRestore();
  });
});
