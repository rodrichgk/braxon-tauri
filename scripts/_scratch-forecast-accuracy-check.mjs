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

function toISO(d) { return d.toISOString().slice(0, 10); }

// 4D returns date columns as "DD/MM/YYYY..." strings (or sometimes as a
// Date object whose .toString() renders that way) — NOT ISO. JS's native
// Date parser assumes MM/DD/YYYY and silently scrambles any day <= 12
// into the wrong month without throwing. Mirrors reman.rs's to_ymd.
function toYmd(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

// Mirrors reman.rs's classify_outcome exactly.
function classifyOutcome(typeCode) {
  switch (typeCode) {
    case 'R': return 'repaired';
    case 'NDL': case 'ND': case 'RSTND': return 'non_repairable';
    case 'RAS': case 'RSTNF': case 'REE': return 'no_fault_found';
    case 'ES': return 'standard_exchange';
    case 'V': return 'sold';
    case 'VST': case 'RST': return 'sent_to_subcontractor';
    default: return 'other';
  }
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const today = new Date();

    // 1. Daily intake for the last 60 days, to see the July->August trend.
    const from60 = new Date(today); from60.setDate(from60.getDate() - 60);
    const intakeRows = await conn.query(
      `SELECT c.DateCommande, l.NoInt_Ligcde
       FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE c.DateCommande BETWEEN '${toISO(from60)}' AND '${toISO(today)}'`
    );
    const byDay = new Map();
    let skipped = 0;
    for (const r of intakeRows) {
      const d = toYmd(r.DATECOMMANDE);
      if (!d) { skipped++; continue; }
      byDay.set(d, (byDay.get(d) || 0) + 1);
    }
    if (skipped) console.log(`(skipped ${skipped} rows with unparseable DateCommande)`);
    const days = [...byDay.keys()].sort();
    console.log(`=== Daily intake, last 60 days (${days[0]} .. ${days[days.length - 1]}) ===`);
    // Weekly buckets for readability.
    const weekly = new Map();
    for (const [d, c] of byDay) {
      const dt = new Date(d);
      const week = toISO(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - dt.getDay()));
      weekly.set(week, (weekly.get(week) || 0) + c);
    }
    [...weekly.entries()].sort().forEach(([w, c]) => console.log(`  week of ${w}: ${c} units`));

    // 2. Historical outcome mix (180-day lookback, matching predicted_mix_from_family_counts).
    const from180 = new Date(today); from180.setDate(from180.getDate() - 180);
    const histSql = `
      SELECT l.NoInt_Ligcde, am.Designation, i.TypeCode, i."Date", i.HeureInterv, i.NoInt_interv
      FROM LigCde l
      LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
      LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
      WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '${toISO(from180)}' AND '${toISO(today)}'
      ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
      LIMIT 20000`;
    const histRows = await conn.query(histSql);
    const latestByJob = new Map();
    for (const r of histRows) {
      const id = r.NOINT_LIGCDE;
      if (!id) continue;
      // Simplified dedup: keep first-seen (SQL already orders NoInt_interv
      // DESC) — good enough for an aggregate mix sanity check, not claiming
      // the same rigor as is_more_recent_step here.
      if (!latestByJob.has(id)) latestByJob.set(id, r);
    }
    const histMix = new Map();
    let histTotal = 0;
    for (const r of latestByJob.values()) {
      const outcome = classifyOutcome(r.TYPECODE);
      histMix.set(outcome, (histMix.get(outcome) || 0) + 1);
      histTotal++;
    }
    console.log(`\n=== Historical outcome mix, last 180 days (${histTotal} closed jobs) ===`);
    for (const [o, c] of [...histMix.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${o}: ${c} (${(c / histTotal * 100).toFixed(1)}%)`);
    }

    // 3. Actual outcome mix for August so far only.
    const augFrom = '2026-08-01';
    const augRows = latestByJob;
    const augMix = new Map();
    let augTotal = 0;
    for (const r of augRows.values()) {
      // DateDernInterv already scoped the outer query; filter client-side to August.
      // Note: r.DATE is the Intervention step's own date, close enough to
      // DateDernInterv for this sanity check.
      const dd = toYmd(r.DATE);
      if (!dd || dd < augFrom) continue;
      const outcome = classifyOutcome(r.TYPECODE);
      augMix.set(outcome, (augMix.get(outcome) || 0) + 1);
      augTotal++;
    }
    console.log(`\n=== Actual outcome mix, August 2026 so far (${augTotal} closed jobs) ===`);
    for (const [o, c] of [...augMix.entries()].sort((a, b) => b[1] - a[1])) {
      const histPct = histTotal ? ((histMix.get(o) || 0) / histTotal * 100) : 0;
      const augPct = augTotal ? (c / augTotal * 100) : 0;
      console.log(`  ${o}: ${c} (${augPct.toFixed(1)}%) vs historical ${histPct.toFixed(1)}%  [delta ${(augPct - histPct).toFixed(1)}pp]`);
    }

    // 4. Current open-queue size right now — matching reman_forecast_open_queue's
    //    exact filters (dated + not more than a month past deadline), not
    //    just the raw Soldée=False/Type_Service scoping.
    const openRows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.DateLimiteLivraison FROM LigCde l
       WHERE l."Soldée" = False AND l.Type_Service IN ('100','101','102','103')`
    );
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffYmd = toISO(cutoff);
    const seen = new Set();
    let unitsWithTech = 0;
    for (const r of openRows) {
      const id = r.NOINT_LIGCDE;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const dd = toYmd(r.DATELIMITELIVRAISON);
      if (!dd || dd < cutoffYmd) continue;
      unitsWithTech++;
    }
    console.log(`\nRaw open bench rows (Soldée=False, Type_Service in 100-103): ${openRows.length}`);
    console.log(`Matching reman_forecast_open_queue's real filter (dated, not >1mo past deadline): ${unitsWithTech} units`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
