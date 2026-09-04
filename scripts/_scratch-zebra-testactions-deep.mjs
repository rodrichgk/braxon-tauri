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

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    // 1. Full Zebra_CategTest contents (categories).
    const cats = await conn.query(`SELECT NoInt_CategTest, LibCategTest FROM Zebra_CategTest ORDER BY NoInt_CategTest`);
    console.log('=== Zebra_CategTest (all categories) ===');
    cats.forEach(c => console.log(' -', c.NOINT_CATEGTEST, c.LIBCATEGTEST));

    // 2. Distinct params ever selected, reconstructing the reference list.
    const params = await conn.query(
      `SELECT DISTINCT NoInt_ParamTest, LibParamTest FROM Zebra_LigCdeTest ORDER BY NoInt_ParamTest LIMIT 200`
    );
    console.log(`\n=== Distinct NoInt_ParamTest/LibParamTest ever selected (${params.length}) ===`);
    params.forEach(p => console.log(' -', p.NOINT_PARAMTEST, p.LIBPARAMTEST));

    // 3. ZebraParamTest_CategTest sample, to see param<->category mapping.
    const mapping = await conn.query(`SELECT NoInt_CategTest, NoInt_ParamTest FROM ZebraParamTest_CategTest ORDER BY NoInt_ParamTest LIMIT 200`);
    console.log(`\n=== ZebraParamTest_CategTest mapping (${mapping.length}) ===`);
    mapping.forEach(m => console.log(' -', 'param', m.NOINT_PARAMTEST, '-> categ', m.NOINT_CATEGTEST));

    // 4. Job 17478401 (LE RELAIS MARMANDAIS, marked Repaired) — does it have Zebra_LigCdeTest rows?
    const lig = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoIntervention = '17478401'`);
    if (lig.length) {
      const ligcdeId = lig[0].NOINT_LIGCDE;
      console.log(`\n=== Job 17478401 (ligcde=${ligcdeId}) Zebra_LigCdeTest rows ===`);
      const rows = await conn.query(`SELECT NoInt_LigCdeTest, NoInt_ParamTest, LibParamTest FROM Zebra_LigCdeTest WHERE NoInt_LigCde = ${ligcdeId}`);
      console.log(rows.length ? rows : '(none found)');
    } else {
      console.log('\nJob 17478401 not found');
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
