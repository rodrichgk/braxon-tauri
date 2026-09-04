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
    const lig = await conn.query(`SELECT NoInt_Ligcde, CodeArt, Type_Service FROM LigCde WHERE NoIntervention = '17494401'`);
    console.log('LigCde:', JSON.stringify(lig));
    if (!lig.length) { console.log('Job not found'); return; }
    const ligcdeId = lig[0].NOINT_LIGCDE;

    const soldee = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde = ${ligcdeId} AND "Soldée" = True`);
    console.log('Soldée = True?', soldee.length > 0);

    const access = await conn.query(`SELECT NoInt_access, NoIntParam FROM Accessoires WHERE NoInt_ligCde = ${ligcdeId}`);
    console.log('Accessoires rows:', JSON.stringify(access));
    for (const a of access) {
      const t = await conn.query(`SELECT NoInt_access FROM Accessoires WHERE NoInt_access = ${a.NOINT_ACCESS} AND CtrlPresence = True`);
      console.log(`  access ${a.NOINT_ACCESS} (param ${a.NOINTPARAM}) confirmed:`, t.length > 0);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
