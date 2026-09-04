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

const SG_FIELDS = [
  'SGRAS', 'SGRefuseeAutreMotif', 'SGRefuseePanneDiff', 'SGConstructRefusee',
  'SGNonDemandée', 'AttRepCltSGRAS', 'ReponseCltSGRASOK', 'SGConstructeur',
  'RefusRASADLC', 'RefusGarantie',
];

async function probeBool(conn, ligcdeId, col) {
  try {
    const r = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde = ${ligcdeId} AND "${col}" = True`);
    return r.length > 0;
  } catch (e) {
    return `ERR: ${(e.odbcErrors || e)[0]?.message || e}`;
  }
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    // 1. Check these fields on our two known jobs first (ground truth).
    for (const noInterv of ['17456901', '17477701']) {
      const lig = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoIntervention = '${noInterv}'`);
      if (!lig.length) continue;
      const id = lig[0].NOINT_LIGCDE;
      console.log(`\n=== Job ${noInterv} (ligcde ${id}) ===`);
      for (const f of SG_FIELDS) {
        console.log(`  ${f}: ${await probeBool(conn, id, f)}`);
      }
    }

    // 2. Prevalence across the whole table for each field (WHERE-only, one
    // query per field — Boolean columns can never be SELECTed directly).
    console.log('\n=== Prevalence across all LigCde rows ===');
    for (const f of SG_FIELDS) {
      try {
        const r = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE "${f}" = True LIMIT 5000`);
        console.log(`  ${f}: ${r.length} rows (capped at 5000)`);
      } catch (e) {
        console.log(`  ${f}: ERR ${(e.odbcErrors || e)[0]?.message || e}`);
      }
    }

    // 3. Sample a few real SGRAS=true jobs to see their other context
    //    (Observations, RAS, Garantie, EchgeS) — is SGRAS a MORE specific
    //    signal than plain RAS for exactly the "warranty NFF" case?
    const sgrasRows = await conn.query(
      `SELECT NoInt_Ligcde, NoIntervention, Observations FROM LigCde WHERE "SGRAS" = True LIMIT 15`
    );
    console.log(`\n=== Sample of SGRAS=True jobs (${sgrasRows.length}) ===`);
    for (const r of sgrasRows) {
      const id = r.NOINT_LIGCDE;
      const ras = await probeBool(conn, id, 'RAS');
      const gar = await probeBool(conn, id, 'Garantie');
      const ech = await probeBool(conn, id, 'EchgeS');
      console.log(` - [${r.NOINTERVENTION}] RAS=${ras} Garantie=${gar} EchgeS=${ech} | "${(r.OBSERVATIONS || '').slice(0, 90)}"`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
