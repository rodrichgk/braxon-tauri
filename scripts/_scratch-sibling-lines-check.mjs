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
    const march = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoInt_cde, l.NoIntervention, c.MtHT_Lignes
       FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
       WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '2026-03-01' AND '2026-03-31' AND c.StatutDossier = 'EXPEDIE'
       ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC LIMIT 20000`
    );
    // Dedup by ligcde (approx, ignoring REE for this check)
    const seenLigcde = new Set();
    const jobs = [];
    for (const r of march) {
      if (seenLigcde.has(r.NOINT_LIGCDE)) continue;
      seenLigcde.add(r.NOINT_LIGCDE);
      jobs.push(r);
    }
    console.log('March cohort jobs:', jobs.length);

    // For each distinct Commande in this cohort, count ALL LigCde rows
    // anywhere in the whole table sharing that Commande (any status/date).
    let checked = 0;
    let withSiblings = 0;
    const siblingExamples = [];
    for (const j of jobs) {
      const cde = j.NOINT_CDE;
      if (cde == null) continue;
      checked++;
      const siblings = await conn.query(`SELECT NoInt_Ligcde, NoIntervention FROM LigCde WHERE NoInt_cde = ${cde}`);
      if (siblings.length > 1) {
        withSiblings++;
        if (siblingExamples.length < 15) {
          siblingExamples.push({ cde, ht: j.MTHT_LIGNES, ourLigcde: j.NOINT_LIGCDE, ourRef: j.NOINTERVENTION, siblings: siblings.map(s => `${s.NOINT_LIGCDE}(${s.NOINTERVENTION})`) });
        }
      }
    }
    console.log(`Checked ${checked} Commande ids. ${withSiblings} have >1 LigCde line ANYWHERE in the table (not just in our March cohort).`);
    console.log('\nExamples:');
    siblingExamples.forEach(e => console.log(`  Commande ${e.cde} (HT=${e.ht}): our job=${e.ourLigcde}(${e.ourRef}), all siblings=${e.siblings.join(', ')}`));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
