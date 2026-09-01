import { createContext, useContext, useState, useMemo, useCallback, ReactNode } from 'react';

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
  // Hydraulic Bench oil calibration
  hydraulicOilMax: number;
  setHydraulicOilMax: (v: number) => void;
}

function persistedRead<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    return s !== null ? JSON.parse(s) as T : fallback;
  } catch { return fallback; }
}

// Module-level write functions — stable references, no component captures
function persistedWrite<T>(key: string) {
  return (v: T) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };
}
const writeMode     = persistedWrite<boolean>('legacyMode');
const writeType     = persistedWrite<number>('legacySensorType');
const writeFreq     = persistedWrite<number>('legacyFreq');
const writeSpeed    = persistedWrite<number | null>('legacyCanSpeed');
const writeChannels = persistedWrite<WSSChannels>('wssChannels');
const writePpr      = persistedWrite<number>('wssCalPpr');
const writeCirc     = persistedWrite<number>('wssCalCirc');
const writeOilMax   = persistedWrite<number>('hydraulicOilMax');

const DEFAULT_CHANNELS: WSSChannels = [null, null, null, null];

const AppSettingsContext = createContext<AppSettingsContextType>({
  legacyMode: false,             setLegacyMode: () => {},
  legacySensorType: 0,           setLegacySensorType: () => {},
  legacyFreq: 0,                setLegacyFreq: () => {},
  legacyCanSpeed: null,          setLegacyCanSpeed: () => {},
  wssChannels: DEFAULT_CHANNELS, setWssChannels: () => {},
  wssCalPpr: 48,                 setWssCalPpr: () => {},
  wssCalCirc: 2.0,               setWssCalCirc: () => {},
  hydraulicOilMax: 2.5,          setHydraulicOilMax: () => {},
});

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [legacyMode,       setLegacyModeState      ] = useState(() => persistedRead<boolean>('legacyMode', false));
  const [legacySensorType, setLegacySensorTypeState ] = useState(() => persistedRead<number>('legacySensorType', 0));
  const [legacyFreq,       setLegacyFreqState       ] = useState(() => persistedRead<number>('legacyFreq', 0));
  const [legacyCanSpeed,   setLegacyCanSpeedState   ] = useState(() => persistedRead<number | null>('legacyCanSpeed', null));
  const [wssChannels,      setWssChannelsState      ] = useState<WSSChannels>(() => persistedRead<WSSChannels>('wssChannels', DEFAULT_CHANNELS));
  const [wssCalPpr,        setWssCalPprState        ] = useState(() => persistedRead<number>('wssCalPpr', 48));
  const [wssCalCirc,       setWssCalCircState       ] = useState(() => persistedRead<number>('wssCalCirc', 2.0));
  const [hydraulicOilMax,  setHydraulicOilMaxState  ] = useState(() => persistedRead<number>('hydraulicOilMax', 2.5));

  const setLegacyMode       = useCallback((v: boolean)           => { setLegacyModeState(v);       writeMode(v);     }, []);
  const setLegacySensorType = useCallback((v: number)            => { setLegacySensorTypeState(v); writeType(v);     }, []);
  const setLegacyFreq       = useCallback((v: number)            => { setLegacyFreqState(v);       writeFreq(v);     }, []);
  const setLegacyCanSpeed   = useCallback((v: number | null)     => { setLegacyCanSpeedState(v);   writeSpeed(v);    }, []);
  const setWssChannels      = useCallback((v: WSSChannels)       => { setWssChannelsState(v);      writeChannels(v); }, []);
  const setWssCalPpr        = useCallback((v: number)            => { setWssCalPprState(v);        writePpr(v);      }, []);
  const setWssCalCirc       = useCallback((v: number)            => { setWssCalCircState(v);       writeCirc(v);     }, []);
  const setHydraulicOilMax  = useCallback((v: number)            => { setHydraulicOilMaxState(v);  writeOilMax(v);   }, []);

  const value = useMemo(() => ({
    legacyMode,       setLegacyMode,
    legacySensorType, setLegacySensorType,
    legacyFreq,       setLegacyFreq,
    legacyCanSpeed,   setLegacyCanSpeed,
    wssChannels,      setWssChannels,
    wssCalPpr,        setWssCalPpr,
    wssCalCirc,       setWssCalCirc,
    hydraulicOilMax,  setHydraulicOilMax,
  }), [
    legacyMode, legacySensorType, legacyFreq, legacyCanSpeed, wssChannels, wssCalPpr, wssCalCirc, hydraulicOilMax,
    setLegacyMode, setLegacySensorType, setLegacyFreq, setLegacyCanSpeed, setWssChannels, setWssCalPpr, setWssCalCirc, setHydraulicOilMax,
  ]);

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
