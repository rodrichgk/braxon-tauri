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
    const cols = await conn.query(`SELECT COLUMN_NAME, DATA_TYPE FROM _USER_COLUMNS WHERE TABLE_NAME = 'ArticleAchat' ORDER BY COLUMN_NAME`);
    console.log('ArticleAchat columns:', cols.map(c => `${c.COLUMN_NAME}(${c.DATA_TYPE})`).join('  '));

    const row = await conn.query(`SELECT * FROM ArticleAchat WHERE CodeArt = '0223010003'`);
    console.log('\nRow for CodeArt 0223010003:', JSON.stringify(row, null, 2));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
