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
    // All param ids ever linked to category 2 ("Cat tests & actions 101").
    const catParams = await conn.query(
      `SELECT NoInt_ParamTest FROM ZebraParamTest_CategTest WHERE NoInt_CategTest = 2`
    );
    const paramIds = catParams.map(r => r.NOINT_PARAMTEST);
    console.log(`Category 101 (id=2) has ${paramIds.length} linked param ids:`, paramIds.sort((a, b) => a - b));

    // For each, every distinct label ever recorded, plus how many times used
    // (a rough proxy for "still the current one" — more recent/heavily used
    // labels are more likely to be current).
    console.log('\n=== Label history per param id ===');
    for (const pid of paramIds.sort((a, b) => a - b)) {
      const labels = await conn.query(
        `SELECT LibParamTest, COUNT(NoInt_LigCdeTest) as cnt FROM Zebra_LigCdeTest WHERE NoInt_ParamTest = ${pid} GROUP BY LibParamTest`
      );
      console.log(`  id=${pid}:`, labels.map(l => `"${l.LIBPARAMTEST}" x${l.CNT}`).join(' | ') || '(never used)');
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
