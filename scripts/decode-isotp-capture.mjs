#!/usr/bin/env node
/**
 * decode-isotp-capture.mjs — reassemble an ISO-TP (ISO 15765-2) KWP2000/UDS
 * session from a BRAXON bus recording and print the request/response transcript.
 * For the KWP-on-CAN units (Renault 0x74x, PSA 0x6Ax, …). VW TP2.0 uses the
 * other decoder (decode-tp20-capture.mjs).
 *
 *   node scripts/decode-isotp-capture.mjs <capture.log> --req 0x6AD --resp 0x68D
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--'));
const val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? parseInt(args[i + 1], 16) : d; };
const REQ = val('--req', NaN);
const RESP = val('--resp', NaN);
if (!path || Number.isNaN(REQ) || Number.isNaN(RESP)) {
  console.error('usage: decode-isotp-capture.mjs <capture.log> --req 0xNNN --resp 0xNNN');
  process.exit(1);
}
const H = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const hexs = (a) => a.map(H).join(' ');
const ascii = (a) => a.map((x) => (x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : '·')).join('');

const SID = {
  0x10: 'StartDiagnosticSession', 0x11: 'ECUReset', 0x14: 'ClearDiagnosticInformation',
  0x17: 'ReadStatusOfDTC', 0x18: 'ReadDTCByStatus', 0x19: 'ReadDTCInformation',
  0x1a: 'ReadECUIdentification', 0x21: 'ReadDataByLocalID', 0x22: 'ReadDataByIdentifier',
  0x23: 'ReadMemoryByAddress', 0x27: 'SecurityAccess', 0x28: 'DisableNormalMsgTx',
  0x2e: 'WriteDataByIdentifier', 0x2f: 'IOControlByIdentifier', 0x30: 'IOControlByLocalID',
  0x31: 'StartRoutineByLocalID', 0x32: 'StopRoutineByLocalID', 0x33: 'RequestRoutineResults',
  0x34: 'RequestDownload', 0x3b: 'WriteDataByLocalID', 0x3d: 'WriteMemoryByAddress',
  0x3e: 'TesterPresent', 0x85: 'ControlDTCSetting',
};
const NRC = {
  0x10: 'generalReject', 0x11: 'serviceNotSupported', 0x12: 'subFunctionNotSupported',
  0x13: 'invalidFormat', 0x22: 'conditionsNotCorrect', 0x24: 'requestSequenceError',
  0x31: 'requestOutOfRange', 0x33: 'securityAccessDenied', 0x35: 'invalidKey',
  0x36: 'exceededAttempts', 0x37: 'timeDelayNotExpired', 0x78: 'responsePending',
};

function parse(txt) {
  const out = [];
  for (const l of txt.split(/\r?\n/)) {
    const m = l.match(/^\[\+(\d+)ms\]\s+(\d+)\s+(\d+)\s+(.+)$/);
    if (!m) continue;
    out.push({ id: +m[2], b: m[4].trim().split(/\s+/).map(Number).slice(0, +m[3]) });
  }
  return out;
}

/**
 * Reassemble BOTH directions in ONE pass over the file, in the file's own
 * (chronological) line order, emitting each completed message the instant it
 * finishes. This matters: reassembling each direction into its own array and
 * then zipping index-for-index (the old approach) silently desyncs whenever
 * the two directions' message counts diverge even slightly — e.g. a `7E`
 * TesterPresent ack that doesn't answer any particular request — so "the
 * response printed after this request" was not reliably the ECU's actual
 * answer to it. A true single pass can't desync like that.
 */
function reassembleBoth(frames, reqId, respId) {
  const state = {
    [reqId]: { buf: [], need: -1, nextSeq: 1, dir: '->' },
    [respId]: { buf: [], need: -1, nextSeq: 1, dir: '<-' },
  };
  const msgs = [];
  for (const f of frames) {
    const s = state[f.id];
    if (!s) continue;
    const t = f.b[0] >> 4;
    if (t === 0) {
      const len = f.b[0] & 0x0f;
      if (len) msgs.push({ dir: s.dir, p: f.b.slice(1, 1 + len) });
    } else if (t === 1) {
      s.need = ((f.b[0] & 0x0f) << 8) | f.b[1];
      s.buf = f.b.slice(2);
      s.nextSeq = 1;
    } else if (t === 2) {
      if (s.need < 0) continue;
      if ((f.b[0] & 0x0f) !== s.nextSeq) continue;
      s.buf.push(...f.b.slice(1));
      s.nextSeq = (s.nextSeq + 1) & 0x0f;
      if (s.buf.length >= s.need) { msgs.push({ dir: s.dir, p: s.buf.slice(0, s.need) }); s.buf = []; s.need = -1; }
    }
    // t === 3 (flow control) ignored
  }
  return msgs;
}

function describe(p, isResp) {
  if (!p.length) return '(empty)';
  if (p[0] === 0x7f) return `NEG  ${SID[p[1]] || 'SID ' + H(p[1])} → ${NRC[p[2]] || 'NRC ' + H(p[2])}`;
  const base = isResp && p[0] >= 0x40 && p[0] < 0x7f ? p[0] - 0x40 : p[0];
  const name = SID[base] || `SID ${H(base)}`;
  let x = p.length > 1 ? ` ${hexs(p.slice(1, 48))}` : '';
  if (base === 0x27) x += ` (${(p[1] & 1) ? 'seed L' + H(p[1]) : 'key L' + H(p[1])})`;
  if ((base === 0x18 || base === 0x19) && isResp) {
    // 58 <count> {hi lo status}  — flag DTC-ish blocks
    x += `   « ${ascii(p.slice(1))} »`;
  }
  if (base === 0x1a && isResp) x += `   "${ascii(p.slice(2))}"`;
  return `${name}${x}`;
}

const frames = parse(fs.readFileSync(path, 'utf8'));
const all = reassembleBoth(frames, REQ, RESP);
const reqM = all.filter((m) => m.dir === '->');
const respM = all.filter((m) => m.dir === '<-');

console.log(`# ${path.split(/[\\/]/).pop()}`);
console.log(`# req 0x${REQ.toString(16)} (${reqM.length} msgs) | resp 0x${RESP.toString(16)} (${respM.length} msgs)\n`);

// True chronological order already — just de-noise repeated keep-alive lines.
const out = [];
let lastKey = '', run = 0;
for (const m of all) {
  const key = m.dir + hexs(m.p);
  if (key === lastKey && (m.p[0] === 0x3e || m.p[0] === 0x7e)) { run++; continue; }
  if (run) { out.push(`     … ×${run + 1}`); run = 0; }
  lastKey = key;
  out.push(`${m.dir} ${hexs(m.p).slice(0, 44).padEnd(44)}  ${describe(m.p, m.dir === '<-')}`);
}
if (run) out.push(`     … ×${run + 1}`);
console.log(out.join('\n'));

// summary
const svc = new Set(), lids = new Set(), rtn = new Set(), sec = [];
for (const { p } of reqM) {
  svc.add(H(p[0]));
  if (p[0] === 0x21 || p[0] === 0x3b || p[0] === 0x30 || p[0] === 0x2f) lids.add(`0x${H(p[1])}`);
  if (p[0] === 0x31 || p[0] === 0x32 || p[0] === 0x33) rtn.add(hexs(p.slice(1, 3)));
  if (p[0] === 0x27) sec.push(hexs(p));
}
console.log(`\n# services: ${[...svc].sort().join(' ')}`);
console.log(`# local IDs / DIDs / IO: ${[...lids].sort().join(' ') || '-'}`);
console.log(`# routines (31/32/33): ${[...rtn].sort().join(' | ') || '-'}`);
console.log(`# SecurityAccess: ${sec.length ? sec.join(' | ') : 'none'}`);
