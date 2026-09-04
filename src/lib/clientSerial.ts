import { invoke } from '@tauri-apps/api/tauri';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type SerialEvent = {
  type: 'connected' | 'disconnected' | 'reconnecting' | 'data' | 'error';
  data?: string;
  error?: { message: string };
  attempt?: number;
};

export type SerialOptions = {
  baudRate: number;
};

export type SerialPortInfo = {
  port_name: string;
  port_type: string;
};

/** A Kvaser CANlib channel, as returned by the `get_kvaser_channels` command. */
export type KvaserChannelInfo = {
  index: number;
  name: string;
  serial: string;
};

/**
 * Which hardware moves the CAN frames. Both expose the identical line protocol
 * to everything downstream (`CANTx : …` out, `<id> <dlc> <b…>` in), so the DTC
 * scanner / ISO-TP / UDS stack never sees the difference — only the Tauri
 * command names and event channels swap.
 */
export type TransportSource = 'board' | 'kvaser';

type SourceConfig = {
  connectCmd: string;
  disconnectCmd: string;
  sendCmd: string;
  dataEvent: string;
  disconnectEvent: string;
};

const SOURCES: Record<TransportSource, SourceConfig> = {
  board: {
    connectCmd: 'connect_serial',
    disconnectCmd: 'disconnect_serial',
    sendCmd: 'send_serial_message',
    dataEvent: 'serial-data',
    disconnectEvent: 'serial-disconnected',
  },
  kvaser: {
    connectCmd: 'connect_kvaser',
    disconnectCmd: 'disconnect_kvaser',
    sendCmd: 'send_kvaser_message',
    dataEvent: 'kvaser-data',
    disconnectEvent: 'kvaser-disconnected',
  },
};

type EventCallback = (event: SerialEvent) => void;

// Capped exponential-ish backoff for auto-reconnect: 2s, 4s, 6s, 8s, then
// holds at 10s — frequent enough to recover quickly from a brief USB/CDC
// blip, but not so aggressive it hammers a port that's genuinely gone
// (cable unplugged, board powered off) for a while.
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 10000;

class TauriSerial {
  private listeners: EventCallback[] = [];
  private selectedPort: string | null = null;
  private unlistenData: UnlistenFn | null = null;
  private unlistenDisconnect: UnlistenFn | null = null;
  private _isConnected = false;
  private _readingStarted = false;
  // Last baud rate actually used to connect — reconnect attempts reuse
  // this without the caller needing to remember/re-pass it.
  private _lastBaudRate = 115200;
  // True only while disconnect() was called deliberately — distinguishes
  // "the operator wants this off" from "the port dropped out from under
  // us", which is the only case that should trigger auto-reconnect.
  private _manualDisconnect = false;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectAttempt = 0;
  // Transport selection. 'board' keeps the exact pre-existing behaviour.
  private _source: TransportSource = 'board';
  private _kvaserChannel = 0;
  private _kvaserBitrate = 500000;

  getIsConnected(): boolean {
    return this._isConnected;
  }

  getSource(): TransportSource {
    return this._source;
  }

  /** Switch transport. Ignored while connected — disconnect first. */
  setSource(source: TransportSource) {
    if (this._isConnected) return;
    this._source = source;
  }

  /** CANlib channel index + bus bitrate (bps) used by the 'kvaser' source. */
  setKvaserTarget(channel: number, bitrate: number) {
    this._kvaserChannel = channel;
    this._kvaserBitrate = bitrate;
  }

  async listKvaserChannels(): Promise<KvaserChannelInfo[]> {
    return invoke<KvaserChannelInfo[]>('get_kvaser_channels');
  }

  private emit(event: SerialEvent) {
    if (event.type === 'connected')    this._isConnected = true;
    if (event.type === 'disconnected') this._isConnected = false;
    this.listeners.forEach(cb => cb(event));
  }

  async listPorts(): Promise<SerialPortInfo[]> {
    return invoke<SerialPortInfo[]>('get_serial_ports');
  }

  setPort(portName: string) {
    this.selectedPort = portName;
  }

  getPort(): string | null {
    return this.selectedPort;
  }

  async requestPort(): Promise<boolean> {
    return this.selectedPort !== null;
  }

  async connect(options?: SerialOptions): Promise<boolean> {
    const cfg = SOURCES[this._source];
    try {
      if (this._source === 'kvaser') {
        await invoke(cfg.connectCmd, {
          channel: this._kvaserChannel,
          bitrate: this._kvaserBitrate,
        });
      } else {
        if (!this.selectedPort) return false;
        this._lastBaudRate = options?.baudRate ?? 115200;
        await invoke(cfg.connectCmd, {
          portName: this.selectedPort,
          baudRate: this._lastBaudRate,
        });
      }
      this._manualDisconnect = false;
      this._cancelReconnect();
      this.emit({ type: 'connected' });
      return true;
    } catch (e) {
      this.emit({ type: 'error', error: { message: String(e) } });
      return false;
    }
  }

  async disconnect(): Promise<void> {
    this._manualDisconnect = true;
    this._cancelReconnect();
    try {
      await invoke(SOURCES[this._source].disconnectCmd);
    } catch { /* ignore */ }
    this._teardownListeners();
    this.emit({ type: 'disconnected' });
  }

  private _cancelReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._reconnectAttempt = 0;
  }

  // Only reached from the *unexpected* disconnect path (the port dropped
  // out from under us — physically still there and running, per the
  // observed case: a board mid-cycle, pod still enabled, that just lost
  // its PC-side connection). Never reached from a deliberate disconnect().
  private _scheduleReconnect() {
    if (this._manualDisconnect) return;
    if (this._source === 'board' && !this.selectedPort) return;
    this._reconnectAttempt += 1;
    const delay = Math.min(RECONNECT_BASE_MS * this._reconnectAttempt, RECONNECT_MAX_MS);
    this.emit({ type: 'reconnecting', attempt: this._reconnectAttempt });
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      const ok = await this.connect({ baudRate: this._lastBaudRate });
      if (ok) {
        this.startReading();
      } else if (!this._manualDisconnect) {
        this._scheduleReconnect();
      }
    }, delay);
  }

  async write(data: string): Promise<boolean> {
    try {
      await invoke(SOURCES[this._source].sendCmd, { message: data });
      return true;
    } catch (e) {
      this.emit({ type: 'error', error: { message: String(e) } });
      return false;
    }
  }

  startReading() {
    if (this._readingStarted) return;
    this._readingStarted = true;
    const cfg = SOURCES[this._source];

    listen<string>(cfg.dataEvent, (event) => {
      this.emit({ type: 'data', data: event.payload });
    }).then(unlisten => {
      this.unlistenData = unlisten;
    });

    listen<void>(cfg.disconnectEvent, () => {
      this._teardownListeners();
      this.emit({ type: 'disconnected' });
      this._scheduleReconnect();
    }).then(unlisten => {
      this.unlistenDisconnect = unlisten;
    });
  }

  private _teardownListeners() {
    this._readingStarted = false;
    if (this.unlistenData) { this.unlistenData(); this.unlistenData = null; }
    if (this.unlistenDisconnect) { this.unlistenDisconnect(); this.unlistenDisconnect = null; }
  }

  addEventListener(cb: EventCallback) {
    this.listeners.push(cb);
  }

  removeEventListener(cb: EventCallback) {
    this.listeners = this.listeners.filter(l => l !== cb);
  }
}

const clientSerial = new TauriSerial();

/**
 * A second, independent transport pinned to the board (`connect_serial` /
 * `serial-data`). Used only when the main `clientSerial` is on the Kvaser and
 * the old board is still on USB to generate the WSS signals — the Kvaser
 * handles CAN, this handles wheel-speed signal generation, both at once.
 * The Rust backend already runs the serial and Kvaser workers concurrently.
 */
const signalBoard = new TauriSerial();

export default clientSerial;
export { TauriSerial, signalBoard };
