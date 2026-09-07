#!/usr/bin/env node
/**
 * decode-tp20-capture.mjs — reassemble a VW TP2.0 (KWP2000/UDS-on-CAN, the
 * pre-2010 VAG diagnostic transport) session from a BRAXON bus recording and
 * print the request/response transcript.
 *
 *   node scripts/decode-tp20-capture.mjs <capture.log> [--reqId 0x790] [--respId 0x300] [--raw]
 *
 * BRAXON log line: `[+Nms] <canId_dec> <dlc> <b0..b7_dec>`  (frames are in
 * chronological file order; the ms field is unreliable so we key off order).
 *
 * TP2.0 data frame b0 = <op><seq>:
 *   op 1/2 = data (op 2 also = "ACK me now"); op A = channel test/params;
 *   op B = ACK(next seq). seq is a running 0..F counter per direction.
 * First frame of a KWP message: b1..b2 = length (big-endian, low 12 bits;
 * bit 15 is a "more coming / responsePending" flag), payload from b3.
 * Continuation frames: payload from b1. Message done at declared length.
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--'));
const RAW = args.includes('--raw');
const hx = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? parseInt(args[i + 1], 16) : d;
};
const REQ_ID = hx('--reqId', 0x790);
const RESP_ID = hx('--respId', 0x300);
if (!path) {
  console.error('usage: decode-tp20-capture.mjs <capture.log>');
  process.exit(1);
}

const H = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const hexs = (a) => a.map(H).join(' ');
const ascii = (a) => a.map((x) => (x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : '·')).join('');

const SID = {
  0x10: 'StartDiagnosticSession', 0x11: 'ECUReset', 0x12: 'ReadFreezeFrameData',
  0x13: 'ReadDiagnosticTroubleCodes', 0x14: 'ClearDiagnosticInformation',
  0x17: 'ReadStatusOfDTC', 0x18: 'ReadDTCByStatus', 0x19: 'ReadDTCInformation',
  0x1a: 'ReadECUIdentification', 0x20: 'StopDiagnosticSession', 0x21: 'ReadDataByLocalID',
  0x22: 'ReadDataByIdentifier', 0x23: 'ReadMemoryByAddress', 0x27: 'SecurityAccess',
  0x28: 'DisableNormalMsgTx', 0x29: 'EnableNormalMsgTx', 0x2c: 'DynamicallyDefineLocalID',
  0x2e: 'WriteDataByIdentifier', 0x2f: 'InputOutputControlByIdentifier',
  0x30: 'InputOutputControlByLocalID', 0x31: 'StartRoutineByLocalID',
  0x32: 'StopRoutineByLocalID', 0x33: 'RequestRoutineResults', 0x34: 'RequestDownload',
  0x36: 'TransferData', 0x37: 'RequestTransferExit', 0x3b: 'WriteDataByLocalID',
  0x3d: 'WriteMemoryByAddress', 0x3e: 'TesterPresent', 0x85: 'ControlDTCSetting', 0x87: 'LinkControl',
};
const NRC = {
  0x10: 'generalReject', 0x11: 'serviceNotSupported', 0x12: 'subFunctionNotSupported',
  0x13: 'invalidFormat', 0x21: 'busyRepeatRequest', 0x22: 'conditionsNotCorrect',
  0x23: 'routineNotComplete', 0x24: 'requestSequenceError', 0x31: 'requestOutOfRange',
  0x33: 'securityAccessDenied', 0x35: 'invalidKey', 0x36: 'exceededAttempts',
  0x37: 'timeDelayNotExpired', 0x78: 'responsePending', 0x7e: 'subFuncNotSupportedInSession',
  0x7f: 'serviceNotSupportedInSession',
};
const DID = {
  0xf186: 'ActiveDiagnosticSession', 0xf187: 'VW spare part number', 0xf189: 'VW ECU SW version',
  0xf18a: 'VW system supplier id', 0xf191: 'VW ECU HW number', 0xf197: 'VW system name',
  0xf19e: 'ASAM ODX file id', 0xf1a2: 'ASAM ODX file version', 0xf1a3: 'VW ECU HW version',
  0xf1a5: 'VW coding / repair-shop code', 0x0600: 'VW coding value', 0x0606: 'coding sub 06',
  0x0607: 'coding sub 07',
};

function parse(txt) {
  const out = [];
  for (const l of txt.split(/\r?\n/)) {
    const m = l.match(/^\[\+(\d+)ms\]\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    const b = m[4].trim().split(/\s+/).map(Number);
    out.push({ ms: +m[1], id: +m[2], dlc: +m[3], b: b.slice(0, +m[3]) });
  }
  return out;
}

// VW KWP2000 measuring-value formula subset: fmt → (a,b) → [text, unit]
const MWB = {
  0x01: (a, b) => [(a * b) / 5, 'rpm'],
  0x02: (a, b) => [a * 0.002 * b, '%'],
  0x03: (a, b) => [a * 0.002 * b, '°'],
  0x05: (a, b) => [a * (b - 100) * 0.1, '°C'],
  0x06: (a, b) => [a * b * 0.001, 'V'],
  0x07: (a, b) => [a * b * 0.01, 'km/h'],
  0x12: (a, b) => [a * b * 0.01, 'mbar'],
  0x14: (a, b) => [a * (b - 128) * 0.01, '%'],
  0x21: (a, b) => [a ? (b * 100) / a : b, '%'],
  0x25: (_a, b) => [b.toString(2).padStart(8, '0'), 'bits'],
  0x36: (a, b) => [a * 256 + b, ''],
};
const mwbTriplets = (bytes) => {
  const out = [];
  for (let i = 0; i + 2 < bytes.length; i += 3) {
    const [fmt, a, b] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const f = MWB[fmt];
    const v = f ? f(a, b) : [`${H(a)} ${H(b)}`, `fmt${H(fmt)}`];
    out.push(typeof v[0] === 'number' ? `${(+v[0].toFixed(2))}${v[1] ? ' ' + v[1] : ''}` : `${v[0]}${v[1] === 'bits' ? '' : ' ' + v[1]}`);
  }
  return out.join(' | ');
};

function describe(p, isResp) {
  if (!p.length) return '(empty)';
  if (p[0] === 0x7f) {
    return `NEG  ${SID[p[1]] || 'SID ' + H(p[1])} → ${NRC[p[2]] || 'NRC ' + H(p[2])}`;
  }
  if (isResp && p[0] === 0x61) return `MWB ${H(p[1])}  ${mwbTriplets(p.slice(2))}`;
  if (isResp && p[0] === 0x58) {
    const n = p[1];
    const dtcs = [];
    for (let i = 0; i < n; i++) {
      const hi = p[2 + i * 3], lo = p[3 + i * 3], st = p[4 + i * 3];
      dtcs.push(`${((hi << 8) | lo).toString().padStart(5, '0')}(-${((st & 0x7f) - 0x60).toString().padStart(3, '0')}${st & 0x80 ? ',present' : ''})`);
    }
    return `ReadDTC → ${n}: ${dtcs.join('  ')}`;
  }
  const base = isResp && p[0] >= 0x40 && p[0] < 0x7f ? p[0] - 0x40 : p[0];
  const name = SID[base] || `SID ${H(base)}`;
  let x = '';
  if (base === 0x10 || base === 0x20) x = ` session 0x${H(p[1] ?? 0)}`;
  else if (base === 0x27) {
    const sf = p[1];
    x = (sf & 1) ? ` requestSeed L${H(sf)}` : ` sendKey L${H(sf)}`;
    if (p.length > 2) x += ` ${hexs(p.slice(2))}`;
  } else if (base === 0x22) {
    if (isResp) {
      const d = (p[1] << 8) | p[2];
      x = ` 0x${H(p[1])}${H(p[2])} (${DID[d] || '?'}) = ${hexs(p.slice(3))}  "${ascii(p.slice(3))}"`;
    } else {
      const ds = [];
      for (let i = 1; i + 1 < p.length; i += 2) ds.push((p[i] << 8) | p[i + 1]);
      x = ' ' + ds.map((d) => `0x${d.toString(16).toUpperCase()}(${DID[d] || '?'})`).join(' ');
    }
  } else if (base === 0x21 || base === 0x30 || base === 0x3b) {
    x = ` LID 0x${H(p[1] ?? 0)}` + (p.length > 2 ? `  ${hexs(p.slice(2))}` : '');
  } else if (base === 0x31 || base === 0x32 || base === 0x33) {
    x = ` routine 0x${H(p[1] ?? 0)}${p[2] !== undefined ? H(p[2]) : ''}` + (p.length > 3 ? ` args ${hexs(p.slice(3))}` : '');
  } else if (base === 0x1a) {
    x = ` rec 0x${H(p[1] ?? 0)}` + (isResp && p.length > 2 ? `  "${ascii(p.slice(2))}"` : '');
  } else if (p.length > 1) {
    x = ` ${hexs(p.slice(1))}`;
  }
  return `${name}${x}`;
}

// --- reassemble both directions in one chronological pass ---
const frames = parse(fs.readFileSync(path, 'utf8'));
const st = {
  [REQ_ID]: { need: -1, buf: [], label: '->' },
  [RESP_ID]: { need: -1, buf: [], label: '<-' },
};
const msgs = [];
let firstDataFrame = null;
for (const f of frames) {
  const s = st[f.id];
  if (!s) continue;
  const op = f.b[0] >> 4;
  if (op === 0xa || op === 0xb || op > 3) continue; // channel test / ACK / non-data
  if (RAW && !firstDataFrame) firstDataFrame = f;
  let payload;
  if (s.need < 0) {
    s.need = ((f.b[1] << 8) | f.b[2]) & 0x0fff;
    payload = f.b.slice(3);
    s.buf = [];
  } else {
    payload = f.b.slice(1);
  }
  s.buf.push(...payload);
  if (s.buf.length >= s.need) {
    msgs.push({ dir: s.label, isResp: s.label === '<-', p: s.buf.slice(0, s.need), ms: f.ms });
    s.buf = [];
    s.need = -1;
  }
}

console.log(`# ${path.split(/[\\/]/).pop()}`);
console.log(`# ${frames.length} frames | reqId 0x${REQ_ID.toString(16)} respId 0x${RESP_ID.toString(16)} | ${msgs.length} messages\n`);

// collapse repeated TesterPresent / identical consecutive polls
let last = '', run = 0;
const lines = [];
for (const m of msgs) {
  const key = m.dir + hexs(m.p);
  if (key === last) { run++; continue; }
  if (run) { lines.push(`        … ×${run + 1} total`); run = 0; }
  last = key;
  lines.push(`${m.dir} ${hexs(m.p).padEnd(32).slice(0, 32)}  ${describe(m.p, m.isResp)}`);
}
if (run) lines.push(`        … ×${run + 1} total`);
console.log(lines.join('\n'));

// summary
const svc = new Set(), dids = new Set(), lids = new Set(), rtn = new Set(), sec = [];
for (const m of msgs.filter((x) => !x.isResp)) {
  const p = m.p;
  svc.add(H(p[0]));
  if (p[0] === 0x22) for (let i = 1; i + 1 < p.length; i += 2) dids.add(`0x${H(p[i])}${H(p[i + 1])}`);
  if (p[0] === 0x21 || p[0] === 0x3b || p[0] === 0x30) lids.add(`0x${H(p[1])}`);
  if (p[0] === 0x31 || p[0] === 0x32 || p[0] === 0x33) rtn.add(`0x${H(p[1])}${p[2] !== undefined ? H(p[2]) : ''}`);
  if (p[0] === 0x27) sec.push(hexs(p));
}
console.log(`\n# services: ${[...svc].sort().join(' ')}`);
console.log(`# DIDs (22): ${[...dids].sort().join(' ') || '-'}`);
console.log(`# local IDs (21/3B/30): ${[...lids].sort().join(' ') || '-'}`);
console.log(`# routines (31/32/33): ${[...rtn].sort().join(' ') || '-'}`);
console.log(`# SecurityAccess: ${sec.length ? sec.join(' | ') : 'none seen'}`);
