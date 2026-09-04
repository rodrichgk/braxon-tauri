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
    const variants = [
      'PAS DE COMMUNICATION', 'NE COMMUNIQUE PAS', 'ABSENCE DE COMMUNICATION',
      'NO COMM', "CAN'T DIAG", 'CANNOT DIAG', 'IMPOSSIBLE DE DIAG', 'PAS DE DIALOGUE',
      'NO COMMS', 'COMMUNICATION IMPOSSIBLE', 'NO RESPONSE', 'DOES NOT COMMUNICATE'
    ];
    let totalUnion = new Set();
    for (const v of variants) {
      const rows = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE Observations LIKE '%${v}%' LIMIT 1000`);
      if (rows.length) console.log(`"${v}": ${rows.length}`);
      rows.forEach(r => totalUnion.add(r.NOINT_LIGCDE));
    }
    console.log(`\nTotal distinct "no comms / can't diag" jobs (all variants, all families): ${totalUnion.size}`);

    // Family breakdown for this union
    const ids = [...totalUnion];
    const famCounts = new Map();
    for (const id of ids.slice(0, 300)) {
      const r = await conn.query(`SELECT am.Famille FROM LigCde l LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt WHERE l.NoInt_Ligcde = ${id}`);
      const fam = r[0]?.FAMILLE || '(none)';
      famCounts.set(fam, (famCounts.get(fam) || 0) + 1);
    }
    console.log('Family breakdown (sample of 300):', JSON.stringify(Object.fromEntries([...famCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10))));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
