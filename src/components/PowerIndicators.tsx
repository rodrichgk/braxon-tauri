
import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { useClientSerialConnection } from '@/hooks/useClientSerialConnection';
import { PowerIcon, BoltIcon } from '@heroicons/react/24/outline';

interface PowerIndicatorsProps {
  sendMessage: (message: any) => Promise<boolean | void>;
  onPowerStatusChange?: (powerOn: boolean, ignitionOn: boolean) => void;
  /** Overrides the main-transport connection state (e.g. when power/WSS run on
   *  the separate signal board while CAN is on the Kvaser). */
  isConnected?: boolean;
}
export interface PowerIndicatorsRef {
  toggleAbsPower: () => void;
  toggleIgnition: () => void;
}

const PowerIndicators = forwardRef<PowerIndicatorsRef, PowerIndicatorsProps>(({ sendMessage, onPowerStatusChange, isConnected: isConnectedProp }, ref) => {
  const [absPower,  setAbsPower]  = useState(false);
  const [ignition,  setIgnition]  = useState(false);
  const [busyAbs,   setBusyAbs]   = useState(false);
  const [busyIgn,   setBusyIgn]   = useState(false);
  const { isConnected: mainConnected } = useClientSerialConnection();
  const isConnected = isConnectedProp ?? mainConnected;

  const toggle = async (type: 15 | 16, current: boolean, setOn: (v: boolean) => void, setBusy: (v: boolean) => void) => {
    if (!isConnected) return;
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
    <button
      onClick={onToggle}
      disabled={!isConnected || busy}
      className={[
        'flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-2 text-[11px] font-semibold border',
        'transition-all disabled:opacity-40 disabled:cursor-not-allowed',
        busy ? 'animate-pulse' : '',
        on ? 'bg-success/15 text-success border-success/25 hover:bg-success/25'
           : 'bg-elevated text-text-secondary border-border hover:text-text-primary',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {label} · {busy ? '…' : on ? 'ON' : 'OFF'}
    </button>
  );

  return (
    <div className="card">
      <h3 className="card-header !mb-2 flex items-center gap-2">
        <PowerIcon className="h-3.5 w-3.5 text-text-tertiary" />
        Power Control
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <PowerBtn on={absPower} busy={busyAbs} label="ABS Power" icon={PowerIcon} onToggle={() => toggle(15, absPower, setAbsPower, setBusyAbs)} />
        <PowerBtn on={ignition} busy={busyIgn} label="Ignition"  icon={BoltIcon}  onToggle={() => toggle(16, ignition, setIgnition, setBusyIgn)} />
      </div>
      {!isConnected && (
        <p className="text-[10px] text-text-tertiary mt-2 text-center">Connect an interface to control power</p>
      )}
    </div>
  );
});

export default React.memo(PowerIndicators);
