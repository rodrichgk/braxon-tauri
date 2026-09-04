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
    console.log('--- without Soldée, without join ---');
    const t1 = await conn.query(`SELECT NoIntervention, NoInt_cde, CodeArt FROM LigCde WHERE NoInt_Ligcde = 35124`);
    console.log(JSON.stringify(t1, null, 2));
  } catch (e) { console.log('ERR t1', e.odbcErrors || e); }
  try {
    console.log('--- with join, without Soldée ---');
    const t2 = await conn.query(`SELECT l.NoIntervention, l.NoInt_cde, l.CodeArt, c.NoIntClt FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde WHERE l.NoInt_Ligcde = 35124`);
    console.log(JSON.stringify(t2, null, 2));
  } catch (e) { console.log('ERR t2', e.odbcErrors || e); }
  try {
    console.log('--- with Soldée alone ---');
    const t3 = await conn.query(`SELECT NoIntervention, "Soldée" FROM LigCde WHERE NoInt_Ligcde = 35124`);
    console.log(JSON.stringify(t3, null, 2));
  } catch (e) { console.log('ERR t3', e.odbcErrors || e); }
  await conn.close();
  process.exit(0);
}
