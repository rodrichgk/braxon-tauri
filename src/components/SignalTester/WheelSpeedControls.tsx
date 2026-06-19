
import { LinkIcon } from '@heroicons/react/24/solid';

interface WheelSpeeds { fl: number; fr: number; rl: number; rr: number; }

interface WheelSpeedControlsProps {
  wheelSpeeds: WheelSpeeds;
  wheelEnabled: { fl: boolean; fr: boolean; rl: boolean; rr: boolean };
  isLinked: boolean;
  masterSpeed: number;
  maxSpeed: number;
  isConnected: boolean;
  isAutoTesting: boolean;
  isPlayingRecorded: boolean;
  onMasterSpeedChange: (speed: number) => void;
  onIndividualWheelChange: (wheel: keyof WheelSpeeds, speed: number) => void;
  onToggleWheelEnabled: (wheel: keyof WheelSpeeds) => void;
  onToggleLinked: () => void;
}

export default function WheelSpeedControls({
  wheelSpeeds, wheelEnabled, isLinked, masterSpeed, maxSpeed,
  isConnected, isAutoTesting, isPlayingRecorded,
  onMasterSpeedChange, onIndividualWheelChange, onToggleWheelEnabled, onToggleLinked,
}: WheelSpeedControlsProps) {
  const disabled = !isConnected || isAutoTesting || isPlayingRecorded;

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-text-primary">Per-wheel Control (Hz)</h3>
        <button
          onClick={onToggleLinked}
          className={['flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            isLinked ? 'bg-accent/15 text-accent border border-accent/20' : 'btn-secondary'].join(' ')}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          {isLinked ? 'Linked' : 'Individual'}
        </button>
      </div>

      {isLinked ? (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="input-label mb-0">Hz override</label>
              <span className="text-sm font-semibold text-accent font-mono">{masterSpeed} Hz</span>
            </div>
            <input type="range" min="0" max={maxSpeed} value={masterSpeed}
              onChange={e => onMasterSpeedChange(parseInt(e.target.value))}
              className="w-full h-1.5 bg-elevated rounded-full appearance-none cursor-pointer accent-[#0a84ff] disabled:opacity-40"
              disabled={disabled}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(wheelEnabled) as [keyof WheelSpeeds, boolean][]).map(([wheel, on]) => (
              <button key={wheel} onClick={() => onToggleWheelEnabled(wheel)} disabled={disabled}
                className={['py-2.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40',
                  on ? 'bg-success/15 text-success border border-success/20'
                     : 'bg-danger/15 text-danger border border-danger/20'].join(' ')}>
                {wheel.toUpperCase()} · {on ? `${wheelSpeeds[wheel]} Hz` : 'OFF'}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {(Object.entries(wheelSpeeds) as [keyof WheelSpeeds, number][]).map(([wheel, speed]) => (
            <div key={wheel} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">{wheel.toUpperCase()}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-accent font-mono">{speed} Hz</span>
                  <button onClick={() => onToggleWheelEnabled(wheel)} disabled={disabled}
                    className={['px-2 py-0.5 rounded text-[10px] font-semibold transition-colors disabled:opacity-40',
                      wheelEnabled[wheel] ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'].join(' ')}>
                    {wheelEnabled[wheel] ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
              <input type="range" min="0" max={maxSpeed} value={speed}
                onChange={e => onIndividualWheelChange(wheel, parseInt(e.target.value))}
                className="w-full h-1.5 bg-elevated rounded-full appearance-none cursor-pointer accent-[#0a84ff] disabled:opacity-40"
                disabled={disabled || !wheelEnabled[wheel]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
