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
    console.log(`\n=== Changes in ${label} ===`);
    for (const c of changes) console.log(`  ${c.field}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`);
  } else {
    console.log(`\n=== No changes in ${label} ===`);
  }
  return changes;
}

async function snapshot(conn) {
  const ligcde = (await conn.query(`SELECT * FROM LigCde WHERE NoInt_Ligcde = 39500`))[0];
  const interventions = await conn.query(`SELECT * FROM Intervention WHERE NoIntLigcde = 39500 ORDER BY NoInt_interv ASC`);
  return { ligcde, interventions };
}

async function main() {
  const conn = await odbc.connect(connectionString);
  try {
    console.log('=== BEFORE ===');
    const before = await snapshot(conn);
    console.log(`Interventions: ${before.interventions.length}`);
    fs.writeFileSync(outPath('_snapshot-17473101-before-sqltest.json'), JSON.stringify(before, null, 2));

    console.log('\n=== Attempting raw SQL INSERT (no NoInt_interv supplied) ===');
    const insertSql = `INSERT INTO Intervention (NoIntLigcde, NoIntTechn, "Date", TypeCode, TypeLibelle, Commentaire, HeureInterv)
                        VALUES (39500, 3569, '2026-08-03', 'ER', 'Etape de réparation', 'BRAXON SQL TEST - safe to delete', '10:00:00')`;
    try {
      const result = await conn.query(insertSql);
      console.log('INSERT result:', result);
    } catch (err) {
      console.log('INSERT FAILED:', err.odbcErrors || err.message || err);
      console.log('\nStopping here — no write happened, nothing to diff or clean up.');
      return;
    }

    console.log('\n=== AFTER ===');
    const after = await snapshot(conn);
    fs.writeFileSync(outPath('_snapshot-17473101-after-sqltest.json'), JSON.stringify(after, null, 2));

    diffObjects(before.ligcde, after.ligcde, 'LigCde');
    console.log(`\nIntervention rows: before ${before.interventions.length}, after ${after.interventions.length}`);
    const beforeIds = new Set(before.interventions.map(r => r.NoInt_interv));
    const newRows = after.interventions.filter(r => !beforeIds.has(r.NoInt_interv));
    for (const r of newRows) {
      console.log('\n--- NEW row from our SQL INSERT ---');
      console.log(r);
    }
  } finally {
    await conn.close();
  }
}

main();
