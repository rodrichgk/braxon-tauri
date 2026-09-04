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
    const rows = await conn.query(
      `SELECT CpteGeneral, MtNet FROM Lig_FactureFr WHERE CpteGeneral IS NOT NULL LIMIT 20000`
    );
    console.log(`Rows with CpteGeneral: ${rows.length}`);
    const byAccount = new Map();
    for (const r of rows) {
      const acct = (r.CPTEGENERAL || '(blank)').trim() || '(blank)';
      const amt = parseFloat(r.MTNET) || 0;
      const cur = byAccount.get(acct) || { count: 0, sum: 0 };
      cur.count++;
      cur.sum += amt;
      byAccount.set(acct, cur);
    }
    const sorted = [...byAccount.entries()].sort((a, b) => b[1].sum - a[1].sum);
    console.log('Account | Count | Sum MtNet');
    for (const [acct, v] of sorted.slice(0, 30)) {
      console.log(`${acct} | ${v.count} | ${v.sum.toFixed(2)}`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
