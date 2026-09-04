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
    // Everything Soldée=True closing in this window, regardless of
    // StatutDossier or TypeCode, so we can see what we're excluding too.
    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoIntervention, l.Famille, c.MtHT_Lignes, i.TypeCode, l.DateDernInterv, c.StatutDossier, l.Type_Service
       FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
       WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '2026-05-04' AND '2026-05-07'
       ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC LIMIT 20000`
    );
    const seen = new Set();
    const jobs = [];
    for (const r of rows) {
      if (seen.has(r.NOINT_LIGCDE)) continue;
      seen.add(r.NOINT_LIGCDE);
      jobs.push(r);
    }
    console.log('All Soldée=True jobs (any status), count:', jobs.length);
    jobs
      .sort((a, b) => (a.NOINTERVENTION || '').localeCompare(b.NOINTERVENTION || ''))
      .forEach(j => console.log(`  ${j.NOINTERVENTION} famille=${j.FAMILLE} service=${j.TYPE_SERVICE} typecode=${j.TYPECODE} statut=${j.STATUTDOSSIER} HT=${j.MTHT_LIGNES} date=${j.DATEDERNINTERV}`));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
