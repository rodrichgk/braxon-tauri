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

async function query(conn, sql, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rows = await conn.query(sql);
      console.log(`=== ${label} (${rows.length}) ===`);
      console.log(JSON.stringify(rows, null, 2));
      return rows;
    } catch (e) {
      console.log(`retry ${attempt} for ${label}:`, e.odbcErrors?.[0]?.message || e.message);
      await new Promise(r => setTimeout(r, 400));
    }
  }
  console.log(`FAILED after retries: ${label}`);
  return null;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const job = await query(conn, `SELECT NoInt_Ligcde, NoIntervention, "DernièreInterv", DateDernInterv, HeureLigCde, TechDernInterv, NomDernierTech, heureModif FROM LigCde WHERE NoIntervention = '17521301'`, 'LigCde for 17521301');
    const ligcdeId = job?.[0]?.NOINT_LIGCDE;
    if (ligcdeId) {
      await query(conn, `SELECT NoInt_interv, NoIntTechn, TypeCode, TypeLibelle, "Date", HeureInterv FROM Intervention WHERE NoIntLigcde = ${ligcdeId} ORDER BY NoInt_interv DESC`, `Full step history for ligcde ${ligcdeId}`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
