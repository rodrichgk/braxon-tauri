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
    const withStock = await conn.query(
      `SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = False AND Type_Service IN ('100','101','102','103') LIMIT 5000`
    );
    const withoutStock = await conn.query(
      `SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = False AND Type_Service IN ('100','101','102','103') AND NomClient <> '' LIMIT 5000`
    );
    console.log(`Open bench rows including stock jobs: ${withStock.length}`);
    console.log(`Open bench rows excluding stock jobs: ${withoutStock.length}`);
    console.log(`Currently-open stock-processing jobs: ${withStock.length - withoutStock.length}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
