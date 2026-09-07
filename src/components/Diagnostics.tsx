import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BugAntIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  TrashIcon,
  BookmarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SignalIcon,
  StopIcon,
  ArrowDownTrayIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import clientSerial, { type SerialEvent } from '@/lib/clientSerial';
import { useSession } from '@/contexts/SessionContext';
import EcuAutoConfig, { type EcuAutoConfig as EcuAutoConfigResult } from '@/components/EcuAutoConfig';
import {
  type ActuatorEntry,
  type EcuInfo,
  type Protocol,
  type VehicleBrand,
  guessHardwareFamily,
  parseCanId,
  protocolFromDb,
  toHex3,
} from '@/lib/ecu';
import { isoTpRequest } from '@/lib/isotp';
import { describeDtc } from '@/lib/dtcGeneric';
import { builtinActuatorsFor } from '@/lib/builtinActuators';
import LiveData from '@/components/LiveData';
import { openVwTp20Channel, type VwTp20Channel } from '@/lib/vwtp20';
import { decodeVwDtcs } from '@/lib/vwKwp';
import { useUdsSession } from '@/hooks/useUdsSession';
import { useReports } from '@/contexts/ReportsContext';

/* ── Types ────────────────────────────────────────────────────── */
export type { Protocol, VehicleBrand } from '@/lib/ecu';
type ScanState =
  | 'idle' | 'scanning' | 'clearing' | 'done' | 'cleared'
  /** Session opened, request sent, ECU said nothing. */
  | 'no_response'
  /** ECU answered the request with a negative response (7F <sid> <nrc>). */
  | 'rejected'
  /** Could not even open the session — a different problem entirely. */
  | 'no_session'
  | 'error';

export interface DTCEntry {
  code: string;
  description: string;
  udsStatus?: number;
  rawValue: number;
  ecuName?: string;
  /** How the DB text was matched — see the Rust `EcuDtcEntry.source`. */
  dtcSource?: 'ecu-exact' | 'ddt-exact' | 'cross-unit';
}

export interface DTCScan {
  timestamp: string;
  protocol: Protocol;
  brand: VehicleBrand;
  codes: DTCEntry[];
  rawLines: string[];
  /** Every frame seen on the response ID during the scan window, as hex —
   *  so a misparse or an unexpected reply is always visible. */
  rawResponse: string[];
  /** Set when the ECU sent 7F <sid> <nrc> (nrc != 0x78). */
  nrc?: { sid: number; code: number };
  /** True once a positive response to the DTC service was actually parsed. */
  gotPositive: boolean;
}

/** ISO 14229 negative-response codes we're likely to see here. */
const NRC_NAMES: Record<number, string> = {
  0x10: 'general reject',
  0x11: 'service not supported',
  0x12: 'sub-function not supported',
  0x13: 'wrong length / format',
  0x14: 'response too long',
  0x22: 'conditions not correct',
  0x24: 'request sequence error',
  0x31: 'request out of range',
  0x33: 'security access denied',
  0x35: 'invalid key',
  0x78: 'response pending',
  0x7E: 'sub-function not supported in active session',
  0x7F: 'service not supported in active session',
};

interface IsoTpFrame {
  totalLen: number;
  data: number[];
  nextSeq: number;
}

interface EcuDtcEntry {
  dtcRaw: number;
  dtcCode: string;
  description: string;
  ecuName: string;
  source: 'ecu-exact' | 'ddt-exact' | 'cross-unit';
  ecuFile?: string | null;
}

interface IdentMatch {
  ecuFile: string;
  ecuName: string;
}

/* ── Bus recorder: raw capture of whatever the Nano forwards, tagged by
   which tool(s) are physically talking to the ABS ECU during the session.
   Used for K-line/CAN ECUs not yet in the DDT4ALL DB (e.g. MK61) — the
   board can't originate K-line requests, so we just sniff/log traffic
   while the user drives the session manually (e.g. with an Autel tool)
   and hand the raw log back for offline protocol analysis. ────────── */
type RecordMode = 'autel' | 'abs' | 'both';

interface RecordedLine {
  tMs: number;
  line: string;
}

interface BusRecording {
  mode: RecordMode;
  startedAt: string;
  absRef: string;
  lines: RecordedLine[];
}

/** A capture auto-written to %APPDATA%\braxon\bus-captures\ — mirrors the
    camelCase struct from list_bus_captures in src-tauri/src/commands.rs. */
interface BusCaptureFile {
  name: string;
  path: string;
  size: number;
  modifiedMs: number;
}

const RECORD_MODE_LABEL: Record<RecordMode, string> = {
  autel: 'OBD tool (Autel)',
  abs: 'ABS board',
  both: 'Both connected',
};

/** header + timestamped body — the on-disk format for a bus capture. */
function buildCaptureLog(
  rec: BusRecording,
  meta: { brand: string; protocol: string; ecuName?: string },
): string {
  const header = [
    `# DTC Scanner bus recording`,
    `# ABS reference: ${rec.absRef || '(not set — select the ABS in the DB search above)'}`,
    `# mode: ${RECORD_MODE_LABEL[rec.mode]}`,
    `# started: ${rec.startedAt}`,
    `# frames: ${rec.lines.length}`,
    `# brand: ${meta.brand} · protocol: ${meta.protocol}${meta.ecuName ? ` · ecu: ${meta.ecuName}` : ''}`,
    '',
  ].join('\n');
  const body = rec.lines.map(l => `[+${l.tMs}ms] ${l.line}`).join('\n');
  return header + body + '\n';
}

function captureFilename(rec: BusRecording): string {
  const safeStamp = rec.startedAt.replace(/[:.]/g, '-');
  const safeRef = rec.absRef ? `-${rec.absRef.replace(/[^\w.-]+/g, '_')}` : '';
  return `dtc-bus-${rec.mode}${safeRef}-${safeStamp}.log`;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function relTime(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ── Decode a DTC ────────────────────────────────────────────────
   Delegates to the SAE J2012 / ISO 14229 generic decoder in ./lib/dtcGeneric
   (code letters = bit math, C0xxx meanings + failure-type byte = static
   standard tables). `ftb` = 3rd byte of a UDS DTC record; omit for 2-byte. */
function decodeDTC(high: number, low: number, ftb?: number | null): DTCEntry {
  const d = describeDtc(high, low, ftb);
  return { code: d.code, description: d.text, rawValue: d.raw };
}

/* ── Parse OBD-II mode 03 (0x43) response payload ────────────── */
function parseOBD2Payload(payload: number[]): DTCEntry[] {
  if (payload[0] !== 0x43) return [];
  const count = payload[1] ?? 0;
  const codes: DTCEntry[] = [];
  for (let i = 0; i < count; i++) {
    const high = payload[2 + i * 2];
    const low  = payload[3 + i * 2];
    if (high === undefined || low === undefined) break;
    if (high !== 0 || low !== 0) codes.push(decodeDTC(high, low));
  }
  return codes;
}

const hx = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

/* ── Parse UDS 0x19 0x02 response (0x59 02) payload ───────────
   Layout: 59 02 <availabilityMask> then N × { DTC[3] , statusOfDTC[1] }.

   A broad status mask (the 0x3B the reference tool uses) makes these
   Renault/Bosch ABS ECUs dump their whole DTC catalogue — dozens of records,
   most with status 0x50 ("supported, test never ran"). Keep only the ones the
   ECU actually flags failed (bit 0) or confirmed (bit 3). The DTC itself is a
   3-byte manufacturer value, not an SAE-packed code, so it's shown as raw hex
   (+ SAE best-effort) and left for the DB to name. */
function parseUDSPayload(payload: number[]): DTCEntry[] {
  if (payload[0] !== 0x59 || payload[1] !== 0x02) return [];
  const codes: DTCEntry[] = [];
  for (let i = 3; i + 3 < payload.length; i += 4) {
    const b1 = payload[i];
    const b2 = payload[i + 1];
    const b3 = payload[i + 2];
    const status = payload[i + 3];
    if ((b1 | b2 | b3) === 0) continue;
    // 0x01 testFailed, 0x08 confirmedDTC — a real, current fault.
    if ((status & 0x09) === 0) continue;
    const sae = decodeDTC(b1, b2, b3);
    codes.push({
      code: `${hx(b1)} ${hx(b2)} ${hx(b3)}`,
      description: `${sae.code} — ${sae.description}`,
      rawValue: sae.rawValue,
      udsStatus: status,
    });
  }
  return codes;
}

/* ── Parse KWP2000 0x18 response (0x58) payload ─────────────── */
function parseKWPPayload(payload: number[]): DTCEntry[] {
  if (payload[0] !== 0x58) return [];
  const count = payload[1] ?? 0;
  const codes: DTCEntry[] = [];
  for (let i = 0; i < count; i++) {
    const high = payload[2 + i * 2];
    const low  = payload[3 + i * 2];
    if (high === undefined || low === undefined) break;
    if (high !== 0 || low !== 0) codes.push(decodeDTC(high, low));
  }
  return codes;
}

/**
 * Traffic the held session generates on its own: TesterPresent acks (7E), a
 * negative response to TesterPresent itself (7F 3E <nrc> — some ECUs reject
 * the keep-alive's subfunction, e.g. a Ford/ATE unit wanting 0x00 where this
 * app sends the KWP-style 0x01; the session stays fine regardless), and
 * "response pending" (7F <sid> 78). None of these are an answer to whatever
 * request a caller is waiting on, so every listener has to step over them —
 * otherwise a keep-alive tick that lands mid-scan gets mistaken for the
 * scan's own request being rejected.
 */
function isSessionNoise(payload: number[]): boolean {
  if (!payload.length) return true;
  if (payload[0] === 0x7E) return true;
  if (payload[0] === 0x7F && payload[1] === 0x3E) return true;
  return payload[0] === 0x7F && payload[2] === 0x78;
}

const DTC_TYPE_STYLE: Record<string, string> = {
  P: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/25',
  C: 'text-red-400   bg-red-400/10   border-red-400/25',
  B: 'text-blue-400  bg-blue-400/10  border-blue-400/25',
  U: 'text-purple-400 bg-purple-400/10 border-purple-400/25',
};

/* ── Component ───────────────────────────────────────────────── */
interface Props {
  sendMessage: (msg: string) => Promise<boolean | void>;
  isConnected: boolean;
  absReference?: string;
}

const SCAN_TIMEOUT_MS = 3500;

export default function Diagnostics({ sendMessage, isConnected, absReference }: Props) {
  const { currentJob } = useSession();
  const { patchIdent: reportPatchIdent, setDtc: reportSetDtc, resetSignalDraft } = useReports();

  // One diagnostic session held for the ECU on the bench. Every request below
  // goes out inside it — these ECUs silently ignore anything sent outside one.
  const { session, ensureSession, closeSession } = useUdsSession(sendMessage, isConnected);

  const [brand, setBrand]               = useState<VehicleBrand>('Renault');
  const [protocol, setProtocol]         = useState<Protocol>('OBD2');
  const [ecuIdHex, setEcuIdHex]         = useState('7E0');
  // Explicit response ID. Empty = derive from the request ID + protocol offset.
  const [recvIdHex, setRecvIdHex]       = useState('');
  const [useBroadcast, setUseBroadcast] = useState(true);
  const [scanState, setScanState]       = useState<ScanState>('idle');
  const [scan, setScan]                 = useState<DTCScan | null>(null);
  // VW TP2.0 channel — the pre-UDS VAG transport, held like a session.
  const vwChanRef                       = useRef<VwTp20Channel | null>(null);
  const [vwOpen, setVwOpen]             = useState(false);
  const [vwTrace, setVwTrace]           = useState<string[]>([]);
  // Technician setup (addressing / discovery / protocol / bus recorder) is
  // folded away by default — operators pick a reference and hit Scan.
  const [setupOpen, setSetupOpen]       = useState(() => {
    try { return localStorage.getItem('braxon.diag.setupOpen') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('braxon.diag.setupOpen', setupOpen ? '1' : '0'); } catch { /* ignore */ }
  }, [setupOpen]);
  const [saveStatus, setSaveStatus]     = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [refSaveStatus, setRefSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [noteOpen, setNoteOpen]         = useState(false);
  const [errorMsg, setErrorMsg]         = useState('');
  const [dbEnriching, setDbEnriching]   = useState(false);
  const [rawOpen, setRawOpen]           = useState(false);

  // ECU selector + active test state
  const [ecuList, setEcuList]           = useState<EcuInfo[]>([]);
  const [selectedEcu, setSelectedEcu]   = useState<EcuInfo | null>(null);
  const [actuators, setActuators]       = useState<ActuatorEntry[]>([]);
  // DDT4ALL full-import (Ddt* tables): calibration / programming procedures for
  // the selected ECU that the ABS-only EcuActuator import may not carry.
  const [ddtProcs, setDdtProcs]         = useState<ActuatorEntry[]>([]);
  const [activeTestOpen, setActiveTestOpen] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [partNumber, setPartNumber]     = useState('');
  const [identState, setIdentState]     = useState<'idle' | 'detecting' | 'found' | 'not_found'>('idle');

  // Bus recorder state
  const [recordMode, setRecordMode]     = useState<RecordMode | null>(null);
  const [recording, setRecording]       = useState<BusRecording | null>(null);
  const [recordCount, setRecordCount]   = useState(0);
  const [saveRecStatus, setSaveRecStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Where the just-stopped capture was auto-written, and the list of every
  // capture on disk — so a cancelled "Save copy…" dialog never loses one.
  const [autoSaved, setAutoSaved]       = useState<{ path: string; name: string } | null>(null);
  const [pastCaptures, setPastCaptures] = useState<BusCaptureFile[]>([]);
  const [capturesOpen, setCapturesOpen] = useState(false);
  const recordListenerRef = useRef<((e: SerialEvent) => void) | null>(null);
  const recordLinesRef    = useRef<RecordedLine[]>([]);
  const recordStartRef    = useRef(0);
  const recordAbsRefRef   = useRef('');

  const scanActiveRef    = useRef(false);
  const protocolRef      = useRef<Protocol>('OBD2');
  const brandRef         = useRef<VehicleBrand>('Renault');
  const isoTpRef         = useRef<Map<number, IsoTpFrame>>(new Map());
  const payloadsRef      = useRef<{ payload: number[]; fromId: number }[]>([]);
  const rawLinesRef      = useRef<string[]>([]);
  // Every frame on the response ID during the scan window, formatted as hex.
  const respFramesRef    = useRef<string[]>([]);
  // The service ID this scan actually asked for (0x03/0x19/0x18) — a negative
  // response only counts as "the scan was rejected" if it names this SID, not
  // an unrelated one (e.g. the keep-alive's own 7F 3E landing mid-scan).
  const reqSidRef        = useRef<number | null>(null);
  // "<absRef>:<protocol>" already written back to the DB this session — a
  // verified positive response only needs to correct the stored protocol once.
  const learnedProtocolRef = useRef<string | null>(null);
  const listenerRef      = useRef<((e: SerialEvent) => void) | null>(null);
  const timeoutRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendRef          = useRef(sendMessage);
  sendRef.current = sendMessage;

  useEffect(() => {
    return () => {
      if (listenerRef.current) clientSerial.removeEventListener(listenerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (recordListenerRef.current) clientSerial.removeEventListener(recordListenerRef.current);
    };
  }, []);

  // Auto-fill Part No. when a reference is selected in the ABS DB search above
  useEffect(() => {
    if (absReference) setPartNumber(absReference);
  }, [absReference]);

  // Load ECU list from DB when brand changes (only for R/N/M)
  useEffect(() => {
    if (brand === 'Other') { setEcuList([]); return; }
    invoke<EcuInfo[]>('get_ecu_list').then(setEcuList).catch(() => setEcuList([]));
  }, [brand]);

  // Load actuators + DDT4ALL calibration procedures when ECU selection changes
  useEffect(() => {
    if (!selectedEcu) { setActuators([]); setDdtProcs([]); return; }
    invoke<ActuatorEntry[]>('get_ecu_actuators', { ecuFile: selectedEcu.ecuFile })
      .then(setActuators).catch(() => setActuators([]));
    invoke<{ kind: string; sentBytes: string; minBytes: number | null; name: string }[]>(
      'ddt_calibration_procedures', { ecuFile: selectedEcu.ecuFile })
      .then(rows => setDdtProcs(rows.map(r => ({
        id: `ddt:${r.sentBytes}`,
        name: r.name,
        label: r.name.replace(/^(Routine|IO Control|Write)\s*-\s*/i, '').slice(0, 40),
        sentBytes: r.sentBytes,
        category: 'calibration',
      }))))
      .catch(() => setDdtProcs([]));
  }, [selectedEcu]);

  // Brand switch is a manual action: clear the model picked under the old
  // brand. Kept out of the effect above so an auto-configured selection made
  // in the same update isn't wiped by the brand change that came with it.
  const changeBrand = (next: VehicleBrand) => {
    if (next === brand) return;
    setBrand(next);
    setSelectedEcu(null);
    setActuators([]);
    setDdtProcs([]);
  };

  // Response ID the ECU will answer on, most specific source first: the
  // explicit field (set by the ABS-ref lookup, by discovery, or by hand), then
  // the selected ECU's stored recvId, then the protocol's offset convention.
  const resolvedRecvId = (): number | null => {
    const explicit = parseCanId(recvIdHex);
    if (explicit !== null) return explicit;
    const stored = parseCanId(selectedEcu?.recvId);
    if (stored !== null) return stored;
    const base = parseCanId(ecuIdHex);
    if (base === null) return null;
    // OBD-II uses +8 (standard); Renault/Nissan/Mitsubishi CAN uses +0x20
    return base + (protocol === 'OBD2' ? 8 : 0x20);
  };

  // Standard OBD-II is sessionless — mode 03 is answered cold. Only the
  // manufacturer protocols need DiagnosticSessionControl held open.
  const needsSession = protocol !== 'OBD2';

  /**
   * Guarantee an open session before a request goes out, reusing the held one
   * when the address already matches. Returns false only when session control
   * itself failed — the caller reports that as its own state, since it points
   * at addressing or wiring rather than at the request.
   */
  const prepareSession = async (): Promise<{ ok: boolean; detail?: string }> => {
    if (!needsSession) return { ok: true };
    const sendId = parseCanId(ecuIdHex);
    const recvId = resolvedRecvId();
    if (sendId === null || recvId === null) {
      return { ok: false, detail: 'No valid ECU address configured' };
    }
    const res = await ensureSession(sendId, recvId);
    if (res.ok) return { ok: true };
    return {
      ok: false,
      detail: res.reason === 'rejected'
        ? `ECU refused the session (7F 10 ${res.nrc !== undefined ? res.nrc.toString(16).toUpperCase().padStart(2, '0') : '??'}) at 0x${toHex3(sendId)}`
        : `No response to session control (10 C0 / 10 03) at 0x${toHex3(sendId)} → 0x${toHex3(recvId)}`,
    };
  };

  // Selecting an ECU record also configures addressing and protocol from it.
  const selectEcu = (ecu: EcuInfo | null) => {
    setSelectedEcu(ecu);
    if (!ecu) return;
    setActiveTestOpen(true);
    const sendId = parseCanId(ecu.sendId);
    if (sendId !== null) {
      setEcuIdHex(toHex3(sendId));
      setRecvIdHex(toHex3(parseCanId(ecu.recvId) ?? sendId + 0x20));
      setUseBroadcast(false);
    }
    const prot = protocolFromDb(ecu.protocol);
    if (prot) setProtocol(prot);
  };

  // One ABS reference drives the whole session: brand, protocol, addressing,
  // ECU record (and therefore its actuators). Values the lookup resolved win
  // over the ECU record's own defaults — a discovered address is the truth
  // for the unit actually on the bench.
  const applyAutoConfig = (cfg: EcuAutoConfigResult) => {
    setPartNumber(cfg.absRef);
    if (cfg.brand) setBrand(cfg.brand);
    selectEcu(cfg.ecu);
    if (cfg.sendIdHex) { setEcuIdHex(cfg.sendIdHex); setUseBroadcast(false); }
    if (cfg.recvIdHex) setRecvIdHex(cfg.recvIdHex);
    if (cfg.protocol)  setProtocol(cfg.protocol);
    setScanState('idle');
    setScan(null);
    // A session held for the previous unit is meaningless once the bench
    // moves to another address — drop it rather than keep it alive.
    const nextSendId = parseCanId(cfg.sendIdHex);
    if (session.sendId !== null && nextSendId !== session.sendId) closeSession();
  };

  // Silently enrich DTC descriptions from the ECU DB after a scan. One batch
  // round-trip, scoped to the unit on the bench: an exact `EcuDtc`/`DdtDevice`
  // row for `selectedEcu.ecuFile` wins; failing that, the same raw value from
  // any other unit (ATE/Bosch fault tables are shared across OEMs) — flagged
  // `cross-unit` so the UI can mark it as borrowed.
  const enrichFromDb = useCallback(async (codes: DTCEntry[]): Promise<DTCEntry[]> => {
    if (!codes.length) return codes;
    // VW TP2.0 DTCs are the VAG 5-digit number on the wire → the Ross-Tech wiki
    // table is keyed exactly the same way.
    const ecuFile = protocol === 'VWTP20' ? 'VAG_WIKI' : (selectedEcu?.ecuFile ?? null);
    try {
      const hits = await invoke<(EcuDtcEntry | null)[]>('lookup_dtcs', {
        dtcRaws: codes.map(c => c.rawValue),
        ecuFile,
      });
      return codes.map((dtc, i) => {
        const e = hits[i];
        if (!e) return dtc;
        return { ...dtc, description: e.description, ecuName: e.ecuName, dtcSource: e.source };
      });
    } catch {
      return codes; // DB not populated yet — keep the generic SAE fallback
    }
  }, [selectedEcu, protocol]);

  const guessedFamily = guessHardwareFamily(partNumber);

  // Filter ECU list: if we guessed a hardware family, show only matching entries.
  // If no guess (unknown part number or empty), show all.
  const filteredEcuList = guessedFamily
    ? ecuList.filter(e => e.hardwareFamily === guessedFamily)
    : ecuList;

  // Active tests: DDT4ALL DB entries for the selected ECU, plus any built-in
  // ones for the hardware family — merged, not either/or, so a family the DB
  // only *mostly* covers still gets the gap filled in alongside the real
  // entries (used today for the MK61 return-pump test).
  const testFamily = selectedEcu?.hardwareFamily ?? guessedFamily;
  // A `10.0961-…` part number guesses "MK61" (Renault ATE), but the same ATE
  // hardware ships in VW/Audi too — on the VW TP2.0 transport it is NOT a
  // Renault MK61, so its Renault built-ins (pump test, 21 04 wheel speeds)
  // must not appear.
  const familyForBuiltins = protocol === 'VWTP20' ? null : testFamily;
  const builtinActuators = builtinActuatorsFor(familyForBuiltins)
    .filter(b => !actuators.some(a => a.id === b.id));
  const extraDdtProcs = ddtProcs.filter(
    p => !actuators.some(a => a.sentBytes === p.sentBytes) &&
         !builtinActuators.some(b => b.sentBytes === p.sentBytes));
  const shownActuators = [...actuators, ...builtinActuators, ...extraDdtProcs];
  const usingBuiltinActuators = builtinActuators.length > 0 || extraDdtProcs.length > 0;
  // Address to send actuator frames to: the DB ECU's send ID, else the
  // manually configured / auto-configured request ID from the address row.
  const actuatorSendId = selectedEcu?.sendId ?? (parseCanId(ecuIdHex) !== null ? ecuIdHex : null);

  // Auto-identify the connected ECU using KWP2000 service 21 80.
  // Renault CAN convention: send to send_id (default 0x740), receive at send_id + 0x20 (0x760).
  // Response byte layout (0-indexed, including the 61 80 prefix):
  //   [7]     = diagversion (1 byte, decimal string)
  //   [8..10] = supplier    (3 bytes ASCII, e.g. "037")
  //   [16,17] = version     (2 bytes → 4-char uppercase hex)
  //   [20,21] = soft        (2 bytes → 4-char uppercase hex)
  const identifyEcu = async () => {
    if (!isConnected || identState === 'detecting') return;
    setIdentState('detecting');

    const sendIdNum = parseCanId(ecuIdHex) ?? 0x740;
    // Configured response ID if there is one, plus the Renault CAN convention
    // (recv = send + 0x20) this KWP service follows.
    const configured = parseCanId(recvIdHex) ?? parseCanId(selectedEcu?.recvId);
    const recvIds = [...new Set([configured, sendIdNum + 0x20])]
      .filter((id): id is number => id !== null && id <= 0x7FF);

    // 21 80 is only answered inside an open session, like every other request.
    const gate = await prepareSession();
    if (!gate.ok) {
      setIdentState('not_found');
      setTimeout(() => setIdentState('idle'), 3000);
      return;
    }

    const res = await isoTpRequest({
      send: (msg) => sendRef.current(msg),
      sendId: sendIdNum,
      recvIds,
      data: [0x21, 0x80],
      timeoutMs: 2000,
      // Step over keep-alive acks so a 7E arriving mid-wait is not mistaken
      // for a truncated ident response.
      accept: (payload) => payload[0] === 0x61 || payload[0] === 0x7F,
    });

    // Need at least 22 bytes to read all fields (soft ends at index 21)
    if (!res || res.payload.length < 22) {
      setIdentState('not_found');
      setTimeout(() => setIdentState('idle'), 3000);
      return;
    }

    const p = res.payload;
    // supplier: 3 ASCII bytes at index 8,9,10 (firstbyte=9 in DDT4ALL, which is 1-indexed)
    const supplier = String.fromCharCode(p[8], p[9], p[10]).replace(/[^\x20-\x7E]/g, '');
    // version: 2 bytes at index 16,17 (firstbyte=17)
    const version  = p[16].toString(16).toUpperCase().padStart(2, '0')
                   + p[17].toString(16).toUpperCase().padStart(2, '0');
    // soft: 2 bytes at index 20,21 (firstbyte=21)
    const soft     = p[20].toString(16).toUpperCase().padStart(2, '0')
                   + p[21].toString(16).toUpperCase().padStart(2, '0');

    reportPatchIdent({ supplier, version, soft, identifiedAt: new Date().toISOString() });

    try {
      const match = await invoke<IdentMatch | null>('match_ecu_ident', { supplier, version, soft });
      if (match) {
        // Find in already-loaded list, or reload the list first
        let ecu = ecuList.find(e => e.ecuFile === match.ecuFile) ?? null;
        if (!ecu) {
          // List may not be loaded yet (brand = Other or not loaded)
          const list = await invoke<EcuInfo[]>('get_ecu_list');
          setEcuList(list);
          ecu = list.find(e => e.ecuFile === match.ecuFile) ?? null;
        }
        if (ecu) {
          selectEcu(ecu);
          setIdentState('found');
          setTimeout(() => setIdentState('idle'), 4000);
        } else {
          setIdentState('not_found');
          setTimeout(() => setIdentState('idle'), 3000);
        }
      } else {
        setIdentState('not_found');
        setTimeout(() => setIdentState('idle'), 3000);
      }
    } catch {
      setIdentState('not_found');
      setTimeout(() => setIdentState('idle'), 3000);
    }
  };

  // Build ISO-TP single frame CANTx string from sentBytes hex + send_id
  const buildActuatorFrame = (sentBytes: string, sendId: string): string | null => {
    const bytes = sentBytes.match(/.{1,2}/g)?.map(h => parseInt(h, 16)) ?? [];
    if (!bytes.length || bytes.length > 7) return null; // >7 needs multi-frame (not yet supported)
    const frame = [bytes.length, ...bytes];
    while (frame.length < 8) frame.push(0x00);
    const hex = frame.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    return `CANTx : ${sendId.toUpperCase().padStart(3, '0')} ${hex}\n`;
  };

  const sendActuator = async (actuator: ActuatorEntry) => {
    if (!isConnected || !actuatorSendId) return;
    const frame = buildActuatorFrame(actuator.sentBytes, actuatorSendId);
    if (!frame) return;
    setActivatingId(actuator.id);
    // Reuses the held session; only opens one if nothing is active yet.
    const gate = await prepareSession();
    if (!gate.ok) { setActivatingId(null); return; }
    await sendRef.current(frame);
    setTimeout(() => setActivatingId(null), 800);
  };

  const getResponseRange = (): [number, number] => {
    if (protocol === 'OBD2' && useBroadcast) return [0x7E0, 0x7EF];
    const recv = resolvedRecvId();
    if (recv === null) return [0x7E0, 0x7EF];
    return [recv, recv];
  };

  const stopScan = () => {
    scanActiveRef.current = false;
    if (listenerRef.current) { clientSerial.removeEventListener(listenerRef.current); listenerRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  };

  // ── VW TP2.0 path ─────────────────────────────────────────────────────
  // A persistent channel replaces the UDS session; `18 02 FF 00` replaces the
  // ISO-TP DTC request. Everything renders into the same `scan` UI.
  const openVwChannel = async (): Promise<VwTp20Channel | null> => {
    if (vwChanRef.current?.open) return vwChanRef.current;
    const { channel, log } = await openVwTp20Channel({ send: sendMessage, logicalAddress: 0x03 });
    vwChanRef.current = channel;
    setVwTrace(log);
    setVwOpen(!!channel);
    if (channel) await channel.request([0x10, 0x89], { timeoutMs: 1500 }); // best-effort session
    return channel;
  };

  const closeVwChannel = () => {
    vwChanRef.current?.close();
    vwChanRef.current = null;
    setVwOpen(false);
    setVwTrace([]);
  };

  const hexFrame = (id: number, bytes: number[]) =>
    `${toHex3(id)}  ${bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`;

  // Persist the current protocol + addressing + family against this ABS
  // reference, so next time the operator picks it everything preloads and they
  // just hit Scan. (An `18` positive also auto-writes the protocol; this button
  // is the explicit "remember this whole setup" the tech asked for.)
  const saveRefSettings = async () => {
    if (!absReference?.trim()) return;
    setRefSaveStatus('saving');
    try {
      const sid = protocol === 'VWTP20' ? null : (parseCanId(ecuIdHex) !== null ? ecuIdHex : null);
      const rid = protocol === 'VWTP20' ? null : (recvIdHex.trim() || null);
      await invoke('save_abs_ref_ecu', {
        absRef: absReference,
        ecuFile: selectedEcu?.ecuFile ?? null,
        sendId: sid,
        recvId: rid,
        protocol,
        hardwareFamily: selectedEcu?.hardwareFamily ?? testFamily ?? null,
        source: 'manual',
      });
      setRefSaveStatus('saved');
      setTimeout(() => setRefSaveStatus('idle'), 2500);
    } catch {
      setRefSaveStatus('error');
      setTimeout(() => setRefSaveStatus('idle'), 2500);
    }
  };

  const vwScan = async () => {
    stopScan();
    setScanState('scanning');
    setScan(null);
    setSaveStatus('idle');
    setErrorMsg('');
    protocolRef.current = protocol;
    brandRef.current = brand;

    const ch = await openVwChannel();
    if (!ch) {
      setScanState('no_session');
      setErrorMsg('VW TP2.0 channel did not open — see the trace above');
      return;
    }
    const r = await ch.request([0x18, 0x02, 0xff, 0x00], { timeoutMs: 3000 });
    const rawResponse = r ? [hexFrame(ch.rxId, r.payload)] : [];
    const base = { timestamp: new Date().toISOString(), protocol, brand, rawLines: [] as string[], rawResponse };

    if (!r) {
      setScan({ ...base, codes: [], gotPositive: false });
      setScanState('no_response');
      return;
    }
    if (r.payload[0] === 0x7f) {
      setScan({ ...base, codes: [], gotPositive: false, nrc: { sid: r.payload[1], code: r.payload[2] } });
      setScanState('rejected');
      return;
    }
    let codes: DTCEntry[] = decodeVwDtcs(r.payload).map(d => ({
      code: d.code,
      description: d.elaborationText,
      rawValue: d.raw,
      udsStatus: d.status,
    }));
    setScan({ ...base, codes, gotPositive: true });
    setScanState('done');

    // A working TP2.0 read proves the protocol for this reference — remember it
    // so next time the operator just picks the ref and scans.
    if (absReference?.trim()) {
      const key = `${absReference}:VWTP20`;
      if (learnedProtocolRef.current !== key) {
        learnedProtocolRef.current = key;
        invoke('save_abs_ref_ecu', {
          absRef: absReference, ecuFile: null, sendId: null, recvId: null,
          protocol: 'VWTP20', hardwareFamily: null, source: 'confirmed',
        }).catch(() => { learnedProtocolRef.current = null; });
      }
    }
    if (codes.length) {
      setDbEnriching(true);
      const enriched = await enrichFromDb(codes);
      setScan(prev => prev ? { ...prev, codes: enriched } : prev);
      setDbEnriching(false);
    }
  };

  const vwClear = async () => {
    const ch = vwChanRef.current;
    if (!ch?.open) return;
    setScanState('clearing');
    await ch.request([0x14, 0xff, 0xff], { timeoutMs: 3000 });
    setTimeout(() => { setScanState('cleared'); setScan(null); }, 1200);
  };

  // Drop the channel when the link goes away, the panel unmounts, or the user
  // switches to a non-TP2.0 protocol.
  useEffect(() => {
    if ((!isConnected || protocol !== 'VWTP20') && vwChanRef.current) closeVwChannel();
    return () => { vwChanRef.current?.close(); vwChanRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, protocol]);

  const finalizeScan = async () => {
    const rawLines = rawLinesRef.current;
    const payloads = payloadsRef.current;
    const rawResponse = [...respFramesRef.current];

    // Negative response to *this scan's own request* — 7F <sid> <nrc>, sid must
    // match what we asked for (not an unrelated 7F, e.g. the keep-alive's),
    // nrc 0x78 ("pending") stepped over.
    const neg = payloads.find(p =>
      p.payload[0] === 0x7F && p.payload[1] === reqSidRef.current && p.payload[2] !== 0x78);
    if (neg) {
      setScan({
        timestamp: new Date().toISOString(),
        protocol: protocolRef.current, brand: brandRef.current,
        codes: [], rawLines, rawResponse,
        nrc: { sid: neg.payload[1] ?? 0, code: neg.payload[2] ?? 0 },
        gotPositive: false,
      });
      setScanState('rejected');
      return;
    }

    // Nothing at all came back on the response ID.
    if (rawResponse.length === 0) {
      setScanState('no_response');
      return;
    }

    const posSid = protocolRef.current === 'OBD2' ? 0x43 : protocolRef.current === 'UDS' ? 0x59 : 0x58;
    const gotPositive = payloads.some(p => p.payload[0] === posSid);

    let codes: DTCEntry[] = [];
    for (const { payload } of payloads) {
      if (!payload.length) continue;
      if (protocolRef.current === 'OBD2')    codes.push(...parseOBD2Payload(payload));
      if (protocolRef.current === 'UDS')     codes.push(...parseUDSPayload(payload));
      if (protocolRef.current === 'KWP2000') codes.push(...parseKWPPayload(payload));
    }

    const seen = new Set<string>();
    codes = codes.filter(c => !seen.has(c.code) && seen.add(c.code) !== undefined);

    setScan({
      timestamp: new Date().toISOString(),
      protocol: protocolRef.current, brand: brandRef.current,
      codes, rawLines, rawResponse, gotPositive,
    });
    setScanState('done');

    // A real positive response *proves* which protocol tab is right for this
    // reference — write it back so the next lookup auto-selects it instead of
    // defaulting to a guess (non-OBD addresses default to KWP2000, which is
    // wrong for a UDS-only ECU like the Ford/ATE unit that started this).
    // save_abs_ref_ecu only touches the protocol column (COALESCE keeps the
    // rest), so this can't clobber a saved address/ecu link.
    if (gotPositive && protocolRef.current !== 'OBD2' && absReference?.trim()) {
      const key = `${absReference}:${protocolRef.current}`;
      if (learnedProtocolRef.current !== key) {
        learnedProtocolRef.current = key;
        invoke('save_abs_ref_ecu', {
          absRef: absReference,
          ecuFile: null, sendId: null, recvId: null,
          protocol: protocolRef.current,
          hardwareFamily: null,
          source: 'confirmed',
        }).catch(() => { learnedProtocolRef.current = null; }); // best effort — retry next scan
      }
    }

    // Always try the DB, regardless of which Brand tab is selected. That tab
    // is a vehicle-OEM filter for the ECU-model dropdown, not a hardware
    // boundary — ATE/Bosch ABS platforms are resold across OEMs with the same
    // internal fault-code table verbatim (confirmed 2026-09-04: a Ford/ATE
    // unit's raw DTCs matched, byte-for-byte, entries stored under the
    // Renault MK61 ECU — the codes are ATE-platform-specific, not brand-
    // specific). Gating this on Brand !== 'Other' only found that match by
    // accident of which tab happened to be left selected.
    if (codes.length > 0) {
      setDbEnriching(true);
      const enriched = await enrichFromDb(codes);
      setScan(prev => prev ? { ...prev, codes: enriched } : prev);
      setDbEnriching(false);
    }
  };

  const startScan = async () => {
    if (!isConnected || scanState === 'scanning') return;
    if (protocol === 'VWTP20') { await vwScan(); return; }

    stopScan();
    setScanState('scanning');
    setScan(null);
    setSaveStatus('idle');
    setErrorMsg('');

    // The ECU answers nothing outside an open session, so the session comes
    // first and its keep-alive runs for the whole scan window.
    const gate = await prepareSession();
    if (!gate.ok) {
      setErrorMsg(gate.detail ?? '');
      setScanState('no_session');
      return;
    }

    scanActiveRef.current = true;
    protocolRef.current = protocol;
    brandRef.current = brand;
    isoTpRef.current.clear();
    payloadsRef.current = [];
    rawLinesRef.current = [];
    respFramesRef.current = [];

    // Capture ECU addressing at scan start. Broadcasting has no single tester
    // ID to flow-control from — that one is derived per responding ECU below.
    const broadcasting = protocol === 'OBD2' && useBroadcast;
    const ecuSendId  = broadcasting ? null : (parseCanId(ecuIdHex) ?? parseCanId(selectedEcu?.sendId));
    const fcOffset   = protocol === 'OBD2' ? 8 : 0x20; // OBD uses +8, Renault CAN uses +0x20

    const [respMin, respMax] = getResponseRange();

    const listener = (event: SerialEvent) => {
      if (!scanActiveRef.current || event.type !== 'data' || !event.data) return;

      const line = event.data.trim();
      rawLinesRef.current.push(line);

      const parts = line.split(/\s+/);
      if (parts.length < 3) return;

      const id  = parseInt(parts[0], 10);
      const dlc = parseInt(parts[1], 10);
      if (isNaN(id) || isNaN(dlc) || id < respMin || id > respMax) return;

      const bytes: number[] = [];
      for (let i = 2; i < 2 + dlc && i < parts.length; i++) {
        const b = parseInt(parts[i], 10);
        if (!isNaN(b)) bytes.push(b);
      }
      if (!bytes.length) return;

      // Keep a hex record of every frame from the ECU, reassembled or not.
      respFramesRef.current.push(
        `${toHex3(id)}  ${bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`,
      );

      const isoType = (bytes[0] >> 4) & 0x0F;

      if (isoType === 0) {
        const len = bytes[0] & 0x0F;
        const payload = bytes.slice(1, 1 + len);
        // The session keep-alive is ticking during the scan window. Its 7E
        // acks — and "still working" replies — are not answers to the DTC
        // request, and counting them would turn silence into "no faults".
        if (isSessionNoise(payload)) return;
        payloadsRef.current.push({ payload, fromId: id });
      } else if (isoType === 1) {
        const totalLen = ((bytes[0] & 0x0F) << 8) | bytes[1];
        isoTpRef.current.set(id, { totalLen, data: bytes.slice(2), nextSeq: 1 });
        // Flow control goes to ECU's physical (tester) ID: sendId from DB or recv - offset
        const fcId = ecuSendId ?? (id - fcOffset);
        sendRef.current(`CANTx : ${toHex3(fcId)} 30 00 00 00 00 00 00 00\n`);
      } else if (isoType === 2) {
        const seq   = bytes[0] & 0x0F;
        const frame = isoTpRef.current.get(id);
        if (frame && frame.nextSeq === seq) {
          frame.data.push(...bytes.slice(1));
          frame.nextSeq = (seq + 1) % 16;
          if (frame.data.length >= frame.totalLen) {
            payloadsRef.current.push({ payload: frame.data.slice(0, frame.totalLen), fromId: id });
            isoTpRef.current.delete(id);
          }
        }
      }
    };

    listenerRef.current = listener;
    clientSerial.addEventListener(listener);

    let reqId: string;
    let reqBytes: string;

    if (protocol === 'OBD2') {
      reqId    = useBroadcast ? '7DF' : ecuIdHex.toUpperCase().padStart(3, '0');
      reqBytes = '02 03 00 00 00 00 00 00';
    } else if (protocol === 'UDS') {
      reqId    = ecuIdHex.toUpperCase().padStart(3, '0');
      // 19 02 <statusMask>. Mask 0x3B is what the commercial tool (Autel) uses
      // on these Renault/Bosch ABS units — captured 2026-07-24 on a MK61
      // (10.0961-1464.3): 0x740→0x760, session 10 C0, then `19 02 3B`. 0xFF is
      // legal but some of these ECUs answer nothing to it.
      reqBytes = '03 19 02 3B 00 00 00 00';
    } else {
      reqId    = ecuIdHex.toUpperCase().padStart(3, '0');
      reqBytes = '03 18 00 FF 00 00 00 00';
    }
    reqSidRef.current = parseInt(reqBytes.split(' ')[1], 16);

    const sent = await sendRef.current(`CANTx : ${reqId} ${reqBytes}\n`);
    if (sent === false) {
      stopScan();
      setScanState('error');
      setErrorMsg('Failed to send request — check serial connection');
      return;
    }

    timeoutRef.current = setTimeout(() => {
      stopScan();
      finalizeScan();
    }, SCAN_TIMEOUT_MS);
  };

  const clearDTCs = async () => {
    if (!isConnected) return;
    if (protocol === 'VWTP20') { await vwClear(); return; }
    setScanState('clearing');

    const gate = await prepareSession();
    if (!gate.ok) {
      setErrorMsg(gate.detail ?? '');
      setScanState('no_session');
      return;
    }

    let reqId: string;
    let reqBytes: string;

    if (protocol === 'OBD2') {
      reqId    = useBroadcast ? '7DF' : ecuIdHex.toUpperCase().padStart(3, '0');
      reqBytes = '01 04 00 00 00 00 00 00';
    } else {
      reqId    = ecuIdHex.toUpperCase().padStart(3, '0');
      reqBytes = '04 14 FF FF FF 00 00 00';
    }

    await sendRef.current(`CANTx : ${reqId} ${reqBytes}\n`);
    setTimeout(() => { setScanState('cleared'); setScan(null); }, 1500);
  };

  // ── Bus recorder ────────────────────────────────────────────
  // Passively logs every line the Nano forwards over serial (CAN frames or
  // raw K-line bytes, whatever the firmware prints), tagged with which
  // tool(s) were physically on the ABS bus during the session.
  const startRecording = (mode: RecordMode) => {
    if (!isConnected || recordMode) return;
    recordLinesRef.current = [];
    recordStartRef.current = Date.now();
    recordAbsRefRef.current = absReference ?? '';
    setRecordCount(0);
    setRecording(null);
    setSaveRecStatus('idle');

    const listener = (event: SerialEvent) => {
      if (event.type !== 'data' || !event.data) return;
      recordLinesRef.current.push({ tMs: Date.now() - recordStartRef.current, line: event.data.trim() });
      setRecordCount(recordLinesRef.current.length);
    };
    recordListenerRef.current = listener;
    clientSerial.addEventListener(listener);
    setRecordMode(mode);
  };

  const loadPastCaptures = useCallback(async () => {
    try {
      setPastCaptures(await invoke<BusCaptureFile[]>('list_bus_captures'));
    } catch {
      setPastCaptures([]);
    }
  }, []);

  useEffect(() => { loadPastCaptures(); }, [loadPastCaptures]);

  const revealCapture = (path: string) => { void invoke('reveal_path', { path }).catch(() => {}); };

  const stopRecording = async () => {
    if (!recordMode) return;
    if (recordListenerRef.current) { clientSerial.removeEventListener(recordListenerRef.current); recordListenerRef.current = null; }
    const rec: BusRecording = {
      mode: recordMode,
      startedAt: new Date(recordStartRef.current).toISOString(),
      absRef: recordAbsRefRef.current,
      lines: recordLinesRef.current,
    };
    setRecording(rec);
    setRecordMode(null);
    setAutoSaved(null);
    setSaveRecStatus('idle');

    // Auto-write straight away — the manual "Save copy…" below is just an
    // export on top of this, never the only copy.
    if (rec.lines.length > 0) {
      try {
        const path = await invoke<string>('save_bus_capture', {
          filename: captureFilename(rec),
          content: buildCaptureLog(rec, { brand, protocol, ecuName: selectedEcu?.ecuName }),
        });
        setAutoSaved({ path, name: path.split(/[\\/]/).pop() ?? path });
        loadPastCaptures();
      } catch { /* best effort; user can still Save copy… */ }
    }
  };

  const discardRecording = () => {
    // Only clears the in-app view — the auto-saved file on disk stays.
    setRecording(null);
    setRecordCount(0);
    setSaveRecStatus('idle');
    setAutoSaved(null);
  };

  const saveRecording = async () => {
    if (!recording) return;
    setSaveRecStatus('saving');
    try {
      const { save } = await import('@tauri-apps/api/dialog');
      const path = await save({
        defaultPath: captureFilename(recording),
        filters: [{ name: 'Bus log', extensions: ['log', 'txt'] }],
      });
      if (!path) { setSaveRecStatus('idle'); return; }
      await invoke('save_text_file', {
        path,
        content: buildCaptureLog(recording, { brand, protocol, ecuName: selectedEcu?.ecuName }),
      });
      setSaveRecStatus('saved');
      setTimeout(() => setSaveRecStatus('idle'), 3000);
    } catch {
      setSaveRecStatus('error');
    }
  };

  const saveToJob = async () => {
    if (!currentJob || !scan) return;
    setSaveStatus('saving');
    try {
      await invoke('save_job_dtcs', { id: currentJob.id, dtcsJson: JSON.stringify([scan]) });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
    }
  };

  const respRangeLabel = (): string => {
    if (protocol === 'OBD2' && useBroadcast) return '0x7E0–0x7EF';
    const recv = resolvedRecvId();
    return recv === null ? '—' : `0x${toHex3(recv)}`;
  };

  // Collapsible hex dump of exactly what the ECU sent on the response ID —
  // shared by the "rejected" and "done" result panels.
  const renderRawResponse = () => {
    if (!scan?.rawResponse?.length) return null;
    return (
      <div className="pt-1.5 border-t border-border">
        <button
          onClick={() => setRawOpen(v => !v)}
          className="flex items-center gap-1 text-[10px] font-medium text-text-tertiary hover:text-text-secondary transition-colors"
        >
          {rawOpen ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
          Raw response ({scan.rawResponse.length} frame{scan.rawResponse.length !== 1 ? 's' : ''})
        </button>
        {rawOpen && (
          <pre className="mt-1.5 max-h-40 overflow-auto bg-app border border-border rounded-lg p-2 font-mono text-[10px] leading-relaxed text-text-secondary">
            {scan.rawResponse.join('\n')}
          </pre>
        )}
      </div>
    );
  };

  const isBusy = scanState === 'scanning' || scanState === 'clearing';

  const SESSION_CHIP: Record<string, { label: string; cls: string }> = {
    open:        { label: 'Session open · click to close', cls: 'text-success bg-success/10 border-success/25' },
    opening:     { label: 'Opening session… · click to cancel', cls: 'text-accent bg-accent/10 border-accent/25' },
    no_response: { label: 'No answer to 10 C0 · retry',    cls: 'text-danger bg-danger/10 border-danger/25' },
    rejected:    { label: 'Session refused · retry',       cls: 'text-warning bg-warning/10 border-warning/25' },
    lost:        { label: 'Session lost · reopen',         cls: 'text-danger bg-danger/10 border-danger/25' },
    idle:        { label: 'Open session',                  cls: 'text-text-tertiary bg-app border-border' },
  };
  const sessionActive = protocol === 'VWTP20'
    ? vwOpen
    : (session.status === 'open' || session.status === 'opening');
  const sessionChip = protocol === 'VWTP20'
    ? (vwOpen
        ? { label: 'TP2.0 channel open · click to close', cls: 'text-success bg-success/10 border-success/25' }
        : { label: 'Open TP2.0 channel', cls: 'text-text-tertiary bg-app border-border' })
    : (SESSION_CHIP[session.status] ?? SESSION_CHIP.idle);

  const toggleSession = async () => {
    if (protocol === 'VWTP20') {
      if (vwOpen) closeVwChannel(); else await openVwChannel();
      return;
    }
    if (sessionActive) { closeSession(); return; }
    await prepareSession();
  };

  // ── Feed the Test Report draft ─────────────────────────────
  // Switching to a *different* unit starts a clean report. Without this,
  // `patchIdent`'s "drop undefined keys" merge (deliberate, so a
  // less-specific source can't blank a field a more-specific one filled)
  // means a truthy field from the previous unit — e.g. hardwareFamily
  // 'MK61' from testing an actual Renault MK61 — survives untouched even
  // once this component starts reporting `undefined` for a completely
  // different reference, and prints on that unit's report as if it were
  // real. (Root cause of a Ford/ATE unit's report showing "Hardware
  // family: MK61" — cosmetic only: lookup_dtc matches DTCs by raw value
  // globally, with no family/brand filter, so it wasn't affected.)
  const prevAbsRefRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (absReference && prevAbsRefRef.current !== absReference) {
      resetSignalDraft();
    }
    prevAbsRefRef.current = absReference;
  }, [absReference, resetSignalDraft]);

  // Addressing / protocol / model identity as configured here.
  useEffect(() => {
    const recv = resolvedRecvId();
    reportPatchIdent({
      absRef: absReference,
      brand,
      protocol,
      sendId: ecuIdHex || undefined,
      recvId: recv !== null ? toHex3(recv) : undefined,
      ecuName: selectedEcu?.ecuName,
      hardwareFamily: testFamily ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [absReference, brand, protocol, ecuIdHex, recvIdHex, selectedEcu, testFamily]);

  // The DTC scan result — including the "answered nothing" case, which
  // finalizeScan doesn't record on `scan` itself.
  useEffect(() => {
    if (!scan) return;
    reportSetDtc({
      timestamp: scan.timestamp,
      protocol: scan.protocol,
      brand: scan.brand,
      codes: scan.codes.map(c => ({
        code: c.code, description: c.description, udsStatus: c.udsStatus, rawValue: c.rawValue,
        ecuName: c.ecuName, dtcSource: c.dtcSource,
      })),
      nrc: scan.nrc,
      gotPositive: scan.gotPositive,
      noResponse: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan]);

  useEffect(() => {
    if (scanState !== 'no_response') return;
    reportSetDtc({
      timestamp: new Date().toISOString(),
      protocol, brand, codes: [], gotPositive: false, noResponse: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanState]);

  return (
    <div className="card">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BugAntIcon className="w-4 h-4 text-text-tertiary" />
          <h2 className="card-header !mb-0">Diagnostics</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSetupOpen(v => !v)}
            className={[
              'flex items-center gap-1 text-[10px] transition-colors',
              setupOpen ? 'text-text-secondary' : 'text-text-tertiary hover:text-text-secondary',
            ].join(' ')}
          >
            <Cog6ToothIcon className="w-3.5 h-3.5" />
            Setup
            {setupOpen ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setNoteOpen(v => !v)}
            className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <InformationCircleIcon className="w-3.5 h-3.5" />
            Firmware note
            {noteOpen ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Firmware note */}
      <AnimatePresence>
        {noteOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mb-3"
          >
            <div className="p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-xl space-y-1.5 text-[11px] text-text-secondary">
              <p className="font-semibold text-yellow-400">Nano firmware update required</p>
              <p>The scanner sends <code className="font-mono bg-elevated px-1 rounded text-text-primary">CANTx</code> — handled by the new NanoTestingApp firmware.</p>
              <pre className="font-mono bg-elevated rounded-lg p-2 text-[10px] text-text-primary overflow-x-auto leading-relaxed">{`// CANTx : <ID_hex> <b0_hex> ...
else if (line.startsWith("CANTx : "))
  handleCANTx(line.substring(8));`}</pre>
              <p>Incoming frames: <code className="font-mono bg-elevated px-1 rounded text-text-primary">&lt;id_dec&gt; &lt;dlc&gt; &lt;b0_dec&gt;…</code></p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact status line — always visible; the operator's whole context. */}
      <div className="flex items-center gap-2 flex-wrap mb-3 text-[11px]">
        {absReference
          ? <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">{absReference}</span>
          : <span className="text-text-tertiary">No reference selected</span>}
        <span className="text-text-secondary">
          {selectedEcu?.ecuName
            ?? (protocol === 'VWTP20' ? 'VAG ABS (MK60 / MK60EC1)'
              : testFamily ? `${testFamily} ABS`
              : brand !== 'Other' ? `${brand} ABS` : 'ABS')}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-tertiary">
          {protocol === 'OBD2' ? 'OBD-II' : protocol === 'VWTP20' ? 'VAG TP2.0' : protocol}
        </span>
        {absReference?.trim() && (
          <button
            onClick={saveRefSettings}
            disabled={refSaveStatus === 'saving'}
            className={[
              'text-[10px] px-1.5 py-0.5 rounded border transition-colors',
              refSaveStatus === 'saved' ? 'text-success border-success/30 bg-success/10'
                : refSaveStatus === 'error' ? 'text-danger border-danger/30 bg-danger/10'
                : 'text-text-tertiary border-border hover:text-text-secondary hover:bg-app',
            ].join(' ')}
            title="Remember this protocol / addressing for this ABS reference"
          >
            {refSaveStatus === 'saved' ? 'Saved ✓' : refSaveStatus === 'saving' ? 'Saving…' : refSaveStatus === 'error' ? 'Save failed' : 'Save for this reference'}
          </button>
        )}
        {!setupOpen && (
          <button onClick={() => setSetupOpen(true)} className="text-[10px] text-text-tertiary hover:text-text-secondary underline">
            addressing / protocol…
          </button>
        )}
      </div>

      {/* ABS-reference → auto-config. Kept MOUNTED even when Setup is folded
          away — this is what preloads protocol / addressing / family from the
          stored reference; its own card UI is just hidden. */}
      <div className={setupOpen ? undefined : 'hidden'}>
        <EcuAutoConfig
          isConnected={isConnected}
          send={sendMessage}
          absRef={absReference}
          onApply={applyAutoConfig}
          session={session}
          connect={ensureSession}
          disconnect={closeSession}
        />
      </div>

      {setupOpen && (<>
      {/* Bus recorder — for ECUs not yet in the DB (e.g. MK61 / K-line units
          the board can't originate requests for). Passively logs whatever
          the Nano forwards while you drive the session manually. */}
      <div className="mb-3 p-2.5 bg-elevated border border-border rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-text-primary">
            <SignalIcon className="w-3.5 h-3.5 text-text-tertiary" />
            Bus recorder
            {absReference ? (
              <span className="text-[9px] font-medium text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded">
                {absReference}
              </span>
            ) : (
              <span className="text-[9px] text-warning">no ABS ref selected</span>
            )}
          </span>
          {recordMode && (
            <span className="flex items-center gap-1 text-[10px] text-danger font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
              {RECORD_MODE_LABEL[recordMode]} · {recordCount} line{recordCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(['autel', 'abs', 'both'] as RecordMode[]).map(mode => {
            const isActive = recordMode === mode;
            return (
              <button
                key={mode}
                onClick={() => isActive ? stopRecording() : startRecording(mode)}
                disabled={!isConnected || (recordMode !== null && !isActive)}
                className={[
                  'flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border transition-colors disabled:opacity-40',
                  isActive
                    ? 'text-danger bg-danger/10 border-danger/25'
                    : 'text-text-secondary hover:bg-app border-border',
                ].join(' ')}
              >
                {isActive ? <StopIcon className="w-3 h-3" /> : <SignalIcon className="w-3 h-3" />}
                {isActive ? 'Stop' : RECORD_MODE_LABEL[mode]}
              </button>
            );
          })}

          {recording && !recordMode && (
            <>
              <span className="text-[10px] text-text-tertiary">
                {recording.lines.length} line{recording.lines.length !== 1 ? 's' : ''} captured ({RECORD_MODE_LABEL[recording.mode]}{recording.absRef ? ` · ${recording.absRef}` : ''})
              </span>
              <button
                onClick={saveRecording}
                disabled={saveRecStatus === 'saving'}
                className={[
                  'flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border transition-colors disabled:opacity-50 ml-auto',
                  saveRecStatus === 'saved'
                    ? 'text-success bg-success/10 border-success/25'
                    : saveRecStatus === 'error'
                      ? 'text-danger bg-danger/10 border-danger/25'
                      : 'text-accent hover:bg-accent/10 border-accent/30',
                ].join(' ')}
              >
                <ArrowDownTrayIcon className="w-3 h-3" />
                {saveRecStatus === 'saving' ? 'Saving…'
                  : saveRecStatus === 'saved' ? '✓ Saved'
                  : saveRecStatus === 'error' ? 'Save failed'
                  : 'Save copy…'}
              </button>
              <button
                onClick={discardRecording}
                className="text-[10px] text-text-tertiary hover:text-text-secondary underline"
              >
                dismiss
              </button>
            </>
          )}
        </div>

        {/* Auto-save confirmation for the just-stopped capture */}
        {autoSaved && !recordMode && (
          <div className="flex items-center gap-1.5 text-[10px] text-success bg-success/5 border border-success/20 rounded-lg px-2 py-1">
            <CheckCircleIcon className="w-3 h-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate" title={autoSaved.path}>
              Auto-saved · <span className="font-mono">{autoSaved.name}</span>
            </span>
            <button
              onClick={() => revealCapture(autoSaved.path)}
              className="shrink-0 underline hover:text-success/80"
            >
              reveal
            </button>
          </div>
        )}

        <p className="text-[9px] text-text-tertiary leading-relaxed">
          {!isConnected
            ? 'Connect to record bus traffic.'
            : 'Pick which tool is on the bus, connect it to the ABS, do the read, then Stop — every capture is auto-saved to %APPDATA%\\braxon\\bus-captures\\.'}
        </p>

        {/* Past captures on disk */}
        {pastCaptures.length > 0 && (
          <div className="pt-1.5 border-t border-border">
            <button
              onClick={() => setCapturesOpen(v => !v)}
              className="flex items-center gap-1 text-[10px] font-medium text-text-secondary hover:text-text-primary transition-colors"
            >
              {capturesOpen ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
              Saved captures ({pastCaptures.length})
            </button>
            {capturesOpen && (
              <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto pr-0.5">
                {pastCaptures.map(c => (
                  <div key={c.path} className="flex items-center gap-1.5 text-[10px] bg-app border border-border rounded-lg px-2 py-1">
                    <span className="min-w-0 flex-1 truncate font-mono text-text-secondary" title={c.path}>
                      {c.name}
                    </span>
                    <span className="shrink-0 text-text-tertiary">{fmtBytes(c.size)}</span>
                    <span className="shrink-0 text-text-tertiary">{relTime(c.modifiedMs)}</span>
                    <button
                      onClick={() => revealCapture(c.path)}
                      className="shrink-0 underline text-text-tertiary hover:text-text-secondary"
                    >
                      reveal
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Brand selector */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[10px] text-text-tertiary shrink-0">Brand</span>
        <div className="flex gap-0.5 p-0.5 bg-app rounded-lg flex-1">
          {(['Renault', 'Nissan', 'Mitsubishi', 'Other'] as VehicleBrand[]).map(b => (
            <button
              key={b}
              onClick={() => changeBrand(b)}
              className={[
                'flex-1 py-0.5 text-[10px] font-medium rounded-md transition-colors',
                brand === b
                  ? 'bg-elevated text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary',
              ].join(' ')}
            >
              {b}
            </button>
          ))}
        </div>
        {brand === 'Other' && (
          <span className="text-[9px] text-text-tertiary italic shrink-0">no ECU DB</span>
        )}
      </div>

      {/* ECU identification */}
      {brand !== 'Other' && (
        <div className="space-y-1.5 mb-3">

          {/* Auto-detect row */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-tertiary shrink-0 w-16">Auto-detect</span>
            <button
              onClick={identifyEcu}
              disabled={!isConnected || identState === 'detecting'}
              className={[
                'flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-lg border transition-colors disabled:opacity-40',
                identState === 'found'
                  ? 'text-success bg-success/10 border-success/25'
                  : identState === 'not_found'
                    ? 'text-danger bg-danger/10 border-danger/25'
                    : 'text-accent hover:bg-accent/10 border-accent/30',
              ].join(' ')}
            >
              {identState === 'detecting'
                ? <><ArrowPathIcon className="w-3 h-3 animate-spin" />Identifying…</>
                : identState === 'found'
                  ? <><CheckCircleIcon className="w-3 h-3" />ECU identified</>
                  : identState === 'not_found'
                    ? <><ExclamationTriangleIcon className="w-3 h-3" />Not found in DB</>
                    : <>
                        <BugAntIcon className="w-3 h-3" />
                        Send 21 80
                      </>}
            </button>
            <span className="text-[9px] text-text-tertiary">
              {identState === 'idle' ? `→ ${(ecuIdHex || '740').toUpperCase()} · Renault KWP2000/CAN` : ''}
            </span>
          </div>

          {/* Part number — narrows the model list below. Mirrors the ABS ref
              above; kept editable so the list can be filtered independently. */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-tertiary shrink-0 w-16" title="Filters the ECU model list by hardware family">
              Filter by
            </span>
            <input
              type="text"
              value={partNumber}
              onChange={e => setPartNumber(e.target.value)}
              placeholder="10.0960-1114.3 or 0 265 253 865"
              className="flex-1 input-field !py-0.5 font-mono text-[10px]"
            />
            {guessedFamily && (
              <span className="text-[10px] font-semibold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded shrink-0">
                {guessedFamily}
              </span>
            )}
          </div>

          {/* ECU dropdown — filtered by guessed hardware family */}
          {ecuList.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-text-tertiary shrink-0 w-16">ECU model</span>
              <select
                value={selectedEcu?.ecuFile ?? ''}
                onChange={e => selectEcu(ecuList.find(x => x.ecuFile === e.target.value) ?? null)}
                className="flex-1 input-field !py-0.5 text-[11px] bg-app"
              >
                <option value="">
                  {filteredEcuList.length === 0 && guessedFamily
                    ? `No ${guessedFamily} ECUs in DB — `
                    : '— Select ECU model —'}
                </option>
                {filteredEcuList.map(ecu => (
                  <option key={ecu.ecuFile} value={ecu.ecuFile}>
                    {ecu.ecuName}
                    {ecu.hardwareFamily ? ` [${ecu.hardwareFamily}]` : ''}
                    {ecu.sendId ? ` · CAN ${ecu.sendId}` : ' · K-line'}
                  </option>
                ))}
              </select>
              {guessedFamily && filteredEcuList.length === 0 && (
                <button onClick={() => setPartNumber('')}
                  className="text-[9px] text-text-tertiary hover:text-text-secondary shrink-0 underline">
                  show all
                </button>
              )}
            </div>
          )}
        </div>
      )}
      </>)}

      {/* Active Tests panel */}
      {shownActuators.length > 0 && (
        <div className="mb-3 border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setActiveTestOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 bg-elevated hover:bg-app/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-text-primary">Active Tests</span>
              {usingBuiltinActuators && (
                <span className="text-[9px] font-semibold text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded">
                  built-in
                </span>
              )}
              <span className="text-[10px] text-text-tertiary">
                {selectedEcu?.ecuName ?? (testFamily ? `${testFamily} ABS` : 'ABS')}
                {actuatorSendId
                  ? ` · CAN ${actuatorSendId.toUpperCase()}`
                  : selectedEcu && !selectedEcu.sendId
                    ? ' · K-line only'
                    : ' · no address'}
              </span>
            </div>
            {activeTestOpen ? <ChevronUpIcon className="w-3.5 h-3.5 text-text-tertiary" /> : <ChevronDownIcon className="w-3.5 h-3.5 text-text-tertiary" />}
          </button>

          <AnimatePresence>
            {activeTestOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 pt-2 space-y-3">
                  {usingBuiltinActuators && (
                    <p className="text-[10px] text-warning bg-warning/5 border border-warning/20 rounded-lg px-2 py-1.5">
                      {builtinActuators.length > 0 && (
                        builtinActuators.length === shownActuators.length
                          ? 'Built-in commands, decoded from a reference-tool capture. '
                          : `${builtinActuators.length} built-in ${builtinActuators.length === 1 ? 'command' : 'commands'} mixed in below (marked ⚠). `)}
                      {extraDdtProcs.length > 0 && `${extraDdtProcs.length} calibration/programming ${extraDdtProcs.length === 1 ? 'procedure' : 'procedures'} from DDT4ALL data. `}
                      They physically drive the actuator / write the ECU. "UNVERIFIED" means inferred, not confirmed on this exact ECU — check the result before trusting it. Keep the unit secured and hit STOP when done.
                    </p>
                  )}
                  {!actuatorSendId && (
                    <p className="text-[10px] text-warning bg-warning/5 border border-warning/20 rounded-lg px-2 py-1.5">
                      No CAN address set — pick an ABS reference or type the request ID in the address row below.
                    </p>
                  )}
                  {!isConnected && (
                    <p className="text-[10px] text-text-tertiary">Connect the interface to run tests.</p>
                  )}

                  {(['pump', 'valve', 'relay', 'calibration', 'reset', 'other'] as const).map(cat => {
                    const group = shownActuators.filter(a => a.category === cat);
                    if (!group.length) return null;
                    const catLabel: Record<string, string> = {
                      pump: 'Pump', valve: 'Valves', relay: 'Relays',
                      calibration: 'Calibration / Programming', reset: 'Reset / Stop', other: 'Other'
                    };
                    const catColor: Record<string, string> = {
                      pump: 'text-blue-400', valve: 'text-amber-400', relay: 'text-purple-400',
                      calibration: 'text-emerald-400', reset: 'text-red-400', other: 'text-text-tertiary'
                    };
                    return (
                      <div key={cat}>
                        <p className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${catColor[cat]}`}>
                          {catLabel[cat]}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.map(act => {
                            const bytes = act.sentBytes.match(/.{1,2}/g) ?? [];
                            const needsMultiFrame = bytes.length > 7;
                            const isActive = activatingId === act.id;
                            return (
                              <button
                                key={act.id}
                                onClick={() => sendActuator(act)}
                                disabled={!isConnected || !actuatorSendId || needsMultiFrame || isActive}
                                title={needsMultiFrame ? `${bytes.length} bytes — multi-frame not yet supported` : act.name}
                                className={[
                                  'flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border transition-colors disabled:opacity-40',
                                  cat === 'reset'
                                    ? 'border-red-400/30 text-red-400 hover:bg-red-400/10'
                                    : cat === 'pump'
                                      ? 'border-blue-400/30 text-blue-400 hover:bg-blue-400/10'
                                      : cat === 'relay'
                                        ? 'border-purple-400/30 text-purple-400 hover:bg-purple-400/10'
                                        : 'border-amber-400/30 text-amber-400 hover:bg-amber-400/10',
                                ].join(' ')}
                              >
                                {isActive
                                  ? <ArrowPathIcon className="w-2.5 h-2.5 animate-spin shrink-0" />
                                  : needsMultiFrame
                                    ? <ExclamationTriangleIcon className="w-2.5 h-2.5 shrink-0 opacity-50" />
                                    : <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />}
                                <span className="font-mono text-[9px] text-current/60 mr-0.5">
                                  {act.sentBytes.slice(0, 4)}
                                </span>
                                {act.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Live data — measured values (wheel speeds, voltages, measuring blocks) */}
      <LiveData
        isConnected={isConnected}
        send={sendMessage}
        sendId={parseCanId(ecuIdHex)}
        recvId={resolvedRecvId()}
        protocol={protocol}
        absRef={absReference}
        family={familyForBuiltins}
        prepareSession={prepareSession}
        vwRequest={protocol === 'VWTP20'
          ? (data: number[]) => (vwChanRef.current?.open ? vwChanRef.current.request(data, { timeoutMs: 800 }) : openVwChannel().then(c => c?.request(data, { timeoutMs: 800 }) ?? null))
          : null}
      />

      {/* Protocol tabs — technician override; the reference normally sets this */}
      {setupOpen && (
        <div className="flex gap-0.5 p-0.5 bg-app rounded-lg mb-3">
          {(['OBD2', 'UDS', 'KWP2000', 'VWTP20'] as Protocol[]).map(p => (
            <button
              key={p}
              onClick={() => { setProtocol(p); if (scanState !== 'scanning') setScanState('idle'); }}
              className={[
                'flex-1 py-1 text-[11px] font-medium rounded-md transition-colors',
                protocol === p
                  ? 'bg-elevated text-text-primary shadow-sm'
                  : 'text-text-tertiary hover:text-text-secondary',
              ].join(' ')}
            >
              {p === 'OBD2' ? 'OBD-II' : p === 'VWTP20' ? 'VAG TP2.0' : p}
            </button>
          ))}
        </div>
      )}

      {protocol === 'VWTP20' && setupOpen && (
        <p className="text-[10px] text-text-tertiary mb-2 leading-snug">
          Pre-UDS VW/Audi/Seat/Skoda ABS (MK25 / MK60 / MK60EC1). The session chip opens a TP2.0
          channel to address 0x03; Scan DTCs reads <span className="font-mono">18 02 FF 00</span>.
        </p>
      )}
      {protocol === 'VWTP20' && setupOpen && vwTrace.length > 0 && (
        <pre className="text-[9.5px] leading-tight text-text-tertiary font-mono bg-app rounded-md p-1.5 mb-2 overflow-x-auto whitespace-pre">
          {vwTrace.join('\n')}
        </pre>
      )}
      {protocol === 'VWTP20' && !setupOpen && !vwOpen && vwTrace.length > 0 && (
        <p className="text-[10px] text-danger mb-2">
          TP2.0 channel didn't open — open Setup to see the handshake trace.
        </p>
      )}

      {/* Action row — session chip + scan buttons always visible; the raw
          addressing inputs only when Setup is expanded. */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {setupOpen && protocol === 'OBD2' && (
          <label className="flex items-center gap-1.5 text-[11px] text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useBroadcast}
              onChange={e => setUseBroadcast(e.target.checked)}
              className="w-3 h-3 accent-accent rounded"
            />
            Broadcast 0x7DF
          </label>
        )}
        {setupOpen && protocol !== 'VWTP20' && (!useBroadcast || protocol !== 'OBD2') && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-tertiary">ECU</span>
            <input
              type="text"
              value={ecuIdHex}
              onChange={e => {
                setEcuIdHex(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 3));
                setRecvIdHex(''); // typing a new request ID drops the paired response ID
              }}
              placeholder="7E0"
              className="w-16 input-field !py-1 font-mono text-xs text-center uppercase"
            />
            <span className="text-[11px] text-text-tertiary">resp</span>
            <input
              type="text"
              value={recvIdHex}
              onChange={e => setRecvIdHex(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 3))}
              placeholder="auto"
              title="Response CAN ID — leave blank to derive it from the request ID"
              className="w-16 input-field !py-1 font-mono text-xs text-center uppercase"
            />
          </div>
        )}
        {setupOpen && protocol !== 'VWTP20' && (
          <span className="text-[10px] text-text-tertiary">→ resp {respRangeLabel()}</span>
        )}

        {/* Connect / disconnect the diagnostic channel (session for UDS/KWP,
            TP2.0 channel for VAG). The transport (board / Kvaser) itself is
            connected from the sidebar. */}
        {protocol === 'VWTP20' ? (
          <button
            onClick={toggleSession}
            disabled={!isConnected}
            className={[
              'flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-lg border transition-colors disabled:opacity-40',
              vwOpen
                ? 'text-danger border-danger/30 bg-danger/10 hover:bg-danger/20'
                : 'text-success border-success/30 bg-success/10 hover:bg-success/20',
            ].join(' ')}
          >
            {vwOpen
              ? <><StopIcon className="w-3 h-3" />Disconnect</>
              : <><span className="w-1.5 h-1.5 rounded-full bg-current" />Connect</>}
          </button>
        ) : needsSession && (
          <button
            onClick={toggleSession}
            disabled={!isConnected}
            title={sessionActive
              ? `Click to close the session${session.sendId !== null ? ` (0x${toHex3(session.sendId)} → 0x${toHex3(session.recvId ?? 0)})` : ''}`
              : 'Click to open a diagnostic session on the address above'}
            className={[
              'flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded border transition-colors disabled:opacity-40',
              sessionChip.cls,
            ].join(' ')}
          >
            {sessionActive
              ? <StopIcon className="w-2.5 h-2.5 shrink-0" />
              : <span className={[
                  'w-1.5 h-1.5 rounded-full bg-current shrink-0',
                  session.status === 'open' ? 'animate-pulse' : '',
                ].join(' ')} />}
            {sessionChip.label}
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {scan && scan.codes.length > 0 && scanState !== 'scanning' && (
            <button
              onClick={clearDTCs}
              disabled={!isConnected || isBusy}
              className="flex items-center gap-1 text-[11px] btn-secondary px-2 py-1 text-danger hover:bg-danger/10 disabled:opacity-40"
            >
              {scanState === 'clearing'
                ? <ArrowPathIcon className="w-3 h-3 animate-spin" />
                : <TrashIcon className="w-3 h-3" />}
              {scanState === 'clearing' ? 'Clearing…' : 'Clear DTCs'}
            </button>
          )}
          <button
            onClick={startScan}
            disabled={!isConnected || isBusy}
            className="flex items-center gap-1.5 btn-primary text-xs px-3 py-1 disabled:opacity-40"
          >
            {scanState === 'scanning'
              ? <><ArrowPathIcon className="w-3 h-3 animate-spin" />Scanning…</>
              : <><BugAntIcon className="w-3 h-3" />Scan DTCs</>}
          </button>
        </div>
      </div>

      {/* Status / Results */}
      <AnimatePresence mode="wait">

        {scanState === 'idle' && !scan && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center justify-center h-14 text-[12px] text-text-tertiary text-center px-4"
          >
            {!isConnected
              ? 'Connect the interface (sidebar) to scan for fault codes'
              : 'Press Scan DTCs to request fault codes from the ABS ECU'}
          </motion.div>
        )}

        {scanState === 'scanning' && (
          <motion.div key="scanning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center h-14 gap-2"
          >
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-[11px] text-text-tertiary">Awaiting ECU response…</p>
          </motion.div>
        )}

        {scanState === 'no_response' && (
          <motion.div key="no_response" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-3 bg-elevated rounded-xl border border-border text-center"
          >
            <ExclamationTriangleIcon className="w-5 h-5 text-warning mx-auto mb-1" />
            <p className="text-[12px] text-text-secondary font-medium">
              {needsSession ? 'Session open, but the ECU ignored the request' : 'No response from ECU'}
            </p>
            <p className="text-[10px] text-text-tertiary mt-0.5">
              {needsSession
                ? 'Addressing is right — the ECU is answering session control. It may not support this DTC service (try the UDS / KWP2000 tab).'
                : 'Check CAN bus wiring, ECU address, and bus bitrate'}
            </p>
          </motion.div>
        )}

        {/* The ECU answered — with a negative response. Show the NRC and the
            raw bytes rather than pretending there are no faults. */}
        {scanState === 'rejected' && scan?.nrc && (
          <motion.div key="rejected" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-3 bg-warning/5 rounded-xl border border-warning/20 space-y-2"
          >
            <div className="flex items-start gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 text-warning shrink-0" />
              <div className="min-w-0">
                <p className="text-[12px] text-text-secondary font-medium">
                  ECU rejected the request
                </p>
                <p className="text-[10px] text-text-tertiary mt-0.5 font-mono">
                  7F {scan.nrc.sid.toString(16).toUpperCase().padStart(2, '0')} {scan.nrc.code.toString(16).toUpperCase().padStart(2, '0')}
                  {' — '}
                  {NRC_NAMES[scan.nrc.code] ?? 'unknown NRC'}
                </p>
                <p className="text-[10px] text-text-tertiary mt-1">
                  {scan.nrc.code === 0x11 || scan.nrc.code === 0x7F
                    ? 'This ECU does not support this DTC service — try the other protocol tab.'
                    : scan.nrc.code === 0x12 || scan.nrc.code === 0x7E || scan.nrc.code === 0x31
                      ? 'Wrong sub-function or status mask for this ECU.'
                      : scan.nrc.code === 0x22 || scan.nrc.code === 0x24
                        ? 'Conditions not met — the session may need to settle, or another request must come first.'
                        : 'See the raw response below.'}
                </p>
              </div>
            </div>
            {renderRawResponse()}
          </motion.div>
        )}

        {/* Distinct from no_response: nothing answered session control, so the
            problem is the address or the wiring, not the request. */}
        {scanState === 'no_session' && (
          <motion.div key="no_session" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-3 bg-danger/5 rounded-xl border border-danger/20 text-center"
          >
            <ExclamationTriangleIcon className="w-5 h-5 text-danger mx-auto mb-1" />
            <p className="text-[12px] text-text-secondary font-medium">Could not open a diagnostic session</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">{errorMsg}</p>
            <p className="text-[10px] text-text-tertiary mt-1">
              The ECU never answered session control, so nothing is listening at this address.
              Check power and CAN wiring, or run Discover ECU above.
            </p>
          </motion.div>
        )}

        {scanState === 'cleared' && (
          <motion.div key="cleared" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center justify-center gap-2 h-14 text-success"
          >
            <CheckCircleIcon className="w-5 h-5" />
            <span className="text-[13px] font-medium">Fault codes cleared</span>
          </motion.div>
        )}

        {scanState === 'error' && (
          <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="p-3 bg-danger/5 border border-danger/20 rounded-xl text-center"
          >
            <p className="text-[12px] text-danger">{errorMsg || 'Scan failed'}</p>
          </motion.div>
        )}

        {(scanState === 'done' || (scanState === 'idle' && scan)) && scan && (
          <motion.div key="results" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between text-[10px] text-text-tertiary">
              <span>
                {scan.codes.length > 0
                  ? `${scan.codes.length} fault code${scan.codes.length !== 1 ? 's' : ''} found`
                  : scan.gotPositive
                    ? 'No stored fault codes'
                    : 'Unexpected response'}
                {' · '}
                {scan.brand}
                {' · '}
                {scan.protocol === 'OBD2' ? 'OBD-II' : scan.protocol === 'VWTP20' ? 'VAG TP2.0' : scan.protocol}
              </span>
              <div className="flex items-center gap-2">
                {dbEnriching && (
                  <span className="flex items-center gap-1 text-text-tertiary">
                    <ArrowPathIcon className="w-3 h-3 animate-spin" />
                    looking up…
                  </span>
                )}
                <span>{new Date(scan.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>

            {scan.codes.length === 0 ? (
              scan.gotPositive ? (
                <div className="flex items-center justify-center gap-2 h-12 text-success text-[12px]">
                  <CheckCircleIcon className="w-4 h-4" />
                  ECU reports no stored faults
                </div>
              ) : (
                <div className="flex items-start gap-2 p-2.5 bg-warning/5 border border-warning/20 rounded-xl text-[11px] text-text-secondary">
                  <ExclamationTriangleIcon className="w-4 h-4 text-warning shrink-0" />
                  <span>
                    The ECU answered, but nothing matched a {scan.protocol === 'OBD2' ? '0x43' : scan.protocol === 'UDS' ? '0x59 02' : '0x58'} DTC
                    response — likely a multi-frame reply that didn&apos;t reassemble, or a different format. Check the raw response below.
                  </span>
                </div>
              )
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                {scan.codes.map((dtc, i) => (
                  <motion.div
                    key={dtc.code}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-start gap-2.5 p-2.5 bg-elevated rounded-xl border border-border"
                  >
                    <span className={[
                      'font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border shrink-0 leading-tight',
                      DTC_TYPE_STYLE[dtc.code[0]] ?? 'text-text-secondary bg-elevated border-border',
                    ].join(' ')}>
                      {dtc.code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-text-primary font-medium leading-tight">{dtc.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {dtc.ecuName && (
                          <span
                            title={dtc.dtcSource === 'cross-unit'
                              ? `Text borrowed from ${dtc.ecuName} — same raw code, different unit (ATE/Bosch platforms share fault tables)`
                              : `Matched to this unit's own fault table`}
                            className={[
                              'text-[10px] px-1.5 py-0.5 rounded font-medium border',
                              dtc.dtcSource === 'cross-unit'
                                ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                                : 'text-accent bg-accent/10 border-accent/20',
                            ].join(' ')}
                          >
                            {dtc.dtcSource === 'cross-unit' ? `≈ ${dtc.ecuName}` : dtc.ecuName}
                          </span>
                        )}
                        {dtc.udsStatus !== undefined && (
                          <p className="text-[10px] text-text-tertiary font-mono">
                            {'0x' + dtc.udsStatus.toString(16).toUpperCase().padStart(2, '0')}
                            {(dtc.udsStatus & 0x01) ? ' · failed now' : ''}
                            {(dtc.udsStatus & 0x08) ? ' · confirmed' : ''}
                            {(dtc.udsStatus & 0x04) ? ' · pending' : ''}
                            {(dtc.udsStatus & 0x80) ? ' · MIL' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {renderRawResponse()}

            {currentJob && currentJob.status === 'in_progress' && (
              <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
                <span className="text-[11px] text-text-tertiary">
                  Active job: <span className="text-text-secondary font-medium">{currentJob.jobNumber}</span>
                </span>
                <button
                  onClick={saveToJob}
                  disabled={saveStatus === 'saving'}
                  className={[
                    'flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg border transition-colors disabled:opacity-50',
                    saveStatus === 'saved'
                      ? 'text-success bg-success/10 border-success/25'
                      : saveStatus === 'error'
                        ? 'text-danger bg-danger/10 border-danger/25'
                        : 'text-accent hover:bg-accent/10 border-accent/30',
                  ].join(' ')}
                >
                  <BookmarkIcon className="w-3 h-3" />
                  {saveStatus === 'saving' ? 'Saving…'
                    : saveStatus === 'saved' ? '✓ Saved to job'
                    : saveStatus === 'error' ? 'Save failed'
                    : 'Save to job'}
                </button>
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
