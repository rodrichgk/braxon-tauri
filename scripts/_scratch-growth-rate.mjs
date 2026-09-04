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
    // Earliest row still in the table (id-wise) and its date, to anchor overall age/rate.
    const earliest = await conn.query('SELECT NoInt_interv, "Date" FROM Intervention WHERE NoInt_interv > 0 ORDER BY NoInt_interv ASC LIMIT 1');
    console.log('Earliest row (lowest id):', earliest);

    // Current max (below BRAXON's range).
    const latest = await conn.query('SELECT NoInt_interv, "Date" FROM Intervention WHERE NoInt_interv < 900000000 ORDER BY NoInt_interv DESC LIMIT 1');
    console.log('Latest real 4D row:', latest);

    // A handful of anchor points spread across the id range to see the actual pace (not just endpoints).
    for (const target of [10000, 30000, 50000, 70000, 90000]) {
      const row = await conn.query(`SELECT NoInt_interv, "Date" FROM Intervention WHERE NoInt_interv >= ${target} ORDER BY NoInt_interv ASC LIMIT 1`);
      console.log(`First row with id >= ${target}:`, row[0] ? `${row[0].NOINT_INTERV} / ${row[0].DATE}` : 'none');
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
