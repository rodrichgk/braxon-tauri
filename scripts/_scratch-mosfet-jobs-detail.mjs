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
    const ids = [18433, 19352, 22230, 31482, 38583];
    for (const id of ids) {
      const lig = await conn.query(
        `SELECT l.NoIntervention, l.CodeArt, am.Famille, l.PrixHT, l.Observations, l."Soldée"
         FROM LigCde l LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt WHERE l.NoInt_Ligcde = ${id}`
      );
      const steps = await conn.query(`SELECT TypeCode, TypeLibelle FROM Intervention WHERE NoIntLigcde = ${id} ORDER BY NoInt_interv DESC LIMIT 1`);
      const r = lig[0];
      console.log(`\nJob ${r?.NOINTERVENTION} (ligcde ${id})`);
      console.log('  Family:', r?.FAMILLE, '| CodeArt:', r?.CODEART, '| PrixHT:', r?.PRIXHT, '| Soldée:', r?.SOLDÉE);
      console.log('  Latest step:', steps[0]?.TYPECODE, '-', steps[0]?.TYPELIBELLE);
      console.log('  Customer-reported Observations:', r?.OBSERVATIONS);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
