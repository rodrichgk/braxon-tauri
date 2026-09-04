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
    // Try several spelling/encoding variants against MK100 specifically.
    const variants = ['desequilibr', 'déséquilibr', 'DESEQUILIBR', 'freinage', 'frein'];
    for (const v of variants) {
      const rows = await conn.query(
        `SELECT l.NoInt_Ligcde FROM LigCde l LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
         WHERE am.Famille = 'MK100' AND l.Observations LIKE '%${v}%' LIMIT 500`
      );
      console.log(`MK100 + "${v}": ${rows.length} matches`);
    }
    // Sample a few real MK100 Observations to see the actual wording used.
    const sample = await conn.query(
      `SELECT Observations FROM LigCde l LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
       WHERE am.Famille = 'MK100' AND l.Observations IS NOT NULL AND l."Soldée" = True
       ORDER BY l.NoInt_Ligcde DESC LIMIT 15`
    );
    console.log('\nSample MK100 Observations text:');
    for (const r of sample) console.log(' -', r.OBSERVATIONS);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
