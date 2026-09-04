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
  const ymdA = toYmd(dA) || ''; const ymdB = toYmd(dB) || '';
  if (ymdA !== ymdB) return ymdA > ymdB;
  const hA2 = hA || ''; const hB2 = hB || '';
  if (hA2 !== hB2) return hA2 > hB2;
  return (idA || 0) > (idB || 0);
}

// Only these TypeCodes count as "revenue" per the requested definition —
// Réparation, Échange Standard, Vente, Validation Sous-Traitance.
const ALLOWED = new Set(['R', 'ES', 'V', 'VST']);

async function revenueFor(conn, fromYmd, toYmdStr, label) {
  const revRows = await conn.query(
    `SELECT l.NoInt_Ligcde, l.NoInt_cde, l.DateDernInterv, c.MtHT_Lignes, i.TypeCode, i.TypeLibelle, i."Date", i.HeureInterv, i.NoInt_interv
     FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
     WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '${fromYmd}' AND '${toYmdStr}' AND c.StatutDossier = 'EXPEDIE'
     ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC LIMIT 20000`
  );
  const latestRev = new Map();
  for (const r of revRows) {
    const id = r.NOINT_LIGCDE; if (!id) continue;
    const cur = latestRev.get(id);
    if (!cur || isMoreRecent(r.DATE, r.HEUREINTERV, r.NOINT_INTERV, cur.DATE, cur.HEUREINTERV, cur.NOINT_INTERV)) latestRev.set(id, r);
  }
  let revenue = 0; const countedCde = new Set(); let jobCount = 0;
  const outcomeBreakdown = new Map();
  let excludedRevenue = 0, excludedCount = 0;
  for (const [, r] of latestRev) {
    const code = r.TYPECODE;
    if (!ALLOWED.has(code)) {
      excludedCount++;
      const amt = parseFloat(r.MTHT_LIGNES);
      if (!isNaN(amt)) excludedRevenue += amt;
      continue;
    }
    const cde = r.NOINT_CDE; if (cde && countedCde.has(cde)) continue; if (cde) countedCde.add(cde);
    const amt = parseFloat(r.MTHT_LIGNES); if (!isNaN(amt)) { revenue += amt; jobCount++; }
    outcomeBreakdown.set(r.TYPELIBELLE || code, (outcomeBreakdown.get(r.TYPELIBELLE || code) || 0) + 1);
  }
  console.log(`${label}: ${revenue.toFixed(2)} EUR HT, ${jobCount} orders`);
  console.log('  Outcome breakdown:', JSON.stringify(Object.fromEntries(outcomeBreakdown)));
  console.log(`  Excluded (other outcomes): ${excludedCount} jobs, ${excludedRevenue.toFixed(2)} EUR HT not counted`);
  return revenue;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const r1 = await revenueFor(conn, '2026-08-01', '2026-08-19', 'August 2026 (1-19)');
    const r2 = await revenueFor(conn, '2025-08-01', '2025-08-19', 'August 2025 (1-19, same period)');
    console.log(`\nYoY change (same period, filtered): ${(((r1-r2)/r2)*100).toFixed(1)}%`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
