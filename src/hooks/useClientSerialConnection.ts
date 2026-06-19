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
}

export function useClientSerialConnection(callbacks?: SerialConnectionCallbacks): UseClientSerialConnectionResult {
  const [isConnected, setIsConnected] = useState(() => clientSerial.getIsConnected());
  const [baudRate, setBaudRate] = useState('115200');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  const [picoDetected, setPicoDetected] = useState(false);

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
        setErrorMessage(null);
        callbacksRef.current?.onConnect?.();
        break;
      case 'disconnected':
        setIsConnected(false);
        callbacksRef.current?.onDisconnect?.();
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
  };
}
