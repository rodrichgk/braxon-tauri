import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useProfileManagement, type ServerProfile } from "@/hooks/useProfileManagement";

const KEY = "wss_hil_profiles";
const profile = (over: Partial<ServerProfile> = {}): ServerProfile => ({
  id: "p1",
  name: "Highway",
  points: JSON.stringify([{ time: 0, frequency: 0 }, { time: 15, frequency: 1000 }]),
  isDefault: false,
  createdAt: "t",
  updatedAt: "t",
  ...over,
});

beforeEach(() => localStorage.clear());

describe("useProfileManagement", () => {
  it("loads profiles from storage on mount and auto-selects the first", async () => {
    localStorage.setItem(KEY, JSON.stringify([profile(), profile({ id: "p2", name: "City" })]));
    const { result } = renderHook(() => useProfileManagement());
    await waitFor(() => expect(result.current.isLoadingProfiles).toBe(false));
    expect(result.current.profiles).toHaveLength(2);
    expect(result.current.selectedProfileId).toBe("p1");
    expect(result.current.activeProfile).toEqual([{ time: 0, frequency: 0 }, { time: 15, frequency: 1000 }]);
  });

  it("saveProfile creates a new profile when none is selected", async () => {
    const { result } = renderHook(() => useProfileManagement());
    await waitFor(() => expect(result.current.isLoadingProfiles).toBe(false));
    act(() => result.current.setActiveProfile([{ time: 0, frequency: 0 }, { time: 10, frequency: 500 }]));
    await act(async () => result.current.saveProfile("Rally"));
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Rally");
    expect(result.current.selectedProfileId).toBe(stored[0].id);
  });

  it("saveProfile updates the selected profile in place", async () => {
    localStorage.setItem(KEY, JSON.stringify([profile()]));
    const { result } = renderHook(() => useProfileManagement());
    await waitFor(() => expect(result.current.isLoadingProfiles).toBe(false));
    act(() => result.current.setActiveProfile([{ time: 0, frequency: 0 }, { time: 5, frequency: 250 }]));
    await act(async () => result.current.saveProfile("Highway v2"));
    const stored = JSON.parse(localStorage.getItem(KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("p1");
    expect(stored[0].name).toBe("Highway v2");
    expect(JSON.parse(stored[0].points)).toEqual([{ time: 0, frequency: 0 }, { time: 5, frequency: 250 }]);
  });

  it("saveProfile ignores a blank name", async () => {
    const { result } = renderHook(() => useProfileManagement());
    await waitFor(() => expect(result.current.isLoadingProfiles).toBe(false));
    await act(async () => result.current.saveProfile("   "));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("addProfilePoint appends a mid point and selects it; removeProfilePoint keeps a floor of 2", async () => {
    localStorage.setItem(KEY, JSON.stringify([profile()]));
    const { result } = renderHook(() => useProfileManagement());
    await waitFor(() => expect(result.current.isLoadingProfiles).toBe(false));

    act(() => result.current.addProfilePoint(1000));
    expect(result.current.activeProfile).toHaveLength(3);
    expect(result.current.activeProfile[2]).toEqual({ time: 7.5, frequency: 500 });
    expect(result.current.editingPoint).toBe(2);

    act(() => result.current.removeProfilePoint());
    expect(result.current.activeProfile).toHaveLength(2);

    // now at the floor — a further remove is refused
    act(() => result.current.setEditingPoint(0));
    act(() => result.current.removeProfilePoint());
    expect(result.current.activeProfile).toHaveLength(2);
  });

  it("updateProfilePoint re-sorts the curve by time", async () => {
    localStorage.setItem(KEY, JSON.stringify([profile()]));
    const { result } = renderHook(() => useProfileManagement());
    await waitFor(() => expect(result.current.isLoadingProfiles).toBe(false));
    act(() => result.current.updateProfilePoint(0, { time: 20, frequency: 999 }));
    expect(result.current.activeProfile.map((p) => p.time)).toEqual([15, 20]);
  });

  it("loadProfile swaps the active curve to another stored profile", async () => {
    localStorage.setItem(KEY, JSON.stringify([profile(), profile({ id: "p2", name: "City", points: JSON.stringify([{ time: 0, frequency: 0 }, { time: 8, frequency: 300 }]) })]));
    const { result } = renderHook(() => useProfileManagement());
    await waitFor(() => expect(result.current.isLoadingProfiles).toBe(false));
    act(() => result.current.loadProfile("p2"));
    expect(result.current.selectedProfileId).toBe("p2");
    expect(result.current.selectedProfileName).toBe("City");
    expect(result.current.activeProfile).toEqual([{ time: 0, frequency: 0 }, { time: 8, frequency: 300 }]);
  });
});
