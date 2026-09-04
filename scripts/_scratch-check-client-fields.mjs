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
    const sample = await conn.query(`SELECT NoIntClt, Nom, Intitule, Ville, CP, Tel, e_mail FROM Client LIMIT 5`);
    console.log('Client sample:', JSON.stringify(sample, null, 2));
    const addrSample = await conn.query(`SELECT NoInt_clt, Adr1, Adr2, CP, Ville, NomContact FROM Clt_adrLivr LIMIT 5`);
    console.log('Clt_adrLivr sample:', JSON.stringify(addrSample, null, 2));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
