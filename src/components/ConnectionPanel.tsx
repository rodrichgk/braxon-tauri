"use client";

import { useState } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

export default function ConnectionPanel() {
  const [showDetails, setShowDetails] = useState(false);
  
  const { 
    isConnected: wsConnected, 
    devices, 
    selectedDeviceId, 
    selectDevice 
  } = useWebSocketContext();

  const { 
    isConnected: serialConnected, 
    connect: serialConnect,
    disconnect: serialDisconnect,
    errorMessage: serialError
  } = useClientSerialConnection();

  // Unified connection status
  const isConnected = Boolean((wsConnected && selectedDeviceId) || serialConnected);

  const esp32Devices = devices.filter(d => d.type === 'esp32');

  return (
    <div className="glass-effect rounded-xl p-6 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
            Connection
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {esp32Devices.length} ESP32 device{esp32Devices.length !== 1 ? 's' : ''} available
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Connection Status Indicator */}
          <div className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
            isConnected 
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
          )}>
            <span className={clsx(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-400'
            )} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>

          {/* Show/Hide Details Button */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg
              transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg"
          >
            {showDetails ? (
              <>
                <ChevronUpIcon className="h-4 w-4" />
                Hide Details
              </>
            ) : (
              <>
                <ChevronDownIcon className="h-4 w-4" />
                Show Details
              </>
            )}
          </button>
        </div>
      </div>

      {/* Connection Details */}
      {showDetails && (
        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          {/* WebSocket Devices Section */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              WebSocket Devices
            </h4>
            
            {esp32Devices.length > 0 ? (
              <div className="space-y-2">
                {esp32Devices.map(device => {
                  const isSelected = device.id === selectedDeviceId;
                  const isPaired = device.isPaired && !isSelected;
                  
                  return (
                    <div
                      key={device.id}
                      className={clsx(
                        'p-4 rounded-lg border-2 transition-all',
                        isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : isPaired
                          ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 dark:text-white">
                              {device.name || device.id}
                            </span>
                            {isSelected && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
                                SELECTED
                              </span>
                            )}
                            {isPaired && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">
                                PAIRED WITH ANOTHER CLIENT
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            ID: {device.id}
                          </div>
                        </div>
                        
                        <button
                          onClick={() => selectDevice(isSelected ? null : device.id)}
                          disabled={isPaired}
                          className={clsx(
                            'px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg',
                            isSelected
                              ? 'bg-red-600 hover:bg-red-700 text-white'
                              : isPaired
                              ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-500 cursor-not-allowed'
                              : 'bg-green-600 hover:bg-green-700 text-white'
                          )}
                        >
                          {isSelected ? 'Disconnect' : isPaired ? 'Unavailable' : 'Connect'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600">
                <div className="text-slate-400 dark:text-slate-500 mb-2">
                  <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-slate-600 dark:text-slate-400 font-medium">No ESP32 devices connected</p>
                <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                  Make sure your device is powered on and connected to the network
                </p>
              </div>
            )}
          </div>

          {/* Serial Connection Section */}
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              Serial Connection
            </h4>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => serialConnected ? serialDisconnect() : serialConnect()}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg',
                  serialConnected
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                )}
              >
                {serialConnected ? 'Disconnect Serial' : 'Connect Serial'}
              </button>
              
              {serialConnected && (
                <span className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Serial Connected
                </span>
              )}
              
              {serialError && (
                <span className="text-sm text-red-600 dark:text-red-400">
                  {serialError}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
