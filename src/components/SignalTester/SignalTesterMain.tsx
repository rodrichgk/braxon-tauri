"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useWebSocketContext } from '@/contexts/WebSocketContext';
import { useWheelSpeedControl } from '@/hooks/useWheelSpeedControl';
import { useProfileManagement } from '@/hooks/useProfileManagement';
import { useRecording } from '@/hooks/useRecording';
import WaveformCanvas from './WaveformCanvas';
import WheelSpeedControls from './WheelSpeedControls';
import ProfileEditor from './ProfileEditor';
import RecordingControls from './RecordingControls';
import { PlayIcon, PauseIcon } from '@heroicons/react/24/solid';

interface SignalTesterProps {
  sendMessage: (message: string) => void;
}

interface WheelSpeeds {
  fl: number;
  fr: number;
  rl: number;
  rr: number;
}

export default function SignalTesterMain({ sendMessage }: SignalTesterProps) {
  const { isConnectedToDevice } = useWebSocketContext();
  
  // Frequency control
  const [frequency, setFrequency] = useState(0);
  const [maxFrequency, setMaxFrequency] = useState(1500);
  const [signalType, setSignalType] = useState<'sine' | 'square'>('sine');
  const [isActiveMode, setIsActiveMode] = useState(true);
  const [maxSpeed, setMaxSpeed] = useState(1500);
  
  // Test states
  const [isAutoTesting, setIsAutoTesting] = useState(false);
  const [isHardwareTesting, setIsHardwareTesting] = useState(false);
  const [isPlayingRecorded, setIsPlayingRecorded] = useState(false);
  const [remainingTime, setRemainingTime] = useState(900);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  
  // Refs for throttling and tracking
  const frequencyThrottleRef = useRef<number | null>(null);
  const pendingFrequencyRef = useRef<number | null>(null);
  const lastSentFrequencyRef = useRef<number>(-1);

  // Custom hooks
  const wheelSpeedControl = useWheelSpeedControl({
    isConnected: isConnectedToDevice,
    sendMessage: (speeds: WheelSpeeds) => {
      const message = JSON.stringify({
        type: 3,
        fl: speeds.fl,
        fr: speeds.fr,
        rl: speeds.rl,
        rr: speeds.rr,
        timestamp: Date.now()
      });
      sendMessage(message);
    }
  });

  const profileManagement = useProfileManagement();
  const recording = useRecording();

  // Handle active/passive mode switching
  const handleModeSwitch = () => {
    const newMode = !isActiveMode;
    setIsActiveMode(newMode);
    
    if (sendMessage) {
      const message = JSON.stringify({
        type: 5,
        mode: newMode ? 'active' : 'passive'
      });
      sendMessage(message);
    }
  };

  // Handle signal type change
  const handleSignalTypeChange = (type: 'sine' | 'square') => {
    setSignalType(type);
    if (isConnectedToDevice) {
      const waveType = type === 'sine' ? 2 : 1;
      sendMessage(`Waveform : ${waveType},${frequency}\n`);
    }
  };

  // Handle frequency change
  const handleFrequencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setFrequency(value);

    pendingFrequencyRef.current = value;
    if (frequencyThrottleRef.current == null) {
      frequencyThrottleRef.current = requestAnimationFrame(() => {
        frequencyThrottleRef.current = null;
        if (pendingFrequencyRef.current !== null && isConnectedToDevice) {
          const freqToSend = pendingFrequencyRef.current;
          
          if (freqToSend !== lastSentFrequencyRef.current) {
            sendMessage(`Frequency : ${freqToSend}\n`);
            lastSentFrequencyRef.current = freqToSend;
          }
          pendingFrequencyRef.current = null;
        }
      });
    }
  };

  // Recording effect
  useEffect(() => {
    if (recording.isRecording) {
      recording.addRecordingPoint(frequency);
    }
  }, [frequency, recording.isRecording]);

  // Auto test toggle
  const toggleAutoTest = () => {
    if (!isAutoTesting) {
      setRemainingTime(900);
      setFrequency(0);
      sendMessage(`Frequency : 0\n`);
      lastSentFrequencyRef.current = 0;
    } else {
      setFrequency(0);
      sendMessage(`Waveform : 0,0\n`);
      lastSentFrequencyRef.current = 0;
    }
    setIsAutoTesting(!isAutoTesting);
  };

  // Recording controls
  const handleStartRecording = () => {
    recording.startRecording();
  };

  const handleStopRecording = () => {
    recording.stopRecording(frequency);
  };

  const handlePlayRecorded = () => {
    if (recording.recordedProfile.length < 2) {
      alert("Please record a profile first (at least 2 points)!");
      return;
    }
    setRemainingTime(900);
    setFrequency(0);
    sendMessage(`Frequency : 0\n`);
    lastSentFrequencyRef.current = 0;
    setIsPlayingRecorded(true);
  };

  const handleStopPlayback = () => {
    setIsPlayingRecorded(false);
    setFrequency(0);
    sendMessage(`Waveform : 0,0\n`);
    lastSentFrequencyRef.current = 0;
  };

  const handleSaveRecorded = async () => {
    const profileName = await recording.saveRecordedProfile();
    if (profileName) {
      await profileManagement.fetchProfiles();
      profileManagement.setActiveProfile(recording.recordedProfile);
    }
  };

  // Profile canvas click handler
  const handleProfileCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const margin = { left: 30, right: 20, top: 20, bottom: 30 };
    const plotWidth = rect.width - margin.left - margin.right;
    const plotHeight = rect.height - margin.top - margin.bottom;

    if (x < margin.left || x > rect.width - margin.right ||
        y < margin.top || y > rect.height - margin.bottom) {
      return;
    }

    const clickTime = Math.max(0, Math.min(15, ((x - margin.left) / plotWidth) * 15));
    const clickFreq = Math.max(0, Math.min(maxFrequency, (1 - (y - margin.top) / plotHeight) * maxFrequency));

    let foundPointIndex: number | null = null;
    profileManagement.activeProfile.forEach((point, index) => {
      const pointX = margin.left + (point.time / 15) * plotWidth;
      const pointY = margin.top + plotHeight - (point.frequency / maxFrequency) * plotHeight;
      const distance = Math.sqrt(Math.pow(pointX - x, 2) + Math.pow(pointY - y, 2));
      if (distance < 10) {
        foundPointIndex = index;
      }
    });

    if (foundPointIndex !== null) {
      profileManagement.setEditingPoint(foundPointIndex);
    } else {
      if (profileManagement.editingPoint !== null) {
        profileManagement.updateProfilePoint(profileManagement.editingPoint, {
          time: clickTime,
          frequency: Math.round(clickFreq)
        });
      } else {
        const newProfile = [...profileManagement.activeProfile, { 
          time: clickTime, 
          frequency: Math.round(clickFreq) 
        }];
        profileManagement.setActiveProfile(newProfile.sort((a, b) => a.time - b.time));
        profileManagement.setEditingPoint(
          newProfile.findIndex(p => p.time === clickTime && p.frequency === Math.round(clickFreq))
        );
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="card">
      <h2 className="card-header flex items-center">
        <span className="mr-2">Signal Tester</span>
        {isConnectedToDevice ? (
          <span className="connection-dot connection-connected animate-pulse">Connected</span>
        ) : (
          <span className="connection-dot connection-disconnected">Disconnected</span>
        )}
      </h2>

      {/* Waveform Display */}
      <WaveformCanvas
        wheelSpeeds={wheelSpeedControl.wheelSpeeds}
        wheelEnabled={wheelSpeedControl.wheelEnabled}
        isConnected={isConnectedToDevice}
      />

      {/* Wheel Speed Controls */}
      <WheelSpeedControls
        wheelSpeeds={wheelSpeedControl.wheelSpeeds}
        wheelEnabled={wheelSpeedControl.wheelEnabled}
        isLinked={wheelSpeedControl.isLinked}
        masterSpeed={wheelSpeedControl.masterSpeed}
        maxSpeed={maxSpeed}
        isConnected={isConnectedToDevice}
        isAutoTesting={isAutoTesting}
        isPlayingRecorded={isPlayingRecorded}
        signalType={signalType}
        isActiveMode={isActiveMode}
        onMasterSpeedChange={wheelSpeedControl.handleMasterSpeedChange}
        onIndividualWheelChange={wheelSpeedControl.handleIndividualWheelChange}
        onToggleWheelEnabled={wheelSpeedControl.toggleWheelEnabled}
        onToggleLinked={wheelSpeedControl.toggleLinked}
        onSignalTypeChange={handleSignalTypeChange}
        onModeSwitch={handleModeSwitch}
      />

      {/* Manual Frequency Control */}
      {!isAutoTesting && !isPlayingRecorded && (
        <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-750 rounded-lg border border-blue-200 dark:border-gray-600">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-semibold text-gray-800 dark:text-white">
              Manual Frequency Control
            </label>
            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">{frequency} Hz</span>
          </div>
          <input
            type="range"
            min="0"
            max={maxFrequency}
            value={frequency}
            onChange={handleFrequencyChange}
            className="w-full h-3 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
            disabled={!isConnectedToDevice || recording.isRecording}
          />
          <div className="flex justify-between mt-2 text-xs text-gray-600 dark:text-gray-400">
            <span>0 Hz</span>
            <span>{maxFrequency} Hz</span>
          </div>
        </div>
      )}

      {/* Test Controls */}
      <div className="mt-6 space-y-3">
        {(isAutoTesting || isPlayingRecorded) && (
          <div className="text-center p-4 bg-blue-50 dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-gray-600">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Test in Progress</p>
            <div className="text-4xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">
              {formatTime(remainingTime)}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={toggleAutoTest}
            className={`px-4 py-3 rounded-lg shadow-md font-medium flex items-center justify-center transition-all text-sm ${
              isAutoTesting ? 'btn-danger hover:shadow-lg' : 'btn-primary hover:shadow-lg'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            disabled={!isConnectedToDevice || isPlayingRecorded || profileEditorOpen}
          >
            {isAutoTesting ? <PauseIcon className="w-5 h-5 mr-2" /> : <PlayIcon className="w-5 h-5 mr-2" />}
            {isAutoTesting ? 'Stop Profile Test' : 'Run Profile Test'}
          </button>

          <button
            className={`px-4 py-3 rounded-lg shadow-md font-medium flex items-center justify-center transition-all text-sm ${
              isHardwareTesting ? 'btn-danger hover:shadow-lg' : 'btn-success hover:shadow-lg'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            disabled={!isConnectedToDevice || isAutoTesting || isPlayingRecorded || profileEditorOpen}
            onClick={() => {
              setIsHardwareTesting(!isHardwareTesting);
              const message = { type: 13, id: Date.now() % 1000 };
              sendMessage(JSON.stringify(message));
            }}
          >
            {isHardwareTesting ? <PauseIcon className="w-5 h-5 mr-2" /> : <PlayIcon className="w-5 h-5 mr-2" />}
            {isHardwareTesting ? 'Stop Hardware Test' : 'Hardware Auto Test'}
          </button>
        </div>

        <button
          onClick={() => setProfileEditorOpen(!profileEditorOpen)}
          className="w-full btn-secondary text-sm py-2.5 disabled:opacity-50 shadow hover:shadow-md transition-all"
          disabled={isAutoTesting || isPlayingRecorded}
        >
          {profileEditorOpen ? '✕ Close Profile Editor' : '⚙ Edit Test Profile'}
        </button>
      </div>

      {/* Profile Editor */}
      {profileEditorOpen && (
        <ProfileEditor
          profiles={profileManagement.profiles}
          activeProfile={profileManagement.activeProfile}
          selectedProfileId={profileManagement.selectedProfileId}
          isLoadingProfiles={profileManagement.isLoadingProfiles}
          editingPoint={profileManagement.editingPoint}
          maxFrequency={maxFrequency}
          onLoadProfile={profileManagement.loadProfile}
          onSaveProfile={profileManagement.saveProfile}
          onAddPoint={() => profileManagement.addProfilePoint(maxFrequency)}
          onRemovePoint={profileManagement.removeProfilePoint}
          onCanvasClick={handleProfileCanvasClick}
          setEditingPoint={profileManagement.setEditingPoint}
        />
      )}

      {/* Recording Controls */}
      <RecordingControls
        isRecording={recording.isRecording}
        isPlayingRecorded={isPlayingRecorded}
        recordedProfile={recording.recordedProfile}
        recordingStartTime={recording.recordingStartTimeRef.current}
        isConnected={isConnectedToDevice}
        isAutoTesting={isAutoTesting}
        profileEditorOpen={profileEditorOpen}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onPlayRecorded={handlePlayRecorded}
        onStopPlayback={handleStopPlayback}
        onSaveRecorded={handleSaveRecorded}
      />
    </div>
  );
}
