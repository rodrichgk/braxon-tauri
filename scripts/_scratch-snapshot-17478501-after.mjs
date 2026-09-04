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
  if (err.code === 'EADDRINUSE') { await main(); }
  else { console.error('Proxy error:', err); process.exit(1); }
});

server.listen(PROXY_PORT, '127.0.0.1', async () => { await main(); });

const LIGCDE_COLS = [
  'NoInt_Ligcde', 'NoIntervention', 'NoInt_cde', 'CodeArt', 'LibelleArt',
  '"DernièreInterv"', 'DateDernInterv', 'TechDernInterv', 'NomDernierTech',
  'Nettoyage', 'CausePanne', 'SemaineGarantie', '"HeureLigSoldée"',
  'DerInterv_technique', 'DateDerInterv_technique', 'HeureDerInterv_technique',
  'ServiceTechnique', 'Type_Service', 'heureModif', 'DateModif',
  'DateLimiteLivraison',
];

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const ligcdeId = 39559;

    const soldee = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde = ${ligcdeId} AND "Soldée" = True`);
    const isSoldee = soldee.length === 1;

    const detail = await conn.query(
      `SELECT ${LIGCDE_COLS.join(', ')} FROM LigCde WHERE NoInt_Ligcde = ${ligcdeId}`
    );

    const steps = await conn.query(
      `SELECT NoInt_interv, NoIntTechn, TypeCode, TypeLibelle, "Date", HeureInterv, Commentaire
       FROM Intervention WHERE NoIntLigcde = ${ligcdeId} ORDER BY NoInt_interv ASC`
    );

    const before = JSON.parse(fs.readFileSync(path.join(__dirname, '_snapshot-17478501-before.json'), 'utf8'));

    console.log('=== BEFORE vs AFTER: LigCde fields ===');
    const beforeLig = before.ligcde;
    const afterLig = detail[0];
    const allKeys = new Set([...Object.keys(beforeLig), ...Object.keys(afterLig)]);
    for (const key of allKeys) {
      const b = beforeLig[key];
      const a = afterLig[key];
      if (JSON.stringify(b) !== JSON.stringify(a)) {
        console.log(`  ${key}: ${JSON.stringify(b)} -> ${JSON.stringify(a)}`);
      }
    }
    console.log('\nisSoldee:', before.isSoldee, '->', isSoldee);

    console.log('\n=== Steps now (before had none) ===');
    steps.forEach(s => console.log(' -', JSON.stringify(s)));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
