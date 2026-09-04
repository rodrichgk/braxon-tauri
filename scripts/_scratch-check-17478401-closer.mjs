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
    const steps = await conn.query(
      `SELECT NoInt_interv, NoIntTechn, TypeCode, TypeLibelle, "Date", HeureInterv FROM Intervention WHERE NoIntLigcde = 39558 ORDER BY NoInt_interv ASC`
    );
    console.log('Job 17478401 (ligcde 39558) step history:');
    steps.forEach(s => console.log(' -', JSON.stringify(s)));

    // Cross check: a sample of OTHER real closed jobs (Soldée=True) and
    // whether they have Zebra_LigCdeTest rows, split by whether they were
    // closed via a BRAXON id (>=900000000) or native 4D id.
    const closed = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoIntervention FROM LigCde l WHERE l."Soldée" = True ORDER BY l.NoInt_Ligcde DESC LIMIT 15`
    );
    console.log('\nChecking 15 recent closed jobs for Zebra_LigCdeTest rows:');
    for (const job of closed) {
      const rows = await conn.query(`SELECT COUNT(NoInt_LigCdeTest) as cnt FROM Zebra_LigCdeTest WHERE NoInt_LigCde = ${job.NOINT_LIGCDE}`).catch(() => null);
      const check = await conn.query(`SELECT NoInt_LigCdeTest FROM Zebra_LigCdeTest WHERE NoInt_LigCde = ${job.NOINT_LIGCDE} LIMIT 1`);
      console.log(` - ${job.NOINTERVENTION} (ligcde ${job.NOINT_LIGCDE}): has_test_rows=${check.length > 0}`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
