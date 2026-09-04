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
      `SELECT l.CpteGeneral, l.MtNet, f.DateFacture
       FROM Lig_FactureFr l
       LEFT JOIN FactureFr f ON l.NoIntFactureFr = f.NoIntFactureFr
       WHERE f.DateFacture BETWEEN '${fromYmd}' AND '${toYmdStr}'
       LIMIT 30000`
    );
    console.log(`Matched lines in window: ${rows.length}`);

    let cogs = 0, externalCharges = 0, capex = 0, other = 0;
    const byPrefix = new Map();
    for (const r of rows) {
      const acct = (r.CPTEGENERAL || '').trim();
      const amt = parseFloat(r.MTNET) || 0;
      const prefix = acct.slice(0, 2);
      byPrefix.set(prefix, (byPrefix.get(prefix) || 0) + amt);
      if (prefix === '60') cogs += amt;
      else if (prefix === '61' || prefix === '62') externalCharges += amt;
      else if (prefix === '21') capex += amt;
      else other += amt;
    }
    console.log(`\nCOGS (60x, achats): ${cogs.toFixed(2)}`);
    console.log(`External charges (61x+62x): ${externalCharges.toFixed(2)}`);
    console.log(`Capex (21x, immobilisations - excluded from opex): ${capex.toFixed(2)}`);
    console.log(`Other/unclassified: ${other.toFixed(2)}`);
    console.log(`\nBy 2-digit prefix:`);
    for (const [p, sum] of [...byPrefix.entries()].sort((a,b) => b[1]-a[1])) {
      console.log(`  ${p || '(blank)'}: ${sum.toFixed(2)}`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
