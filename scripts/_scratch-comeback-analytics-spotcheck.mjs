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

// Mirrors reman.rs's reman_analytics comeback logic, simplified (no
// chronological-latest-row dedup — not needed here, just a plausibility
// check on the tally direction and the batched IN-clause resolution).
function toISO(d) { return d.toISOString().slice(0, 10); }

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const to = new Date();
    const from = new Date();
    from.setMonth(from.getMonth() - 6);
    // reman.rs passes plain ISO (YYYY-MM-DD) directly into this same
    // BETWEEN comparison against DateCommande — matching that exactly.
    const fromStr = toISO(from);
    const toStr = toISO(to);
    console.log(`Range: ${fromStr} -> ${toStr}`);

    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.SuiviGar_AncNoInterv
       FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE c.DateCommande BETWEEN '${fromStr}' AND '${toStr}'`
    );
    console.log(`Total LigCde rows in window: ${rows.length}`);

    const comebackRefs = rows
      .map(r => (r.SUIVIGAR_ANCNOINTERV || '').trim())
      .filter(r => r && r !== '0');
    console.log(`Comeback-linked rows in window: ${comebackRefs.length}`);

    const uniqueRefs = [...new Set(comebackRefs)];
    if (uniqueRefs.length === 0) { console.log('No comebacks in this window.'); return; }

    const inList = uniqueRefs.map(r => `'${r.replace(/'/g, "''")}'`).join(',');
    const prevRows = await conn.query(
      `SELECT l.NoIntervention, l.TechDernInterv, am.Designation
       FROM LigCde l
       LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
       WHERE l.NoIntervention IN (${inList})`
    );
    console.log(`Resolved ${prevRows.length} of ${uniqueRefs.length} unique previous-job references.`);

    const techByRef = new Map();
    const famByRef = new Map();
    for (const r of prevRows) {
      if (r.TECHDERNINTERV && r.TECHDERNINTERV !== '0' && r.TECHDERNINTERV !== '2403') {
        techByRef.set(r.NOINTERVENTION, r.TECHDERNINTERV);
      }
      if (r.DESIGNATION) famByRef.set(r.NOINTERVENTION, r.DESIGNATION.trim());
    }

    // Exclusion — mirrors reman.rs's excluded_prev_refs lookup (one
    // WHERE-only query against the same ref list, Boolean columns can
    // never be SELECTed). Broadened 2026-08-06 beyond plain RAS to also
    // cover SGRAS/SGRefuseePanneDiff/SGRefuseeAutreMotif, confirmed live
    // by the workflow owner as the same "not a repair failure" shape.
    const nffRows = await conn.query(
      `SELECT NoIntervention FROM LigCde WHERE NoIntervention IN (${inList})
       AND ("RAS" = True OR "SGRAS" = True OR "SGRefuseePanneDiff" = True OR "SGRefuseeAutreMotif" = True)`
    );
    const nffRefs = new Set(nffRows.map(r => r.NOINTERVENTION));
    console.log(`Of those, ${nffRefs.size} previous jobs are excluded (RAS/SGRAS/SGRefuseePanneDiff/SGRefuseeAutreMotif) — excluded from blame breakdown below.`);

    const byTech = new Map();
    const byFamily = new Map();
    let afterNffCount = 0;
    for (const ref of comebackRefs) {
      if (nffRefs.has(ref)) { afterNffCount++; continue; }
      const tech = techByRef.get(ref);
      if (tech) byTech.set(tech, (byTech.get(tech) || 0) + 1);
      const fam = famByRef.get(ref);
      if (fam) byFamily.set(fam, (byFamily.get(fam) || 0) + 1);
    }
    console.log(`comeback_after_nff_count would be: ${afterNffCount}`);

    console.log('\n=== Top 10 by technician id, NFF-preceded excluded (name resolution skipped here) ===');
    [...byTech.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([id, c]) => console.log(`  tech ${id}: ${c}`));

    console.log('\n=== Top 10 by family, NFF-preceded excluded (raw Designation, unparsed) ===');
    [...byFamily.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([f, c]) => console.log(`  ${f}: ${c}`));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
