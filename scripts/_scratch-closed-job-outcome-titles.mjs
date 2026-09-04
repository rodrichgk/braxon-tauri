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

// Same "chronologically most recent step wins" comparison as Rust's
// is_more_recent_step: Date (normalized), then HeureInterv, then NoInt_interv.
function isMoreRecent(dA, hA, idA, dB, hB, idB) {
  const ymdA = toYmd(dA) || '';
  const ymdB = toYmd(dB) || '';
  if (ymdA !== ymdB) return ymdA > ymdB;
  const hA2 = hA || '';
  const hB2 = hB || '';
  if (hA2 !== hB2) return hA2 > hB2;
  return (idA || 0) > (idB || 0);
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    // Broad window: everything closed, last 365 days by intake date (same
    // shape as the ETL's own hist_sql, just a wider lookback + TypeLibelle).
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 365);
    const fromYmd = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    const toYmdStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    console.log(`Window: DateCommande BETWEEN ${fromYmd} AND ${toYmdStr}`);

    const histRows = await conn.query(
      `SELECT l.NoInt_Ligcde, i.TypeCode, i.TypeLibelle, i."Date", i.HeureInterv, i.NoInt_interv
       FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
       WHERE c.DateCommande BETWEEN '${fromYmd}' AND '${toYmdStr}'
       ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
       LIMIT 20000`
    );
    console.log(`hist rows: ${histRows.length}`);

    const closedRows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.DateDernInterv FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l."Soldée" = True AND c.DateCommande BETWEEN '${fromYmd}' AND '${toYmdStr}'
       LIMIT 20000`
    );
    console.log(`closed rows: ${closedRows.length}`);
    const closedIds = new Set(closedRows.map(r => String(r.NOINT_LIGCDE)));
    const closedDates = new Map(closedRows.map(r => [String(r.NOINT_LIGCDE), toYmd(r.DATEDERNINTERV)]));

    const latest = new Map();
    for (const r of histRows) {
      const id = String(r.NOINT_LIGCDE);
      if (!id) continue;
      const cur = latest.get(id);
      if (!cur || isMoreRecent(r.DATE, r.HEUREINTERV, r.NOINT_INTERV, cur.DATE, cur.HEUREINTERV, cur.NOINT_INTERV)) {
        latest.set(id, r);
      }
    }

    const tally = new Map(); // key = `${code}|||${libelle}` -> count
    let closedDateHistogramMonth = new Map();
    let counted = 0;
    for (const id of closedIds) {
      const row = latest.get(id);
      if (!row) continue;
      counted++;
      const key = `${row.TYPECODE ?? '(null)'}|||${row.TYPELIBELLE ?? '(null)'}`;
      tally.set(key, (tally.get(key) || 0) + 1);
      const cd = closedDates.get(id);
      if (cd) {
        const month = cd.slice(0, 7);
        closedDateHistogramMonth.set(month, (closedDateHistogramMonth.get(month) || 0) + 1);
      }
    }

    console.log(`\nMatched ${counted} of ${closedIds.size} closed jobs to a latest step.\n`);
    const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    console.log('Code | Libellé | Count');
    for (const [key, n] of sorted) {
      const [code, lib] = key.split('|||');
      console.log(`${code} | ${lib} | ${n}`);
    }

    console.log('\nClosed-jobs-by-month (DateDernInterv):');
    for (const [m, n] of [...closedDateHistogramMonth.entries()].sort()) {
      console.log(`${m}: ${n}`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
