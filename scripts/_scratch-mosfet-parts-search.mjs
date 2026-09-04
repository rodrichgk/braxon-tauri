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
    const cols = await conn.query(`SELECT COLUMN_NAME, DATA_TYPE FROM _USER_COLUMNS WHERE TABLE_NAME = 'DetailInterv' ORDER BY COLUMN_NAME`);
    console.log('DetailInterv columns:', cols.map(c => `${c.COLUMN_NAME}(${c.DATA_TYPE})`).join('  '));

    const parts = await conn.query(
      `SELECT NoIntDetail, NoIntIntervAppel, CodeArt, LibArt FROM DetailInterv
       WHERE LibArt LIKE '%MOSFET%' OR LibArt LIKE '%TRANSISTOR%' LIMIT 500`
    );
    console.log(`\nDetailInterv lines matching MOSFET/TRANSISTOR: ${parts.length}`);
    for (const p of parts.slice(0, 20)) console.log(' -', p.CODEART, '|', p.LIBART);

    // Also try ArticleAchat / Article for parts catalog entries
    const catalog = await conn.query(`SELECT CodeArtAchat, Designation FROM ArticleAchat WHERE Designation LIKE '%MOSFET%' OR Designation LIKE '%TRANSISTOR%' LIMIT 50`);
    console.log(`\nArticleAchat catalog entries: ${catalog.length}`);
    for (const c of catalog) console.log(' -', c.CODEARTACHAT, '|', c.DESIGNATION);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
