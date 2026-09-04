import net from 'net';
import odbc from 'odbc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROXY_PORT = 19812;
const REMAN_HOST = '192.168.77.10';
const REMAN_PORT = 19822;

const server = net.createServer(client => {
  const remote = net.connect(REMAN_PORT, REMAN_HOST, () => {
    client.pipe(remote);
    remote.pipe(client);
  });
  remote.on('error', () => client.destroy());
  client.on('error', () => remote.destroy());
});

server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('Proxy already running elsewhere, using it directly.');
    await main();
  } else {
    console.error('Proxy error:', err);
    process.exit(1);
  }
});

server.listen(PROXY_PORT, '127.0.0.1', async () => {
  console.log('Local proxy up on', PROXY_PORT);
  await main();
});

const SNAPSHOT_COLS = [
  'NoInt_interv', 'NoIntLigcde', 'NoIntTechn', 'TypeCode', 'TypeLibelle',
  '"Date"', 'HeureInterv', 'HeureNum', 'Commentaire', 'TempsPasse',
  'NiveauPanne', 'PrixForfait', 'NbJrsRepClient', 'NoIntEtapeEnCours',
  'NomMachine', 'Possesseur', 'Heures', 'AncD_DepartDateL', 'AncD_DepartTech',
  'AncDateLimiteLivr', 'AncDateLimiteTech', 'AncDelaiLog1', 'AncDelaiLog2',
  'AncDelaiTechnique', 'AncH_DepartDateL', 'AncH_DepartTech',
  '"DateDevisPièce"', 'DateLimiteInitialeLivr', 'DateLimiteInitialeTech',
  '"DelaiCorrigé"', 'HeureAcceptDevis', '"verif GRE"'
];

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    console.log('\n=== STEP 1: full snapshot of rows 101419 / 101420 before deletion ===');
    const snapshotSql = `SELECT ${SNAPSHOT_COLS.join(', ')} FROM Intervention WHERE NoInt_interv IN (101419, 101420) ORDER BY NoInt_interv ASC`;
    const before = await conn.query(snapshotSql);
    console.log(JSON.stringify(before, null, 2));

    const outFile = path.join(__dirname, '_snapshot-101419-101420.json');
    fs.writeFileSync(outFile, JSON.stringify(before, null, 2));
    console.log('Snapshot saved to', outFile);

    if (before.length !== 2) {
      console.log(`\nEXPECTED 2 rows, found ${before.length}. Stopping WITHOUT deleting — state has changed since it was last checked, re-investigate before proceeding.`);
      return;
    }

    console.log('\n=== STEP 2: deleting rows 101419 and 101420 to free the slot 4D\'s counter is stuck on ===');
    await conn.query('DELETE FROM Intervention WHERE NoInt_interv IN (101419, 101420)');
    console.log('Delete executed.');

    console.log('\n=== STEP 3: verify ===');
    const after = await conn.query('SELECT NoInt_interv FROM Intervention WHERE NoInt_interv IN (101419, 101420)');
    console.log('Rows still present with those ids (expect 0):', after.length);

    const max = await conn.query('SELECT NoInt_interv FROM Intervention ORDER BY NoInt_interv DESC LIMIT 1');
    console.log('New MAX(NoInt_interv):', max[0].NOINT_INTERV);

    console.log('\nDone. The slot is now free — try the transfer to Service Commercial again in the 4D client and see if it goes through.');
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
