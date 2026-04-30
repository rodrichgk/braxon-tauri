"use client";

import { useState, useEffect, useCallback } from 'react';
import clientSerial, { SerialEvent, SerialOptions } from '@/lib/clientSerial';

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
  autoScroll: boolean;
  setAutoScroll: (scroll: boolean) => void;
  dataLog: string[];
}

export function useClientSerialConnection(callbacks?: SerialConnectionCallbacks): UseClientSerialConnectionResult {
  const [isConnected, setIsConnected] = useState(false);
  const [baudRate, setBaudRate] = useState('500000');
  const [autoScroll, setAutoScroll] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dataLog, setDataLog] = useState<string[]>([]);

  // Handle serial events
  const handleSerialEvent = useCallback((event: SerialEvent) => {
    switch (event.type) {
      case 'connected':
        setIsConnected(true);
        setErrorMessage(null);
        // Call onConnect callback if provided
        if (callbacks?.onConnect) {
          callbacks.onConnect();
        }
        break;
      case 'disconnected':
        setIsConnected(false);
        // Call onDisconnect callback if provided
        if (callbacks?.onDisconnect) {
          callbacks.onDisconnect();
        }
        break;
      case 'data':
        if (event.data) {
          setDataLog(prev => {
            const newLog = [...prev, event.data!];
            // Limit log size to prevent memory issues
            if (newLog.length > 1000) {
              return newLog.slice(-1000);
            }
            return newLog;
          });
          
          // Call onDataReceived callback if provided
          if (callbacks?.onDataReceived) {
            callbacks.onDataReceived(event.data);
          }
        }
        break;
      case 'error':
        setErrorMessage(event.error?.message || 'Unknown error');
        console.error('Serial error:', event.error);
        
        // Call onError callback if provided
        if (callbacks?.onError && event.error) {
          callbacks.onError({ message: event.error.message || 'Unknown error' });
        }
        break;
    }
  }, [callbacks]);

  // Set up event listener
  useEffect(() => {
    clientSerial.addEventListener(handleSerialEvent);
    
    return () => {
      clientSerial.removeEventListener(handleSerialEvent);
    };
  }, [handleSerialEvent]);

  const clearError = () => {
    setErrorMessage(null);
  };

  const connect = async (): Promise<boolean> => {
    try {
      clearError();
      
      // First request a port selection
      const portSelected = await clientSerial.requestPort();
      if (!portSelected) {
        return false;
      }
      
      // Then connect with the selected baudRate
      const options: SerialOptions = {
        baudRate: parseInt(baudRate, 10)
      };
      
      const connected = await clientSerial.connect(options);
      if (connected) {
        // Start reading data from the port
        clientSerial.startReading();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Connection error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Connection failed');
      return false;
    }
  };

  const disconnect = async (): Promise<void> => {
    try {
      await clientSerial.disconnect();
    } catch (error) {
      console.error('Disconnect error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Disconnect failed');
    }
  };

  const sendCommand = async (command: string): Promise<boolean> => {
    if (!isConnected) {
      setErrorMessage('Not connected to a device');
      return false;
    }
    
    try {
      const success = await clientSerial.write(command);
      return success;
    } catch (error) {
      console.error('Send error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to send command');
      return false;
    }
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
    autoScroll,
    setAutoScroll,
    dataLog
  };
}
