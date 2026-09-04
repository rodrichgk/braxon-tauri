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

async function probeBool(conn, ligcdeId, col) {
  const r = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde = ${ligcdeId} AND "${col}" = True`);
  return r.length > 0;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    for (const field of ['SGRefuseePanneDiff', 'SGRefuseeAutreMotif']) {
      const rows = await conn.query(
        `SELECT NoInt_Ligcde, NoIntervention, Observations, CommentaireInterne
         FROM LigCde WHERE "${field}" = True LIMIT 12`
      );
      console.log(`\n=== Sample of ${field}=True jobs (${rows.length}) ===`);
      for (const r of rows) {
        const id = r.NOINT_LIGCDE;
        const ras = await probeBool(conn, id, 'RAS');
        const gar = await probeBool(conn, id, 'Garantie');
        const rep = await probeBool(conn, id, 'Réparation');
        console.log(` - [${r.NOINTERVENTION}] RAS=${ras} Garantie=${gar} Réparation=${rep}`);
        console.log(`     Observations: "${(r.OBSERVATIONS || '').slice(0, 140)}"`);
        console.log(`     CommentaireInterne: "${(r.COMMENTAIREINTERNE || '').slice(0, 140)}"`);
      }
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
