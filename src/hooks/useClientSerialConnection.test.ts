import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { cs, emit, invoke } = vi.hoisted(() => {
  const listeners = new Set<(e: unknown) => void>();
  return {
    cs: {
      getIsConnected: vi.fn(() => false),
      listPorts: vi.fn(async () => [{ port_name: "COM3", port_type: "USB" }]),
      listKvaserChannels: vi.fn(async () => [{ index: 0, name: "Leaf", serial: "1" }]),
      setPort: vi.fn(),
      setSource: vi.fn(),
      setKvaserTarget: vi.fn(),
      connect: vi.fn(async () => true),
      disconnect: vi.fn(async () => {}),
      startReading: vi.fn(),
      write: vi.fn(async () => true),
      addEventListener: vi.fn((cb: (e: unknown) => void) => listeners.add(cb)),
      removeEventListener: vi.fn((cb: (e: unknown) => void) => listeners.delete(cb)),
    },
    emit: (e: unknown) => [...listeners].forEach((cb) => (cb as (x: unknown) => void)(e)),
    invoke: vi.fn(async (..._a: unknown[]): Promise<string | null> => null),
  };
});
vi.mock("@/lib/clientSerial", () => ({ default: cs }));
vi.mock("@tauri-apps/api/tauri", () => ({ invoke }));

import { useClientSerialConnection } from "@/hooks/useClientSerialConnection";

beforeEach(() => {
  localStorage.clear();
  Object.values(cs).forEach((f) => (f as ReturnType<typeof vi.fn>).mockClear?.());
  cs.getIsConnected.mockReturnValue(false);
  cs.connect.mockResolvedValue(true);
  cs.write.mockResolvedValue(true);
  invoke.mockResolvedValue(null);
});

describe("useClientSerialConnection — settings", () => {
  it("hydrates from localStorage", () => {
    localStorage.setItem("serialBaudRate", JSON.stringify("57600"));
    localStorage.setItem("serialSelectedPort", JSON.stringify("COM9"));
    localStorage.setItem("transportSource", JSON.stringify("kvaser"));
    localStorage.setItem("kvaserBitrate", JSON.stringify("250000"));
    const { result } = renderHook(() => useClientSerialConnection());
    expect(result.current.baudRate).toBe("57600");
    expect(result.current.selectedPort).toBe("COM9");
    expect(result.current.source).toBe("kvaser");
    expect(result.current.canBitrate).toBe("250000");
  });

  it("each setter persists and syncs the singleton", () => {
    const { result } = renderHook(() => useClientSerialConnection());
    act(() => result.current.setBaudRate("9600"));
    act(() => result.current.setSelectedPort("COM4"));
    act(() => result.current.setSource("kvaser"));
    expect(JSON.parse(localStorage.getItem("serialBaudRate")!)).toBe("9600");
    expect(JSON.parse(localStorage.getItem("serialSelectedPort")!)).toBe("COM4");
    expect(cs.setPort).toHaveBeenCalledWith("COM4");
    expect(cs.setSource).toHaveBeenCalledWith("kvaser");
  });

  it("refreshPorts lists ports; get_pico_port auto-selects a detected Pico", async () => {
    invoke.mockResolvedValueOnce("COM11");
    const { result } = renderHook(() => useClientSerialConnection());
    await waitFor(() => expect(result.current.ports).toHaveLength(1));
    await waitFor(() => expect(result.current.picoDetected).toBe(true));
    expect(result.current.selectedPort).toBe("COM11");
  });
});

describe("useClientSerialConnection — events", () => {
  it("maps transport events to state and callbacks", async () => {
    const onConnect = vi.fn();
    const onError = vi.fn();
    const onData = vi.fn();
    const { result } = renderHook(() =>
      useClientSerialConnection({ onConnect, onError, onDataReceived: onData }),
    );
    await waitFor(() => expect(cs.addEventListener).toHaveBeenCalled());

    act(() => emit({ type: "connected" }));
    expect(result.current.isConnected).toBe(true);
    expect(onConnect).toHaveBeenCalled();

    act(() => emit({ type: "reconnecting", attempt: 2 }));
    expect(result.current.isReconnecting).toBe(true);
    expect(result.current.reconnectAttempt).toBe(2);

    act(() => emit({ type: "data", data: "2016 3 3 127 34" }));
    expect(onData).toHaveBeenCalledWith("2016 3 3 127 34");

    act(() => emit({ type: "error", error: { message: "bus off" } }));
    expect(result.current.errorMessage).toBe("bus off");
    expect(onError).toHaveBeenCalledWith({ message: "bus off" });

    act(() => emit({ type: "disconnected" }));
    expect(result.current.isConnected).toBe(false);
  });
});

describe("useClientSerialConnection — connect / send", () => {
  it("board connect requires a port", async () => {
    const { result } = renderHook(() => useClientSerialConnection());
    const ok = await act(async () => result.current.connect());
    expect(ok).toBe(false);
    expect(result.current.errorMessage).toMatch(/select a serial port/i);
  });

  it("board connect points the singleton at the port and starts reading", async () => {
    const { result } = renderHook(() => useClientSerialConnection());
    act(() => result.current.setSelectedPort("COM3"));
    const ok = await act(async () => result.current.connect());
    expect(ok).toBe(true);
    expect(cs.setSource).toHaveBeenCalledWith("board");
    expect(cs.setPort).toHaveBeenCalledWith("COM3");
    expect(cs.connect).toHaveBeenCalledWith({ baudRate: 115200 });
    expect(cs.startReading).toHaveBeenCalled();
  });

  it("kvaser connect sets the channel target instead of a port", async () => {
    const { result } = renderHook(() => useClientSerialConnection());
    act(() => result.current.setSource("kvaser"));
    act(() => result.current.setSelectedKvaserChannel(1));
    act(() => result.current.setCanBitrate("250000"));
    const ok = await act(async () => result.current.connect());
    expect(ok).toBe(true);
    expect(cs.setKvaserTarget).toHaveBeenCalledWith(1, 250000);
  });

  it("sendCommand refuses while disconnected and writes when connected", async () => {
    const { result } = renderHook(() => useClientSerialConnection());
    let ok = await act(async () => result.current.sendCommand("R"));
    expect(ok).toBe(false);
    expect(result.current.errorMessage).toMatch(/not connected/i);

    act(() => emit({ type: "connected" }));
    ok = await act(async () => result.current.sendCommand("W1,1,1,1"));
    expect(ok).toBe(true);
    expect(cs.write).toHaveBeenCalledWith("W1,1,1,1");
  });

  it("disconnect clears the reconnecting flag", async () => {
    const { result } = renderHook(() => useClientSerialConnection());
    act(() => emit({ type: "reconnecting", attempt: 1 }));
    await act(async () => result.current.disconnect());
    expect(cs.disconnect).toHaveBeenCalled();
    expect(result.current.isReconnecting).toBe(false);
    expect(result.current.reconnectAttempt).toBe(0);
  });
});
