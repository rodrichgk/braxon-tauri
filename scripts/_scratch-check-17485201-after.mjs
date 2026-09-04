import net from 'net';
import odbc from 'odbc';
import fs from 'fs';

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

async function probeBool(conn, ligcdeId, col) {
  const r = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde = ${ligcdeId} AND "${col}" = True`);
  return r.length > 0;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const before = JSON.parse(fs.readFileSync('scripts/_scratch-snapshot-17485201-before.json', 'utf8'));
    const ligcdeId = before.ligcdeId;

    const lig = await conn.query(
      `SELECT l.NoInt_Ligcde, l.Type_Service, l."DernièreInterv", l.DateDernInterv, l.TechDernInterv, l.NomDernierTech
       FROM LigCde l WHERE l.NoInt_Ligcde = ${ligcdeId}`
    );
    console.log('Current LigCde state:', lig);

    const steps = await conn.query(
      `SELECT NoInt_interv, "Date", HeureInterv, NoIntTechn, TypeCode, TypeLibelle, Commentaire
       FROM Intervention WHERE NoIntLigcde = ${ligcdeId} ORDER BY NoInt_interv ASC`
    );
    console.log(`\nStep history (${steps.length} steps, was ${before.steps.length} before):`);
    steps.forEach(s => console.log(`  [${s.NOINT_INTERV}] ${s.DATE} ${s.HEUREINTERV} tech=${s.NOINTTECHN} ${s.TYPECODE} "${s.TYPELIBELLE}" -- ${s.COMMENTAIRE || ''}`));

    // Diff booleans against the snapshot.
    console.log('\n=== Boolean diff vs snapshot ===');
    for (const col of Object.keys(before.booleanSnapshot)) {
      const now = await probeBool(conn, ligcdeId, col);
      if (now !== before.booleanSnapshot[col]) {
        console.log(`  ${col}: ${before.booleanSnapshot[col]} -> ${now}`);
      }
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
