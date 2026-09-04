import net from 'net';
import odbc from 'odbc';

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
    const lig = await conn.query(
      `SELECT NoInt_Ligcde, NomClient, CodeArt, LibelleArt, DateDernInterv, "DernièreInterv", SuiviGar_AncNoInterv, NoBL, TechDernInterv, NomDernierTech, Observations
       FROM LigCde WHERE NoIntervention = '17456901'`
    );
    console.log('Job 17456901:', lig);
    if (!lig.length) { console.log('Not found'); return; }
    const ligcdeId = lig[0].NOINT_LIGCDE;

    console.log('\n=== Key outcome/status booleans ===');
    for (const col of ['Soldée', 'RAS', 'ND', 'Réparation', 'Vente', 'EchgeS', 'Garantie']) {
      console.log(`  ${col}: ${await probeBool(conn, ligcdeId, col)}`);
    }

    console.log('\n=== Intervention step history ===');
    const steps = await conn.query(
      `SELECT NoInt_interv, "Date", HeureInterv, NoIntTechn, TypeCode, TypeLibelle, Commentaire
       FROM Intervention WHERE NoIntLigcde = ${ligcdeId} ORDER BY NoInt_interv ASC`
    );
    steps.forEach(s => console.log(`  [${s.NOINT_INTERV}] ${s.DATE} ${s.HEUREINTERV} tech=${s.NOINTTECHN} ${s.TYPECODE} "${s.TYPELIBELLE}" -- ${s.COMMENTAIRE || ''}`));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
