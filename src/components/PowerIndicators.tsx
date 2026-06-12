"use client";

import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { PowerIcon, BoltIcon } from '@heroicons/react/24/outline';

interface PowerIndicatorsProps {
  sendMessage: (message: any) => Promise<boolean | void>;
  onPowerStatusChange?: (powerOn: boolean, ignitionOn: boolean) => void;
}
export interface PowerIndicatorsRef {
  toggleAbsPower: () => void;
  toggleIgnition: () => void;
}

const PowerIndicators = forwardRef<PowerIndicatorsRef, PowerIndicatorsProps>(({ sendMessage, onPowerStatusChange }, ref) => {
  const [absPower,  setAbsPower]  = useState(false);
  const [ignition,  setIgnition]  = useState(false);
  const [busyAbs,   setBusyAbs]   = useState(false);
  const [busyIgn,   setBusyIgn]   = useState(false);
  const { isConnectedToDevice } = useWebSocketContext();

  const toggle = async (type: 15 | 16, current: boolean, setOn: (v: boolean) => void, setBusy: (v: boolean) => void) => {
    if (!isConnectedToDevice) return;
    setBusy(true);
    try {
      const next = !current;
      const ok = await sendMessage(JSON.stringify({ type, id: Date.now(), state: next, timestamp: Date.now() }));
      if (ok) {
        setOn(next);
        if (onPowerStatusChange) onPowerStatusChange(type === 15 ? next : absPower, type === 16 ? next : ignition);
      }
    } catch {}
    finally { setBusy(false); }
  };

  useImperativeHandle(ref, () => ({
    toggleAbsPower: () => toggle(15, absPower, setAbsPower, setBusyAbs),
    toggleIgnition: () => toggle(16, ignition, setIgnition, setBusyIgn),
  }));

  const PowerBtn = ({
    on, busy, label, icon: Icon, onToggle,
  }: { on: boolean; busy: boolean; label: string; icon: typeof PowerIcon; onToggle: () => void }) => (
    <div className="space-y-2">
      <label className="input-label">{label}</label>
      <button
        onClick={onToggle}
        disabled={!isConnectedToDevice || busy}
        className={[
          'w-full py-2.5 flex items-center justify-center gap-2 rounded-lg text-sm font-medium',
          'transition-all disabled:opacity-40 disabled:cursor-not-allowed',
          busy ? 'animate-pulse' : '',
          on ? 'bg-success/15 text-success border border-success/20 hover:bg-success/25'
             : 'bg-elevated text-text-secondary border border-border hover:text-text-primary',
        ].join(' ')}
      >
        <Icon className="h-4 w-4" />
        {busy ? 'Updating…' : on ? `${label} ON` : `${label} OFF`}
      </button>
      <div className="flex items-center gap-2 text-xs">
        <span className={['w-1.5 h-1.5 rounded-full', on ? 'bg-success' : 'bg-text-tertiary'].join(' ')} />
        <span className={on ? 'text-success' : 'text-text-tertiary'}>{on ? 'Enabled' : 'Disabled'}</span>
      </div>
    </div>
  );

  return (
    <div className="card">
      <h3 className="card-header">Power Control</h3>
      <div className="grid grid-cols-2 gap-4">
        <PowerBtn on={absPower} busy={busyAbs} label="ABS Power" icon={PowerIcon} onToggle={() => toggle(15, absPower, setAbsPower, setBusyAbs)} />
        <PowerBtn on={ignition} busy={busyIgn} label="Ignition"  icon={BoltIcon}  onToggle={() => toggle(16, ignition, setIgnition, setBusyIgn)} />
      </div>
      {!isConnectedToDevice && (
        <p className="text-xs text-text-tertiary mt-3 text-center">Connect ESP32 to control power</p>
      )}
    </div>
  );
});

export default React.memo(PowerIndicators);
