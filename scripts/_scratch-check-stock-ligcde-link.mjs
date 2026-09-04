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
    const total = await conn.query(`SELECT NoInt_Stock FROM Stock`);
    console.log('Total Stock rows:', total.length);

    const linked = await conn.query(`SELECT NoInt_Stock FROM Stock WHERE NoIntLigCdeVte > 0`);
    console.log('Stock rows with NoIntLigCdeVte > 0:', linked.length);

    const sample = await conn.query(`SELECT NoInt_Stock, CodeArt, PA, CoutVariable, NoIntLigCdeVte, DateSortie FROM Stock WHERE NoIntLigCdeVte > 0 LIMIT 10`);
    console.log('Sample linked rows:', JSON.stringify(sample, null, 2));

    // Check: do these NoIntLigCdeVte values actually resolve to real LigCde rows?
    if (linked.length > 0) {
      const ids = sample.map(r => r.NOINTLIGCDEVTE).filter(Boolean);
      if (ids.length) {
        const resolved = await conn.query(`SELECT NoInt_Ligcde, NoIntervention, "Soldée", DateDernInterv FROM LigCde WHERE NoInt_Ligcde IN (${ids.join(',')})`);
        console.log('Resolved LigCde rows for those stock links:', JSON.stringify(resolved, null, 2));
      }
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
