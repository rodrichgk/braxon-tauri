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
    // Distinct Segmentation values, open bench jobs only (most relevant for a filter dropdown).
    const rows = await conn.query(
      `SELECT l.Segmentation, COUNT(l.NoInt_Ligcde) as cnt
       FROM LigCde l
       WHERE l."Soldée" = False AND l.Type_Service IN ('100','101','102','103')
       GROUP BY l.Segmentation`
    );
    console.log('Distinct Segmentation values (open bench):', rows);

    // Compare against ArticleMeteor.Designation-derived family cardinality for the same set.
    const rows2 = await conn.query(
      `SELECT am.Designation, COUNT(l.NoInt_Ligcde) as cnt
       FROM LigCde l LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
       WHERE l."Soldée" = False AND l.Type_Service IN ('100','101','102','103')
       GROUP BY am.Designation`
    );
    console.log(`\nDistinct Designation (family) values (open bench): ${rows2.length} distinct`);
    rows2.sort((a, b) => b.CNT - a.CNT).slice(0, 20).forEach(r => console.log(`  "${r.DESIGNATION}": ${r.CNT}`));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
