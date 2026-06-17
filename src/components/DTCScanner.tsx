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
} from '@heroicons/react/24/outline';
import clientSerial, { type SerialEvent } from '@/lib/clientSerial';
import { useSession } from '@/contexts/SessionContext';

/* ── Fallback DTC description lookup ────────────────────────── */
const DTC_DESC: Record<string, string> = {
  P0500: 'Vehicle Speed Sensor Malfunction',
  P0501: 'Vehicle Speed Sensor Range/Performance',
  P0502: 'Vehicle Speed Sensor Low Input',
  P0503: 'Vehicle Speed Sensor Intermittent/Erratic/High',
  P0504: 'Brake Switch A/B Correlation',
  P0571: 'Brake Switch A Circuit Malfunction',
  P0572: 'Brake Switch A Circuit Low',
  P0573: 'Brake Switch A Circuit High',
  C0035: 'Left Front Wheel Speed Sensor Circuit',
  C0036: 'Left Front Wheel Speed Sensor Range/Performance',
  C0040: 'Right Front Wheel Speed Sensor Circuit',
  C0041: 'Right Front Wheel Speed Sensor Range/Performance',
  C0045: 'Left Rear Wheel Speed Sensor Circuit',
  C0046: 'Left Rear Wheel Speed Sensor Range/Performance',
  C0050: 'Right Rear Wheel Speed Sensor Circuit',
  C0051: 'Right Rear Wheel Speed Sensor Range/Performance',
  C0060: 'LF ABS Solenoid #1 Circuit Malfunction',
  C0065: 'RF ABS Solenoid #1 Circuit Malfunction',
  C0070: 'RR ABS Solenoid #1 Circuit Malfunction',
  C0080: 'LR ABS Solenoid #1 Circuit Malfunction',
  C0110: 'ABS Motor Circuit Malfunction',
  C0121: 'ABS Valve Relay Circuit Malfunction',
  C0131: 'ABS System Pressure Circuit Malfunction',
  C0161: 'ABS/TCS Brake Switch Circuit',
  C0186: 'Lateral Accelerometer Sensor Performance',
  C0196: 'Yaw Rate Sensor Performance',
  C0200: 'Right Front Wheel Speed Sensor Circuit',
  C0205: 'Right Rear Wheel Speed Sensor Circuit',
  C0210: 'Left Rear Wheel Speed Sensor Circuit',
  C0215: 'Left Front Wheel Speed Sensor Circuit',
  C0221: 'Right Front Wheel Speed Sensor Fault',
  C0222: 'Right Front Wheel Speed Signal Erratic',
  C0225: 'Left Front Wheel Speed Sensor Fault',
  C0235: 'Rear Wheel Speed Sensor Signal Erratic',
  C0238: 'Wheel Speed Mismatch',
  C0245: 'Wheel Speed Sensor Frequency Error',
  C0250: 'ABS Modulator Valve Fault',
  C0274: 'Solenoid Power Relay Circuit',
  C0281: 'Brake Switch Circuit Fault',
  C0290: 'Lost Communication with ABS Module',
  C0300: 'Rear Wheel Speed Sensor Malfunction',
  C1210: 'ABS Warning Lamp Circuit Open',
  C1214: 'System Relay Contact or Coil Circuit Open',
  C1217: 'Pump Motor Shorted To Ground',
  C1218: 'Pump Motor Circuit Shorted To Voltage',
  C1221: 'LF Wheel Speed Sensor Input Signal = Zero',
  C1222: 'RF Wheel Speed Sensor Input Signal = Zero',
  C1223: 'LR Wheel Speed Sensor Input Signal = Zero',
  C1224: 'RR Wheel Speed Sensor Input Signal = Zero',
  C1225: 'Left Front Excessive Wheel Speed Variation',
  C1226: 'Right Front Excessive Wheel Speed Variation',
  C1227: 'Left Rear Excessive Wheel Speed Variation',
  C1228: 'Right Rear Excessive Wheel Speed Variation',
  C1232: 'Left Front Wheel Speed Circuit Open/Shorted',
  C1233: 'Right Front Wheel Speed Circuit Open/Shorted',
  C1234: 'Left Rear Wheel Speed Circuit Open/Shorted',
  C1235: 'Right Rear Wheel Speed Circuit Open/Shorted',
  C1236: 'Low System Supply Voltage',
  C1237: 'High System Supply Voltage',
  C1241: 'ABS Relay Valve Circuit Open',
  C1243: 'Pump Motor Circuit Short To Ground',
  C1244: 'Pump Motor Circuit Open',
  C1245: 'ECU Hardware Failure',
  C1255: 'EBCM Internal Fault',
  C1261: 'LF Inlet Valve Coil Malfunction',
  C1262: 'LF Outlet Valve Coil Malfunction',
  C1263: 'RF Inlet Valve Coil Malfunction',
  C1264: 'RF Outlet Valve Coil Malfunction',
  C1265: 'LR Inlet Valve Coil Malfunction',
  C1266: 'LR Outlet Valve Coil Malfunction',
  C1267: 'RR Inlet Valve Coil Malfunction',
  C1268: 'RR Outlet Valve Coil Malfunction',
};

/* ── Types ────────────────────────────────────────────────────── */
export type Protocol = 'OBD2' | 'UDS' | 'KWP2000';
export type VehicleBrand = 'Renault' | 'Nissan' | 'Mitsubishi' | 'Other';
type ScanState = 'idle' | 'scanning' | 'clearing' | 'done' | 'cleared' | 'no_response' | 'error';

export interface DTCEntry {
  code: string;
  description: string;
  udsStatus?: number;
  rawValue: number;
  ecuName?: string;
}

export interface DTCScan {
  timestamp: string;
  protocol: Protocol;
  brand: VehicleBrand;
  codes: DTCEntry[];
  rawLines: string[];
}

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
}

interface EcuInfo {
  ecuFile: string;
  ecuName: string;
  protocol: string;
  sendId: string | null;
  recvId: string | null;
  hardwareFamily: string | null;
}

interface IdentMatch {
  ecuFile: string;
  ecuName: string;
}

interface ActuatorEntry {
  id: string;
  name: string;
  label: string;
  sentBytes: string;
  category: 'pump' | 'valve' | 'relay' | 'reset' | 'other';
}

/* ── Decode 2-byte OBD-II/KWP DTC ────────────────────────────── */
function decodeDTC(high: number, low: number): DTCEntry {
  const types = ['P', 'C', 'B', 'U'] as const;
  const type = types[(high >> 6) & 0x03];
  const d1 = (high >> 4) & 0x03;
  const d2 = (high & 0x0F).toString(16).toUpperCase();
  const d3 = ((low >> 4) & 0x0F).toString(16).toUpperCase();
  const d4 = (low & 0x0F).toString(16).toUpperCase();
  const code = `${type}${d1}${d2}${d3}${d4}`;
  const rawValue = (high << 8) | low;
  return { code, description: DTC_DESC[code] ?? `${type}-code — manufacturer specific`, rawValue };
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

/* ── Parse UDS 0x19 0x02 response (0x59 02) payload ─────────── */
function parseUDSPayload(payload: number[]): DTCEntry[] {
  if (payload[0] !== 0x59 || payload[1] !== 0x02) return [];
  const codes: DTCEntry[] = [];
  let i = 3;
  while (i + 3 < payload.length) {
    const high   = payload[i];
    const mid    = payload[i + 1];
    const status = payload[i + 3];
    if (high !== 0 || mid !== 0) {
      const entry = decodeDTC(high, mid);
      codes.push({ ...entry, udsStatus: status });
    }
    i += 4;
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

function toHex3(n: number): string {
  return n.toString(16).toUpperCase().padStart(3, '0');
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

export default function DTCScanner({ sendMessage, isConnected, absReference }: Props) {
  const { currentJob } = useSession();

  const [brand, setBrand]               = useState<VehicleBrand>('Renault');
  const [protocol, setProtocol]         = useState<Protocol>('OBD2');
  const [ecuIdHex, setEcuIdHex]         = useState('7E0');
  const [useBroadcast, setUseBroadcast] = useState(true);
  const [scanState, setScanState]       = useState<ScanState>('idle');
  const [scan, setScan]                 = useState<DTCScan | null>(null);
  const [saveStatus, setSaveStatus]     = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [noteOpen, setNoteOpen]         = useState(false);
  const [errorMsg, setErrorMsg]         = useState('');
  const [dbEnriching, setDbEnriching]   = useState(false);

  // ECU selector + active test state
  const [ecuList, setEcuList]           = useState<EcuInfo[]>([]);
  const [selectedEcu, setSelectedEcu]   = useState<EcuInfo | null>(null);
  const [actuators, setActuators]       = useState<ActuatorEntry[]>([]);
  const [activeTestOpen, setActiveTestOpen] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [partNumber, setPartNumber]     = useState('');
  const [identState, setIdentState]     = useState<'idle' | 'detecting' | 'found' | 'not_found'>('idle');

  const scanActiveRef    = useRef(false);
  const protocolRef      = useRef<Protocol>('OBD2');
  const brandRef         = useRef<VehicleBrand>('Renault');
  const isoTpRef         = useRef<Map<number, IsoTpFrame>>(new Map());
  const payloadsRef      = useRef<{ payload: number[]; fromId: number }[]>([]);
  const rawLinesRef      = useRef<string[]>([]);
  const listenerRef      = useRef<((e: SerialEvent) => void) | null>(null);
  const timeoutRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendRef          = useRef(sendMessage);
  sendRef.current = sendMessage;

  useEffect(() => {
    return () => {
      if (listenerRef.current) clientSerial.removeEventListener(listenerRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Auto-fill Part No. when a reference is selected in the ABS DB search above
  useEffect(() => {
    if (absReference) setPartNumber(absReference);
  }, [absReference]);

  // Load ECU list from DB when brand changes (only for R/N/M)
  useEffect(() => {
    if (brand === 'Other') { setEcuList([]); setSelectedEcu(null); setActuators([]); return; }
    invoke<EcuInfo[]>('get_ecu_list').then(setEcuList).catch(() => setEcuList([]));
    setSelectedEcu(null);
    setActuators([]);
  }, [brand]);

  // Load actuators when ECU selection changes
  useEffect(() => {
    if (!selectedEcu) { setActuators([]); return; }
    invoke<ActuatorEntry[]>('get_ecu_actuators', { ecuFile: selectedEcu.ecuFile })
      .then(setActuators).catch(() => setActuators([]));
  }, [selectedEcu]);

  // Auto-configure ECU address and protocol from DB when an ECU is selected
  useEffect(() => {
    if (!selectedEcu) return;
    if (selectedEcu.sendId) {
      setEcuIdHex(selectedEcu.sendId.replace(/^0x/i, '').toUpperCase().padStart(3, '0'));
      setUseBroadcast(false);
    }
    const prot = selectedEcu.protocol?.toUpperCase() ?? '';
    if (prot.includes('KWP'))                                    setProtocol('KWP2000');
    else if (prot.includes('UDS') || prot.includes('ISO15765')) setProtocol('UDS');
  }, [selectedEcu?.ecuFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Silently enrich DTC descriptions from the ECU DB after a scan
  const enrichFromDb = useCallback(async (codes: DTCEntry[]): Promise<DTCEntry[]> => {
    if (!codes.length) return codes;
    return Promise.all(
      codes.map(async (dtc) => {
        try {
          const entry = await invoke<EcuDtcEntry | null>('lookup_dtc', { dtcRaw: dtc.rawValue });
          if (entry) return { ...dtc, description: entry.description, ecuName: entry.ecuName };
        } catch { /* DB not populated yet — keep fallback */ }
        return dtc;
      })
    );
  }, []);

  // Guess hardware family from physical part number printed on the ABS unit.
  // ATE/Continental: 10.0960-xxxx → MK60, 10.0970-xxxx → MK70
  // Bosch: 0 265 25x xxx → Bosch 8.x,  0 265 9xx xxx → Bosch Gen 9
  const guessHardwareFamily = (pn: string): string | null => {
    const n = pn.replace(/[\s\-\.]/g, '').toUpperCase();
    if (/^10(0961)/.test(n))                           return 'MK61';
    if (/^10(0960|0175|0176)/.test(n))                 return 'MK60';
    if (/^10(0970|0971|0972|0973)/.test(n))            return 'MK70';
    if (/^10(0200|0201|0202|0203)/.test(n))            return 'MK20';
    if (/^026595/.test(n))                             return 'Bosch Gen 9';
    if (/^02652[0-9]/.test(n))                         return 'Bosch 8.x';
    if (/^02650[89]/.test(n))                          return 'Bosch 8.0';
    return null;
  };

  const guessedFamily = guessHardwareFamily(partNumber);

  // Filter ECU list: if we guessed a hardware family, show only matching entries.
  // If no guess (unknown part number or empty), show all.
  const filteredEcuList = guessedFamily
    ? ecuList.filter(e => e.hardwareFamily === guessedFamily)
    : ecuList;

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

    const sendIdNum = parseInt(ecuIdHex || '740', 16) || 0x740;
    const recvIdNum = sendIdNum + 0x20; // Renault CAN: recv = send + 0x20

    // ISO-TP single frame for "21 80": byte0=len(2), then 21 80, padded to 8
    const sendIdStr = sendIdNum.toString(16).toUpperCase().padStart(3, '0');
    const frame = `CANTx : ${sendIdStr} 02 21 80 00 00 00 00 00\n`;

    // Collect ISO-TP response
    let payloadBuf: number[] = [];
    let totalLen = 0;
    let nextSeq = 1;
    let resolved = false;

    const resolve = () => { resolved = true; };

    const listener = (event: SerialEvent) => {
      if (resolved || event.type !== 'data' || !event.data) return;
      const parts = event.data.trim().split(/\s+/);
      if (parts.length < 3) return;
      const id = parseInt(parts[0], 10);
      if (id !== recvIdNum) return;
      const dlc = parseInt(parts[1], 10);
      const bytes: number[] = [];
      for (let i = 2; i < 2 + dlc; i++) { const b = parseInt(parts[i], 10); if (!isNaN(b)) bytes.push(b); }
      if (!bytes.length) return;

      const isoType = (bytes[0] >> 4) & 0x0F;
      if (isoType === 0) {
        const len = bytes[0] & 0x0F;
        payloadBuf = bytes.slice(1, 1 + len);
        resolve();
      } else if (isoType === 1) {
        totalLen = ((bytes[0] & 0x0F) << 8) | bytes[1];
        payloadBuf = bytes.slice(2);
        nextSeq = 1;
        // Send flow control back to ECU
        sendRef.current(`CANTx : ${sendIdStr} 30 00 00 00 00 00 00 00\n`);
      } else if (isoType === 2) {
        const seq = bytes[0] & 0x0F;
        if (seq === nextSeq) {
          payloadBuf.push(...bytes.slice(1));
          nextSeq = (seq + 1) % 16;
          if (payloadBuf.length >= totalLen) { payloadBuf = payloadBuf.slice(0, totalLen); resolve(); }
        }
      }
    };

    clientSerial.addEventListener(listener);
    await sendRef.current(frame);

    // Wait up to 2 s for complete response
    await new Promise<void>(res => {
      const t = setTimeout(res, 2000);
      const poll = setInterval(() => { if (resolved) { clearTimeout(t); clearInterval(poll); res(); } }, 50);
    });
    clientSerial.removeEventListener(listener);

    // Need at least 22 bytes to read all fields (soft ends at index 21)
    if (!resolved || payloadBuf.length < 22) {
      setIdentState('not_found');
      setTimeout(() => setIdentState('idle'), 3000);
      return;
    }

    const p = payloadBuf;
    // supplier: 3 ASCII bytes at index 8,9,10 (firstbyte=9 in DDT4ALL, which is 1-indexed)
    const supplier = String.fromCharCode(p[8], p[9], p[10]).replace(/[^\x20-\x7E]/g, '');
    // version: 2 bytes at index 16,17 (firstbyte=17)
    const version  = p[16].toString(16).toUpperCase().padStart(2, '0')
                   + p[17].toString(16).toUpperCase().padStart(2, '0');
    // soft: 2 bytes at index 20,21 (firstbyte=21)
    const soft     = p[20].toString(16).toUpperCase().padStart(2, '0')
                   + p[21].toString(16).toUpperCase().padStart(2, '0');

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
          setSelectedEcu(ecu);
          setActiveTestOpen(true);
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
    if (!isConnected || !selectedEcu?.sendId) return;
    const frame = buildActuatorFrame(actuator.sentBytes, selectedEcu.sendId);
    if (!frame) return;
    setActivatingId(actuator.id);
    await sendRef.current(frame);
    setTimeout(() => setActivatingId(null), 800);
  };

  const getResponseRange = (): [number, number] => {
    if (protocol === 'OBD2' && useBroadcast) return [0x7E0, 0x7EF];
    // Use stored recvId from DB when an ECU is selected (most accurate)
    if (selectedEcu?.recvId) {
      const id = parseInt(selectedEcu.recvId, 16);
      if (!isNaN(id)) return [id, id];
    }
    const base = parseInt(ecuIdHex, 16);
    if (isNaN(base)) return [0x7E0, 0x7EF];
    // OBD-II uses +8 (standard); Renault/Nissan/Mitsubishi CAN uses +0x20
    const offset = protocol === 'OBD2' ? 8 : 0x20;
    return [base + offset, base + offset];
  };

  const stopScan = () => {
    scanActiveRef.current = false;
    if (listenerRef.current) { clientSerial.removeEventListener(listenerRef.current); listenerRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  };

  const finalizeScan = async () => {
    const payloads = payloadsRef.current;
    const rawLines = rawLinesRef.current;

    let codes: DTCEntry[] = [];
    for (const { payload } of payloads) {
      if (!payload.length) continue;
      if (protocolRef.current === 'OBD2')    codes.push(...parseOBD2Payload(payload));
      if (protocolRef.current === 'UDS')     codes.push(...parseUDSPayload(payload));
      if (protocolRef.current === 'KWP2000') codes.push(...parseKWPPayload(payload));
    }

    const seen = new Set<string>();
    codes = codes.filter(c => !seen.has(c.code) && seen.add(c.code) !== undefined);

    if (payloads.length === 0) {
      setScanState('no_response');
      return;
    }

    setScan({ timestamp: new Date().toISOString(), protocol: protocolRef.current, brand: brandRef.current, codes, rawLines });
    setScanState('done');

    // DB enrichment only for brands covered by the DDT4ALL database
    if (codes.length > 0 && brandRef.current !== 'Other') {
      setDbEnriching(true);
      const enriched = await enrichFromDb(codes);
      setScan(prev => prev ? { ...prev, codes: enriched } : prev);
      setDbEnriching(false);
    }
  };

  const startScan = async () => {
    if (!isConnected || scanState === 'scanning') return;

    stopScan();
    setScanState('scanning');
    setScan(null);
    setSaveStatus('idle');
    setErrorMsg('');
    scanActiveRef.current = true;
    protocolRef.current = protocol;
    brandRef.current = brand;
    isoTpRef.current.clear();
    payloadsRef.current = [];
    rawLinesRef.current = [];

    // Capture ECU addressing at scan start
    const ecuRecvId  = selectedEcu?.recvId  ? parseInt(selectedEcu.recvId,  16) : null;
    const ecuSendId  = selectedEcu?.sendId  ? parseInt(selectedEcu.sendId,  16) : null;
    const fcOffset   = protocol === 'OBD2' ? 8 : 0x20; // OBD uses +8, Renault CAN uses +0x20

    const [respMin, respMax] = (ecuRecvId && !isNaN(ecuRecvId))
      ? [ecuRecvId, ecuRecvId]
      : getResponseRange();

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

      const isoType = (bytes[0] >> 4) & 0x0F;

      if (isoType === 0) {
        const len = bytes[0] & 0x0F;
        payloadsRef.current.push({ payload: bytes.slice(1, 1 + len), fromId: id });
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
      reqBytes = '03 19 02 FF 00 00 00 00';
    } else {
      reqId    = ecuIdHex.toUpperCase().padStart(3, '0');
      reqBytes = '03 18 00 FF 00 00 00 00';
    }

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
    setScanState('clearing');

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
    if (selectedEcu?.recvId) return `0x${selectedEcu.recvId.replace(/^0x/i, '').toUpperCase().padStart(3, '0')}`;
    const base = parseInt(ecuIdHex, 16);
    if (isNaN(base)) return '—';
    const offset = protocol === 'OBD2' ? 8 : 0x20;
    return `0x${(base + offset).toString(16).toUpperCase()}`;
  };

  const isBusy = scanState === 'scanning' || scanState === 'clearing';

  return (
    <div className="card">

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BugAntIcon className="w-4 h-4 text-text-tertiary" />
          <h2 className="card-header !mb-0">DTC Scanner</h2>
        </div>
        <button
          onClick={() => setNoteOpen(v => !v)}
          className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
        >
          <InformationCircleIcon className="w-3.5 h-3.5" />
          Firmware note
          {noteOpen ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
        </button>
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

      {/* Brand selector */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[10px] text-text-tertiary shrink-0">Brand</span>
        <div className="flex gap-0.5 p-0.5 bg-app rounded-lg flex-1">
          {(['Renault', 'Nissan', 'Mitsubishi', 'Other'] as VehicleBrand[]).map(b => (
            <button
              key={b}
              onClick={() => setBrand(b)}
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

          {/* Part number input (manual fallback) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-text-tertiary shrink-0 w-16">Part No.</span>
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
                onChange={e => {
                  const found = ecuList.find(x => x.ecuFile === e.target.value) ?? null;
                  setSelectedEcu(found);
                  if (found) setActiveTestOpen(true);
                }}
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

      {/* Active Tests panel */}
      {selectedEcu && actuators.length > 0 && (
        <div className="mb-3 border border-border rounded-xl overflow-hidden">
          <button
            onClick={() => setActiveTestOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 bg-elevated hover:bg-app/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-text-primary">Active Tests</span>
              <span className="text-[10px] text-text-tertiary">
                {selectedEcu.ecuName}
                {selectedEcu.sendId
                  ? ` · CAN ${selectedEcu.sendId}→${selectedEcu.recvId}`
                  : ' · K-line only'}
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
                  {!selectedEcu.sendId && (
                    <p className="text-[10px] text-warning bg-warning/5 border border-warning/20 rounded-lg px-2 py-1.5">
                      K-line protocol — cannot send via CAN interface. Commands shown for reference only.
                    </p>
                  )}
                  {!isConnected && (
                    <p className="text-[10px] text-text-tertiary">Connect to Nano to activate tests.</p>
                  )}

                  {(['pump', 'valve', 'relay', 'reset', 'other'] as const).map(cat => {
                    const group = actuators.filter(a => a.category === cat);
                    if (!group.length) return null;
                    const catLabel: Record<string, string> = {
                      pump: 'Pump', valve: 'Valves', relay: 'Relays', reset: 'Reset / Stop', other: 'Other'
                    };
                    const catColor: Record<string, string> = {
                      pump: 'text-blue-400', valve: 'text-amber-400',
                      relay: 'text-purple-400', reset: 'text-red-400', other: 'text-text-tertiary'
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
                                disabled={!isConnected || !selectedEcu.sendId || needsMultiFrame || isActive}
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

      {/* Protocol tabs */}
      <div className="flex gap-0.5 p-0.5 bg-app rounded-lg mb-3">
        {(['OBD2', 'UDS', 'KWP2000'] as Protocol[]).map(p => (
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
            {p === 'OBD2' ? 'OBD-II' : p}
          </button>
        ))}
      </div>

      {/* Address row + action buttons */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {protocol === 'OBD2' && (
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
        {(!useBroadcast || protocol !== 'OBD2') && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-text-tertiary">ECU</span>
            <input
              type="text"
              value={ecuIdHex}
              onChange={e => setEcuIdHex(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 3))}
              placeholder="7E0"
              className="w-16 input-field !py-1 font-mono text-xs text-center uppercase"
            />
          </div>
        )}
        <span className="text-[10px] text-text-tertiary">→ resp {respRangeLabel()}</span>

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
              ? 'Connect to Nano via serial to scan for fault codes'
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
            <p className="text-[12px] text-text-secondary font-medium">No response from ECU</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">
              Check CAN bus connection, ECU address, and firmware CANTx support
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
                {scan.codes.length === 0
                  ? 'No stored fault codes'
                  : `${scan.codes.length} fault code${scan.codes.length !== 1 ? 's' : ''} found`}
                {' · '}
                {scan.brand}
                {' · '}
                {scan.protocol === 'OBD2' ? 'OBD-II' : scan.protocol}
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
              <div className="flex items-center justify-center gap-2 h-12 text-success text-[12px]">
                <CheckCircleIcon className="w-4 h-4" />
                ECU reports no stored faults
              </div>
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
                          <span className="text-[10px] text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded font-medium">
                            {dtc.ecuName}
                          </span>
                        )}
                        {dtc.udsStatus !== undefined && (
                          <p className="text-[10px] text-text-tertiary font-mono">
                            {'0x' + dtc.udsStatus.toString(16).toUpperCase().padStart(2, '0')}
                            {(dtc.udsStatus & 0x01) ? ' · active' : ''}
                            {(dtc.udsStatus & 0x08) ? ' · confirmed' : ''}
                            {(dtc.udsStatus & 0x20) ? ' · pending' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

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
