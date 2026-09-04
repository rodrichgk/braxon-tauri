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
    // Search every table with a Libelle-ish text column for anything matching "fixation"
    const candidates = await conn.query(
      `SELECT TABLE_NAME, COLUMN_NAME FROM _USER_COLUMNS WHERE COLUMN_NAME LIKE '%ib%' OR COLUMN_NAME LIKE '%escrip%' OR COLUMN_NAME LIKE '%esign%' OR COLUMN_NAME LIKE '%om%'`
    );
    // Too broad probably; instead just try known likely tables directly.
    const guesses = ['TableFormulaire', 'Zebra_Accessoire', 'Accessoires', 'Article', 'ArticleMeteor', 'Categ_Art', 'RegptArticle', 'ModeOpClt_Article', 'Art_ModeOpClt_Article'];
    for (const t of guesses) {
      try {
        const cols = await conn.query(`SELECT COLUMN_NAME, DATA_TYPE FROM _USER_COLUMNS WHERE TABLE_NAME = '${t}'`);
        const textCols = cols.filter(c => c.DATA_TYPE === 10 || c.DATA_TYPE === 6).map(c => c.COLUMN_NAME);
        for (const col of textCols) {
          try {
            const rows = await conn.query(`SELECT ${col} FROM ${t} WHERE ${col} LIKE '%ixation%' LIMIT 5`);
            if (rows.length) console.log(`FOUND in ${t}.${col}:`, JSON.stringify(rows));
          } catch (e) {}
        }
      } catch (e) {}
    }
    console.log('done scanning guesses');
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
