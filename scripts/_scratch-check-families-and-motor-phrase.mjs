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
    const fams = await conn.query(`SELECT DISTINCT Famille FROM ArticleMeteor WHERE Famille LIKE '%MK%' OR Famille LIKE '%Bosch%' LIMIT 50`);
    console.log('Family values matching MK/Bosch:', fams.map(f => f.FAMILLE));

    // Search for "motor running all the time" style phrasing
    const candidates = ['tourne en permanence', 'tourne tout le temps', 'tourne sans arret', 'MOTOR RUNS', 'motor runs continuously', 'moteur en continu', 'toujours en marche', 'ne s\'arrete pas', 'ne s\'arrête pas'];
    for (const c of candidates) {
      const rows = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE Observations LIKE '%${c}%' LIMIT 5`);
      console.log(`"${c}": ${rows.length} matches`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
