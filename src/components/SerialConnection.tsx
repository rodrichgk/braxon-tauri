"use client";

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowsRightLeftIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import clientSerial, { SerialEvent, SerialOptions } from '../lib/clientSerial';

const isBrowser = typeof window !== 'undefined';

interface SerialConnectionProps {
  onConnectionChange: (connected: boolean) => void;
  onDataReceived: (data: string) => void;
  children?: React.ReactNode;
}

export default function SerialConnection({
  onConnectionChange,
  onDataReceived,
  children,
}: SerialConnectionProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [baudRate, setBaudRate] = useState("500000");
  const [serialAvailable, setSerialAvailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dataLog, setDataLog] = useState<Array<{ message: string; timestamp: string; direction: 'in' | 'out' }>>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logRef = React.useRef<HTMLDivElement>(null);

  // Check Web Serial API availability
  useEffect(() => {
    if (isBrowser) {
      const isSecure = window.isSecureContext;
      const hasSerial = 'serial' in navigator;

      if (!isSecure) {
        setErrorMessage(
          "Web Serial API requires HTTPS or localhost. Use a secure context or 'localhost'."
        );
        setSerialAvailable(false);
      } else if (!hasSerial) {
        setErrorMessage(
          "Web Serial API not supported. Please use Chrome, Edge, or Opera."
        );
        setSerialAvailable(false);
      } else {
        setSerialAvailable(true);
      }
    }
  }, []);

  // Serial event handler
  const handleSerialEvent = useCallback((event: SerialEvent) => {
    switch (event.type) {
      case 'connected':
        setIsConnected(true);
        setErrorMessage(null);
        onConnectionChange(true);
        break;
      case 'disconnected':
        setIsConnected(false);
        onConnectionChange(false);
        break;
      case 'data':
        if (event.data) {
          setDataLog(prev => {
            const now = new Date();
            const timestamp = now.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            });
            const newEntry = { message: event.data!, timestamp, direction: 'in' as const };
            
            // If auto-scroll is disabled and there's already data of the same direction,
            // update the last entry of that direction instead of adding a new one
            if (!autoScroll && prev.length > 0) {
              const lastInIndex = prev.map(entry => entry.direction).lastIndexOf('in');
              if (lastInIndex >= 0) {
                const updated = [...prev];
                updated[lastInIndex] = newEntry;
                return updated;
              }
            }
            
            // Otherwise add a new entry
            return [...prev, newEntry].slice(-1000);
          });
          onDataReceived(event.data);
        }
        break;
      case 'error':
        setErrorMessage(event.error?.message || 'Unknown error');
        console.error('Serial error:', event.error);
        break;
    }
  }, [onConnectionChange, onDataReceived]);

  // Attach/detach event listener
  useEffect(() => {
    if (isBrowser) {
      clientSerial.addEventListener(handleSerialEvent);
      return () => {
        clientSerial.removeEventListener(handleSerialEvent);
      };
    }
  }, [handleSerialEvent]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [dataLog, autoScroll]);

  // Connect
  const handleConnect = async () => {
    try {
      setErrorMessage(null);
      const portSelected = await clientSerial.requestPort();
      if (!portSelected) return;
      const options: SerialOptions = { baudRate: parseInt(baudRate, 10) };
      const connected = await clientSerial.connect(options);
      if (connected) clientSerial.startReading();
    } catch (err) {
      console.error('Connection error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    try {
      await clientSerial.disconnect();
    } catch (err) {
      console.error('Disconnect error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Disconnect failed');
    }
  };

  // Send message
  const sendMessage = useCallback((message: string) => {
    if (!isConnected) return;
    clientSerial.write(message)
      .then(() => {
        setDataLog(prev => {
          const now = new Date();
          const timestamp = now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          });
          const newEntry = { message, timestamp, direction: 'out' as const };
          
          // If auto-scroll is disabled and there's already data of the same direction,
          // update the last entry of that direction instead of adding a new one
          if (!autoScroll && prev.length > 0) {
            const lastOutIndex = prev.map(entry => entry.direction).lastIndexOf('out');
            if (lastOutIndex >= 0) {
              const updated = [...prev];
              updated[lastOutIndex] = newEntry;
              return updated;
            }
          }
          
          return [...prev, newEntry].slice(-1000);
        });
      })
      .catch(err => {
        console.error('Error sending message:', err);
        setErrorMessage(`Failed to send: ${err instanceof Error ? err.message : err}`);
      });
  }, [isConnected]);

  return (
    <div className="card">
      <h2 className="card-header flex items-center">
        <ArrowsRightLeftIcon className="h-6 w-6 mr-2 text-blue-600" />
        Serial Connection
      </h2>

      {!serialAvailable ? (
        <div className="alert alert-warning mb-6">
          <div className="flex items-center mb-2">
            <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
            <span className="font-semibold">Browser Compatibility Warning</span>
          </div>
          <p className="mb-2">{errorMessage}</p>
          <ul className="list-disc ml-6">
            <li>Use <code className="bg-gray-200 px-1 rounded">localhost:3000</code> instead of an IP.</li>
            <li>Enable HTTPS on your dev server.</li>
            <li>
              In Chrome, enable “Insecure origins treated as secure”:
              <ol className="list-decimal ml-6 mt-1">
                <li>Go to <code className="bg-gray-200 px-1 rounded">chrome://flags</code></li>
                <li>Search for “Insecure origins treated as secure”</li>
                <li>Add your IP (e.g. <code className="bg-gray-200 px-1 rounded">http://192.168.1.100:3000</code>)</li>
                <li>Restart browser</li>
              </ol>
            </li>
          </ul>
        </div>
      ) : (
        <div className="space-y-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label htmlFor="baudRate" className="input-label">
                Baud Rate
              </label>
              <select
                id="baudRate"
                value={baudRate}
                onChange={e => setBaudRate(e.target.value)}
                disabled={isConnected}
                className="input-field"
              >
                {['9600', '19200', '38400', '57600', '115200', '250000', '500000'].map(br => (
                  <option key={br} value={br}>{br}</option>
                ))}
              </select>
            </div>

            <div className="flex space-x-4">
              {!isConnected ? (
                <button
                  onClick={handleConnect}
                  className="btn-primary"
                >
                  Connect
                </button>
              ) : (
                <button
                  onClick={handleDisconnect}
                  className="btn-danger"
                >
                  Disconnect
                </button>
              )}
            </div>

            <div className={`flex items-center ${isConnected ? 'status-success' : 'status-error'}`}>
              <div className={`connection-dot ${isConnected ? 'connection-connected' : 'connection-disconnected'}`} />
              <span className="ml-2 text-sm font-medium">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>

          {errorMessage && (
            <div className="alert alert-error">
              <div className="flex items-center mb-1">
                <XCircleIcon className="h-5 w-5 mr-2" />
                <span className="font-semibold">Error</span>
              </div>
              <p>{errorMessage}</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Communication Log</h3>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setDataLog([])}
                  className="px-3 py-1 text-xs btn-secondary"
                >
                  Clear Log
                </button>
                <label className="inline-flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={e => setAutoScroll(e.target.checked)}
                    className="form-checkbox text-blue-600"
                  />
                  <span className="ml-2">Auto-scroll</span>
                </label>
              </div>
            </div>

            <div
              ref={logRef}
              className="h-60 p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 overflow-y-auto font-mono text-xs"
            >
              <div className="grid grid-cols-[80px_50px_1fr] gap-2 pb-2 border-b border-gray-300 dark:border-gray-700">
                <div className="text-gray-500 dark:text-gray-400 font-semibold">Time</div>
                <div className="text-gray-500 dark:text-gray-400 font-semibold text-center">Dir</div>
                <div className="text-gray-500 dark:text-gray-400 font-semibold">Message</div>
              </div>

              {dataLog.length === 0 ? (
                <div className="text-gray-400 dark:text-gray-500 italic mt-4">No data received</div>
              ) : (
                dataLog.map((entry, i) => (
                  <React.Fragment key={i}>
                    <div className="pt-2 text-gray-700 dark:text-gray-200">{entry.timestamp}</div>
                    <div className={`pt-2 text-center ${entry.direction === 'out' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                      {entry.direction === 'out' ? 'TX' : 'RX'}
                    </div>
                    <div className={`pt-2 whitespace-pre-wrap break-all ${entry.direction === 'out' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                      {entry.message}
                    </div>
                  </React.Fragment>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pass down sendMessage to children */}
      {React.Children.map(children, child =>
        React.isValidElement(child)
          ? React.cloneElement(child, { isConnected, sendMessage } as any)
          : child
      )}
    </div>
  );
}
