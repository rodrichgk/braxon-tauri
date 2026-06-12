"use client";

import { useState } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';

interface SensorData { voltage: number; current: number; voltage_ignition?: number; voltage_abs?: number; }
interface BenchPowerProps { sendMessage: (message: string) => Promise<boolean | void>; }

export default function BenchPower(_props: BenchPowerProps) {
  const [sensor] = useState<SensorData>({ voltage: 0, current: 0, voltage_ignition: 0, voltage_abs: 0 });
  const { isConnectedToDevice } = useWebSocketContext();

  const readings = [
    { label: 'VCC Main',  value: `${sensor.voltage.toFixed(2)} V` },
    { label: 'Current',   value: `${sensor.current.toFixed(3)} A` },
    { label: 'Ignition',  value: `${(sensor.voltage_ignition ?? 0).toFixed(2)} V` },
    { label: 'ABS Power', value: `${(sensor.voltage_abs ?? 0).toFixed(2)} V` },
  ];

  return (
    <div className="card">
      <h3 className="card-header">Bench Power Supply</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {readings.map(({ label, value }) => (
          <div key={label} className="bg-elevated rounded-xl px-3 py-2.5 text-center border border-border">
            <p className="text-xs text-text-tertiary mb-1">{label}</p>
            <p className="text-lg font-semibold text-text-primary font-mono">{value}</p>
          </div>
        ))}
      </div>

      {!isConnectedToDevice && (
        <p className="text-xs text-text-tertiary mt-3 text-center">Connect to ESP32 to enable power control</p>
      )}
    </div>
  );
}
