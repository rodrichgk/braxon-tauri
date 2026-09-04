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
      `SELECT NoInt_Ligcde, NoIntervention, CodeArt, Observations, CommentaireInterne
       FROM LigCde
       WHERE CodeArt LIKE '100961%' AND (Observations LIKE '%5DF0%' OR CommentaireInterne LIKE '%5DF0%')
       LIMIT 200`
    );
    console.log(`Matches: ${rows.length}`);
    for (const r of rows) {
      console.log(`\njob ${r.NOINTERVENTION} (ligcde ${r.NOINT_LIGCDE}) codeArt=${r.CODEART}`);
      if (r.OBSERVATIONS) console.log('  Observations:', r.OBSERVATIONS);
      if (r.COMMENTAIREINTERNE) console.log('  CommentaireInterne:', r.COMMENTAIREINTERNE);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
