import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';

export interface ConnectedDevice {
  id: string;
  device_type: string;
  last_seen: number;
  paired_with_client?: string | null;
  paired_with_esp32?: string | null;
}

export interface WebSocketMessage {
  type: number;
  [key: string]: any;
}

interface WebSocketContextType {
  isConnected: boolean;
  socket: null;
  errorMessage: string | null;
  setErrorMessage: (message: string | null) => void;
  sendMessage: (message: WebSocketMessage) => boolean;
  devices: ConnectedDevice[];
  selectedDeviceId: string | null;
  selectDevice: (deviceId: string | null) => boolean;
  isConnectedToDevice: boolean;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConnected] = useState(true); // Always connected in Tauri

  useEffect(() => {
    // Listen for device list updates from Rust backend
    const unlistenDeviceList = listen<ConnectedDevice[]>('device-list', (event) => {
      setDevices(event.payload);
    });

    // Listen for device messages
    const unlistenDeviceMessage = listen<WebSocketMessage>('device-message', (event) => {
      // Handle incoming device messages
      console.log('Device message:', event.payload);
    });

    // Cleanup listeners on unmount
    return () => {
      unlistenDeviceList.then(fn => fn());
      unlistenDeviceMessage.then(fn => fn());
    };
  }, []);

  const selectDevice = (deviceId: string | null): boolean => {
    if (deviceId) {
      invoke('select_device', { deviceId })
        .then(() => {
          setSelectedDeviceId(deviceId);
        })
        .catch((error) => {
          console.error('Failed to select device:', error);
          setErrorMessage(`Failed to select device: ${error}`);
          return false;
        });
      return true;
    } else {
      setSelectedDeviceId(null);
      return true;
    }
  };

  const sendMessage = (message: WebSocketMessage): boolean => {
    if (!selectedDeviceId) {
      console.warn('No device selected');
      return false;
    }

    invoke('send_device_message', {
      deviceId: selectedDeviceId,
      message: JSON.stringify(message)
    })
      .catch((error) => {
        console.error('Failed to send message:', error);
        setErrorMessage(`Failed to send message: ${error}`);
      });

    return true;
  };

  const isConnectedToDevice = selectedDeviceId !== null && 
    devices.some(d => d.id === selectedDeviceId);

  const value: WebSocketContextType = {
    isConnected,
    socket: null,
    errorMessage,
    setErrorMessage,
    sendMessage,
    devices,
    selectedDeviceId,
    selectDevice,
    isConnectedToDevice
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextType {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
}
