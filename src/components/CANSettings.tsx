"use client";

import { useState, useEffect, useRef } from 'react';
import {
  DevicePhoneMobileIcon,
  LightBulbIcon,
  ArrowDownTrayIcon,
  XCircleIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

interface CANMessage {
  timestamp: string;
  direction: 'TX' | 'RX';
  message: string;
}

interface CANSettingsProps {
  result: {
    canSpeed: string;
    canByte: string;
    canIdLine: string;
    canValue: string;
  };
  isConnected: boolean;
  sendMessage?: (message: string) => Promise<boolean | void>;
  canReceivedData?: {
    idLine?: string;
    byte?: string;
    value?: string;
  };
}

export default function CANSettings({
  result,
  isConnected,
  sendMessage,
  canReceivedData = {}
}: CANSettingsProps) {
  // Maximum number of messages to keep in the log
  const MAX_LOG_MESSAGES = 100;
  const [hasFaults, setHasFaults] = useState(false);
  const [receivedCanData, setReceivedCanData] = useState<{
    idLine?: string;
    byte?: string;
    value?: string;
    hasComms: boolean;
  }>({
    idLine: undefined,
    byte: undefined,
    value: undefined,
    hasComms: false
  });
  const [canData, setCanData] = useState({
    speed: result.canSpeed,
    byte: result.canByte,
    idLine: result.canIdLine,
    value: result.canValue,
  });
  const [canMessages, setCanMessages] = useState<CANMessage[]>([]);
  const [showLog, setShowLog] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCanData(prev => ({ ...prev, [name]: value }));
  };

  // Check fault status based on incoming CAN data
  const checkFaultStatus = () => {
    // If we have communication but values don't match expected ones
    if (receivedCanData.hasComms) {
      // Compare received values with expected values
      // If any of the values don't match, we have faults
      const hasMismatch = Boolean(
        (receivedCanData.idLine && receivedCanData.idLine !== canData.idLine) || 
        (receivedCanData.byte && receivedCanData.byte !== canData.byte) || 
        (receivedCanData.value && receivedCanData.value !== canData.value)
      );
      
      setHasFaults(hasMismatch);
    }
  };
  
  // For manual testing
  const toggleFaults = () => setHasFaults(f => !f);
  
  // Sync internal state when result prop changes (e.g. new search selection)
  useEffect(() => {
    setCanData({
      speed: result.canSpeed,
      byte: result.canByte,
      idLine: result.canIdLine,
      value: result.canValue,
    });
  }, [result.canSpeed, result.canByte, result.canIdLine, result.canValue]);

  // Keep log scrolled to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [canMessages]);

  // Add message to the log
  const addMessageToLog = (direction: 'TX' | 'RX', message: string) => {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    setCanMessages(prev => {
      const newMessage = {
        timestamp,
        direction,
        message
      };
      
      // If we've reached the maximum number of messages, remove the oldest one
      if (prev.length >= MAX_LOG_MESSAGES) {
        return [...prev.slice(1), newMessage];
      }
      
      // Otherwise, just add the new message
      return [...prev, newMessage];
    });
  };

  // Clear log messages
  const clearLog = () => {
    setCanMessages([]);
  };

  // Send CAN message
  const sendCanMessage = async () => {
    if (isConnected && sendMessage) {
      const message = `SEND:${canData.idLine}:${canData.value}:${canData.byte}`;
      addMessageToLog('TX', `ID: ${canData.idLine} | Data: ${canData.value} | Length: ${canData.byte}`);
      await sendMessage(message);
    }
  };

  // Send CAN speed 1 second after connection
  useEffect(() => {
    if (isConnected && sendMessage) {
      const timer = setTimeout(() => {
        // Simply take the first 3 characters (e.g., "500" from "500Kbps")
        const message = `t\n`;
        sendMessage(message);
        //addMessageToLog('TX', `Set CAN Speed: ${speedValue}kbps`);
      }, 1000); // 1 second delay
      
      return () => clearTimeout(timer);
    }
  }, [isConnected, sendMessage, canData.speed]);

  // Update received CAN data when props change
  useEffect(() => {
    if (canReceivedData) {
      setReceivedCanData(prev => ({
        ...prev,
        idLine: canReceivedData.idLine,
        byte: canReceivedData.byte,
        value: canReceivedData.value,
        hasComms: !!canReceivedData.idLine || !!canReceivedData.byte || !!canReceivedData.value
      }));
    }
  }, [canReceivedData]);
  
  // Check fault status whenever received data changes
  useEffect(() => {
    if (receivedCanData.hasComms) {
      checkFaultStatus();
    }
  }, [receivedCanData, canData.idLine, canData.byte, canData.value]);

  return (
    <div className="card">
      <h2 className="card-header flex items-center">
        <DevicePhoneMobileIcon className="h-6 w-6 mr-2 text-blue-600" />
        CAN Settings
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {[
          {
            label: 'CAN Speed',
            name: 'speed',
            value: canData.speed,
            placeholder: '500kbps',
          },
          {
            label: 'CAN Byte',
            name: 'byte',
            value: canData.byte,
            placeholder: '8',
          },
          {
            label: 'CAN ID Line',
            name: 'idLine',
            value: canData.idLine,
            placeholder: '0x7E0',
          },
          {
            label: 'CAN Value',
            name: 'value',
            value: canData.value,
            placeholder: '0xFF',
          },
        ].map((field, idx) => (
          <div key={idx}>
            <label
              htmlFor={field.name}
              className="input-label"
            >
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type="text"
              value={field.value}
              onChange={handleChange}
              placeholder={field.placeholder}
              className="input-field"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
        <div className="flex items-center gap-4">
          <div className={`flex items-center text-sm ${isConnected ? 'status-success' : 'status-error'}`}>
            <span
              className={`connection-dot ${isConnected ? 'connection-connected' : 'connection-disconnected'}`}
            />
            <span className="ml-2 font-medium">
              {isConnected ? 'Connected' : 'Disconnected — use the bar above'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Fault Codes:
          </span>
          <button
            onClick={toggleFaults}
            className={`
              relative inline-flex items-center
              h-6 w-12
              rounded-full
              transition
              focus:outline-none focus:ring-2 focus:ring-blue-600
              ${
                hasFaults
                  ? 'bg-red-600'
                  : (receivedCanData.hasComms ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-600')
              }
            `}
          >
            <div
              className={`
                h-5 w-5
                bg-white
                rounded-full
                shadow
                transform transition
                ${hasFaults ? 'translate-x-6' : 'translate-x-1'}
              `}
            />
            <LightBulbIcon
              className={`
                absolute h-4 w-4
                ${hasFaults ? 'text-white left-1' : 'text-slate-500 right-1'}
                transition
              `}
            />
          </button>
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center">
            <button
              onClick={() => setShowLog(!showLog)}
              className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600 mr-2 focus:outline-none transition-colors"
              aria-label={showLog ? "Hide log" : "Show log"}
            >
              {showLog ? (
                <ChevronUpIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              ) : (
                <ChevronDownIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              )}
            </button>
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
              CAN Communication Log
            </h3>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={sendCanMessage}
              disabled={!isConnected}
              className={`flex items-center px-2 py-1 text-xs rounded ${isConnected ? 'btn-primary' : 'btn-secondary opacity-50 cursor-not-allowed'}`}
            >
              <ArrowDownTrayIcon className="h-3 w-3 mr-1" />
              Send
            </button>
            <button
              onClick={clearLog}
              className="flex items-center px-2 py-1 text-xs btn-secondary"
            >
              <XCircleIcon className="h-3 w-3 mr-1" />
              Clear
            </button>
          </div>
        </div>
        {showLog && (
          <div
            ref={logContainerRef}
            className="bg-slate-100 dark:bg-slate-700 p-4 rounded-xl h-32 overflow-auto font-mono text-sm text-slate-800 dark:text-slate-200 transition-colors"
          >
          {isConnected ? (
            canMessages.length > 0 ? (
              canMessages.map((msg, idx) => (
                <div key={idx} className="mb-1">
                  <span className="text-slate-500 dark:text-slate-400 text-xs mr-2">[{msg.timestamp}]</span>
                  <span className={msg.direction === 'TX' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}>
                    {msg.direction === 'TX' ? '➤ ' : '◀ '}
                  </span>
                  <span>{msg.message}</span>
                </div>
              ))
            ) : (
              <div className="italic text-slate-500 dark:text-slate-400">
                No messages yet. Use the Send button to send a CAN message.
              </div>
            )
          ) : (
            <div className="italic text-slate-500 dark:text-slate-400">
              Not connected to CAN bus...
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
