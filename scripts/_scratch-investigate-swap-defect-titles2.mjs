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
    for (const libelle of ['Réparation = SWAP', 'R.A.S. = SWAP', 'Non Dépannable = Défect']) {
      const steps = await conn.query(
        `SELECT NoInt_interv, NoIntLigcde, TypeCode, TypeLibelle, "Date" FROM Intervention WHERE TypeLibelle = '${libelle}' ORDER BY NoInt_interv DESC LIMIT 8`
      );
      console.log(`\n=== ${libelle} (${steps.length} sample rows) ===`);
      for (const s of steps) {
        const ligcdeId = s.NOINTLIGCDE;
        const lig = await conn.query(
          `SELECT l.NoIntervention, l.NoInt_cde, l.CodeArt, l.NomClient, c.NoInt_Client, c.DateCommande
           FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
           WHERE l.NoInt_Ligcde = ${ligcdeId}`
        );
        if (!lig.length) { console.log(`  ligcde ${ligcdeId}: not found`); continue; }
        const row = lig[0];
        console.log(`  job ${row.NOINTERVENTION} ligcde=${ligcdeId} codeArt=${row.CODEART} nomClient="${row.NOMCLIENT}" noIntClient=${row.NOINT_CLIENT} dateCommande=${row.DATECOMMANDE}`);
      }
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
