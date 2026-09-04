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

function toYmd(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    // Mirrors todays_bench_population exactly.
    const openRows = await conn.query(
      `SELECT l.NoInt_Ligcde, am.Designation, l.DateLimiteLivraison
       FROM LigCde l LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
       WHERE l."Soldée" = False AND l.Type_Service IN ('100', '101', '102', '103')
       ORDER BY l.NoInt_Ligcde DESC LIMIT 5000`
    );
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffYmd = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    const ids = new Set();
    const familyCounts = new Map();
    let openCounted = 0;
    for (const r of openRows) {
      const id = r.NOINT_LIGCDE;
      if (!id || ids.has(id)) continue;
      const dd = toYmd(r.DATELIMITELIVRAISON);
      if (!dd || dd < cutoffYmd) continue;
      ids.add(id);
      openCounted++;
      const fam = (r.DESIGNATION || '(unspecified)').trim() || '(unspecified)';
      familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
    }
    console.log(`Open branch counted: ${openCounted}`);

    const todayYmd = toYmd(`${String(new Date().getDate()).padStart(2, '0')}/${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`);
    const closedRows = await conn.query(
      `SELECT l.NoInt_Ligcde, am.Designation, l.DateDernInterv
       FROM LigCde l LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
       WHERE l."Soldée" = True AND l.Type_Service IN ('100', '101', '102', '103')
       ORDER BY l.NoInt_Ligcde DESC LIMIT 5000`
    );
    let closedCounted = 0;
    for (const r of closedRows) {
      const id = r.NOINT_LIGCDE;
      if (!id || ids.has(id)) continue;
      if (toYmd(r.DATEDERNINTERV) !== todayYmd) continue;
      ids.add(id);
      closedCounted++;
      const fam = (r.DESIGNATION || '(unspecified)').trim() || '(unspecified)';
      familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
    }
    console.log(`Closed-today branch counted: ${closedCounted}`);
    console.log(`Union total (units_today): ${ids.size}`);
    console.log('\nTop families:', [...familyCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
