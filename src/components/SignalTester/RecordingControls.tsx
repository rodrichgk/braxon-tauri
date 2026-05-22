"use client";

import { PlayIcon, PauseIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { ProfilePoint } from '@/hooks/useProfileManagement';

interface RecordingControlsProps {
  isRecording: boolean;
  isPlayingRecorded: boolean;
  recordedProfile: ProfilePoint[];
  recordingStartTime: number | null;
  isConnected: boolean;
  isAutoTesting: boolean;
  profileEditorOpen: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPlayRecorded: () => void;
  onStopPlayback: () => void;
  onSaveRecorded: () => void;
}

export default function RecordingControls({
  isRecording,
  isPlayingRecorded,
  recordedProfile,
  recordingStartTime,
  isConnected,
  isAutoTesting,
  profileEditorOpen,
  onStartRecording,
  onStopRecording,
  onPlayRecorded,
  onStopPlayback,
  onSaveRecorded
}: RecordingControlsProps) {
  const getElapsedTime = () => {
    if (recordingStartTime === null) return '0.0';
    return ((Date.now() - recordingStartTime) / 1000).toFixed(1);
  };

  return (
    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-800 dark:text-white">Recording Studio</h3>
        {recordedProfile.length > 0 && !isRecording && (
          <span className="text-xs px-2.5 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full font-medium">
            {recordedProfile.length} points • {recordedProfile.length > 1 ? recordedProfile[recordedProfile.length-1].time.toFixed(1) : '0.0'}s
          </span>
        )}
      </div>

      {isRecording && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              Recording in progress... {getElapsedTime()}s
            </span>
          </div>
          <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1 ml-5">
            Adjust the frequency slider above to create your custom profile
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={isRecording ? onStopRecording : onStartRecording}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center shadow-md transition-all ${
            isRecording 
              ? 'bg-red-600 hover:bg-red-700 text-white hover:shadow-lg' 
              : 'bg-purple-600 hover:bg-purple-700 text-white hover:shadow-lg'
          } disabled:opacity-50`}
          disabled={!isConnected || isAutoTesting || isPlayingRecorded || profileEditorOpen}
        >
          <ArrowPathIcon className={`w-4 h-4 mr-2 ${isRecording ? 'animate-spin' : ''}`} />
          {isRecording ? 'Stop' : 'Record'}
        </button>

        {!isPlayingRecorded ? (
          <button
            onClick={onPlayRecorded}
            className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center"
            disabled={!isConnected || recordedProfile.length < 2 || isRecording || isAutoTesting || profileEditorOpen}
          >
            <PlayIcon className="w-4 h-4 mr-2" /> Play
          </button>
        ) : (
          <button
            onClick={onStopPlayback}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center"
            disabled={!isConnected}
          >
            <PauseIcon className="w-4 h-4 mr-2" /> Stop
          </button>
        )}

        <button
          onClick={onSaveRecorded}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center"
          disabled={recordedProfile.length < 2 || isRecording || isPlayingRecorded}
        >
          💾 Save
        </button>
      </div>

      {!isRecording && recordedProfile.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 text-center">
          Click Record, then adjust the frequency slider to create a custom test profile
        </p>
      )}
    </div>
  );
}
