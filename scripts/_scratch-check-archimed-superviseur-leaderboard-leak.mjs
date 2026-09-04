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
    const from = '2026-07-07';
    const to = '2026-08-06';
    for (const [id, label] of [['3389', 'Archimed Saïd'], ['2403', 'Superviseur']]) {
      const rows = await conn.query(
        `SELECT NoIntLigcde, TypeCode, "Date" FROM Intervention
         WHERE NoIntTechn = ${id} AND "Date" BETWEEN '${from}' AND '${to}'`
      );
      const distinctJobs = new Set(rows.map(r => r.NOINTLIGCDE));
      const byType = new Map();
      for (const r of rows) byType.set(r.TYPECODE, (byType.get(r.TYPECODE) || 0) + 1);
      console.log(`\n=== ${label} (id ${id}), ${from}..${to} ===`);
      console.log(`  Intervention rows: ${rows.length}, distinct jobs (would-be "units"): ${distinctJobs.size}`);
      console.log(`  TypeCode breakdown:`, Object.fromEntries(byType));
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
