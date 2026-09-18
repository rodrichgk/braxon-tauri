import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { board, emit, invoke } = vi.hoisted(() => {
  const listeners = new Set<(e: unknown) => void>();
  return {
    board: {
      getIsConnected: vi.fn(() => false),
      listPorts: vi.fn(async () => [{ port_name: "COM7", port_type: "USB" }]),
      setPort: vi.fn(),
      connect: vi.fn(async () => true),
      startReading: vi.fn(),
      disconnect: vi.fn(),
      write: vi.fn(async () => true),
      addEventListener: vi.fn((cb: (e: unknown) => void) => listeners.add(cb)),
      removeEventListener: vi.fn((cb: (e: unknown) => void) => listeners.delete(cb)),
    },
    emit: (e: unknown) => [...listeners].forEach((cb) => (cb as (x: unknown) => void)(e)),
    invoke: vi.fn(async (..._a: unknown[]): Promise<string | null> => null),
  };
});
vi.mock("@/lib/clientSerial", () => ({ signalBoard: board }));
vi.mock("@tauri-apps/api/tauri", () => ({ invoke }));

import { useSignalBoard } from "@/hooks/useSignalBoard";

beforeEach(() => {
  localStorage.clear();
  Object.values(board).forEach((f) => (f as ReturnType<typeof vi.fn>).mockClear?.());
  board.getIsConnected.mockReturnValue(false);
  board.connect.mockResolvedValue(true);
  invoke.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe("useSignalBoard", () => {
  it("refreshes the port list on mount", async () => {
    const { result } = renderHook(() => useSignalBoard());
    await waitFor(() => expect(result.current.ports).toHaveLength(1));
    expect(result.current.ports[0].port_name).toBe("COM7");
  });

  it("hydrates the port + baud from localStorage and persists changes", async () => {
    localStorage.setItem("signalBoardPort", JSON.stringify("COM9"));
    localStorage.setItem("signalBoardBaud", JSON.stringify("57600"));
    const { result } = renderHook(() => useSignalBoard());
    expect(result.current.selectedPort).toBe("COM9");
    expect(result.current.baudRate).toBe("57600");

    act(() => result.current.setSelectedPort("COM3"));
    act(() => result.current.setBaudRate("115200"));
    expect(JSON.parse(localStorage.getItem("signalBoardPort")!)).toBe("COM3");
    expect(JSON.parse(localStorage.getItem("signalBoardBaud")!)).toBe("115200");
    expect(board.setPort).toHaveBeenCalledWith("COM3");
  });

  it("offers the auto-detected Pico when no port is remembered", async () => {
    invoke.mockResolvedValueOnce("COM11");
    const { result } = renderHook(() => useSignalBoard());
    await waitFor(() => expect(result.current.selectedPort).toBe("COM11"));
    expect(invoke).toHaveBeenCalledWith("get_pico_port");
  });

  it("connect() errors without a port, otherwise connects and starts reading", async () => {
    const { result } = renderHook(() => useSignalBoard());
    let ok = await act(async () => result.current.connect());
    expect(ok).toBe(false);
    expect(result.current.error).toMatch(/signal board port/i);

    act(() => result.current.setSelectedPort("COM7"));
    ok = await act(async () => result.current.connect());
    expect(ok).toBe(true);
    expect(board.connect).toHaveBeenCalledWith({ baudRate: 115200 });
    expect(board.startReading).toHaveBeenCalled();
  });

  it("reflects transport events in isConnected / error", async () => {
    const { result } = renderHook(() => useSignalBoard());
    await waitFor(() => expect(result.current.ports).toHaveLength(1));
    act(() => emit({ type: "connected" }));
    expect(result.current.isConnected).toBe(true);
    act(() => emit({ type: "error", error: { message: "cable out" } }));
    expect(result.current.error).toBe("cable out");
    act(() => emit({ type: "disconnected" }));
    expect(result.current.isConnected).toBe(false);
  });

  it("sendCommand refuses while disconnected", async () => {
    const { result } = renderHook(() => useSignalBoard());
    const ok = await act(async () => result.current.sendCommand("W10,10,10,10"));
    expect(ok).toBe(false);
    expect(result.current.error).toMatch(/not connected/i);
    expect(board.write).not.toHaveBeenCalled();
  });

  it("sendCommand writes while connected", async () => {
    board.getIsConnected.mockReturnValue(true);
    const { result } = renderHook(() => useSignalBoard());
    const ok = await act(async () => result.current.sendCommand("R"));
    expect(ok).toBe(true);
    expect(board.write).toHaveBeenCalledWith("R");
  });

  // The Kvaser-as-main-transport + legacy-Nano-as-signal-board combo needs
  // this board's baud forced to the Nano's fixed 500000, not the Pico's
  // 115200 default (there's no UI to set it manually — see Sidebar.tsx).
  describe("legacyMode baud sync", () => {
    it("forces 500000 baud when legacyMode is on from the start", async () => {
      const { result } = renderHook(() => useSignalBoard({ legacyMode: true }));
      await waitFor(() => expect(result.current.baudRate).toBe("500000"));
      expect(JSON.parse(localStorage.getItem("signalBoardBaud")!)).toBe("500000");
    });

    it("leaves a remembered baud alone when legacyMode is off", () => {
      localStorage.setItem("signalBoardBaud", JSON.stringify("57600"));
      const { result } = renderHook(() => useSignalBoard());
      expect(result.current.baudRate).toBe("57600");
    });

    it("corrects the baud when legacyMode turns on later", async () => {
      localStorage.setItem("signalBoardBaud", JSON.stringify("57600"));
      const { result, rerender } = renderHook(
        ({ legacyMode }: { legacyMode: boolean }) => useSignalBoard({ legacyMode }),
        { initialProps: { legacyMode: false } },
      );
      expect(result.current.baudRate).toBe("57600");

      rerender({ legacyMode: true });
      await waitFor(() => expect(result.current.baudRate).toBe("500000"));
    });
  });
});
