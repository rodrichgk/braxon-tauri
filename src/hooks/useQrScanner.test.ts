import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useQrScanner } from "@/hooks/useQrScanner";

vi.mock("jsqr", () => ({ default: vi.fn(() => null) }));

const onDecode = vi.fn();

beforeEach(() => onDecode.mockClear());
afterEach(() => {
  // @ts-expect-error test cleanup
  delete navigator.mediaDevices;
});

describe("useQrScanner", () => {
  it("does nothing while inactive", () => {
    const { result } = renderHook(() => useQrScanner({ active: false, onDecode }));
    expect(result.current.error).toBeNull();
    expect(result.current.streaming).toBe(false);
    expect(result.current.devices).toEqual([]);
  });

  it("reports 'no-camera' when getUserMedia is unavailable (jsdom / no permission API)", async () => {
    const { result } = renderHook(() => useQrScanner({ active: true, onDecode }));
    await waitFor(() => expect(result.current.error).toBe("no-camera"));
    expect(result.current.streaming).toBe(false);
  });

  it("classifies a denied permission as 'permission-denied'", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });
    const { result } = renderHook(() => useQrScanner({ active: true, onDecode }));
    await waitFor(() => expect(result.current.error).toBe("permission-denied"));
  });

  it("classifies a missing device as 'no-camera'", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("no", "NotFoundError")),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });
    const { result } = renderHook(() => useQrScanner({ active: true, onDecode }));
    await waitFor(() => expect(result.current.error).toBe("no-camera"));
  });

  it("stops the camera tracks on unmount", async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });
    const { unmount } = renderHook(() => useQrScanner({ active: true, onDecode }));
    await new Promise((r) => setTimeout(r, 5));
    unmount();
    expect(stop).toHaveBeenCalled();
  });
});
