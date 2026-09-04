import odbc from 'odbc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outPath = name => path.join(scriptDir, name);

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

function diffObjects(before, after, label) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changes = [];
  for (const k of keys) {
    const b = before ? before[k] : undefined;
    const a = after ? after[k] : undefined;
    if (JSON.stringify(b) !== JSON.stringify(a)) changes.push({ field: k, before: b, after: a });
  }
  if (changes.length) {
    console.log(`\n=== Changes in ${label} (${changes.length}) ===`);
    for (const c of changes) console.log(`  ${c.field}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`);
  } else {
    console.log(`\n=== No changes in ${label} ===`);
  }
  return changes;
}

async function main() {
  const before = JSON.parse(fs.readFileSync(outPath('_snapshot-17473101-before-close.json'), 'utf8'));
  const conn = await odbc.connect(connectionString);
  try {
    const ligcde = (await conn.query(`SELECT * FROM LigCde WHERE NoInt_Ligcde = 39500`))[0];
    const interventions = await conn.query(`SELECT * FROM Intervention WHERE NoIntLigcde = 39500 ORDER BY NoInt_interv ASC`);

    diffObjects(before.ligcde, ligcde, 'LigCde');

    console.log(`\n=== Intervention rows: before had ${before.interventions.length}, now have ${interventions.length} ===`);
    const beforeIds = new Set(before.interventions.map(r => r.NoInt_interv));
    const newRows = interventions.filter(r => !beforeIds.has(r.NoInt_interv));
    for (const r of newRows) {
      console.log('\n--- NEW Intervention row ---');
      console.log(r);
    }

    fs.writeFileSync(outPath('_snapshot-17473101-after-close.json'), JSON.stringify({
      capturedAt: new Date().toISOString(), ligcde, interventions,
    }, null, 2));
    console.log('\nAfter-snapshot saved.');
  } catch (err) {
    console.error('Query error:', err.odbcErrors || err);
  } finally {
    await conn.close();
  }
}

main();
