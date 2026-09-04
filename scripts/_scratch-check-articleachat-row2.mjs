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
    const row = await conn.query(
      `SELECT NoInt_ArtAchat, CodeArtAchat, Designation, QteStock, QteStockLabo, CMUP, DernierPA, StockTamponM, DateModif
       FROM ArticleAchat WHERE CodeArtAchat = '0223010003'`
    );
    console.log('By CodeArtAchat:', JSON.stringify(row, null, 2));

    const row2 = await conn.query(
      `SELECT NoInt_ArtAchat, CodeArtAchat, Designation, QteStock, QteStockLabo, CMUP, DernierPA, StockTamponM, DateModif
       FROM ArticleAchat WHERE Designation LIKE '%upport moteur%'`
    );
    console.log('By Designation search:', JSON.stringify(row2, null, 2));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
