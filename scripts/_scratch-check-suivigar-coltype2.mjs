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
    for (const clause of [
      `WHERE SuiviGar_AncNoInterv <> '0'`,
      `WHERE SuiviGar_AncNoInterv <> ''`,
      `WHERE SuiviGar_AncNoInterv > '0'`,
    ]) {
      try {
        const r = await conn.query(`SELECT NoInt_Ligcde FROM LigCde ${clause} LIMIT 5`);
        console.log(`OK "${clause}" -> ${r.length} rows (sample)`, r.map(x => x.NOINT_LIGCDE));
      } catch (e) {
        console.log(`FAIL "${clause}":`, (e.odbcErrors || e)[0]?.message || e);
      }
    }

    // Full count with the working clause (fill in after seeing above).
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
