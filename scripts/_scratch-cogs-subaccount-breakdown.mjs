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
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 365);
    const fromYmd = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    const toYmdStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    console.log(`Window: ${fromYmd} to ${toYmdStr}`);

    const rows = await conn.query(
      `SELECT l.CpteGeneral, l.MtNet, l.CodeArt, l.LibelleArt
       FROM Lig_FactureFr l
       LEFT JOIN FactureFr f ON l.NoIntFactureFr = f.NoIntFactureFr
       WHERE f.DateFacture BETWEEN '${fromYmd}' AND '${toYmdStr}'
       LIMIT 30000`
    );
    console.log(`Matched lines: ${rows.length}`);

    const byAccount = new Map();
    for (const r of rows) {
      const acct = (r.CPTEGENERAL || '').trim();
      if (!acct.startsWith('60')) continue;
      const amt = parseFloat(r.MTNET) || 0;
      const cur = byAccount.get(acct) || { count: 0, sum: 0 };
      cur.count++;
      cur.sum += amt;
      byAccount.set(acct, cur);
    }
    const sorted = [...byAccount.entries()].sort((a, b) => b[1].sum - a[1].sum);
    console.log('\n60x sub-accounts, properly dated:');
    console.log('Account | Count | Sum MtNet');
    for (const [acct, v] of sorted) {
      console.log(`${acct} | ${v.count} | ${v.sum.toFixed(2)}`);
    }

    // Sample the biggest sub-account's line items to see what's actually being bought
    const topAccount = sorted[0][0];
    const sampleLines = rows.filter(r => (r.CPTEGENERAL || '').trim() === topAccount).slice(0, 15);
    console.log(`\nSample lines for top account ${topAccount}:`);
    for (const r of sampleLines) {
      console.log(`  ${r.CODEART || '(no code)'} | ${r.LIBELLEART || '(no label)'} | ${r.MTNET}`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
