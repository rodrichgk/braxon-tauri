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

async function describeCols(conn, table) {
  const cols = await conn.query(`SELECT COLUMN_NAME, DATA_TYPE FROM _USER_COLUMNS WHERE TABLE_NAME = '${table}' ORDER BY COLUMN_NAME`);
  console.log(`\n[${table}] (${cols.length} cols)`);
  console.log(cols.map(c => `${c.COLUMN_NAME}(${c.DATA_TYPE})`).join('  '));
  return cols;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    await describeCols(conn, 'Accessoires');
    await describeCols(conn, 'AccessoireLigCdefr');
    await describeCols(conn, 'AccessPreCde');
    await describeCols(conn, 'E_AccessLigCde');

    // Try to find accessory rows tied to this specific ligcde (39677) or its NoIntervention (17490801)
    for (const table of ['Accessoires']) {
      try {
        const cols = await conn.query(`SELECT COLUMN_NAME FROM _USER_COLUMNS WHERE TABLE_NAME = '${table}'`);
        const colNames = cols.map(c => c.COLUMN_NAME);
        console.log(`\n${table} columns:`, colNames.join(', '));
      } catch (e) { console.log(`ERR describing ${table}`, e.odbcErrors || e); }
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
