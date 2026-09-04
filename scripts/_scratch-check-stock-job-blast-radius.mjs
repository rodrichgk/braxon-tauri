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
    const ids = await conn.query(`SELECT NoIntLigcde FROM Intervention WHERE TypeLibelle = 'Réparation = SWAP' LIMIT 20`);
    const uniqIds = [...new Set(ids.map(r => r.NOINTLIGCDE))].slice(0, 10);
    for (const id of uniqIds) {
      const lig = await conn.query(
        `SELECT l.Type_Service, l."Soldée", l.PrixHT, l.NoInt_cde, c.StatutDossier, c.MtHT_Lignes
         FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
         WHERE l.NoInt_Ligcde = ${id}`
      );
      console.log(id, JSON.stringify(lig[0]));
    }

    // Also: total count of LigCde rows with empty NomClient overall, vs total LigCde count
    const totalEmpty = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NomClient = '' LIMIT 20000`);
    console.log(`\nTotal LigCde rows with empty NomClient (capped 20000 scan): ${totalEmpty.length}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
