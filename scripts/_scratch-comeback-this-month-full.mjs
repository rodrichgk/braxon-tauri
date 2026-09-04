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
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const from = process.argv[2] || '2026-08-01';
    const to = process.argv[3] || '2026-08-31';
    console.log(`Window: ${from} .. ${to}`);

    // Mirrors reman_analytics's intake_sql scope (DateCommande BETWEEN),
    // pulling every job in the window that has a SuiviGar_AncNoInterv link.
    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoIntervention, l.SuiviGar_AncNoInterv, c.DateCommande
       FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE c.DateCommande BETWEEN '${from}' AND '${to}'`
    );
    const comebacks = rows.filter(r => r.SUIVIGAR_ANCNOINTERV && r.SUIVIGAR_ANCNOINTERV.trim() && r.SUIVIGAR_ANCNOINTERV.trim() !== '0');
    console.log(`Comeback-linked jobs, August 2026 (DateCommande): ${comebacks.length}`);

    const uniqueRefs = [...new Set(comebacks.map(r => r.SUIVIGAR_ANCNOINTERV.trim()))];
    const inList = uniqueRefs.map(r => `'${r.replace(/'/g, "''")}'`).join(',');
    const prevRows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoIntervention, l.TechDernInterv, l.NomDernierTech, l.Type_Service, am.Designation
       FROM LigCde l LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
       WHERE l.NoIntervention IN (${inList})`
    );
    const prevByRef = new Map(prevRows.map(r => [r.NOINTERVENTION, r]));

    const nffRows = await conn.query(
      `SELECT NoIntervention FROM LigCde WHERE NoIntervention IN (${inList})
       AND ("RAS" = True OR "SGRAS" = True OR "SGRefuseePanneDiff" = True OR "SGRefuseeAutreMotif" = True)`
    );
    const excludedRefs = new Set(nffRows.map(r => r.NOINTERVENTION));

    const byTech = new Map(); // techId -> { count, name, jobs: [{newRef, prevRef}] }
    let excludedCount = 0;
    let unattributed = 0;
    for (const c of comebacks) {
      const prevRef = c.SUIVIGAR_ANCNOINTERV.trim();
      if (excludedRefs.has(prevRef)) { excludedCount++; continue; }
      const prev = prevByRef.get(prevRef);
      const techId = prev?.TECHDERNINTERV != null ? String(prev.TECHDERNINTERV) : null;
      if (!techId || techId === '0' || techId === '2403') { unattributed++; continue; }
      if (!byTech.has(techId)) byTech.set(techId, { count: 0, name: prev.NOMDERNIERTECH, jobs: [] });
      const entry = byTech.get(techId);
      entry.count++;
      entry.jobs.push({ newRef: c.NOINTERVENTION, prevRef, prevService: prev.TYPE_SERVICE, prevFamily: prev.DESIGNATION });
    }

    console.log(`Excluded (NFF/SG-refusal): ${excludedCount}`);
    console.log(`Unattributed (tech 0 or Superviseur): ${unattributed}`);
    const attributedTotal = [...byTech.values()].reduce((s, e) => s + e.count, 0);
    console.log(`Attributed total (sum across ALL technicians, not just top 10): ${attributedTotal}`);
    console.log(`Sanity check: excluded + unattributed + attributed = ${excludedCount + unattributed + attributedTotal} (should equal ${comebacks.length})`);

    console.log('\n=== Full technician breakdown (all technicians, not truncated to 10) ===');
    [...byTech.entries()].sort((a, b) => b[1].count - a[1].count).forEach(([id, e]) => {
      console.log(`  tech ${id} (${e.name}): ${e.count}`);
    });

    console.log('\n=== Archimed Saïd (tech 3389) — job detail ===');
    const archimed = byTech.get('3389');
    if (!archimed) {
      console.log('  Not present in this month\'s attributed comebacks.');
    } else {
      archimed.jobs.forEach(j => console.log(
        `  New job ${j.newRef} <- prev job ${j.prevRef} | prev Type_Service=${j.prevService} | prev family="${j.prevFamily}"`
      ));
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
