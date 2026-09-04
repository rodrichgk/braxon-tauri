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
    for (const d of ['08/08/2026', '09/08/2026']) {
      const rows = await conn.query(
        `SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = True AND DateDernInterv = '${d}' LIMIT 20`
      );
      console.log(`Closed on ${d}: ${rows.length}`);
      const steps = await conn.query(`SELECT NoInt_interv FROM Intervention WHERE "Date" = '${d.split('/').reverse().join('-')}' LIMIT 20`);
      console.log(`  Any Intervention steps logged that day: ${steps.length}`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
