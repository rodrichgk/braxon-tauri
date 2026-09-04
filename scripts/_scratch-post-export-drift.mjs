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
    // March report was exported 01/04/2026 10:51:15. Any LigCde row in
    // March's cohort whose heureModif/DateModif is AFTER that would mean
    // it changed since the report was generated.
    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoIntervention, l.DateModif, l.heureModif, l.DateDernInterv, c.MtHT_Lignes, c.DateModif
       FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '2026-03-01' AND '2026-03-31' AND c.StatutDossier = 'EXPEDIE'
       ORDER BY l.NoInt_Ligcde DESC LIMIT 20000`
    );
    console.log('Total rows:', rows.length);

    // LigCde modified after the March report's export date
    const modifiedAfter = rows.filter(r => {
      const d = r.DATEMODIF;
      if (!d) return false;
      // 4D dates come as "DD/MM/YYYY HH:MM"
      const [datePart] = d.split(' ');
      const [dd, mm, yyyy] = datePart.split('/').map(Number);
      const asDate = new Date(yyyy, mm - 1, dd);
      return asDate > new Date(2026, 3, 1); // after 01/04/2026
    });
    console.log('LigCde rows with DateModif after 01/04/2026 (report export date):', modifiedAfter.length);
    modifiedAfter.slice(0, 15).forEach(r => console.log('  ', r.NOINTERVENTION, 'LigCde.DateModif=' + r.DATEMODIF, 'HT=' + r.MTHT_LIGNES));

    // Commande modified after the export date (second DateModif column, from `c`)
    const cModifiedAfter = rows.filter(r => {
      const d = r[6]; // second DateModif (Commande's)
      if (!d) return false;
      const [datePart] = String(d).split(' ');
      const [dd, mm, yyyy] = datePart.split('/').map(Number);
      const asDate = new Date(yyyy, mm - 1, dd);
      return asDate > new Date(2026, 3, 1);
    });
    console.log('\nCommande rows with DateModif after 01/04/2026:', cModifiedAfter.length);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
