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

const JOBS = [39573, 39544, 39521, 39520, 39519, 39515, 39508, 39507, 39503, 39500, 39495, 39480, 39477, 39465, 39464];

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    for (const ligcde of JOBS) {
      const maxStep = await conn.query(
        `SELECT NoInt_interv, TypeCode FROM Intervention WHERE NoIntLigcde = ${ligcde} ORDER BY NoInt_interv DESC LIMIT 1`
      );
      const hasTests = await conn.query(`SELECT NoInt_LigCdeTest FROM Zebra_LigCdeTest WHERE NoInt_LigCde = ${ligcde} LIMIT 1`);
      const maxId = maxStep[0]?.NOINT_INTERV;
      const isBraxon = maxId != null && Number(maxId) >= 900000000;
      console.log(`ligcde=${ligcde} latest_step_id=${maxId} typecode=${maxStep[0]?.TYPECODE} isBraxonWritten=${isBraxon} has_test_rows=${hasTests.length > 0}`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
