import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { SessionProvider, useSession } from "@/contexts/SessionContext";
import { mockTauri } from "@/test/tauri";

const wrapper = ({ children }: { children: React.ReactNode }) => <SessionProvider>{children}</SessionProvider>;

const seed = (over: Record<string, string> = {}) => {
  localStorage.setItem("session_user_id", "u1");
  localStorage.setItem("session_user_name", "Alice");
  localStorage.setItem("session_expires_at", String(Date.now() + 3_600_000));
  for (const [k, v] of Object.entries(over)) localStorage.setItem(k, v);
};

beforeEach(() => localStorage.clear());

describe("SessionContext — restore", () => {
  it("starts logged out with nothing stored", () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.currentUser).toBeNull();
    expect(result.current.isLoggedIn).toBe(false);
  });

  it("restores a non-expired stored session", () => {
    seed({ session_user_role: "technicien", session_user_reman_tech_id: "3569" });
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.currentUser).toMatchObject({ id: "u1", name: "Alice", role: "technicien", remanTechId: "3569" });
    expect(result.current.isLoggedIn).toBe(true);
  });

  it("clears and ignores an expired session", () => {
    seed({ session_expires_at: String(Date.now() - 1000) });
    const { result } = renderHook(() => useSession(), { wrapper });
    expect(result.current.currentUser).toBeNull();
    expect(localStorage.getItem("session_user_id")).toBeNull();
  });
});

describe("SessionContext — auth actions", () => {
  it("login() calls login_user, persists and sets the user", async () => {
    const tauri = mockTauri({ login_user: (a) => ({ id: "u9", name: a.name, role: "commercial" }) });
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(() => result.current.login("Bob", "pw"));
    expect(tauri.callsTo("login_user")).toEqual([{ name: "Bob", password: "pw" }]);
    expect(result.current.currentUser).toMatchObject({ id: "u9", name: "Bob" });
    expect(localStorage.getItem("session_user_id")).toBe("u9");
  });

  it("loginAsGuest() never persists to localStorage", () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    act(() => result.current.loginAsGuest());
    expect(result.current.isGuest).toBe(true);
    expect(result.current.isLoggedIn).toBe(true);
    expect(localStorage.getItem("session_user_id")).toBeNull();
  });

  it("logout() clears the user, job and storage", async () => {
    mockTauri({ login_user: () => ({ id: "u9", name: "Bob" }) });
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(() => result.current.login("Bob", "pw"));
    act(() => result.current.logout());
    expect(result.current.currentUser).toBeNull();
    expect(localStorage.getItem("session_user_id")).toBeNull();
  });
});

describe("SessionContext — jobs", () => {
  it("startJob() invokes create_repair_job with the current user and sets currentJob", async () => {
    seed();
    const tauri = mockTauri({
      create_repair_job: (a) => ({ id: "j1", jobNumber: a.jobNumber, userId: a.userId, userName: a.userName, status: "in_progress", startedAt: "now" }),
    });
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(() => result.current.startJob("17500101", "10.0961-1464.3"));
    expect(tauri.callsTo("create_repair_job")[0]).toMatchObject({
      jobNumber: "17500101",
      userId: "u1",
      userName: "Alice",
      absRef: "10.0961-1464.3",
      absRefId: null,
    });
    expect(result.current.currentJob).toMatchObject({ id: "j1", jobNumber: "17500101" });
  });

  it("startJob() throws when nobody is logged in", async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    await expect(result.current.startJob("1")).rejects.toThrow(/Not logged in/);
  });

  it("endJob() updates the job to the given status", async () => {
    seed();
    mockTauri({
      create_repair_job: () => ({ id: "j1", jobNumber: "1", userId: "u1", userName: "Alice", status: "in_progress", startedAt: "now" }),
      update_repair_job: () => undefined,
    });
    const { result } = renderHook(() => useSession(), { wrapper });
    await act(() => result.current.startJob("1"));
    await act(() => result.current.endJob("completed", "all good"));
    expect(result.current.currentJob).toMatchObject({ status: "completed", notes: "all good" });
  });
});
