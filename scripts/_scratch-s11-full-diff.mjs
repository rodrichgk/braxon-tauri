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
      `SELECT l.NoInt_Ligcde, l.NoIntervention, l.Famille, c.MtHT_Lignes, i.TypeCode, l.DateDernInterv, c.StatutDossier
       FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
       WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '2026-03-09' AND '2026-03-13'
       ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC LIMIT 20000`
    );
    const seen = new Set();
    const jobs = [];
    for (const r of rows) {
      if (seen.has(r.NOINT_LIGCDE)) continue;
      seen.add(r.NOINT_LIGCDE);
      jobs.push(r);
    }
    console.log('All Soldée=True jobs closing Mon-Fri 09-13 March (any StatutDossier):', jobs.length);

    const expedie = jobs.filter(j => j.STATUTDOSSIER === 'EXPEDIE');
    const notExpedie = jobs.filter(j => j.STATUTDOSSIER !== 'EXPEDIE');
    console.log('EXPEDIE:', expedie.length, '| not EXPEDIE:', notExpedie.length, notExpedie.map(j => `${j.NOINTERVENTION}(${j.STATUTDOSSIER})`));

    const notREE = expedie.filter(j => j.TYPECODE !== 'REE');
    const ree = expedie.filter(j => j.TYPECODE === 'REE');
    console.log('\nEXPEDIE + not REE (our "réparation client" count):', notREE.length, '  (real report: 124)');
    console.log('REE jobs:', ree.length, ree.map(j => j.NOINTERVENTION), '  (real report RT: 2)');

    const sum = notREE.reduce((s, j) => s + (parseFloat(j.MTHT_LIGNES) || 0), 0);
    console.log('\nSum HT (our montant):', sum.toFixed(1), '  (real report: 28201.0)');
    console.log('Diff:', (sum - 28201.0).toFixed(1));

    console.log('\n=== Full job list ===');
    notREE
      .sort((a, b) => (a.NOINTERVENTION || '').localeCompare(b.NOINTERVENTION || ''))
      .forEach(j => console.log(`  ${j.NOINTERVENTION} famille=${j.FAMILLE} typecode=${j.TYPECODE} HT=${j.MTHT_LIGNES} date=${j.DATEDERNINTERV}`));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
