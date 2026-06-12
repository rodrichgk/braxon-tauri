import { invoke } from '@tauri-apps/api/tauri';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type SerialEvent = {
  type: 'connected' | 'disconnected' | 'data' | 'error';
  data?: string;
  error?: { message: string };
};

export type SerialOptions = {
  baudRate: number;
};

export type SerialPortInfo = {
  port_name: string;
  port_type: string;
};

type EventCallback = (event: SerialEvent) => void;

class TauriSerial {
  private listeners: EventCallback[] = [];
  private selectedPort: string | null = null;
  private unlistenData: UnlistenFn | null = null;
  private unlistenDisconnect: UnlistenFn | null = null;
  private _isConnected = false;

  getIsConnected(): boolean {
    return this._isConnected;
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
    if (!this.selectedPort) return false;
    try {
      await invoke('connect_serial', {
        portName: this.selectedPort,
        baudRate: options?.baudRate ?? 115200,
      });
      this.emit({ type: 'connected' });
      return true;
    } catch (e) {
      this.emit({ type: 'error', error: { message: String(e) } });
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await invoke('disconnect_serial');
    } catch { /* ignore */ }
    this._teardownListeners();
    this.emit({ type: 'disconnected' });
  }

  async write(data: string): Promise<boolean> {
    try {
      await invoke('send_serial_message', { message: data });
      return true;
    } catch (e) {
      this.emit({ type: 'error', error: { message: String(e) } });
      return false;
    }
  }

  send = this.write.bind(this);

  startReading() {
    if (this.unlistenData) return;

    listen<string>('serial-data', (event) => {
      this.emit({ type: 'data', data: event.payload });
    }).then(unlisten => {
      this.unlistenData = unlisten;
    });

    listen<void>('serial-disconnected', () => {
      this._teardownListeners();
      this.emit({ type: 'disconnected' });
    }).then(unlisten => {
      this.unlistenDisconnect = unlisten;
    });
  }

  private _teardownListeners() {
    if (this.unlistenData) { this.unlistenData(); this.unlistenData = null; }
    if (this.unlistenDisconnect) { this.unlistenDisconnect(); this.unlistenDisconnect = null; }
  }

  addEventListener(cb: EventCallback) {
    this.listeners.push(cb);
  }

  removeEventListener(cb: EventCallback) {
    this.listeners = this.listeners.filter(l => l !== cb);
  }

  onData = () => {};
  onError = () => {};
}

const clientSerial = new TauriSerial();
export default clientSerial;
export { TauriSerial };
