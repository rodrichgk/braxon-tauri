import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import type { Page } from "../lib/pages";
import {
  type ScanEntity,
  getScanServiceUrl,
  setScanServiceUrl as persistScanServiceUrl,
} from "../lib/braxonScan";

export interface LinkedJob {
  ligcdeId: string;
  clientName: string;
  reference: string;
  vehiclePlate: string;
  vehicleModel: string;
  /** LigCde.CodeArt / LibelleArt — the article being worked on. Optional
   *  (older callers don't set them); SignalPage uses codeArt to prefill
   *  its ABS reference search. */
  codeArt?: string;
  libelleArt?: string;
}

/** Mirrors src-tauri/src/client_registry.rs's ClientIdentity. */
export interface ClientIdentity {
  pcId: string;
  hostname: string;
  osUser: string;
  appVersion: string;
}

/** A scan waiting to be acted on — set by ScanListener (phone push or the
 *  in-app camera), consumed by RemanPage / SignalPage once they mount. */
export interface PendingScan {
  entity: ScanEntity;
  key: string;
  label?: string;
  /** Distinguishes two scans of the same code so a re-scan re-fires the effect. */
  ts: number;
}

interface TestSessionContextType {
  activeHydraulicJob: LinkedJob | null;
  setActiveHydraulicJob: (job: LinkedJob | null) => void;
  /** REMAN job attached to the Signal HIL page — same idea as
   *  activeHydraulicJob, kept separate so a job can be on both benches. */
  activeSignalJob: LinkedJob | null;
  setActiveSignalJob: (job: LinkedJob | null) => void;
  navigateTo: (page: Page) => void;

  /** This machine's identity for building QR values. Null until loaded. */
  clientIdentity: ClientIdentity | null;
  /** Base URL of the scan-service, for the QR host. */
  scanServiceUrl: string;
  setScanServiceUrl: (url: string) => void;

  pendingScan: PendingScan | null;
  setPendingScan: (scan: PendingScan | null) => void;
}

const TestSessionContext = createContext<TestSessionContextType | null>(null);

export function TestSessionProvider({
  children,
  navigateTo,
}: {
  children: ReactNode;
  navigateTo: (page: Page) => void;
}) {
  const [activeHydraulicJob, setActiveHydraulicJob] = useState<LinkedJob | null>(null);
  const [activeSignalJob, setActiveSignalJob] = useState<LinkedJob | null>(null);
  const [clientIdentity, setClientIdentity] = useState<ClientIdentity | null>(null);
  const [scanServiceUrl, setScanServiceUrlState] = useState<string>(() => getScanServiceUrl());
  const [pendingScan, setPendingScan] = useState<PendingScan | null>(null);

  useEffect(() => {
    invoke<ClientIdentity>("braxon_client_identity")
      .then(setClientIdentity)
      .catch(() => setClientIdentity(null));
  }, []);

  const setScanServiceUrl = (url: string) => {
    persistScanServiceUrl(url);
    setScanServiceUrlState(getScanServiceUrl());
  };

  return (
    <TestSessionContext.Provider
      value={{
        activeHydraulicJob,
        setActiveHydraulicJob,
        activeSignalJob,
        setActiveSignalJob,
        navigateTo,
        clientIdentity,
        scanServiceUrl,
        setScanServiceUrl,
        pendingScan,
        setPendingScan,
      }}
    >
      {children}
    </TestSessionContext.Provider>
  );
}

export function useTestSession() {
  const context = useContext(TestSessionContext);
  if (!context) {
    throw new Error("useTestSession must be used within a TestSessionProvider");
  }
  return context;
}
