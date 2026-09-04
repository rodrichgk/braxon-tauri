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

async function fetchMonth(conn, from, to) {
  const rows = await conn.query(
    `SELECT l.NoInt_Ligcde, l.NoInt_cde, c.MtHT_Lignes, l.DateDernInterv
     FROM LigCde l
     LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
     WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '${from}' AND '${to}' AND c.StatutDossier = 'EXPEDIE'
     ORDER BY l.NoInt_Ligcde DESC LIMIT 20000`
  );
  return rows;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const march = await fetchMonth(conn, '2026-03-01', '2026-03-31');
    const april = await fetchMonth(conn, '2026-04-01', '2026-04-30');

    const marchCdes = new Set(march.map(r => r.NOINT_CDE));
    const aprilCdes = new Set(april.map(r => r.NOINT_CDE));
    const overlap = [...marchCdes].filter(c => aprilCdes.has(c));
    console.log('March distinct Commande ids:', marchCdes.size);
    console.log('April distinct Commande ids:', aprilCdes.size);
    console.log('Commande ids appearing in BOTH March and April cohorts:', overlap.length, overlap);

    // For March specifically: how many distinct Commande ids vs LigCde rows?
    const marchByC = new Map();
    for (const r of march) {
      const c = r.NOINT_CDE;
      if (c == null) continue;
      if (!marchByC.has(c)) marchByC.set(c, []);
      marchByC.get(c).push(r);
    }
    const multiLine = [...marchByC.entries()].filter(([, rows]) => rows.length > 1);
    console.log('\nMarch: Commande ids with >1 LigCde line in cohort:', multiLine.length);
    multiLine.forEach(([cde, rows]) => {
      console.log(`  Commande ${cde}: ${rows.length} lines, ligcde ids = ${rows.map(r => r.NOINT_LIGCDE).join(',')}, HT=${rows[0].MTHT_LIGNES}`);
    });

    // Sum sanity
    let sumFirst = 0, seen = new Set();
    for (const r of march) {
      if (seen.has(r.NOINT_CDE)) continue;
      seen.add(r.NOINT_CDE);
      const v = parseFloat(r.MTHT_LIGNES);
      if (!isNaN(v)) sumFirst += v;
    }
    console.log('\nMarch deduped-by-commande sum (first occurrence):', sumFirst.toFixed(1));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
