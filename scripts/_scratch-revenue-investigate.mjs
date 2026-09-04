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
    // 1. Full column lists, hunting for a "closed/shipped" date candidate.
    const ligcdeCols = await conn.query(
      `SELECT COLUMN_NAME FROM _USER_COLUMNS WHERE TABLE_NAME = 'LigCde' AND COLUMN_NAME LIKE '%ate%' ORDER BY COLUMN_NAME`
    );
    console.log('=== LigCde date-ish columns ===');
    ligcdeCols.forEach(c => console.log(' -', c.COLUMN_NAME));

    const commandeCols = await conn.query(
      `SELECT COLUMN_NAME FROM _USER_COLUMNS WHERE TABLE_NAME = 'Commande' AND COLUMN_NAME LIKE '%ate%' ORDER BY COLUMN_NAME`
    );
    console.log('\n=== Commande date-ish columns ===');
    commandeCols.forEach(c => console.log(' -', c.COLUMN_NAME));

    // 2. Cardinality: does one Commande have multiple LigCde lines?
    const sample = await conn.query(
      `SELECT NoInt_cde, NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde > 39000 ORDER BY NoInt_Ligcde DESC LIMIT 2000`
    );
    const byCde = new Map();
    for (const r of sample) {
      const cde = r.NOINT_CDE;
      if (cde == null) continue;
      byCde.set(cde, (byCde.get(cde) || 0) + 1);
    }
    const multi = [...byCde.entries()].filter(([, n]) => n > 1);
    console.log(`\n=== Commande cardinality (2000 recent LigCde rows) ===`);
    console.log('Distinct Commande ids:', byCde.size, '/ rows:', sample.length);
    console.log('Commande ids with >1 LigCde line:', multi.length, multi.slice(0, 5));

    // 3. Subcontractor-outcome closed jobs: what does TotalTTC look like?
    const subRows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoIntervention, i.TypeCode, c.TotalTTC, c.MtHT_Total
       FROM LigCde l
       LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l."Soldée" = True AND i.TypeCode IN ('VST','RST','RSTNF','RSTND')
       ORDER BY l.NoInt_Ligcde DESC LIMIT 15`
    );
    console.log('\n=== Sample closed subcontractor-outcome jobs (latest Intervention row per, unfiltered so may repeat per job) ===');
    subRows.forEach(r => console.log(' -', r.NOINTERVENTION, r.TYPECODE, 'TotalTTC=' + r.TOTALTTC, 'MtHT_Total=' + r.MTHT_TOTAL));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
