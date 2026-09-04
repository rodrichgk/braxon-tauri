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
    console.log('Proxy already running elsewhere, using it directly.');
    await main();
  } else {
    console.error('Proxy error:', err);
    process.exit(1);
  }
});

server.listen(PROXY_PORT, '127.0.0.1', async () => {
  console.log('Local proxy up on', PROXY_PORT);
  await main();
});

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const top = await conn.query('SELECT NoInt_interv, NoIntLigcde, NoIntTechn, TypeCode, "Date", HeureInterv FROM Intervention ORDER BY NoInt_interv DESC LIMIT 10');
    console.log('\n=== Top 10 ids now ===');
    top.forEach(r => console.log(' -', r.NOINT_INTERV, 'ligcde='+r.NOINTLIGCDE, 'tech='+r.NOINTTECHN, r.TYPECODE, r.DATE, r.HEUREINTERV));

    const lig = await conn.query("SELECT NoInt_Ligcde, NoIntervention, TechDernInterv, DateDernInterv FROM LigCde WHERE NoIntervention = '17469101'");
    console.log('\n=== Job 17469101 ===');
    console.log(lig);
    if (lig[0]) {
      const id = lig[0].NOINT_LIGCDE;
      const hist = await conn.query('SELECT NoInt_interv, NoIntTechn, TypeCode, TypeLibelle, "Date", HeureInterv, Commentaire FROM Intervention WHERE NoIntLigcde = ' + id + ' ORDER BY NoInt_interv ASC');
      console.log('\n=== Job 17469101 history ===');
      hist.forEach(r => console.log(' -', r));
    }

    const now = new Date();
    console.log('\nCurrent wall clock:', now.toISOString());
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
