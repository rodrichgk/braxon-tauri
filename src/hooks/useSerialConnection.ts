import { useState, useEffect } from 'react';
import type { SerialPortInfo } from '@/lib/serialService';

export function useSerialConnection() {
  const [isConnected, setIsConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [availablePorts, setAvailablePorts] = useState<SerialPortInfo[]>([]);

  useEffect(() => {
    // Check initial connection status
    console.log('[useSerialConnection] Checking initial connection status...');
    fetch('/api/serial?mode=status')
      .then(res => res.json())
      .then(data => {
        console.log('[useSerialConnection] Initial connection status:', data);
        setIsConnected(data.connected);
        setSelectedPath(data.selectedPath);
      })
      .catch(error => {
        console.error('[useSerialConnection] Error checking connection status:', error);
        setErrorMessage('Failed to check connection status');
      });
  }, []);
  
  const fetchPorts = async () => {
    try {
      console.log('[useSerialConnection] Fetching available ports...');
      const response = await fetch('/api/serial?mode=list');
      const data = await response.json();
      console.log('[useSerialConnection] Available ports:', data.ports);
      setAvailablePorts(data.ports);
    } catch (error) {
      console.error('[useSerialConnection] Error fetching ports:', error);
      setErrorMessage('Failed to fetch available ports');
    }
  };

  const selectPort = async (path: string) => {
    try {
      console.log('[useSerialConnection] Selecting port:', path);
      const response = await fetch('/api/serial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'select', path }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('[useSerialConnection] Failed to select port:', data.error);
        setErrorMessage(data.error || 'Failed to select port');
        return false;
      }

      console.log('[useSerialConnection] Port selected successfully:', path);
      setSelectedPath(path);
      return true;
    } catch (error) {
      console.error('[useSerialConnection] Error selecting port:', error);
      setErrorMessage('Failed to select port');
      return false;
    }
  };

  const connect = async () => {
    try {
      console.log('[useSerialConnection] Initiating connection...');
      const response = await fetch('/api/serial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'connect' }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('[useSerialConnection] Connection failed:', data.error);
        setErrorMessage(data.error || 'Failed to connect');
        return false;
      }

      console.log('[useSerialConnection] Connection request successful');
      //setIsConnected(true);
      return true;
    } catch (error) {
      console.error('[useSerialConnection] Error connecting:', error);
      setErrorMessage('Failed to connect to device');
      //setIsConnected(false);
      return false;
    }
  };

  const disconnect = async () => {
    try {
      console.log('[useSerialConnection] Initiating disconnection...');
      const response = await fetch('/api/serial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'disconnect' }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('[useSerialConnection] Disconnection failed:', data.error);
        setErrorMessage(data.error || 'Failed to disconnect');
        return false;
      }

      console.log('[useSerialConnection] Disconnection successful');
      return true;
    } catch (error) {
      console.error('[useSerialConnection] Error disconnecting:', error);
      setErrorMessage('Failed to disconnect from device');
      return false;
    }
  };

  const sendCommand = async (command: string): Promise<boolean> => {
    try {
      console.log('[useSerialConnection] Sending command:', command);
      const response = await fetch('/api/serial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
      });

      if (!response.ok) {
        const data = await response.json();
        console.error('[useSerialConnection] Command failed:', data.error);
        setErrorMessage(data.error || 'Failed to send command');
        return false;
      }

      console.log('[useSerialConnection] Command sent successfully');
      return true;
    } catch (error) {
      console.error('[useSerialConnection] Error sending command:', error);
      setErrorMessage('Failed to communicate with the ABS tester');
      return false;
    }
  };

  return {
    isConnected,
    connect,
    disconnect,
    sendCommand,
    errorMessage,
    setErrorMessage,
    selectedPath,
    availablePorts,
    selectPort,
    refreshPorts: fetchPorts
  };
}
