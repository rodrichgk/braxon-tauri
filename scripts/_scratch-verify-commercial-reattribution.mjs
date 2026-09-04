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

const COMMERCIAL = new Set(['3495', '3976', '4028', '71', '72']);

function classifyOutcome(isClosed, typeCode) {
  if (!isClosed) return 'in_progress';
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
    const from = '2026-02-28', to = '2026-08-30';
    const rows = await conn.query(
      `SELECT i.NoIntLigcde, i.NoIntTechn, i."Date"
       FROM Intervention i
       JOIN LigCde l ON i.NoIntLigcde = l.NoInt_Ligcde
       WHERE i."Date" BETWEEN '${from}' AND '${to}' AND l.NomClient <> ''
       LIMIT 20000`
    );
    const techUnits = new Map(); // tech_id -> Set(job_id)  (raw, no Superviseur reattribution — not needed for this check)
    for (const r of rows) {
      const jobId = String(r.NOINTLIGCDE), techId = String(r.NOINTTECHN ?? '0');
      if (!jobId) continue;
      if (!techUnits.has(techId)) techUnits.set(techId, new Set());
      techUnits.get(techId).add(jobId);
    }

    // BEFORE: how many jobs were credited to the known commercial ids?
    console.log('--- BEFORE reattribution ---');
    for (const cid of COMMERCIAL) {
      if (techUnits.has(cid)) console.log(`  tech ${cid} (commercial): ${techUnits.get(cid).size} units`);
    }

    // Full step history for every touched job.
    const allIds = new Set();
    for (const set of techUnits.values()) for (const id of set) allIds.add(id);
    const idList = [...allIds].join(',');
    const stepRows = await conn.query(
      `SELECT NoIntLigcde, NoIntTechn, TypeCode, "Date", HeureInterv, NoInt_interv FROM Intervention WHERE NoIntLigcde IN (${idList})`
    );
    const jobSteps = new Map();
    for (const r of stepRows) {
      const jobId = String(r.NOINTLIGCDE);
      if (!jobSteps.has(jobId)) jobSteps.set(jobId, []);
      jobSteps.get(jobId).push(r);
    }
    function latestMatching(steps, predicate) {
      let best = null, bestKey = null;
      for (const r of steps) {
        if (!predicate(r)) continue;
        const key = `${r.DATE || ''} ${r.HEUREINTERV || ''} ${String(r.NOINT_INTERV || 0).padStart(10, '0')}`;
        if (!best || key > bestKey) { best = r; bestKey = key; }
      }
      return best;
    }

    // REATTRIBUTE
    const reattributed = new Map();
    let redirectedCount = 0;
    for (const [techId, jobs] of techUnits) {
      for (const jobId of jobs) {
        let effective = techId;
        if (COMMERCIAL.has(techId)) {
          const steps = jobSteps.get(jobId) || [];
          const real = latestMatching(steps, r => {
            const t = String(r.NOINTTECHN ?? '0');
            return t !== '0' && !COMMERCIAL.has(t);
          });
          if (real) { effective = String(real.NOINTTECHN); redirectedCount++; }
        }
        if (!reattributed.has(effective)) reattributed.set(effective, new Set());
        reattributed.get(effective).add(jobId);
      }
    }
    console.log(`\nRedirected ${redirectedCount} commercial-attributed touches to a real technician.`);

    console.log('\n--- AFTER reattribution ---');
    for (const cid of COMMERCIAL) {
      const n = reattributed.has(cid) ? reattributed.get(cid).size : 0;
      console.log(`  tech ${cid} (commercial): ${n} units remaining (should be near 0 or small — jobs with no other technician at all)`);
    }

    // Spot-check: pick one job that got redirected from tech 71, show its full step history.
    let sampleJobId = null;
    for (const jobId of techUnits.get('71') || []) {
      const steps = jobSteps.get(jobId) || [];
      const real = latestMatching(steps, r => { const t = String(r.NOINTTECHN ?? '0'); return t !== '0' && !COMMERCIAL.has(t); });
      if (real) { sampleJobId = jobId; break; }
    }
    if (sampleJobId) {
      console.log(`\nSample job ${sampleJobId}, full step history (chronological order as returned):`);
      for (const r of jobSteps.get(sampleJobId)) {
        console.log(`  tech=${r.NOINTTECHN} type=${r.TYPECODE} date=${r.DATE} heure=${r.HEUREINTERV} id=${r.NOINT_INTERV}`);
      }
    }

    // Also compute the new outcome mix for tech 3569 (a known real technician) before/after, to confirm nothing broke for non-commercial techs.
    const before3569 = techUnits.get('3569')?.size || 0;
    const after3569 = reattributed.get('3569')?.size || 0;
    console.log(`\ntech 3569 (real technician) units: before=${before3569} after=${after3569} (should only grow or stay same, never shrink)`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
