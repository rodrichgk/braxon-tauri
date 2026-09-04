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
    const q = '5DF0';
    // Mirrors reman_search_interventions's exact new OR clause.
    const orClause = `(l.NomClient LIKE '%${q}%' OR l.CodeArt LIKE '%${q}%' OR l.LibelleArt LIKE '%${q}%' OR l.NoIntervention LIKE '%${q}%' OR l.Observations LIKE '%${q}%')`;

    const closedRows = await conn.query(
      `SELECT l.NoIntervention FROM LigCde l WHERE ${orClause} AND l."Soldée" = True LIMIT 50`
    );
    console.log(`Closed queue matches: ${closedRows.length}`);

    const openRows = await conn.query(
      `SELECT l.NoIntervention FROM LigCde l WHERE ${orClause} AND l."Soldée" = False AND l.Type_Service IN ('100','101','102','103') LIMIT 50`
    );
    console.log(`Open queue matches: ${openRows.length}`, JSON.stringify(openRows));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
