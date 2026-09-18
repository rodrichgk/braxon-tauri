import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AppSettingsProvider, useAppSettings } from "@/contexts/AppSettingsContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AppSettingsProvider>{children}</AppSettingsProvider>
);

beforeEach(() => localStorage.clear());

describe("AppSettingsContext", () => {
  it("exposes the documented defaults", () => {
    const { result } = renderHook(() => useAppSettings(), { wrapper });
    expect(result.current.legacyMode).toBe(false);
    expect(result.current.legacySensorType).toBe(0);
    expect(result.current.legacyCanSpeed).toBeNull();
    expect(result.current.wssChannels).toEqual([null, null, null, null]);
    expect(result.current.wssCalPpr).toBe(48);
    expect(result.current.wssCalCirc).toBe(2.0);
    expect(result.current.hydraulicOilMax).toBe(2.5);
  });

  it("each setter updates state and persists JSON to localStorage", () => {
    const { result } = renderHook(() => useAppSettings(), { wrapper });
    act(() => result.current.setLegacyMode(true));
    act(() => result.current.setWssCalPpr(60));
    act(() => result.current.setHydraulicOilMax(3.1));
    expect(result.current.legacyMode).toBe(true);
    expect(result.current.wssCalPpr).toBe(60);
    expect(result.current.hydraulicOilMax).toBe(3.1);
    expect(localStorage.getItem("legacyMode")).toBe("true");
    expect(localStorage.getItem("wssCalPpr")).toBe("60");
    expect(localStorage.getItem("hydraulicOilMax")).toBe("3.1");
  });

  it("hydrates from localStorage on mount", () => {
    localStorage.setItem("legacyFreq", "42");
    localStorage.setItem("legacyCanSpeed", "500");
    const { result } = renderHook(() => useAppSettings(), { wrapper });
    expect(result.current.legacyFreq).toBe(42);
    expect(result.current.legacyCanSpeed).toBe(500);
  });

  it("falls back to the default when a stored value is corrupt", () => {
    localStorage.setItem("wssCalPpr", "{not json");
    const { result } = renderHook(() => useAppSettings(), { wrapper });
    expect(result.current.wssCalPpr).toBe(48);
  });

  it("stores WSS channel assignments", () => {
    const { result } = renderHook(() => useAppSettings(), { wrapper });
    const ch = { canId: 0x12e, byteIdx: 2, kmhScale: 0.01, kmhOffset: 0, kmhPerHz: 1 };
    act(() => result.current.setWssChannels([ch, null, null, null]));
    expect(result.current.wssChannels[0]).toEqual(ch);
    expect(JSON.parse(localStorage.getItem("wssChannels")!)[0]).toEqual(ch);
  });
});
