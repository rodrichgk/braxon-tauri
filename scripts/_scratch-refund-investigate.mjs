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
    // 1. Any table name hinting at refunds/credit notes?
    const tables = await conn.query(
      `SELECT DISTINCT TABLE_NAME FROM _USER_COLUMNS WHERE TABLE_NAME LIKE '%voir%' OR TABLE_NAME LIKE '%efund%' OR TABLE_NAME LIKE '%embour%' OR TABLE_NAME LIKE '%redit%' OR TABLE_NAME LIKE '%Avoir%'`
    );
    console.log('=== Tables matching avoir/refund/credit ===');
    tables.forEach(t => console.log(' -', t.TABLE_NAME));

    // 2. Any Commande or LigCde columns hinting at refund/avoir?
    const cols = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME FROM _USER_COLUMNS WHERE (TABLE_NAME = 'Commande' OR TABLE_NAME = 'LigCde') AND (COLUMN_NAME LIKE '%voir%' OR COLUMN_NAME LIKE '%efund%' OR COLUMN_NAME LIKE '%embour%' OR COLUMN_NAME LIKE '%redit%' OR COLUMN_NAME LIKE '%Annul%')`
    );
    console.log('\n=== Commande/LigCde columns matching avoir/refund/credit/annulation ===');
    cols.forEach(c => console.log(' -', c.TABLE_NAME, c.COLUMN_NAME));

    // 3. Negative amounts in our July cohort?
    const negRows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoInt_cde, l.NoIntervention, c.MtHT_Lignes, c.TotalTTC
       FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '2026-07-01' AND '2026-07-31'
       ORDER BY l.NoInt_Ligcde DESC LIMIT 20000`
    );
    const negatives = negRows.filter(r => {
      const v = parseFloat(r.MTHT_LIGNES);
      return !isNaN(v) && v < 0;
    });
    console.log(`\n=== Negative MtHT_Lignes rows in July cohort (out of ${negRows.length}) ===`);
    negatives.forEach(r => console.log(' -', r.NOINTERVENTION, 'MtHT_Lignes=' + r.MTHT_LIGNES, 'TotalTTC=' + r.TOTALTTC));
    console.log('Count:', negatives.length);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
