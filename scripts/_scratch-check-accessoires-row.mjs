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
    const rows = await conn.query(`SELECT NoInt_access, NoIntParam FROM Accessoires WHERE NoInt_ligCde = 39677`);
    console.log('Accessoires rows for ligcde 39677:', JSON.stringify(rows, null, 2));

    const presence = await conn.query(`SELECT NoInt_access FROM Accessoires WHERE NoInt_ligCde = 39677 AND CtrlPresence = True`);
    console.log('Rows with CtrlPresence=True:', presence.length);
    const noPresence = await conn.query(`SELECT NoInt_access FROM Accessoires WHERE NoInt_ligCde = 39677 AND CtrlPresence = False`);
    console.log('Rows with CtrlPresence=False:', noPresence.length);

    // Try to resolve NoIntParam - check likely lookup tables
    const paramIds = [...new Set(rows.map(r => r.NOINTPARAM))];
    console.log('Distinct NoIntParam values:', paramIds);
    for (const table of ['MotCleArticle', 'Article', 'RegptArticle', 'Categ_Art']) {
      try {
        const cols = await conn.query(`SELECT COLUMN_NAME FROM _USER_COLUMNS WHERE TABLE_NAME = '${table}'`);
        console.log(`${table} columns:`, cols.map(c => c.COLUMN_NAME).join(', '));
      } catch (e) {}
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
