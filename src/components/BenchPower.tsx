"use client";

import { useState } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';

// Sensor data interface
interface SensorData {
  voltage: number;
  current: number;
  voltage_ignition?: number;
  voltage_abs?: number;
}

interface BenchPowerProps {
  sendMessage: (message: string) => Promise<boolean | void>;
}

export default function BenchPower(_props: BenchPowerProps) {
  const [sensorData] = useState<SensorData>({
    voltage: 0,
    current: 0,
    voltage_ignition: 0,
    voltage_abs: 0,
  });

  const { isConnectedToDevice } = useWebSocketContext();

  return (
    <div className="card">
      <h3 className="card-header">
        Bench Power Supply
      </h3>

      <div className="space-y-4">
        {/* Voltage and Current Controls - Commented out as not necessary */}
        {/*
        <div>
          <label className="input-label">
            Voltage ({voltage.toFixed(1)}V)
          </label>
          <div className="flex items-center">
            <span className="mr-2 text-gray-600 dark:text-gray-400">0V</span>
            <input
              type="range"
              min="0"
              max="24"
              step="0.1"
              value={voltage}
              onChange={handleVoltageChange}
              disabled={!isConnectedToDevice}
              className={`
                w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer
                dark:bg-gray-700 
                ${!isConnectedToDevice ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            />
            <span className="ml-2 text-gray-600 dark:text-gray-400">24V</span>
          </div>
        </div>

        <div>
          <label className="input-label">
            Current Limit ({current.toFixed(2)}A)
          </label>
          <div className="flex items-center">
            <span className="mr-2 text-gray-600 dark:text-gray-400">0A</span>
            <input
              type="range"
              min="0"
              max="5"
              step="0.01"
              value={current}
              onChange={handleCurrentChange}
              disabled={!isConnectedToDevice}
              className={`
                w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer
                dark:bg-gray-700
                ${!isConnectedToDevice ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            />
            <span className="ml-2 text-gray-600 dark:text-gray-400">5A</span>
          </div>
        </div>

        <button
          onClick={handleCurrentReset}
          disabled={!isConnectedToDevice || resetInProgress}
          className={`
            w-full
            ${resetInProgress 
              ? 'btn-warning' 
              : 'btn-primary'
            }
            ${!isConnectedToDevice || resetInProgress ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          {resetInProgress ? 'Resetting...' : 'Reset Current Meter'}
        </button>
        */}

        {/* ESP32 Sensor Readings */}
        <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600/50">
          <h4 className="text-base font-semibold text-slate-800 dark:text-white mb-3">
            Live Sensor Readings
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-xl font-bold status-info">
                {sensorData.voltage.toFixed(2)}V
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">VCC Main</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold status-success">
                {sensorData.current.toFixed(3)}A
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Current</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold status-warning">
                {(sensorData.voltage_ignition || 0).toFixed(2)}V
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Ignition</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                {(sensorData.voltage_abs || 0).toFixed(2)}V
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">ABS Power</div>
            </div>
          </div>
        </div>

        {!isConnectedToDevice && (
          <div className="text-amber-600 dark:text-amber-500 text-sm mt-2">
            Connect to device to reset current metering.
          </div>
        )}
      </div>
    </div>
  );
}
