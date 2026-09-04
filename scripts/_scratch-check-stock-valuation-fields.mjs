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

    const stillIn = await conn.query(`SELECT NoInt_Stock FROM Stock WHERE DateSortie IS NULL`);
    console.log('Stock rows with DateSortie IS NULL (still in stock?):', stillIn.length);

    const sample = await conn.query(`SELECT NoInt_Stock, CodeArt, PA, CoutVariable, DateSortie, Localisation FROM Stock LIMIT 20`);
    console.log('Sample rows:', JSON.stringify(sample.slice(0, 20), null, 2));

    const paStats = await conn.query(`SELECT NoInt_Stock, PA FROM Stock WHERE DateSortie IS NULL AND PA > 0`);
    console.log('Rows with DateSortie NULL and PA > 0:', paStats.length);
    const sumPa = paStats.reduce((s, r) => s + (parseFloat(r.PA) || 0), 0);
    console.log('Sum of PA for those rows:', sumPa);

    const cvStats = await conn.query(`SELECT NoInt_Stock, CoutVariable FROM Stock WHERE DateSortie IS NULL AND CoutVariable > 0`);
    console.log('Rows with DateSortie NULL and CoutVariable > 0:', cvStats.length);
    const sumCv = cvStats.reduce((s, r) => s + (parseFloat(r.COUTVARIABLE) || 0), 0);
    console.log('Sum of CoutVariable for those rows:', sumCv);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
