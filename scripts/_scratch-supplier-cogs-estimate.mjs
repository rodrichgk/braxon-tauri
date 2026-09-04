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

function toYmd(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 365);
    const fromYmd = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    const toYmdStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    console.log(`Window: DateFacture BETWEEN ${fromYmd} AND ${toYmdStr}`);

    const total = await conn.query(`SELECT NoIntFactureFr FROM FactureFr`);
    console.log('Total FactureFr rows (all time):', total.length);

    // Avoir is Boolean - can't SELECT it directly, only filter via WHERE.
    const invoicesOnly = await conn.query(
      `SELECT NoIntFactureFr, MtHT, DateFacture FROM FactureFr WHERE DateFacture BETWEEN '${fromYmd}' AND '${toYmdStr}' AND Avoir = False`
    );
    console.log(`Non-avoir (real invoice) rows in window: ${invoicesOnly.length}`);
    let sumHT = 0;
    for (const r of invoicesOnly) {
      const v = parseFloat(r.MTHT);
      if (!Number.isNaN(v)) sumHT += v;
    }
    console.log(`Sum MtHT (invoices, non-avoir): ${sumHT.toFixed(2)}`);

    const avoirRows = await conn.query(
      `SELECT NoIntFactureFr, MtHT, DateFacture FROM FactureFr WHERE DateFacture BETWEEN '${fromYmd}' AND '${toYmdStr}' AND Avoir = True`
    );
    console.log(`Avoir (credit note) rows in window: ${avoirRows.length}`);
    let sumAvoirHT = 0;
    for (const r of avoirRows) {
      const v = parseFloat(r.MTHT);
      if (!Number.isNaN(v)) sumAvoirHT += v;
    }
    console.log(`Sum MtHT (avoir/credit notes): ${sumAvoirHT.toFixed(2)}`);
    console.log(`Net supplier cost (invoices - avoir): ${(sumHT - sumAvoirHT).toFixed(2)}`);

    // Sanity: sample a few rows to eyeball plausibility
    console.log('\nSample rows:', JSON.stringify(invoicesOnly.slice(0, 5), null, 2));

    // Also check the full DateFacture range available, to know if this table is populated recently
    const range = await conn.query(`SELECT MIN(DateFacture) as mn FROM FactureFr WHERE DateFacture IS NOT NULL`);
    console.log('\n(min query may fail as aggregate - ignore if errors)');
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
