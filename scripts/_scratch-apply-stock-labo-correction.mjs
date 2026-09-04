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
    const before = await conn.query(`SELECT QteStockLabo FROM ArticleAchat WHERE NoInt_ArtAchat = 1615`);
    console.log('Before:', JSON.stringify(before));
    if (before[0]?.QTESTOCKLABO !== 140) {
      console.log('ABORT: value changed since investigation, not proceeding.');
      return;
    }
    await conn.query(`UPDATE ArticleAchat SET QteStockLabo = 164 WHERE NoInt_ArtAchat = 1615`);
    const after = await conn.query(`SELECT QteStockLabo FROM ArticleAchat WHERE NoInt_ArtAchat = 1615`);
    console.log('After:', JSON.stringify(after));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
