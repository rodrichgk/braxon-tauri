import { createContext, useContext, useState, ReactNode } from 'react';

export interface WSSChannel {
  canId: number;
  byteIdx: number;
  kmhScale: number;    // km/h = kmhScale * rawByte + kmhOffset
  kmhOffset: number;
  kmhPerHz: number;    // expected km/h per input Hz (wheel geometry: circ*3.6/ppr)
}

export type WSSChannels = [WSSChannel | null, WSSChannel | null, WSSChannel | null, WSSChannel | null];
export const WHEEL_LABELS = ['FL', 'FR', 'RL', 'RR'] as const;

interface AppSettingsContextType {
  legacyMode: boolean;
  setLegacyMode: (v: boolean) => void;
  // Legacy panel state — persisted so page navigation doesn't lose selections
  legacySensorType: number;       // 0=stop, 1=DF11 active 1.5kΩ, 2=DF6 passive
  setLegacySensorType: (v: number) => void;
  legacyFreq: number;             // Hz
  setLegacyFreq: (v: number) => void;
  legacyCanSpeed: number | null;  // Nano cmd value sent: 250/500/1000, null=none set
  setLegacyCanSpeed: (v: number | null) => void;
  // WSS channel assignments — 4 wheels, each linked to a (canId, byteIdx) with fitted coefficients
  wssChannels: WSSChannels;
  setWssChannels: (v: WSSChannels) => void;
  // Wheel model used by CAN Analyzer — persisted and saved per-reference in DB
  wssCalPpr: number;
  setWssCalPpr: (v: number) => void;
  wssCalCirc: number;
  setWssCalCirc: (v: number) => void;
  // CAN Analyzer collapse state
  analyzerOpen: boolean;
  setAnalyzerOpen: (v: boolean) => void;
}

function persisted<T>(key: string, fallback: T): [() => T, (v: T) => void] {
  const read = (): T => {
    try {
      const s = localStorage.getItem(key);
      return s !== null ? JSON.parse(s) as T : fallback;
    } catch { return fallback; }
  };
  const write = (v: T) => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  };
  return [read, write];
}

const DEFAULT_CHANNELS: WSSChannels = [null, null, null, null];

const AppSettingsContext = createContext<AppSettingsContextType>({
  legacyMode: false,             setLegacyMode: () => {},
  legacySensorType: 0,           setLegacySensorType: () => {},
  legacyFreq: 50,                setLegacyFreq: () => {},
  legacyCanSpeed: null,          setLegacyCanSpeed: () => {},
  wssChannels: DEFAULT_CHANNELS, setWssChannels: () => {},
  wssCalPpr: 48,                 setWssCalPpr: () => {},
  wssCalCirc: 2.0,               setWssCalCirc: () => {},
  analyzerOpen: true,            setAnalyzerOpen: () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [readMode,     saveMode    ] = persisted<boolean>('legacyMode', false);
  const [readType,     saveType    ] = persisted<number>('legacySensorType', 0);
  const [readFreq,     saveFreq    ] = persisted<number>('legacyFreq', 50);
  const [readSpeed,    saveSpeed   ] = persisted<number | null>('legacyCanSpeed', null);
  const [readChannels, saveChannels] = persisted<WSSChannels>('wssChannels', DEFAULT_CHANNELS);
  const [readPpr,      savePpr     ] = persisted<number>('wssCalPpr', 48);
  const [readCirc,     saveCirc    ] = persisted<number>('wssCalCirc', 2.0);
  const [readAnalyzer, saveAnalyzer] = persisted<boolean>('analyzerOpen', true);

  const [legacyMode,       setLegacyModeState      ] = useState(readMode);
  const [legacySensorType, setLegacySensorTypeState ] = useState(readType);
  const [legacyFreq,       setLegacyFreqState       ] = useState(readFreq);
  const [legacyCanSpeed,   setLegacyCanSpeedState   ] = useState(readSpeed);
  const [wssChannels,      setWssChannelsState      ] = useState<WSSChannels>(readChannels);
  const [wssCalPpr,        setWssCalPprState        ] = useState(readPpr);
  const [wssCalCirc,       setWssCalCircState       ] = useState(readCirc);
  const [analyzerOpen,     setAnalyzerOpenState     ] = useState(readAnalyzer);

  const mk = <T,>(setState: (v: T) => void, save: (v: T) => void) =>
    (v: T) => { setState(v); save(v); };

  return (
    <AppSettingsContext.Provider value={{
      legacyMode,       setLegacyMode:       mk(setLegacyModeState,       saveMode),
      legacySensorType, setLegacySensorType: mk(setLegacySensorTypeState,  saveType),
      legacyFreq,       setLegacyFreq:       mk(setLegacyFreqState,        saveFreq),
      legacyCanSpeed,   setLegacyCanSpeed:   mk(setLegacyCanSpeedState,    saveSpeed),
      wssChannels,      setWssChannels:      mk(setWssChannelsState,       saveChannels),
      wssCalPpr,        setWssCalPpr:        mk(setWssCalPprState,         savePpr),
      wssCalCirc,       setWssCalCirc:       mk(setWssCalCircState,        saveCirc),
      analyzerOpen,     setAnalyzerOpen:     mk(setAnalyzerOpenState,      saveAnalyzer),
    }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
