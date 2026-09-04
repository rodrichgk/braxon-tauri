import odbc from 'odbc';
import fs from 'fs';

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

async function main() {
  const conn = await odbc.connect(connectionString);
  try {
    // Node's `odbc` package doesn't hit the Rust odbc-api Boolean-column
    // panic, so SELECT * is safe here and gives us the full raw row,
    // including every Boolean flag, for a real before/after diff.
    const ligcde = await conn.query(`SELECT * FROM LigCde WHERE NoInt_Ligcde = 39500`);
    const interventions = await conn.query(`SELECT * FROM Intervention WHERE NoIntLigcde = 39500 ORDER BY NoInt_interv ASC`);
    const detailInterv = await conn.query(
      `SELECT * FROM DetailInterv WHERE NoIntIntervAppel IN (${interventions.map(r => r.NoInt_interv).join(',') || '0'})`
    );
    const maxInterv = await conn.query(`SELECT MAX(NoInt_interv) AS MAXID FROM Intervention`);
    const commande = await conn.query(`SELECT * FROM Commande WHERE NoInt_Cde = 38999`);

    const snapshot = {
      capturedAt: new Date().toISOString(),
      ligcde: ligcde[0],
      interventions,
      detailInterv,
      maxInterventionIdBeforeChange: maxInterv[0],
      commande: commande[0],
    };

    fs.writeFileSync('scripts/_snapshot-17473101-before.json', JSON.stringify(snapshot, null, 2));
    console.log('Snapshot saved to scripts/_snapshot-17473101-before.json');
    console.log(`LigCde row: ${Object.keys(ligcde[0] || {}).length} fields`);
    console.log(`Intervention rows: ${interventions.length}`);
    interventions.forEach(r => console.log(`  - ${r.NoInt_interv}: ${r.TypeCode} / ${r.TypeLibelle} @ ${r.Date} ${r.HeureInterv} by tech ${r.NoIntTechn}`));
    console.log(`Current MAX(NoInt_interv) in Intervention table: ${maxInterv[0]?.MAXID}`);
  } catch (err) {
    console.error('Query error:', err.odbcErrors || err);
  } finally {
    await conn.close();
  }
}

main();
