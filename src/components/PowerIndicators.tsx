"use client";

import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { PowerIcon, BoltIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';

interface PowerIndicatorsProps {
  sendMessage: (message: any) => Promise<boolean | void>;
  onPowerStatusChange?: (powerOn: boolean, ignitionOn: boolean) => void;
}

interface PowerStates {
  absPower: boolean;
  ignition: boolean;
}

export interface PowerIndicatorsRef {
  toggleAbsPower: () => void;
  toggleIgnition: () => void;
}

const PowerIndicators = forwardRef<PowerIndicatorsRef, PowerIndicatorsProps>(({ sendMessage }, ref) => {
  const [powerStates, setPowerStates] = useState<PowerStates>({
    absPower: false,
    ignition: false
  });
  
  const [isUpdating, setIsUpdating] = useState({
    absPower: false,
    ignition: false
  });

  const { isConnectedToDevice } = useWebSocketContext();

  useImperativeHandle(ref, () => ({
    toggleAbsPower: handleAbsPowerToggle,
    toggleIgnition: handleIgnitionToggle
  }));

  const handleAbsPowerToggle = async () => {
    if (!isConnectedToDevice) return;
    
    setIsUpdating(prev => ({ ...prev, absPower: true }));
    
    try {
      const newState = !powerStates.absPower;
      
      // CORRECTED: Create the JSON string
      const messageToSend = JSON.stringify({
        type: 15, // MSG_SET_ABS_POWER
        id: Date.now(),
        state: newState,
        timestamp: Date.now()
      });

      // CORRECTED: Send the string directly
      const success = await sendMessage(messageToSend);
      
      if (success) {
        setPowerStates(prev => ({ ...prev, absPower: newState }));
      }
    } catch (error) {
      console.error('Error toggling ABS power:', error);
    } finally {
      setIsUpdating(prev => ({ ...prev, absPower: false }));
    }
  };

  const handleIgnitionToggle = async () => {
    if (!isConnectedToDevice) return;
    
    setIsUpdating(prev => ({ ...prev, ignition: true }));
    
    try {
      const newState = !powerStates.ignition;

      // CORRECTED: Create the JSON string
      const messageToSend = JSON.stringify({
        type: 16, // MSG_SET_IGNITION
        id: Date.now(),
        state: newState,
        timestamp: Date.now()
      });

      // CORRECTED: Send the string directly
      const success = await sendMessage(messageToSend);
      
      if (success) {
        setPowerStates(prev => ({ ...prev, ignition: newState }));
      }
    } catch (error) {
      console.error('Error toggling ignition:', error);
    } finally {
      setIsUpdating(prev => ({ ...prev, ignition: false }));
    }
  };
  return (
    <div className="card">
      <h3 className="card-header">
        Power Control
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ABS Power Control */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            ABS Power
          </label>
          <button
            onClick={handleAbsPowerToggle}
            disabled={!isConnectedToDevice || isUpdating.absPower}
            className={clsx(
              'w-full py-3 px-4 rounded-lg font-medium transition-all duration-200',
              'flex items-center justify-center gap-2',
              'shadow-md',
              !isConnectedToDevice && 'btn-secondary opacity-50 cursor-not-allowed',
              isConnectedToDevice && powerStates.absPower && 'btn-success',
              isConnectedToDevice && !powerStates.absPower && 'btn-secondary',
              isUpdating.absPower && 'animate-pulse'
            )}
          >
            <PowerIcon className="h-5 w-5" />
            <span>
              {isUpdating.absPower 
                ? 'Updating...' 
                : powerStates.absPower 
                  ? 'ABS Power ON' 
                  : 'ABS Power OFF'
              }
            </span>
          </button>
          <div className="flex items-center gap-2 text-sm">
            <div className={clsx(
              'connection-dot',
              powerStates.absPower ? 'connection-connected' : 'connection-disconnected'
            )} />
            <span className={powerStates.absPower ? 'status-success' : 'status-error'}>
              Status: {powerStates.absPower ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>

        {/* Ignition Control */}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Ignition
          </label>
          <button
            onClick={handleIgnitionToggle}
            disabled={!isConnectedToDevice || isUpdating.ignition}
            className={clsx(
              'w-full py-3 px-4 rounded-lg font-medium transition-all duration-200',
              'flex items-center justify-center gap-2',
              'shadow-md',
              !isConnectedToDevice && 'btn-secondary opacity-50 cursor-not-allowed',
              isConnectedToDevice && powerStates.ignition && 'btn-warning',
              isConnectedToDevice && !powerStates.ignition && 'btn-secondary',
              isUpdating.ignition && 'animate-pulse'
            )}
          >
            <BoltIcon className="h-5 w-5" />
            <span>
              {isUpdating.ignition 
                ? 'Updating...' 
                : powerStates.ignition 
                  ? 'Ignition ON' 
                  : 'Ignition OFF'
              }
            </span>
          </button>
          <div className="flex items-center gap-2 text-sm">
            <div className={clsx(
              'connection-dot',
              powerStates.ignition ? 'bg-amber-500' : 'connection-disconnected'
            )} />
            <span className={powerStates.ignition ? 'status-warning' : 'status-error'}>
              Status: {powerStates.ignition ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>

      {!isConnectedToDevice && (
        <div className="mt-4 p-3 bg-amber-100 border border-amber-300 text-amber-800 rounded-lg text-sm">
          <strong>Note:</strong> Connect to the ESP32 board to control power settings.
        </div>
      )}
    </div>
  );
});

export default React.memo(PowerIndicators);
