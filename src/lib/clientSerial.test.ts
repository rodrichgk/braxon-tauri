import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Control both Tauri surfaces this module uses.
const invoke = vi.fn();
type Listener = (e: { payload: unknown }) => void;
const listeners = new Map<string, Listener>();
const unlisten = vi.fn();
const listen = vi.fn(async (event: string, cb: Listener) => {
  listeners.set(event, cb);
  return unlisten;
});

vi.mock("@tauri-apps/api/tauri", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: (...a: unknown[]) => (listen as unknown as typeof listen)(...(a as [string, Listener])) }));

import { TauriSerial, type SerialEvent } from "@/lib/clientSerial";

const last = <T>(a: T[]): T | undefined => a[a.length - 1];

function fresh() {
  const s = new TauriSerial();
  const events: SerialEvent[] = [];
  s.addEventListener((e) => events.push(e));
  return { s, events };
}

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
  listen.mockClear();
  unlisten.mockClear();
  listeners.clear();
});
afterEach(() => vi.useRealTimers());

describe("port + source accessors", () => {
  it("tracks the selected port", () => {
    const { s } = fresh();
    expect(s.getPort()).toBeNull();
    s.setPort("COM3");
    expect(s.getPort()).toBe("COM3");
  });

  it("requestPort resolves true only once a port is set", async () => {
    const { s } = fresh();
    expect(await s.requestPort()).toBe(false);
    s.setPort("COM3");
    expect(await s.requestPort()).toBe(true);
  });

  it("setSource is ignored while connected", async () => {
    const { s } = fresh();
    s.setSource("kvaser");
    expect(s.getSource()).toBe("kvaser");
    s.setPort("COM3");
    s.setSource("board");
    await s.connect();
    s.setSource("kvaser");
    expect(s.getSource()).toBe("board"); // change refused mid-connection
  });
});

describe("connect (board)", () => {
  it("returns false and emits nothing extra without a port", async () => {
    const { s, events } = fresh();
    expect(await s.connect()).toBe(false);
    expect(events).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("invokes connect_serial with port + baud and emits 'connected'", async () => {
    const { s, events } = fresh();
    s.setPort("COM7");
    expect(await s.connect({ baudRate: 9600 })).toBe(true);
    expect(invoke).toHaveBeenCalledWith("connect_serial", { portName: "COM7", baudRate: 9600 });
    expect(last(events)).toEqual({ type: "connected" });
    expect(s.getIsConnected()).toBe(true);
  });

  it("emits 'error' and returns false when the backend rejects", async () => {
    const { s, events } = fresh();
    s.setPort("COM7");
    invoke.mockRejectedValueOnce("port busy");
    expect(await s.connect()).toBe(false);
    expect(last(events)).toMatchObject({ type: "error", error: { message: "port busy" } });
    expect(s.getIsConnected()).toBe(false);
  });
});

describe("connect (kvaser)", () => {
  it("invokes connect_kvaser with channel + bitrate, no port needed", async () => {
    const { s } = fresh();
    s.setSource("kvaser");
    s.setKvaserTarget(2, 250000);
    expect(await s.connect()).toBe(true);
    expect(invoke).toHaveBeenCalledWith("connect_kvaser", { channel: 2, bitrate: 250000 });
  });
});

describe("write", () => {
  it("sends via the source's send command and returns true", async () => {
    const { s } = fresh();
    expect(await s.write("CANTx : 7E0 02 10 03")).toBe(true);
    expect(invoke).toHaveBeenCalledWith("send_serial_message", { message: "CANTx : 7E0 02 10 03" });
  });

  it("emits 'error' and returns false on failure", async () => {
    const { s, events } = fresh();
    invoke.mockRejectedValueOnce("write fail");
    expect(await s.write("x")).toBe(false);
    expect(last(events)).toMatchObject({ type: "error" });
  });
});

describe("disconnect", () => {
  it("invokes the disconnect command and emits 'disconnected'", async () => {
    const { s, events } = fresh();
    s.setPort("COM7");
    await s.connect();
    invoke.mockClear();
    await s.disconnect();
    expect(invoke).toHaveBeenCalledWith("disconnect_serial");
    expect(last(events)).toEqual({ type: "disconnected" });
    expect(s.getIsConnected()).toBe(false);
  });
});

describe("startReading + auto-reconnect", () => {
  it("subscribes to the data + disconnect events once", () => {
    const { s } = fresh();
    s.startReading();
    s.startReading(); // idempotent
    expect(listen).toHaveBeenCalledTimes(2);
    expect([...listeners.keys()].sort()).toEqual(["serial-data", "serial-disconnected"]);
  });

  it("forwards incoming lines as 'data' events", async () => {
    const { s, events } = fresh();
    s.startReading();
    await Promise.resolve();
    listeners.get("serial-data")!({ payload: "2016 3 3 127 34" });
    expect(last(events)).toEqual({ type: "data", data: "2016 3 3 127 34" });
  });

  it("an unexpected disconnect emits 'reconnecting' and retries with backoff", async () => {
    vi.useFakeTimers();
    const { s, events } = fresh();
    s.setPort("COM7");
    await s.connect();
    s.startReading();
    await Promise.resolve();

    invoke.mockClear();
    listeners.get("serial-disconnected")!(undefined as never);

    expect(last(events)).toMatchObject({ type: "reconnecting", attempt: 1 });
    await vi.advanceTimersByTimeAsync(2000); // first retry after 2s
    expect(invoke).toHaveBeenCalledWith("connect_serial", expect.objectContaining({ portName: "COM7" }));
  });

  it("a deliberate disconnect() does not schedule a reconnect", async () => {
    vi.useFakeTimers();
    const { s, events } = fresh();
    s.setPort("COM7");
    await s.connect();
    s.startReading();
    await Promise.resolve();
    await s.disconnect();

    invoke.mockClear();
    await vi.advanceTimersByTimeAsync(20000);
    expect(events.some((e) => e.type === "reconnecting")).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith("connect_serial", expect.anything());
  });
});

describe("event listener management", () => {
  it("removeEventListener stops delivery", async () => {
    const { s } = fresh();
    const seen: SerialEvent[] = [];
    const cb = (e: SerialEvent) => seen.push(e);
    s.addEventListener(cb);
    s.setPort("COM1");
    await s.connect();
    expect(seen.length).toBe(1);
    s.removeEventListener(cb);
    await s.disconnect();
    expect(seen.length).toBe(1); // no further events after removal
  });
});
