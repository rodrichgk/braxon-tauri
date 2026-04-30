import { useReducer, useCallback } from 'react';

// State machine for SignalTester component modes
export type SignalTesterMode = 
  | 'idle'
  | 'recording'
  | 'auto_testing'
  | 'playback'
  | 'profile_test'
  | 'paused'
  | 'editing_profile';

export interface SignalTesterState {
  mode: SignalTesterMode;
  isConnected: boolean;
  isActiveMode: boolean;
  wheelSpeeds: {
    fl: number;
    fr: number;
    rl: number;
    rr: number;
  };
  recordings: Array<{
    id: string;
    name: string;
    duration: number;
    timestamp: Date;
    wheelData: Array<{
      time: number;
      fl: number;
      fr: number;
      rl: number;
      rr: number;
    }>;
  }>;
  currentRecording: any;
  profiles: Array<{
    id: string;
    name: string;
    description: string;
    steps: Array<any>;
    totalDuration: number;
    createdAt: Date;
    modifiedAt: Date;
  }>;
  selectedProfile: any;
  playbackStartTime: number | null;
  testStartTime: number | null;
  remainingTime: number;
  error: string | null;
}

export type SignalTesterAction =
  | { type: 'SET_CONNECTION_STATUS'; payload: boolean }
  | { type: 'SET_ACTIVE_MODE'; payload: boolean }
  | { type: 'SET_WHEEL_SPEEDS'; payload: { fl: number; fr: number; rl: number; rr: number } }
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'START_AUTO_TEST' }
  | { type: 'STOP_AUTO_TEST' }
  | { type: 'START_PROFILE_TEST' }
  | { type: 'STOP_TEST' }
  | { type: 'PAUSE_TEST' }
  | { type: 'RESUME_TEST' }
  | { type: 'START_PLAYBACK'; payload: any }
  | { type: 'STOP_PLAYBACK' }
  | { type: 'ADD_RECORDING'; payload: any }
  | { type: 'DELETE_RECORDING'; payload: string }
  | { type: 'ADD_PROFILE'; payload: any }
  | { type: 'UPDATE_PROFILE'; payload: any }
  | { type: 'DELETE_PROFILE'; payload: string }
  | { type: 'SELECT_PROFILE'; payload: any }
  | { type: 'START_EDITING_PROFILE' }
  | { type: 'STOP_EDITING_PROFILE' }
  | { type: 'SET_PROFILE'; payload: string | null }
  | { type: 'ADD_RECORDING_POINT'; payload: { time: number; fl: number; fr: number; rl: number; rr: number } }
  | { type: 'CLEAR_RECORDING' }
  | { type: 'SET_PLAYBACK_START_TIME'; payload: number }
  | { type: 'SET_TEST_START_TIME'; payload: number }
  | { type: 'UPDATE_REMAINING_TIME'; payload: number }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_TO_IDLE' };

const initialState: SignalTesterState = {
  mode: 'idle',
  isConnected: false,
  isActiveMode: false,
  wheelSpeeds: { fl: 0, fr: 0, rl: 0, rr: 0 },
  recordings: [],
  currentRecording: null,
  profiles: [],
  selectedProfile: null,
  playbackStartTime: null,
  testStartTime: null,
  remainingTime: 0,
  error: null
};

function signalTesterReducer(state: SignalTesterState, action: SignalTesterAction): SignalTesterState {
  switch (action.type) {
    case 'SET_CONNECTION_STATUS':
      return {
        ...state,
        isConnected: action.payload,
        // Reset to idle if disconnected
        mode: action.payload ? state.mode : 'idle'
      };

    case 'SET_ACTIVE_MODE':
      return {
        ...state,
        isActiveMode: action.payload
      };

    case 'SET_WHEEL_SPEEDS':
      return {
        ...state,
        wheelSpeeds: action.payload
      };

    case 'START_RECORDING':
      // Can only start recording from idle mode
      if (state.mode !== 'idle' || !state.isConnected) {
        return state;
      }
      return {
        ...state,
        mode: 'recording',
        error: null
      };

    case 'STOP_RECORDING':
      if (state.mode !== 'recording') {
        return state;
      }
      return {
        ...state,
        mode: 'idle'
      };

    case 'START_AUTO_TEST':
      if (state.mode !== 'idle' || !state.isConnected) {
        return state;
      }
      return {
        ...state,
        mode: 'auto_testing',
        testStartTime: Date.now(),
        error: null
      };

    case 'STOP_AUTO_TEST':
      if (state.mode !== 'auto_testing') {
        return state;
      }
      return {
        ...state,
        mode: 'idle',
        testStartTime: null,
        remainingTime: 0
      };

    case 'START_PROFILE_TEST':
      if (state.mode !== 'idle' || !state.isConnected) {
        return state;
      }
      return {
        ...state,
        mode: 'profile_test',
        testStartTime: Date.now(),
        error: null
      };

    case 'STOP_TEST':
      return {
        ...state,
        mode: 'idle',
        testStartTime: null,
        playbackStartTime: null,
        remainingTime: 0
      };

    case 'PAUSE_TEST':
      if (state.mode === 'auto_testing' || state.mode === 'profile_test') {
        return {
          ...state,
          mode: 'paused'
        };
      }
      return state;

    case 'RESUME_TEST':
      if (state.mode === 'paused') {
        return {
          ...state,
          mode: state.selectedProfile ? 'profile_test' : 'auto_testing'
        };
      }
      return state;

    case 'START_PLAYBACK':
      if (state.mode !== 'idle' || !state.isConnected) {
        return state;
      }
      return {
        ...state,
        mode: 'playback',
        currentRecording: action.payload,
        playbackStartTime: Date.now(),
        error: null
      };

    case 'STOP_PLAYBACK':
      if (state.mode !== 'playback') {
        return state;
      }
      return {
        ...state,
        mode: 'idle',
        currentRecording: null,
        playbackStartTime: null
      };

    case 'ADD_RECORDING':
      return {
        ...state,
        recordings: [...state.recordings, action.payload]
      };

    case 'DELETE_RECORDING':
      return {
        ...state,
        recordings: state.recordings.filter(r => r.id !== action.payload)
      };

    case 'ADD_PROFILE':
      return {
        ...state,
        profiles: [...state.profiles, action.payload]
      };

    case 'UPDATE_PROFILE':
      return {
        ...state,
        profiles: state.profiles.map(p => p.id === action.payload.id ? action.payload : p)
      };

    case 'DELETE_PROFILE':
      return {
        ...state,
        profiles: state.profiles.filter(p => p.id !== action.payload),
        selectedProfile: state.selectedProfile?.id === action.payload ? null : state.selectedProfile
      };

    case 'SELECT_PROFILE':
      return {
        ...state,
        selectedProfile: action.payload
      };

    case 'START_EDITING_PROFILE':
      if (state.mode !== 'idle') {
        return state;
      }
      return {
        ...state,
        mode: 'editing_profile',
        error: null
      };

    case 'STOP_EDITING_PROFILE':
      if (state.mode !== 'editing_profile') {
        return state;
      }
      return {
        ...state,
        mode: 'idle'
      };

    case 'SET_PROFILE':
      return {
        ...state,
        selectedProfile: action.payload
      };

    case 'ADD_RECORDING_POINT':
      if (state.mode !== 'recording') {
        return state;
      }
      // For now, we'll handle recording points differently
      // This would need to be integrated with the recordings array
      return state;

    case 'CLEAR_RECORDING':
      return {
        ...state,
        recordings: []
      };

    case 'SET_PLAYBACK_START_TIME':
      return {
        ...state,
        playbackStartTime: action.payload
      };

    case 'SET_TEST_START_TIME':
      return {
        ...state,
        testStartTime: action.payload
      };

    case 'UPDATE_REMAINING_TIME':
      return {
        ...state,
        remainingTime: action.payload
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload
      };

    case 'RESET_TO_IDLE':
      return {
        ...state,
        mode: 'idle',
        playbackStartTime: null,
        testStartTime: null,
        remainingTime: 0,
        error: null
      };

    default:
      return state;
  }
}

export function useSignalTesterState() {
  const [state, dispatch] = useReducer(signalTesterReducer, initialState);

  // Action creators with validation
  const actions = {
    setConnectionStatus: useCallback((connected: boolean) => {
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: connected });
    }, []),

    startRecording: useCallback(() => {
      dispatch({ type: 'START_RECORDING' });
    }, []),

    stopRecording: useCallback(() => {
      dispatch({ type: 'STOP_RECORDING' });
    }, []),

    startAutoTest: useCallback(() => {
      dispatch({ type: 'START_AUTO_TEST' });
    }, []),

    stopAutoTest: useCallback(() => {
      dispatch({ type: 'STOP_AUTO_TEST' });
    }, []),

    startPlayback: useCallback((recording: any) => {
      dispatch({ type: 'START_PLAYBACK', payload: recording });
    }, []),

    stopPlayback: useCallback(() => {
      dispatch({ type: 'STOP_PLAYBACK' });
    }, []),

    startEditingProfile: useCallback(() => {
      dispatch({ type: 'START_EDITING_PROFILE' });
    }, []),

    stopEditingProfile: useCallback(() => {
      dispatch({ type: 'STOP_EDITING_PROFILE' });
    }, []),

    setProfile: useCallback((profileId: string | null) => {
      dispatch({ type: 'SET_PROFILE', payload: profileId });
    }, []),

    addRecordingPoint: useCallback((point: { time: number; fl: number; fr: number; rl: number; rr: number }) => {
      dispatch({ type: 'ADD_RECORDING_POINT', payload: point });
    }, []),

    clearRecording: useCallback(() => {
      dispatch({ type: 'CLEAR_RECORDING' });
    }, []),

    setPlaybackStartTime: useCallback((time: number) => {
      dispatch({ type: 'SET_PLAYBACK_START_TIME', payload: time });
    }, []),

    setTestStartTime: useCallback((time: number) => {
      dispatch({ type: 'SET_TEST_START_TIME', payload: time });
    }, []),

    updateRemainingTime: useCallback((time: number) => {
      dispatch({ type: 'UPDATE_REMAINING_TIME', payload: time });
    }, []),

    setError: useCallback((error: string | null) => {
      dispatch({ type: 'SET_ERROR', payload: error });
    }, []),

    resetToIdle: useCallback(() => {
      dispatch({ type: 'RESET_TO_IDLE' });
    }, [])
  };

  // Computed properties
  const canStartRecording = state.mode === 'idle' && state.isConnected;
  const canStartAutoTest = state.mode === 'idle' && state.isConnected;
  const canStartPlayback = state.mode === 'idle' && state.isConnected && state.recordings.length > 0;
  const canEditProfile = state.mode === 'idle';
  const isActive = state.mode !== 'idle';

  return {
    state,
    actions,
    dispatch, // Expose dispatch for complex actions
    canStartRecording,
    canStartAutoTest,
    canStartPlayback,
    canEditProfile,
    isActive
  };
}
