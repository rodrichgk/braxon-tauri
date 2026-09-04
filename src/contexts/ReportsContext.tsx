/* ── Cross-bench test-report state ────────────────────────────
   Holds the ECU (Signal HIL) report draft that the diagnostics panels
   feed into, plus a snapshot of the last hydraulic report so a single
   combined PDF can be generated from the Signal HIL page without it
   having to reach into the hydraulic dashboard's own state.

   A passive CAN sniffer runs here for the whole app session so "did we
   see bus traffic" is always answerable, regardless of which panels are
   currently mounted. It's just counters over the serial/Kvaser text
   streams — cheap — and only pushes an updated snapshot ~1×/s. ───────── */

import {
  createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode,
} from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  type EcuReportDraft, type EcuIdent, type EcuDtcSnapshot, type CanActivity,
  type WssChannelSummary, type EcuReportManual, type WheelCurvePoint,
  emptyEcuReportDraft,
} from '@/lib/ecuReport';
import type { ParsedReport } from '@/lib/hydraulicReport';

const STORE_KEY = 'braxon.ecuReportDraft';

// Small copy of CANAnalyzer's ID hints — enough to annotate the top IDs
// on the report without importing the whole analyzer.
const ID_HINTS: Record<number, string> = {
  0x0C0: 'Wheel speeds — Continental/Teves',
  0x0E4: 'ABS status — Continental/Teves',
  0x12E: 'Wheel speeds — Bosch MK61 (Renault)',
  0x1A0: 'Wheel speeds — Bosch ESP',
  0x1E0: 'ABS/ESP status — Bosch',
  0x284: 'Vehicle speed — common',
  0x760: 'Diagnostic response — Renault',
};

export interface HydraulicSnapshot {
  parsed: ParsedReport | null;
  rawText: string;
  jobRef?: string;
  updatedAt: string;
}

interface ReportsContextType {
  signalDraft: EcuReportDraft;
  patchIdent: (p: Partial<EcuIdent>) => void;
  setDtc: (dtc: EcuDtcSnapshot | null) => void;
  setWssChannels: (chs: WssChannelSummary[]) => void;
  setCurve: (curve: WheelCurvePoint[]) => void;
  patchManual: (p: Partial<EcuReportManual>) => void;
  setCanBitrate: (label: string | undefined) => void;
  resetCanActivity: () => void;
  resetSignalDraft: () => void;

  hydraulicSnapshot: HydraulicSnapshot | null;
  setHydraulicSnapshot: (s: HydraulicSnapshot | null) => void;
}

const ReportsContext = createContext<ReportsContextType | null>(null);

function loadDraft(): EcuReportDraft {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as EcuReportDraft;
      // The live sniffer owns `can`; never trust a stale persisted value.
      return { ...emptyEcuReportDraft(), ...parsed, can: null };
    }
  } catch { /* ignore */ }
  return emptyEcuReportDraft();
}

export function ReportsProvider({ children }: { children: ReactNode }) {
  const [signalDraft, setSignalDraft] = useState<EcuReportDraft>(loadDraft);
  const [hydraulicSnapshot, setHydraulicSnapshot] = useState<HydraulicSnapshot | null>(null);

  // Persist everything except the live CAN block.
  useEffect(() => {
    try {
      const { can, ...rest } = signalDraft;
      void can;
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...rest, can: null }));
    } catch { /* ignore */ }
  }, [signalDraft]);

  const mutate = useCallback((fn: (d: EcuReportDraft) => EcuReportDraft) => {
    setSignalDraft(d => ({ ...fn(d), updatedAt: new Date().toISOString() }));
  }, []);

  const patchIdent = useCallback((p: Partial<EcuIdent>) => {
    // Drop undefined keys so a later, less-specific source can't blank a
    // field an earlier one filled.
    const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== ''));
    if (Object.keys(clean).length === 0) return;
    mutate(d => ({ ...d, ident: { ...d.ident, ...clean } }));
  }, [mutate]);

  const setDtc = useCallback((dtc: EcuDtcSnapshot | null) => mutate(d => ({ ...d, dtc })), [mutate]);
  const setWssChannels = useCallback((chs: WssChannelSummary[]) => mutate(d => ({ ...d, wssChannels: chs })), [mutate]);
  const setCurve = useCallback((curve: WheelCurvePoint[]) => mutate(d => ({ ...d, curve })), [mutate]);
  const patchManual = useCallback((p: Partial<EcuReportManual>) => mutate(d => ({ ...d, manual: { ...d.manual, ...p } })), [mutate]);

  // ── passive CAN sniffer ────────────────────────────────────
  const canCountRef = useRef<Map<number, number>>(new Map());
  const canTotalRef = useRef(0);
  const canWindowRef = useRef<number[]>([]); // frame timestamps, last ~10 s
  const canSinceRef = useRef(Date.now());
  const bitrateRef = useRef<string | undefined>(undefined);

  const clearCanCounters = useCallback(() => {
    canCountRef.current.clear();
    canTotalRef.current = 0;
    canWindowRef.current = [];
    canSinceRef.current = Date.now();
  }, []);

  const resetSignalDraft = useCallback(() => {
    clearCanCounters();
    setSignalDraft(emptyEcuReportDraft());
  }, [clearCanCounters]);

  const setCanBitrate = useCallback((label: string | undefined) => {
    bitrateRef.current = label || undefined;
  }, []);

  const resetCanActivity = useCallback(() => {
    clearCanCounters();
    mutate(d => ({ ...d, can: { seen: false, frameCount: 0, uniqueIds: 0, observedAt: new Date().toISOString(), bitrate: bitrateRef.current } }));
  }, [mutate, clearCanCounters]);

  useEffect(() => {
    const onLine = (line: string) => {
      const p = line.trim().split(/\s+/);
      if (p.length < 2) return;
      const id = parseInt(p[0], 10);
      const dlc = parseInt(p[1], 10);
      if (isNaN(id) || isNaN(dlc) || dlc < 0 || dlc > 8 || p.length !== 2 + dlc) return;
      canCountRef.current.set(id, (canCountRef.current.get(id) ?? 0) + 1);
      canTotalRef.current += 1;
      const now = Date.now();
      canWindowRef.current.push(now);
    };
    const subs = (['serial-data', 'kvaser-data'] as const).map(ev =>
      listen<string>(ev, e => onLine(e.payload)),
    );

    const tick = setInterval(() => {
      const now = Date.now();
      canWindowRef.current = canWindowRef.current.filter(t => now - t < 10_000);
      const total = canTotalRef.current;
      const seen = total > 0;
      const uniqueIds = canCountRef.current.size;
      const topIds = [...canCountRef.current.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([cid, count]) => ({ id: cid, count, hint: ID_HINTS[cid] }));
      const next: CanActivity = {
        seen, frameCount: total, uniqueIds, topIds,
        windowSec: 10,
        bitrate: bitrateRef.current,
        observedAt: new Date().toISOString(),
      };
      setSignalDraft(d => {
        const c = d.can;
        if (c && c.seen === next.seen && c.frameCount === next.frameCount && c.uniqueIds === next.uniqueIds && c.bitrate === next.bitrate) {
          return d; // nothing moved — skip the re-render
        }
        return { ...d, can: next };
      });
    }, 1000);

    return () => { subs.forEach(s => s.then(u => u())); clearInterval(tick); };
  }, []);

  const value = useMemo<ReportsContextType>(() => ({
    signalDraft,
    patchIdent, setDtc, setWssChannels, setCurve, patchManual,
    setCanBitrate, resetCanActivity, resetSignalDraft,
    hydraulicSnapshot, setHydraulicSnapshot,
  }), [
    signalDraft, patchIdent, setDtc, setWssChannels, setCurve, patchManual,
    setCanBitrate, resetCanActivity, resetSignalDraft, hydraulicSnapshot,
  ]);

  return <ReportsContext.Provider value={value}>{children}</ReportsContext.Provider>;
}

export function useReports() {
  const ctx = useContext(ReportsContext);
  if (!ctx) throw new Error('useReports must be used within a ReportsProvider');
  return ctx;
}
