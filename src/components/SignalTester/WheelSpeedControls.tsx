"use client";

import React from 'react';
import { LinkIcon } from '@heroicons/react/24/solid';

interface WheelSpeeds {
  fl: number;
  fr: number;
  rl: number;
  rr: number;
}

interface WheelSpeedControlsProps {
  wheelSpeeds: WheelSpeeds;
  wheelEnabled: {
    fl: boolean;
    fr: boolean;
    rl: boolean;
    rr: boolean;
  };
  isLinked: boolean;
  masterSpeed: number;
  maxSpeed: number;
  isConnected: boolean;
  isAutoTesting: boolean;
  isPlayingRecorded: boolean;
  signalType: 'sine' | 'square';
  isActiveMode: boolean;
  onMasterSpeedChange: (speed: number) => void;
  onIndividualWheelChange: (wheel: keyof WheelSpeeds, speed: number) => void;
  onToggleWheelEnabled: (wheel: keyof WheelSpeeds) => void;
  onToggleLinked: () => void;
  onSignalTypeChange: (type: 'sine' | 'square') => void;
  onModeSwitch: () => void;
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
  signalType,
  isActiveMode,
  onMasterSpeedChange,
  onIndividualWheelChange,
  onToggleWheelEnabled,
  onToggleLinked,
  onSignalTypeChange,
  onModeSwitch
}: WheelSpeedControlsProps) {
  return (
    <div className="mt-6 card">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">ABS Wheel Speed Signals</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Signal:</span>
            <div className="flex border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
              <button
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  signalType === 'sine' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
                onClick={() => onSignalTypeChange('sine')}
                disabled={isAutoTesting || isPlayingRecorded}
              >
                Sine
              </button>
              <button
                className={`px-2.5 py-1 text-xs font-medium transition-colors border-l border-gray-300 dark:border-gray-600 ${
                  signalType === 'square' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
                onClick={() => onSignalTypeChange('square')}
                disabled={isAutoTesting || isPlayingRecorded}
              >
                Square
              </button>
            </div>
          </div>
          <button
            onClick={onModeSwitch}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isActiveMode ? 'btn-success' : 'btn-warning'
            }`}
            disabled={!isConnected || isAutoTesting || isPlayingRecorded}
          >
            {isActiveMode ? 'Active' : 'Passive'}
          </button>
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
      </div>

      {isLinked ? (
        <div className="space-y-4">
          <div>
            <label className="input-label block mb-2">
              Master Speed: <span className="font-bold status-info">{masterSpeed} Hz</span>
            </label>
            <input
              type="range"
              min="0"
              max={maxSpeed}
              value={masterSpeed}
              onChange={(e) => onMasterSpeedChange(parseInt(e.target.value))}
              onInput={(e) => onMasterSpeedChange(parseInt((e.target as HTMLInputElement).value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
              disabled={!isConnected || isAutoTesting || isPlayingRecorded}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(wheelEnabled).map(([wheel, enabled]) => (
              <button
                key={wheel}
                onClick={() => onToggleWheelEnabled(wheel as keyof WheelSpeeds)}
                className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                  enabled ? 'btn-success' : 'btn-danger'
                } disabled:opacity-50`}
                disabled={!isConnected || isAutoTesting || isPlayingRecorded}
              >
                {wheel.toUpperCase()}: {enabled ? `${wheelSpeeds[wheel as keyof WheelSpeeds]}Hz` : 'OFF'}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(wheelSpeeds).map(([wheel, speed]) => (
            <div key={wheel} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="input-label">
                  {wheel.toUpperCase()}: <span className="font-bold status-info">{speed} Hz</span>
                </label>
                <button
                  onClick={() => onToggleWheelEnabled(wheel as keyof WheelSpeeds)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    wheelEnabled[wheel as keyof WheelSpeeds] ? 'btn-success' : 'btn-danger'
                  }`}
                  disabled={!isConnected || isAutoTesting || isPlayingRecorded}
                >
                  {wheelEnabled[wheel as keyof WheelSpeeds] ? 'ON' : 'OFF'}
                </button>
              </div>
              <input
                type="range"
                min="0"
                max={maxSpeed}
                value={speed}
                onChange={(e) => onIndividualWheelChange(wheel as keyof WheelSpeeds, parseInt(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
                disabled={!isConnected || isAutoTesting || isPlayingRecorded || !wheelEnabled[wheel as keyof WheelSpeeds]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
