import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import clientSerial, { SerialEvent, SerialOptions, SerialPortInfo } from '@/lib/clientSerial';

export interface SerialConnectionCallbacks {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: { message: string }) => void;
  onDataReceived?: (data: unknown) => void;
}

export interface UseClientSerialConnectionResult {
  isConnected: boolean;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  sendCommand: (command: string) => Promise<boolean>;
  errorMessage: string | null;
  clearError: () => void;
  baudRate: string;
  setBaudRate: (rate: string) => void;
  ports: SerialPortInfo[];
  refreshPorts: () => Promise<void>;
  selectedPort: string | null;
  setSelectedPort: (port: string | null) => void;
  picoDetected: boolean;
  /** True while auto-reconnect is actively retrying after an unexpected
   * disconnect (the port dropped out from under an otherwise-still-running
   * board) — distinct from a plain, deliberate disconnected state. */
  isReconnecting: boolean;
  reconnectAttempt: number;
}

// Remembered across sessions so a reconnect (manual or automatic) never
// needs the operator to re-pick the port/baud rate from scratch — same
// localStorage convention AppSettingsContext.tsx uses for its own settings.
function persistedRead<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s !== null ? (JSON.parse(s) as T) : fallback;
  } catch { return fallback; }
}
function persistedWrite<T>(key: string, v: T) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
}

export function useClientSerialConnection(callbacks?: SerialConnectionCallbacks): UseClientSerialConnectionResult {
  const [isConnected, setIsConnected] = useState(() => clientSerial.getIsConnected());
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [baudRate, setBaudRateState] = useState(() => persistedRead<string>('serialBaudRate', '115200'));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPortState] = useState<string | null>(() => persistedRead<string | null>('serialSelectedPort', null));
  const [picoDetected, setPicoDetected] = useState(false);

  const setBaudRate = useCallback((rate: string) => {
    setBaudRateState(rate);
    persistedWrite('serialBaudRate', rate);
  }, []);
  const setSelectedPort = useCallback((port: string | null) => {
    setSelectedPortState(port);
    persistedWrite('serialSelectedPort', port);
    if (port) clientSerial.setPort(port);
  }, []);

  // The remembered port only becomes useful once clientSerial itself
  // knows about it — get_pico_port's auto-detect (below) can still
  // override this if a Pico is actually plugged in under a different
  // port than last time.
  useEffect(() => {
    if (selectedPort) clientSerial.setPort(selectedPort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const refreshPorts = useCallback(async () => {
    try {
      const list = await clientSerial.listPorts();
      setPorts(list);
    } catch (e) {
      setErrorMessage(String(e));
    }
  }, []);

  useEffect(() => {
    refreshPorts();
  }, [refreshPorts]);

  useEffect(() => {
    invoke<string | null>('get_pico_port')
      .then(port => {
        if (port) {
          setSelectedPort(port);
          setPicoDetected(true);
        }
      })
      .catch(() => {});
  }, []);

  const handleSerialEvent = useCallback((event: SerialEvent) => {
    switch (event.type) {
      case 'connected':
        setIsConnected(true);
        setIsReconnecting(false);
        setReconnectAttempt(0);
        setErrorMessage(null);
        callbacksRef.current?.onConnect?.();
        break;
      case 'disconnected':
        setIsConnected(false);
        callbacksRef.current?.onDisconnect?.();
        break;
      case 'reconnecting':
        setIsReconnecting(true);
        setReconnectAttempt(event.attempt ?? 0);
        break;
      case 'data':
        if (event.data) {
          callbacksRef.current?.onDataReceived?.(event.data);
        }
        break;
      case 'error':
        setErrorMessage(event.error?.message ?? 'Unknown error');
        if (event.error) callbacksRef.current?.onError?.({ message: event.error.message ?? 'Unknown error' });
        break;
    }
  }, []); // stable — reads callbacks via ref at call time

  useEffect(() => {
    clientSerial.addEventListener(handleSerialEvent);
    return () => clientSerial.removeEventListener(handleSerialEvent);
  }, [handleSerialEvent]);

  const clearError = () => setErrorMessage(null);

  const connect = async (): Promise<boolean> => {
    if (!selectedPort) {
      setErrorMessage('Select a serial port first');
      return false;
    }
    clearError();
    clientSerial.setPort(selectedPort);
    const options: SerialOptions = { baudRate: parseInt(baudRate, 10) };
    const connected = await clientSerial.connect(options);
    if (connected) clientSerial.startReading();
    return connected;
  };

  const disconnect = async (): Promise<void> => {
    try {
      await clientSerial.disconnect();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Disconnect failed');
    }
    // A manual disconnect also cancels any in-flight auto-reconnect
    // retries (see clientSerial.disconnect()'s _cancelReconnect()), but
    // that cancellation doesn't emit its own event — clear the local
    // "reconnecting" flag here so it doesn't linger true.
    setIsReconnecting(false);
    setReconnectAttempt(0);
  };

  const sendCommand = async (command: string): Promise<boolean> => {
    if (!isConnected) {
      setErrorMessage('Not connected to a device');
      return false;
    }
    const success = await clientSerial.write(command);
    if (!success) setErrorMessage('Failed to send command');
    return success;
  };

  return {
    isConnected,
    connect,
    disconnect,
    sendCommand,
    errorMessage,
    clearError,
    baudRate,
    setBaudRate,
    ports,
    refreshPorts,
    selectedPort,
    setSelectedPort,
    picoDetected,
    isReconnecting,
    reconnectAttempt,
  };
}
