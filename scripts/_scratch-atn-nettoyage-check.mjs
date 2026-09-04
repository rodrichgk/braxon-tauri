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
    // Recent ATN steps, newest first.
    const atnSteps = await conn.query(
      `SELECT NoIntLigcde, NoInt_interv FROM Intervention WHERE TypeCode = 'ATN' ORDER BY NoInt_interv DESC LIMIT 300`
    );
    console.log('Sampled', atnSteps.length, 'recent ATN steps');

    let checked = 0, netThenAtn = 0, currentlyFalse = 0, currentlyTrue = 0;
    const examples = [];
    for (const row of atnSteps) {
      const ligcdeId = row.NOINTLIGCDE;
      const thisAtnId = row.NOINT_INTERV;
      if (checked >= 40) break; // cap how many we probe in detail

      // Is this ATN step this job's MOST RECENT step (not superseded later)?
      const latest = await conn.query(
        `SELECT TypeCode, NoInt_interv FROM Intervention WHERE NoIntLigcde = ${ligcdeId} ORDER BY NoInt_interv DESC LIMIT 1`
      );
      if (!latest.length || latest[0].NOINT_INTERV !== thisAtnId) continue; // superseded, skip

      // What was the step immediately before this ATN?
      const prior = await conn.query(
        `SELECT TypeCode FROM Intervention WHERE NoIntLigcde = ${ligcdeId} AND NoInt_interv < ${thisAtnId} ORDER BY NoInt_interv DESC LIMIT 1`
      );
      if (!prior.length || prior[0].TYPECODE !== 'NET') continue; // only care about NET -> ATN cases

      checked++;
      netThenAtn++;
      const nettoyage = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde = ${ligcdeId} AND Nettoyage = True`);
      const isTrue = nettoyage.length === 1;
      if (isTrue) currentlyTrue++; else currentlyFalse++;
      if (examples.length < 10) examples.push({ ligcdeId, thisAtnId, nettoyageNow: isTrue });
    }

    console.log('NET -> ATN (latest step) cases checked:', netThenAtn);
    console.log('Currently Nettoyage=False:', currentlyFalse, '| Currently Nettoyage=True:', currentlyTrue);
    console.log('Examples:', examples);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
