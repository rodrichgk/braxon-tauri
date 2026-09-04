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
    console.log('--- Commande count for that id ---');
    const t1 = await conn.query(`SELECT NoInt_Cde FROM Commande WHERE NoInt_Cde = 34535`);
    console.log(JSON.stringify(t1, null, 2));
  } catch (e) { console.log('ERR t1', e.odbcErrors || e); }
  try {
    console.log('--- Commande, any row, top 3 ---');
    const t2 = await conn.query(`SELECT NoInt_Cde FROM Commande ORDER BY NoInt_Cde DESC LIMIT 3`);
    console.log(JSON.stringify(t2, null, 2));
  } catch (e) { console.log('ERR t2', e.odbcErrors || e); }
  try {
    console.log('--- Commande DateCommande for id ---');
    const t3 = await conn.query(`SELECT NoInt_Cde, DateCommande FROM Commande WHERE NoInt_Cde = 34535`);
    console.log(JSON.stringify(t3, null, 2));
  } catch (e) { console.log('ERR t3', e.odbcErrors || e); }
  await conn.close();
  process.exit(0);
}
