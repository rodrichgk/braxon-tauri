// Stub for client serial - not needed in Tauri (uses backend serial instead)
export type SerialEvent = {
  type: 'connected' | 'disconnected' | 'data' | 'error';
  data?: string;
  error?: { message: string };
};

export type SerialOptions = {
  baudRate: number;
};

const clientSerial = {
  connect: (_options?: SerialOptions) => Promise.resolve(false),
  disconnect: () => Promise.resolve(),
  send: () => Promise.resolve(false),
  write: (_data: string) => Promise.resolve(false),
  requestPort: () => Promise.resolve(false),
  startReading: () => {},
  addEventListener: (_cb: (event: SerialEvent) => void) => {},
  removeEventListener: (_cb: (event: SerialEvent) => void) => {},
  onData: () => {},
  onError: () => {},
};

export default clientSerial;
