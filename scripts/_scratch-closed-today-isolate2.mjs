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

async function tryQuery(label, sql) {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const rows = await conn.query(sql);
    console.log(`OK  ${label}: ${rows.length} rows`);
  } catch (e) {
    console.log(`ERR ${label}:`, JSON.stringify(e.odbcErrors || e));
  } finally {
    await conn.close();
  }
}

async function main() {
  await tryQuery('Soldee only', `SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = True LIMIT 5`);
  await tryQuery('Soldee + DateDernInterv LIKE', `SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = True AND DateDernInterv LIKE '27/08/2026%' LIMIT 5`);
  await tryQuery('Soldee + NomClient', `SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = True AND NomClient <> '' LIMIT 5`);
  await tryQuery('DateDernInterv LIKE only (no Soldee)', `SELECT NoInt_Ligcde FROM LigCde WHERE DateDernInterv LIKE '27/08/2026%' LIMIT 5`);
  await tryQuery('Soldee + DateDernInterv LIKE + NomClient', `SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = True AND DateDernInterv LIKE '27/08/2026%' AND NomClient <> '' LIMIT 5`);
  process.exit(0);
}
