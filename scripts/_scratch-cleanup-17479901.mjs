import net from 'net';
import odbc from 'odbc';

const server = net.createServer(client => {
  const remote = net.connect(19822, '192.168.77.10', () => { client.pipe(remote); remote.pipe(client); });
  remote.on('error', () => client.destroy());
  client.on('error', () => remote.destroy());
});
server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') { await main(); } else { console.error(err); process.exit(1); }
});
server.listen(19812, '127.0.0.1', async () => { await main(); });

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const before = await conn.query(`SELECT COUNT(NoInt_LigCdeTest) as cnt FROM Zebra_LigCdeTest WHERE NoInt_LigCde = 39574`).catch(() => null);
    const rows = await conn.query(`SELECT NoInt_LigCdeTest FROM Zebra_LigCdeTest WHERE NoInt_LigCde = 39574`);
    console.log('Rows to delete:', rows.length);
    await conn.query(`DELETE FROM Zebra_LigCdeTest WHERE NoInt_LigCde = 39574`);
    const after = await conn.query(`SELECT NoInt_LigCdeTest FROM Zebra_LigCdeTest WHERE NoInt_LigCde = 39574`);
    console.log('Rows remaining after delete:', after.length);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
