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
      `SELECT l.NoInt_Ligcde, l.NoIntervention, l.Famille, l.CodeArt, c.MtHT_Lignes, i.TypeCode, l.DateDernInterv
       FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
       WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '2026-03-01' AND '2026-03-31' AND c.StatutDossier = 'EXPEDIE'
       ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC LIMIT 20000`
    );
    const seen = new Set();
    const jobs = [];
    for (const r of rows) {
      if (seen.has(r.NOINT_LIGCDE)) continue;
      seen.add(r.NOINT_LIGCDE);
      if (r.TYPECODE === 'REE') continue;
      const v = parseFloat(r.MTHT_LIGNES);
      jobs.push({ ...r, ht: isNaN(v) ? 0 : v });
    }
    jobs.sort((a, b) => b.ht - a.ht);
    console.log('Total counted jobs:', jobs.length);
    console.log('Sum:', jobs.reduce((s, j) => s + j.ht, 0).toFixed(1));
    console.log('\nTop 20 highest-value jobs:');
    jobs.slice(0, 20).forEach(j => {
      console.log(`  ${j.NOINTERVENTION} ligcde=${j.NOINT_LIGCDE} famille=${j.FAMILLE} art=${j.CODEART} typecode=${j.TYPECODE} HT=${j.ht} date=${j.DATEDERNINTERV}`);
    });

    // Compare against typical PMP (report says 241.0€ avg for March)
    const above1000 = jobs.filter(j => j.ht > 1000);
    console.log(`\nJobs with HT > 1000€ (way above 241€ avg): ${above1000.length}, sum = ${above1000.reduce((s,j)=>s+j.ht,0).toFixed(1)}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
