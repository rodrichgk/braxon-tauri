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
    const variants = ['MOSFET', 'Mosfet', 'mosfet', 'MosFET', 'TRANSISTOR', 'Transistor', 'transistor', 'transitor', 'Transitor'];
    const clause = variants.map(v => `Commentaire LIKE '%${v}%'`).join(' OR ');
    const rows = await conn.query(`SELECT NoIntLigcde, Commentaire FROM Intervention WHERE ${clause} LIMIT 2000`);
    console.log(`Case-corrected total Intervention.Commentaire matches: ${rows.length}`);
    console.log(`Distinct jobs: ${new Set(rows.map(r => r.NOINTLIGCDE)).size}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
