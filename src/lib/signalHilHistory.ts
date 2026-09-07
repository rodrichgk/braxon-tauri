// Persistent history of units tested on the Signal HIL bench — backed by
// "SignalHilTest" in BRAXON's own Postgres (src-tauri/src/signal_history.rs),
// not REMAN's 4D. A row is written for every generated ECU report whether
// or not a REMAN job is linked, so job_number/job_label are optional: a
// unit tested outside the job system (bench validation, a spare ECU, a
// warranty check with no job number yet) still gets a permanent record.

import { invoke } from '@tauri-apps/api/tauri';
import {
  type EcuReportDraft, type Verdict,
  activeDtcCount, peakCurrent,
} from '@/lib/ecuReport';

export interface SignalHilTestRecord {
  id: string;
  createdAt: string;
  operator?: string;
  verdict?: Verdict;
  reason?: string;
  absRef?: string;
  manufacturer?: string;
  wssType?: string;
  brand?: string;
  ecuName?: string;
  hardwareFamily?: string;
  protocol?: string;
  sendId?: string;
  recvId?: string;
  faultCount: number;
  currentPeakA?: number;
  voltageV?: number;
  /** Both undefined together whenever the unit isn't linked to a REMAN job. */
  jobNumber?: string;
  jobLabel?: string;
  ligcdeId?: string;
  notes?: string;
  /** Full EcuReportDraft snapshot at save time — re-print or inspect later. */
  reportJson: string;
}

export interface SignalHilJobInfo {
  jobLabel?: string;
  jobNumber?: string;
  ligcdeId?: string;
}

/** Shapes a completed draft into the payload `save_signal_hil_test` expects. */
export function buildSignalHilTestInput(
  draft: EcuReportDraft,
  verdict: Verdict | null,
  reason: string,
  job: SignalHilJobInfo,
  operator?: string,
) {
  return {
    operator: operator || undefined,
    verdict: verdict ?? undefined,
    reason: reason || undefined,
    absRef: draft.ident.absRef,
    manufacturer: draft.ident.manufacturer,
    wssType: draft.ident.wssType,
    brand: draft.ident.brand,
    ecuName: draft.ident.ecuName,
    hardwareFamily: draft.ident.hardwareFamily,
    protocol: draft.ident.protocol,
    sendId: draft.ident.sendId,
    recvId: draft.ident.recvId,
    faultCount: activeDtcCount(draft.dtc),
    currentPeakA: peakCurrent(draft) ?? undefined,
    voltageV: draft.manual.voltageV ?? undefined,
    jobNumber: job.jobNumber,
    jobLabel: job.jobLabel,
    ligcdeId: job.ligcdeId,
    notes: draft.manual.notes,
    reportJson: JSON.stringify(draft),
  };
}

export async function saveSignalHilTest(
  draft: EcuReportDraft,
  verdict: Verdict | null,
  reason: string,
  job: SignalHilJobInfo,
  operator?: string,
): Promise<SignalHilTestRecord> {
  const input = buildSignalHilTestInput(draft, verdict, reason, job, operator);
  return invoke<SignalHilTestRecord>('save_signal_hil_test', { input });
}

export async function listSignalHilTests(opts: { search?: string; limit?: number } = {}): Promise<SignalHilTestRecord[]> {
  return invoke<SignalHilTestRecord[]>('list_signal_hil_tests', {
    search: opts.search || undefined,
    limit: opts.limit,
  });
}

export async function deleteSignalHilTest(id: string): Promise<void> {
  await invoke('delete_signal_hil_test', { id });
}

/** Recovers the draft stored at save time, so a past report can be
 *  re-rendered exactly as it was (curve points, DTCs, CAN snapshot, notes). */
export function parseSignalHilDraft(record: SignalHilTestRecord): EcuReportDraft | null {
  try {
    return JSON.parse(record.reportJson) as EcuReportDraft;
  } catch {
    return null;
  }
}
