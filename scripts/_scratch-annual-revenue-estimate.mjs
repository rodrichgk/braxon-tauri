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
    // Mirrors reman.rs's revenue_sql exactly (Soldée=True, DateDernInterv
    // window, StatutDossier='EXPEDIE', REE-excluded, HT not TTC,
    // deduped by Commande so multi-line orders aren't double counted).
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 365);
    const fromYmd = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    const toYmdStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    console.log(`Window: DateDernInterv BETWEEN ${fromYmd} AND ${toYmdStr}`);

    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoInt_cde, l.DateDernInterv, c.MtHT_Lignes, i.TypeCode,
              i."Date", i.HeureInterv, i.NoInt_interv
       FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
       WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '${fromYmd}' AND '${toYmdStr}'
         AND c.StatutDossier = 'EXPEDIE'
       ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
       LIMIT 20000`
    );
    console.log(`rows: ${rows.length}`);

    const latest = new Map();
    for (const r of rows) {
      const id = String(r.NOINT_LIGCDE);
      if (!id) continue;
      const cur = latest.get(id);
      if (!cur || isMoreRecent(r.DATE, r.HEUREINTERV, r.NOINT_INTERV, cur.DATE, cur.HEUREINTERV, cur.NOINT_INTERV)) {
        latest.set(id, r);
      }
    }

    const countedCommandes = new Set();
    let totalRevenue = 0;
    let counted = 0;
    for (const [, r] of latest) {
      if (r.TYPECODE === 'REE') continue;
      const cdeId = r.NOINT_CDE ? String(r.NOINT_CDE) : '';
      if (cdeId && countedCommandes.has(cdeId)) continue;
      if (cdeId) countedCommandes.add(cdeId);
      const amount = parseFloat(r.MTHT_LIGNES);
      if (Number.isNaN(amount)) continue;
      totalRevenue += amount;
      counted++;
    }
    console.log(`Counted ${counted} distinct orders.`);
    console.log(`Total revenue (HT), trailing 365 days: ${totalRevenue.toFixed(2)}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
