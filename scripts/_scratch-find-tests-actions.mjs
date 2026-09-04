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
    // 1. Any table name hinting at "test"/"action"/"systematique"?
    const tables = await conn.query(
      `SELECT DISTINCT TABLE_NAME FROM _USER_COLUMNS WHERE TABLE_NAME LIKE '%est%' OR TABLE_NAME LIKE '%ction%' OR TABLE_NAME LIKE '%ystem%'`
    );
    console.log('=== Tables matching test/action/systeme ===');
    tables.forEach(t => console.log(' -', t.TABLE_NAME));

    // 2. Any column name across all tables hinting at this?
    const cols = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME FROM _USER_COLUMNS WHERE COLUMN_NAME LIKE '%Test%' OR COLUMN_NAME LIKE '%Action%' OR COLUMN_NAME LIKE '%Systematique%'`
    );
    console.log('\n=== Columns matching test/action/systematique ===');
    cols.forEach(c => console.log(' -', c.TABLE_NAME, c.COLUMN_NAME));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
