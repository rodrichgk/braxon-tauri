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
  if (err.code === 'EADDRINUSE') {
    console.log('Proxy already running elsewhere, using it directly.');
    await main();
  } else {
    console.error('Proxy error:', err);
    process.exit(1);
  }
});

server.listen(PROXY_PORT, '127.0.0.1', async () => {
  console.log('Local proxy up on', PROXY_PORT);
  await main();
});

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const max = await conn.query('SELECT NoInt_interv FROM Intervention ORDER BY NoInt_interv DESC LIMIT 1');
    console.log('Current real MAX(NoInt_interv):', max[0].NOINT_INTERV);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
