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
    // Does DateDernInterv accept the same ISO BETWEEN comparison DateCommande does?
    const sql = `SELECT l.NoInt_Ligcde, l.NoIntervention, l.DateDernInterv, l.TechDernInterv, l.NomDernierTech
       FROM LigCde l
       WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '2026-08-06' AND '2026-08-06'
         AND l.TechDernInterv = 3569
       LIMIT 20`;
    const rows = await conn.query(sql);
    console.log(`Closed today (DateDernInterv BETWEEN, tech 3569 = Gabhy Kiba): ${rows.length} rows`);
    rows.forEach(r => console.log(` - [${r.NOINTERVENTION}] DateDernInterv=${r.DATEDERNINTERV} tech=${r.NOMDERNIERTECH}`));

    // Same query but scoped by the OLD (wrong) DateCommande field, for comparison.
    const sqlOld = `SELECT l.NoInt_Ligcde, l.NoIntervention, c.DateCommande
       FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l."Soldée" = True AND c.DateCommande BETWEEN '2026-08-06' AND '2026-08-06'
         AND l.TechDernInterv = 3569
       LIMIT 20`;
    const rowsOld = await conn.query(sqlOld);
    console.log(`\nOld behavior (DateCommande BETWEEN, tech 3569): ${rowsOld.length} rows`);

    // Prevalence of NULL DateDernInterv across all LigCde rows.
    const nullCount = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE DateDernInterv IS NULL LIMIT 5000`);
    const total = await conn.query(`SELECT NoInt_Ligcde FROM LigCde LIMIT 5000`);
    console.log(`\nNULL DateDernInterv (capped at 5000): ${nullCount.length} of ${total.length} sampled rows`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
