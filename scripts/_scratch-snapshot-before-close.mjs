import odbc from 'odbc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outPath = name => path.join(scriptDir, name);

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

async function main() {
  const conn = await odbc.connect(connectionString);
  try {
    const ligcde = (await conn.query(`SELECT * FROM LigCde WHERE NoInt_Ligcde = 39500`))[0];
    const interventions = await conn.query(`SELECT * FROM Intervention WHERE NoIntLigcde = 39500 ORDER BY NoInt_interv ASC`);
    const maxInterv = (await conn.query(`SELECT NoInt_interv FROM Intervention ORDER BY NoInt_interv DESC LIMIT 1`))[0];

    fs.writeFileSync(outPath('_snapshot-17473101-before-close.json'), JSON.stringify({
      capturedAt: new Date().toISOString(), ligcde, interventions, maxInterventionIdBeforeChange: maxInterv,
    }, null, 2));

    console.log('Snapshot saved.');
    console.log('Soldée:', ligcde.Soldée);
    console.log('DernièreInterv:', ligcde.DernièreInterv);
    console.log('DateDernInterv:', ligcde.DateDernInterv);
    console.log('TechDernInterv:', ligcde.TechDernInterv);
    console.log('NomDernierTech:', JSON.stringify(ligcde.NomDernierTech));
    console.log('Nettoyage:', ligcde.Nettoyage);
    console.log('Réparation:', ligcde['Réparation']);
    console.log('Current step count:', interventions.length);
    interventions.forEach(r => console.log(' -', r.NoInt_interv, r.NoIntTechn, r.TypeCode, r.TypeLibelle, JSON.stringify(r.Commentaire)));
    console.log('Current MAX(NoInt_interv):', maxInterv?.NoInt_interv);
  } catch (err) {
    console.error('Query error:', err.odbcErrors || err);
  } finally {
    await conn.close();
  }
}

main();
