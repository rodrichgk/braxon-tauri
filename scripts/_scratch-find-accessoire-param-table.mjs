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
    const cols = await conn.query(`SELECT TABLE_NAME, COLUMN_NAME FROM _USER_COLUMNS WHERE COLUMN_NAME LIKE '%NoIntParam%' OR COLUMN_NAME LIKE '%Param%'`);
    const byTable = new Map();
    for (const c of cols) {
      const arr = byTable.get(c.TABLE_NAME) || [];
      arr.push(c.COLUMN_NAME);
      byTable.set(c.TABLE_NAME, arr);
    }
    for (const [t, names] of byTable) {
      console.log(t, ':', names.join(', '));
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
