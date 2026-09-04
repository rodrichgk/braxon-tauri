// Investigates "17446801 is assigned to Nicolas Paoli but I can't see it
// from BRAXON" (2026-09-01). Found: Commande.Representant is a 2-3 letter
// staff-initials code, a genuinely different concept from
// LigCde.TechDernInterv (who did the *last actual step*) — this job's
// Representant was "NP" while every Intervention row on it was logged
// under a completely different technician (it had been transferred to
// Service Commercial). Cross-checked against Salarie to resolve "NP" to
// "Nicolas Paoli" with certainty. See representant_name's doc comment in
// reman.rs for the handful of other codes resolved the same way, and why
// the rest are deliberately left unresolved rather than guessed.
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
  if (err.code === 'EADDRINUSE') {
    await main();
  } else {
    console.error('Proxy error:', err);
    process.exit(1);
  }
});

server.listen(PROXY_PORT, '127.0.0.1', async () => {
  await main();
});

async function query(conn, sql, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rows = await conn.query(sql);
      console.log(`=== ${label} (${rows.length}) ===`);
      console.log(JSON.stringify(rows, null, 2));
      return rows;
    } catch (e) {
      console.log(`retry ${attempt} for ${label}:`, e.odbcErrors?.[0]?.message || e.message);
      await new Promise(r => setTimeout(r, 400));
    }
  }
  console.log(`FAILED after retries: ${label}`);
  return null;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const job = await query(
      conn,
      `SELECT l.NoInt_Ligcde, l.NoIntervention, l."DernièreInterv", l.TechDernInterv, c.Representant
       FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l.NoIntervention = '17446801'`,
      'LigCde+Commande for 17446801'
    );
    if (job) {
      console.log('TechDernInterv (last technical step) vs Representant (assigned rep) — different concepts:',
        job[0].TECHDERNINTERV, 'vs', job[0].REPRESENTANT);
    }

    await query(conn, `SELECT DISTINCT Representant FROM Commande WHERE Representant <> ''`, 'All distinct Representant codes shop-wide');
    await query(conn, `SELECT NoInt_salarie, Nom, Prenom FROM Salarie WHERE Nom LIKE '%Paoli%'`, 'Confirms NP = Nicolas Paoli');
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
