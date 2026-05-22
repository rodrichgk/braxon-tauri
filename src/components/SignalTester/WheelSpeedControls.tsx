"use client";

import { LinkIcon } from '@heroicons/react/24/solid';

interface WheelSpeeds {
  fl: number;
  fr: number;
  rl: number;
  rr: number;
}

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
  wheelSpeeds,
  wheelEnabled,
  isLinked,
  masterSpeed,
  maxSpeed,
  isConnected,
  isAutoTesting,
  isPlayingRecorded,
  onMasterSpeedChange,
  onIndividualWheelChange,
  onToggleWheelEnabled,
  onToggleLinked,
}: WheelSpeedControlsProps) {
  const disabled = !isConnected || isAutoTesting || isPlayingRecorded;

  return (
    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-white">Per-wheel Control (Hz)</h3>
        <button
          onClick={onToggleLinked}
          className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isLinked ? 'btn-primary' : 'btn-secondary'
          }`}
        >
          <LinkIcon className="w-4 h-4 mr-1" />
          {isLinked ? 'Linked' : 'Individual'}
        </button>
      </div>

      {isLinked ? (
        <div className="space-y-4">
          <div>
            <label className="input-label block mb-2">
              Hz override: <span className="font-bold status-info">{masterSpeed} Hz</span>
            </label>
            <input
              type="range"
              min="0"
              max={maxSpeed}
              value={masterSpeed}
              onChange={e => onMasterSpeedChange(parseInt(e.target.value))}
              onInput={e => onMasterSpeedChange(parseInt((e.target as HTMLInputElement).value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
              disabled={disabled}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(wheelEnabled) as [keyof WheelSpeeds, boolean][]).map(([wheel, enabled]) => (
              <button
                key={wheel}
                onClick={() => onToggleWheelEnabled(wheel)}
                className={`p-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  enabled ? 'btn-success' : 'btn-danger'
                }`}
                disabled={disabled}
              >
                {wheel.toUpperCase()}: {enabled ? `${wheelSpeeds[wheel]} Hz` : 'OFF'}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.entries(wheelSpeeds) as [keyof WheelSpeeds, number][]).map(([wheel, speed]) => (
            <div key={wheel} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="input-label">
                  {wheel.toUpperCase()}: <span className="font-bold status-info">{speed} Hz</span>
                </label>
                <button
                  onClick={() => onToggleWheelEnabled(wheel)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    wheelEnabled[wheel] ? 'btn-success' : 'btn-danger'
                  }`}
                  disabled={disabled}
                >
                  {wheelEnabled[wheel] ? 'ON' : 'OFF'}
                </button>
              </div>
              <input
                type="range"
                min="0"
                max={maxSpeed}
                value={speed}
                onChange={e => onIndividualWheelChange(wheel, parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                disabled={disabled || !wheelEnabled[wheel]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
