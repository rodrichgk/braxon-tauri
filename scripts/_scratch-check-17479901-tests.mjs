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
    const lig = await conn.query(`SELECT NoInt_Ligcde, CodeArt, LibelleArt FROM LigCde WHERE NoIntervention = '17479901'`);
    if (!lig.length) {
      console.log('Job 17479901 not found');
      return;
    }
    const ligcdeId = lig[0].NOINT_LIGCDE;
    console.log('Job 17479901 -> ligcde', ligcdeId, lig[0].CODEART, lig[0].LIBELLEART);

    const rows = await conn.query(
      `SELECT NoInt_LigCdeTest, NoInt_ParamTest, LibParamTest FROM Zebra_LigCdeTest WHERE NoInt_LigCde = ${ligcdeId} ORDER BY NoInt_ParamTest ASC`
    );
    console.log(`\n${rows.length} Zebra_LigCdeTest rows found:`);
    rows.forEach(r => console.log(` - id=${r.NOINT_PARAMTEST}  "${r.LIBPARAMTEST}"`));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
