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
      `SELECT l.NoInt_Ligcde, l.NoIntervention, l.PrixHT, l.Remise, c.MtHT_Lignes, i.TypeCode
       FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
       WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '2026-03-09' AND '2026-03-13' AND c.StatutDossier = 'EXPEDIE'
       ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC LIMIT 20000`
    );
    const seen = new Set();
    const jobs = [];
    for (const r of rows) {
      if (seen.has(r.NOINT_LIGCDE)) continue;
      seen.add(r.NOINT_LIGCDE);
      if (r.TYPECODE === 'REE') continue;
      jobs.push(r);
    }
    console.log('Jobs:', jobs.length);

    let sumMtHtLignes = 0, sumPrixHtMinusRemise = 0, sumPrixHt = 0, sumRemise = 0;
    let mismatches = 0;
    for (const j of jobs) {
      const mt = parseFloat(j.MTHT_LIGNES) || 0;
      const prix = parseFloat(j.PRIXHT) || 0;
      const remise = parseFloat(j.REMISE) || 0;
      sumMtHtLignes += mt;
      sumPrixHt += prix;
      sumRemise += remise;
      sumPrixHtMinusRemise += (prix - remise);
      if (Math.abs(mt - prix) > 0.01) {
        mismatches++;
        if (mismatches <= 10) {
          console.log(`  ${j.NOINTERVENTION}: MtHT_Lignes=${mt} PrixHT=${prix} Remise=${remise} (PrixHT-Remise=${(prix-remise).toFixed(1)})`);
        }
      }
    }
    console.log('\nSum MtHT_Lignes (Commande):', sumMtHtLignes.toFixed(1));
    console.log('Sum PrixHT (LigCde line):', sumPrixHt.toFixed(1));
    console.log('Sum Remise (LigCde line):', sumRemise.toFixed(1));
    console.log('Sum PrixHT - Remise:', sumPrixHtMinusRemise.toFixed(1));
    console.log('Real report (S11): 28201.0');
    console.log('Rows where MtHT_Lignes != PrixHT:', mismatches, '/', jobs.length);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
