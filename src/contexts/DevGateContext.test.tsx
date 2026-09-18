import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { SessionProvider } from "@/contexts/SessionContext";
import { DevGateProvider, useDevGate } from "@/contexts/DevGateContext";
import { mockTauri } from "@/test/tauri";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SessionProvider>
    <DevGateProvider>{children}</DevGateProvider>
  </SessionProvider>
);

// The dev user, per src/lib/devAccess.ts.
const DEV_USER_ID = "2e1c8ded-970e-4f0a-adfd-aa266dce53df";
const seedUser = (id: string) => {
  localStorage.setItem("session_user_id", id);
  localStorage.setItem("session_user_name", "U");
  localStorage.setItem("session_expires_at", String(Date.now() + 3_600_000));
};

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe("DevGateContext", () => {
  it("reads the hidden-pages setting and exposes isHidden", async () => {
    mockTauri({ get_app_setting: () => JSON.stringify(["valves", "signal"]) });
    const { result } = renderHook(() => useDevGate(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hiddenPages).toEqual(["valves", "signal"]);
    expect(result.current.isHidden("valves")).toBe(true);
    expect(result.current.isHidden("home")).toBe(false);
  });

  it("isDev is false for a normal user, true for the pinned dev id", async () => {
    seedUser("someone-else");
    mockTauri({ get_app_setting: () => null });
    const { result: normal } = renderHook(() => useDevGate(), { wrapper });
    await waitFor(() => expect(normal.current.loading).toBe(false));
    expect(normal.current.isDev).toBe(false);

    localStorage.clear();
    seedUser(DEV_USER_ID);
    mockTauri({ get_app_setting: () => null });
    const { result: dev } = renderHook(() => useDevGate(), { wrapper });
    await waitFor(() => expect(dev.current.loading).toBe(false));
    expect(dev.current.isDev).toBe(true);
  });

  it("setHidden is a no-op for a non-dev user", async () => {
    seedUser("not-the-dev");
    const tauri = mockTauri({ get_app_setting: () => null, set_app_setting: () => undefined });
    const { result } = renderHook(() => useDevGate(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.setHidden("valves", true));
    expect(tauri.callsTo("set_app_setting")).toHaveLength(0);
    expect(result.current.hiddenPages).toEqual([]);
  });

  it("setHidden optimistically updates then rolls back if the write fails", async () => {
    seedUser(DEV_USER_ID);
    mockTauri({
      get_app_setting: () => JSON.stringify([]),
      set_app_setting: () => { throw "db down"; },
    });
    const { result } = renderHook(() => useDevGate(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(act(() => result.current.setHidden("valves", true))).rejects.toBeTruthy();
    expect(result.current.hiddenPages).toEqual([]); // rolled back
  });

  it("keeps its last value when the DB is unreachable", async () => {
    mockTauri({ get_app_setting: () => { throw "unreachable"; } });
    const { result } = renderHook(() => useDevGate(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hiddenPages).toEqual([]);
  });
});
