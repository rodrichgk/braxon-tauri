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
    const tables = await conn.query(
      `SELECT DISTINCT TABLE_NAME FROM _USER_COLUMNS WHERE TABLE_NAME LIKE '%ParamTest%'`
    );
    console.log('=== Tables matching ParamTest ===');
    tables.forEach(t => console.log(' -', t.TABLE_NAME));

    // Full table list, in case naming is totally different — scan for
    // anything plausible.
    const allTables = await conn.query(`SELECT DISTINCT TABLE_NAME FROM _USER_COLUMNS ORDER BY TABLE_NAME`);
    console.log(`\n=== All ${allTables.length} table names (for manual scan) ===`);
    allTables.forEach(t => console.log(' -', t.TABLE_NAME));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
