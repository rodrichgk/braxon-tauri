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
    // Search technician-written fields (not customer-reported Observations):
    // Intervention.Commentaire (per-step notes) and LigCde.CommentaireInterne.
    const stepMatches = await conn.query(
      `SELECT NoIntLigcde, Commentaire FROM Intervention
       WHERE Commentaire LIKE '%MOSFET%' OR Commentaire LIKE '%MOS FET%' OR Commentaire LIKE '%TRANSISTOR%'
       LIMIT 1000`
    );
    console.log(`Intervention.Commentaire matches: ${stepMatches.length}`);

    const internalMatches = await conn.query(
      `SELECT NoInt_Ligcde, CommentaireInterne FROM LigCde
       WHERE CommentaireInterne LIKE '%MOSFET%' OR CommentaireInterne LIKE '%MOS FET%' OR CommentaireInterne LIKE '%TRANSISTOR%'
       LIMIT 1000`
    );
    console.log(`LigCde.CommentaireInterne matches: ${internalMatches.length}`);

    console.log('\nSample step comments:');
    for (const r of stepMatches.slice(0, 15)) console.log(` - [ligcde ${r.NOINTLIGCDE}] ${r.COMMENTAIRE}`);
    console.log('\nSample internal comments:');
    for (const r of internalMatches.slice(0, 15)) console.log(` - [ligcde ${r.NOINT_LIGCDE}] ${r.COMMENTAIREINTERNE}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
