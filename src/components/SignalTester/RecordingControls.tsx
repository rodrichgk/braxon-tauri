import { useState } from 'react';
import { PlayIcon, PauseIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { BookmarkSquareIcon } from '@heroicons/react/24/outline';
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
  onSaveRecorded: (name: string) => void;
}

export default function RecordingControls({
  isRecording, isPlayingRecorded, recordedProfile, recordingStartTime,
  isConnected, isAutoTesting, profileEditorOpen,
  onStartRecording, onStopRecording, onPlayRecorded, onStopPlayback, onSaveRecorded,
}: RecordingControlsProps) {
  const [saveName, setSaveName] = useState('');
  const elapsed = recordingStartTime ? ((Date.now() - recordingStartTime) / 1000).toFixed(1) : '0.0';
  const duration = recordedProfile.length > 1 ? recordedProfile[recordedProfile.length - 1].time.toFixed(1) : '0.0';
  const canSave = recordedProfile.length >= 2 && !isRecording && !isPlayingRecorded;

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Recording Studio</h3>
        {recordedProfile.length > 0 && !isRecording && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-elevated border border-border text-text-secondary">
            {recordedProfile.length} pts · {duration}s
          </span>
        )}
      </div>

      {isRecording && (
        <div className="mb-3 flex items-center gap-2 p-2.5 bg-danger/8 border border-danger/20 rounded-xl">
          <span className="w-2 h-2 bg-danger rounded-full animate-pulse shrink-0" />
          <span className="text-xs text-danger font-medium">Recording… {elapsed}s</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={isRecording ? onStopRecording : onStartRecording}
          disabled={!isConnected || isAutoTesting || isPlayingRecorded || profileEditorOpen}
          className={['py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40',
            isRecording ? 'bg-danger/15 text-danger border border-danger/20 hover:bg-danger/25'
                        : 'bg-accent/15 text-accent border border-accent/20 hover:bg-accent/25'].join(' ')}
        >
          <ArrowPathIcon className={['w-3.5 h-3.5', isRecording ? 'animate-spin' : ''].join(' ')} />
          {isRecording ? 'Stop' : 'Record'}
        </button>

        {!isPlayingRecorded ? (
          <button onClick={onPlayRecorded}
            disabled={!isConnected || recordedProfile.length < 2 || isRecording || isAutoTesting || profileEditorOpen}
            className="py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 bg-success/15 text-success border border-success/20 hover:bg-success/25">
            <PlayIcon className="w-3.5 h-3.5" /> Play
          </button>
        ) : (
          <button onClick={onStopPlayback} disabled={!isConnected}
            className="py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 bg-danger/15 text-danger border border-danger/20 hover:bg-danger/25">
            <PauseIcon className="w-3.5 h-3.5" /> Stop
          </button>
        )}
      </div>

      {canSave && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Profile name…"
            className="input-field text-xs py-1.5 flex-1 min-w-0"
          />
          <button
            onClick={() => { if (saveName.trim()) { onSaveRecorded(saveName.trim()); setSaveName(''); } }}
            disabled={!saveName.trim()}
            className="btn-secondary py-1.5 px-2.5 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 shrink-0"
          >
            <BookmarkSquareIcon className="w-3.5 h-3.5" /> Save
          </button>
        </div>
      )}

      {!isRecording && recordedProfile.length === 0 && (
        <p className="text-xs text-text-tertiary mt-3 text-center">
          Click Record then adjust the frequency slider to create a custom test profile
        </p>
      )}
    </div>
  );
}
