/* Import DTC text from VCDS Auto-Scan .txt files into the "EcuDtc" table.
 *
 * VCDS writes a plain-text scan to C:\Ross-Tech\VCDS\Scans\ every time you run
 * an Auto-Scan or read fault codes. This parses the Address 03 (ABS Brakes) and
 * Address 53 (Parking Brake) blocks and upserts each fault as an EcuDtc row
 * under ecu_file 'VAG_ABS', keyed by the VAG 5-digit code as dtc_raw — so
 * BRAXON's lookup_dtc can name it. Consuming VCDS's own output, not its DB.
 *
 * Usage:
 *   node scripts/import-vcds-scans.mjs                 # dry run, default folder
 *   node scripts/import-vcds-scans.mjs <folder>        # dry run, given folder
 *   node scripts/import-vcds-scans.mjs <folder> --write        # commit new codes only
 *   node scripts/import-vcds-scans.mjs <folder> --write --overwrite   # also refresh existing
 */
import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const args = process.argv.slice(2);
const DO_WRITE   = args.includes('--write');
const OVERWRITE  = args.includes('--overwrite');
const folder = args.find(a => !a.startsWith('--')) ||
  (existsSync('C:/Ross-Tech/VCDS/Scans') ? 'C:/Ross-Tech/VCDS/Scans' : '.');

const EF = 'VAG_ABS', EN = 'VAG ABS/ESP (VCDS Auto-Scan import)';

// --- parse one scan file -> [{ raw, code, description, saeCode }] ---
function parseScan(txt) {
  const out = [];
  const lines = txt.split(/\r?\n/);
  let inBlock = false;
  let comp = '';           // current fault's component/primary line text
  let vag = null;          // current fault's 5-digit VAG code

  const isBrakeHeader = l => /^Address (03|53):/.test(l);
  const isAnyHeader   = l => /^Address \d{2}:/.test(l) || /^-{10,}/.test(l);

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (isBrakeHeader(line)) { inBlock = true; comp = ''; vag = null; continue; }
    if (inBlock && isAnyHeader(line) && !isBrakeHeader(line)) { inBlock = false; continue; }
    if (!inBlock) continue;

    // primary fault line:  "01435 - Brake Pressure Sensor 1 (G201)"  /  "1435 - ..."  /  "778 - ..."
    let m = line.match(/^\s*(\d{3,5})\s*-\s*(\D.+?)\s*$/);
    if (m) { vag = m[1].padStart(5, '0'); comp = m[2].trim(); continue; }

    // detail line, UDS:  "C1124 00 [009] - Implausible Signal"  /  "B10469E1 00 [009] - ..."
    if (vag) {
      m = line.match(/^\s+([CPBU][0-9A-F]{4}|[0-9A-F]{6,8})\s+([0-9A-F]{2})\s*(?:\[\d+\])?\s*-\s*(.+?)\s*$/i);
      if (!m) // detail line, old KWP:  "27-10 - Implausible Signal"
        m = line.match(/^\s+(\d{2})-(\d{2})\s*-\s*(.+?)\s*$/);
      if (m) {
        const sub = m[1].toUpperCase();
        const failure = m[3].trim().replace(/^-+$/, '').trim();
        const saeCode = /^[CPBU][0-9A-F]{4}$/i.test(sub) ? sub : null;
        const desc = [comp, failure].filter(Boolean).join(' — ') + (saeCode ? `  [SAE ${saeCode}]` : '');
        out.push({ raw: parseInt(vag, 10), code: vag, description: desc, saeCode });
        vag = null; comp = '';
      }
      continue;
    }
  }
  return out;
}

const files = readdirSync(folder).filter(f => /\.txt$/i.test(f));
if (!files.length) { console.log(`no .txt scans in ${folder}`); process.exit(0); }

const merged = new Map(); // vag 5-digit -> row (last wins within a run)
for (const f of files) {
  let rows;
  try { rows = parseScan(readFileSync(join(folder, f), 'latin1')); }
  catch (e) { console.log(`skip ${f}: ${e.message}`); continue; }
  for (const r of rows) merged.set(r.code, r);
  console.log(`${f}: ${rows.length} brake DTC line(s)`);
}

const rows = [...merged.values()];
console.log(`\n${rows.length} distinct DTC(s) from ${files.length} scan file(s):`);
for (const r of rows) console.log(`  ${r.code}  raw=${r.raw}  ${r.description.slice(0, 90)}`);
if (!DO_WRITE) { console.log('\n(dry run — add --write to commit; --overwrite to refresh existing rows)'); process.exit(0); }

const cfgPath = 'C:/Users/Gabhy Kiba/AppData/Roaming/braxon/db_config.json';
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const c = new pg.Client({ host: cfg.host, port: cfg.port, database: cfg.database, user: cfg.username, password: cfg.password });
await c.connect();

const conflict = OVERWRITE
  ? `ON CONFLICT (ecu_file, dtc_raw) DO UPDATE SET description = EXCLUDED.description, dtc_code = EXCLUDED.dtc_code`
  : `ON CONFLICT (ecu_file, dtc_raw) DO NOTHING`;

await c.query('BEGIN');
let ins = 0;
try {
  for (const r of rows) {
    const res = await c.query(
      `INSERT INTO "EcuDtc" (id, ecu_name, ecu_file, protocol, dtc_raw, dtc_code, description, dtc_type)
       VALUES ($1,$2,$3,'KWP2000',$4,$5,$6,0) ${conflict}`,
      [randomUUID(), EN, EF, r.raw, r.code, r.description]);
    ins += res.rowCount;
  }
  await c.query('COMMIT');
} catch (e) { await c.query('ROLLBACK'); console.error('ROLLBACK', e.message); process.exit(1); }

const tot = (await c.query(`SELECT COUNT(*)::int n FROM "EcuDtc" WHERE ecu_file=$1`, [EF])).rows[0].n;
console.log(`\n${ins} row(s) ${OVERWRITE ? 'written' : 'inserted (new only)'}.  VAG_ABS now ${tot} rows.`);
await c.end();
