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
  if (err.code === 'EADDRINUSE') {
    await main();
  } else {
    console.error('Proxy error:', err);
    process.exit(1);
  }
});

server.listen(PROXY_PORT, '127.0.0.1', async () => {
  await main();
});

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const rows = await conn.query(
      `SELECT NoInt_Ligcde, NoIntervention, "DernièreInterv", DateDernInterv, TechDernInterv,
              NomDernierTech, Nettoyage, CausePanne, SemaineGarantie, "HeureLigSoldée",
              DerInterv_technique, DateDerInterv_technique
       FROM LigCde WHERE NoInt_Ligcde = 39465`
    );
    console.log('=== LigCde 39465 current state ===');
    console.log(JSON.stringify(rows, null, 2));

    const soldee = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde = 39465 AND "Soldée" = True`);
    console.log('Still Soldée=True?', soldee.length === 1);

    const latestInterv = await conn.query(
      `SELECT NoInt_interv, TypeCode, TypeLibelle, "Date", HeureInterv FROM Intervention WHERE NoIntLigcde = 39465 ORDER BY NoInt_interv DESC LIMIT 1`
    );
    console.log('=== Latest remaining Intervention row for this job (used by the queue display) ===');
    console.log(latestInterv);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
