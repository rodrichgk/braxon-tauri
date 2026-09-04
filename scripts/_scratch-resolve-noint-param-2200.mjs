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
    const art = await conn.query(`SELECT NoIntArticle, CodeArt, LibArt, Famille FROM Article WHERE NoIntArticle = 2200`);
    console.log('Article NoIntArticle=2200:', JSON.stringify(art, null, 2));

    const am = await conn.query(`SELECT NoInt_art, CodeArt, Designation FROM ArticleMeteor WHERE NoInt_art = 2200`);
    console.log('ArticleMeteor NoInt_art=2200:', JSON.stringify(am, null, 2));

    // Distinct NoIntParam values properly this time
    const rows = await conn.query(`SELECT NoIntParam FROM Accessoires LIMIT 2000`);
    const set = new Set(rows.map(r => r.NOINTPARAM));
    console.log('Distinct NoIntParam sample:', [...set].slice(0, 20));

    // Resolve a few against Article.LibArt
    for (const p of [...set].slice(0, 10)) {
      const a = await conn.query(`SELECT LibArt, CodeArt FROM Article WHERE NoIntArticle = ${p}`);
      console.log(p, '->', JSON.stringify(a));
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
