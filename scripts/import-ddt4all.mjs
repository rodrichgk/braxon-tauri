/* Import the full DDT4ALL ECU JSON database into BRAXON's Postgres.
 *
 * The existing "EcuActuator" table (populated by an external tool, ABS-only)
 * kept just the actionable screens for ~35 ABS ECUs. This imports EVERY unit —
 * engine, steering, airbag, cluster, BCM … — with:
 *   DdtEcu     one row per ECU: addressing (obd), protocol, autoidents
 *   DdtRequest every screen: reads (21/22), writes (2E/3B), routines (31),
 *              IO control (30/2F), session/clear/security … classified by `kind`
 *   DdtData    the value dictionary: bits, bytes, scaling (divideby/step/offset),
 *              signed, format, unit, enum lists
 *   DdtDevice  DTCs (raw + text) per ECU
 *
 * The converted JSON does NOT carry the received-DataItem → byte-offset map
 * (stripped in the DDT4ALL conversion), so DdtData scaling is a reference
 * dictionary, not auto-wired to a response byte. Everything else is exact.
 *
 * Usage:
 *   node scripts/import-ddt4all.mjs "C:/Users/Gabhy Kiba/Downloads/ecu"
 *   node scripts/import-ddt4all.mjs <folder> --limit 50        # test on a subset
 *   node scripts/import-ddt4all.mjs <folder> --wipe            # drop the 4 tables first
 */
import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';

const args = process.argv.slice(2);
const folder = args.find(a => !a.startsWith('--'));
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) : Infinity; })();
const WIPE = args.includes('--wipe');
if (!folder) { console.error('give the ecu folder path'); process.exit(1); }

const cfg = JSON.parse(readFileSync('C:/Users/Gabhy Kiba/AppData/Roaming/braxon/db_config.json', 'utf8'));
const c = new pg.Client({ host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.username, password: cfg.password });
await c.connect();
console.log('connected', cfg.database, '@', cfg.host);

if (WIPE) {
  await c.query(`DROP TABLE IF EXISTS "DdtRequest","DdtData","DdtDevice","DdtEcu" CASCADE`);
  console.log('wiped Ddt* tables');
}

await c.query(`
  CREATE TABLE IF NOT EXISTS "DdtEcu" (
    ecu_file TEXT PRIMARY KEY, ecu_name TEXT NOT NULL, protocol TEXT,
    send_id TEXT, recv_id TEXT, baudrate INTEGER, func_addr TEXT, func_name TEXT,
    endian TEXT, autoidents JSONB, request_count INTEGER, data_count INTEGER,
    device_count INTEGER, imported_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS "DdtRequest" (
    id TEXT PRIMARY KEY, ecu_file TEXT NOT NULL, kind TEXT NOT NULL,
    sent_bytes TEXT NOT NULL, min_bytes INTEGER, name TEXT NOT NULL,
    UNIQUE (ecu_file, sent_bytes, name)
  );
  CREATE INDEX IF NOT EXISTS idx_ddtreq_file ON "DdtRequest" (ecu_file);
  CREATE INDEX IF NOT EXISTS idx_ddtreq_kind ON "DdtRequest" (ecu_file, kind);
  CREATE TABLE IF NOT EXISTS "DdtData" (
    id TEXT PRIMARY KEY, ecu_file TEXT NOT NULL, name TEXT NOT NULL,
    bits INTEGER, bytes INTEGER, scaled BOOLEAN, is_signed BOOLEAN,
    divideby DOUBLE PRECISION, step DOUBLE PRECISION, val_offset DOUBLE PRECISION,
    fmt TEXT, unit TEXT, lists JSONB, UNIQUE (ecu_file, name)
  );
  CREATE INDEX IF NOT EXISTS idx_ddtdata_file ON "DdtData" (ecu_file);
  CREATE TABLE IF NOT EXISTS "DdtDevice" (
    id TEXT PRIMARY KEY, ecu_file TEXT NOT NULL, dtc_raw INTEGER, dtc_code TEXT,
    dtc_type INTEGER, name TEXT NOT NULL, UNIQUE (ecu_file, name)
  );
  CREATE INDEX IF NOT EXISTS idx_ddtdev_file ON "DdtDevice" (ecu_file);
`);

// sent-bytes prefix -> kind
function classify(sb) {
  const p = (sb || '').slice(0, 2).toUpperCase();
  return ({
    '10': 'session', '11': 'ecureset', '14': 'cleardtc', '17': 'readdtc',
    '18': 'readdtc', '19': 'readdtc', '1A': 'read', '21': 'read', '22': 'read',
    '23': 'read', '24': 'read', '27': 'security', '28': 'comm', '2C': 'read',
    '2E': 'write', '2F': 'io', '30': 'io', '31': 'routine', '34': 'transfer',
    '35': 'transfer', '36': 'transfer', '37': 'transfer', '3B': 'write',
    '3D': 'write', '3E': 'session',
  })[p] || 'other';
}
const decodeDtcCode = (raw) => {
  if (raw == null) return null;
  const hi = (raw >> 8) & 0xff, lo = raw & 0xff;
  const t = ['P', 'C', 'B', 'U'][(hi >> 6) & 3];
  return `${t}${(hi >> 4) & 3}${(hi & 0xf).toString(16)}${(lo >> 4).toString(16)}${(lo & 0xf).toString(16)}`.toUpperCase();
};

// Skip pure CAN-message-list / bus-definition files (not ECUs).
const SKIP_RE = /message_list|_can_v_|_can_v_m|kbps_can|_can2\.|_can_v\./i;
// DdtData is huge and — without the received-DataItem→offset map (stripped in
// the DDT4ALL conversion) — only a loose reference. So only keep value rows that
// carry a `unit`, and skip the mega signal-catalog files (gateways / big ECMs).
const DATA_MEGA = 6000;

const files = readdirSync(folder)
  .filter(f => f.endsWith('.json') && !f.endsWith('.layout') && !SKIP_RE.test(f))
  .slice(0, LIMIT);
console.log(`${files.length} ecu json files\n`);

let nEcu = 0, nReq = 0, nData = 0, nDev = 0, nBad = 0;
const BATCH = 400;

async function flush(sql, rows) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const cols = chunk[0].length;
    const params = chunk.map((_, r) => `(${Array.from({ length: cols }, (_, k) => `$${r * cols + k + 1}`).join(',')})`).join(',');
    await c.query(sql.replace('%VALUES%', params), chunk.flat());
  }
}

for (let fi = 0; fi < files.length; fi++) {
  const f = files[fi];
  const ef = basename(f, '.json');
  let d;
  try { d = JSON.parse(readFileSync(join(folder, f), 'utf8')); }
  catch { nBad++; continue; }

  const obd = d.obd || {};
  const reqs = Array.isArray(d.requests) ? d.requests : [];
  const data = d.data && typeof d.data === 'object' ? d.data : {};
  const devs = Array.isArray(d.devices) ? d.devices : [];

  await c.query(
    `INSERT INTO "DdtEcu" (ecu_file,ecu_name,protocol,send_id,recv_id,baudrate,func_addr,func_name,endian,autoidents,request_count,data_count,device_count)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (ecu_file) DO UPDATE SET
       ecu_name=EXCLUDED.ecu_name, protocol=EXCLUDED.protocol, send_id=EXCLUDED.send_id, recv_id=EXCLUDED.recv_id,
       baudrate=EXCLUDED.baudrate, func_addr=EXCLUDED.func_addr, func_name=EXCLUDED.func_name, endian=EXCLUDED.endian,
       autoidents=EXCLUDED.autoidents, request_count=EXCLUDED.request_count, data_count=EXCLUDED.data_count,
       device_count=EXCLUDED.device_count, imported_at=now()`,
    [ef, d.ecuname || ef, obd.protocol ?? null, obd.send_id ?? null, obd.recv_id ?? null,
     obd.baudrate ?? null, obd.funcaddr ?? null, obd.funcname ?? null, d.endian ?? null,
     JSON.stringify(d.autoidents ?? []), reqs.length, Object.keys(data).length, devs.length]);
  nEcu++;

  // requests
  const seen = new Set();
  const reqRows = [];
  for (const r of reqs) {
    const sb = String(r.sentbytes ?? '').toUpperCase();
    const key = sb + '|' + (r.name ?? '');
    if (!sb || seen.has(key)) continue;
    seen.add(key);
    reqRows.push([randomUUID(), ef, classify(sb), sb, r.minbytes ?? null, String(r.name ?? '').slice(0, 300)]);
  }
  await flush(
    `INSERT INTO "DdtRequest" (id,ecu_file,kind,sent_bytes,min_bytes,name) VALUES %VALUES%
     ON CONFLICT (ecu_file,sent_bytes,name) DO UPDATE SET kind=EXCLUDED.kind, min_bytes=EXCLUDED.min_bytes`,
    reqRows);
  nReq += reqRows.length;

  // data dictionary — only value rows with a unit, and not from mega catalogs
  const dataRows = [];
  if (Object.keys(data).length <= DATA_MEGA) {
    for (const [name, v] of Object.entries(data)) {
      if (!v || typeof v !== 'object' || !v.unit) continue;
      dataRows.push([randomUUID(), ef, name.slice(0, 300),
        v.bitscount ?? null, v.bytescount ?? null,
        v.scaled ?? null, v.signed ?? null,
        v.divideby ?? null, v.step ?? null, v.offset ?? null,
        v.format ?? null, v.unit ?? null,
        v.lists ? JSON.stringify(v.lists) : null]);
    }
  }
  await flush(
    `INSERT INTO "DdtData" (id,ecu_file,name,bits,bytes,scaled,is_signed,divideby,step,val_offset,fmt,unit,lists) VALUES %VALUES%
     ON CONFLICT (ecu_file,name) DO UPDATE SET bits=EXCLUDED.bits, bytes=EXCLUDED.bytes, scaled=EXCLUDED.scaled,
       is_signed=EXCLUDED.is_signed, divideby=EXCLUDED.divideby, step=EXCLUDED.step, val_offset=EXCLUDED.val_offset,
       fmt=EXCLUDED.fmt, unit=EXCLUDED.unit, lists=EXCLUDED.lists`,
    dataRows);
  nData += dataRows.length;

  // devices (DTCs)
  const devSeen = new Set();
  const devRows = [];
  for (const dev of devs) {
    const nm = String(dev.name ?? '').slice(0, 300);
    if (!nm || devSeen.has(nm)) continue;
    devSeen.add(nm);
    const raw = Number.isInteger(dev.dtc) ? dev.dtc : null;
    devRows.push([randomUUID(), ef, raw, decodeDtcCode(raw), dev.dtctype ?? null, nm]);
  }
  await flush(
    `INSERT INTO "DdtDevice" (id,ecu_file,dtc_raw,dtc_code,dtc_type,name) VALUES %VALUES%
     ON CONFLICT (ecu_file,name) DO UPDATE SET dtc_raw=EXCLUDED.dtc_raw, dtc_code=EXCLUDED.dtc_code, dtc_type=EXCLUDED.dtc_type`,
    devRows);
  nDev += devRows.length;

  if ((fi + 1) % 200 === 0 || fi === files.length - 1)
    console.log(`  ${fi + 1}/${files.length}  ecus=${nEcu} reqs=${nReq} data=${nData} devs=${nDev} bad=${nBad}`);
}

// summary
const k = await c.query(`SELECT kind, COUNT(*)::int n FROM "DdtRequest" GROUP BY kind ORDER BY n DESC`);
console.log('\n=== DdtRequest by kind ===');
for (const r of k.rows) console.log(`  ${r.kind.padEnd(10)} ${r.n}`);
const tot = await c.query(`SELECT
  (SELECT COUNT(*)::int FROM "DdtEcu") ecus,
  (SELECT COUNT(*)::int FROM "DdtRequest") reqs,
  (SELECT COUNT(*)::int FROM "DdtData") data,
  (SELECT COUNT(*)::int FROM "DdtDevice") devs`);
console.log('\ntotals:', tot.rows[0]);
await c.end();
