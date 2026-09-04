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
  const m = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
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
    const from = '2026-02-28', to = '2026-08-29'; // matches default 6-month quick range
    const rows = await conn.query(
      `SELECT i.NoIntLigcde, i.NoIntTechn, i."Date"
       FROM Intervention i
       JOIN LigCde l ON i.NoIntLigcde = l.NoInt_Ligcde
       WHERE i."Date" BETWEEN '${from}' AND '${to}' AND l.NomClient <> ''
       LIMIT 20000`
    );
    const techUnits = new Map(); // tech_id -> Set(job_id)
    for (const r of rows) {
      const jobId = r.NOINTLIGCDE, techId = r.NOINTTECHN ?? '0';
      if (!jobId) continue;
      if (!techUnits.has(techId)) techUnits.set(techId, new Set());
      techUnits.get(techId).add(jobId);
    }
    const allIds = new Set();
    for (const set of techUnits.values()) for (const id of set) allIds.add(id);
    const idList = [...allIds].join(',');
    console.log(`Distinct technicians (raw, incl. Superviseur/Archimed): ${techUnits.size}, distinct touched jobs: ${allIds.size}`);

    const closedRows = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = True AND NoInt_Ligcde IN (${idList})`);
    const closedIds = new Set(closedRows.map(r => r.NOINT_LIGCDE));

    const stepRows = await conn.query(`SELECT NoIntLigcde, TypeCode, "Date", HeureInterv, NoInt_interv FROM Intervention WHERE NoIntLigcde IN (${idList})`);
    const latestByJob = new Map();
    for (const r of stepRows) {
      const id = r.NOINTLIGCDE;
      const key = `${r.DATE || ''} ${r.HEUREINTERV || ''} ${String(r.NOINT_INTERV || 0).padStart(10, '0')}`;
      const existing = latestByJob.get(id);
      if (!existing || key > existing.key) latestByJob.set(id, { key, typeCode: r.TYPECODE });
    }

    const outcomeByJob = new Map();
    for (const id of allIds) {
      const tc = latestByJob.get(id)?.typeCode;
      outcomeByJob.set(id, classifyOutcome(closedIds.has(id), tc));
    }

    // Show top 8 by units touched, with their transformation mix.
    const ranked = [...techUnits.entries()]
      .filter(([id]) => id !== '0' && id !== '2403' && id !== '3389')
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 8);
    console.log('\nTop 8 technicians by units touched, with current outcome mix:');
    for (const [techId, jobs] of ranked) {
      const mix = {};
      for (const job of jobs) {
        const o = outcomeByJob.get(job) || 'unknown';
        mix[o] = (mix[o] || 0) + 1;
      }
      const total = jobs.size;
      const decided = total - (mix.in_progress || 0);
      const transformed = (mix.repaired || 0) + (mix.standard_exchange || 0) + (mix.sold || 0);
      const rate = decided > 0 ? Math.round((transformed / decided) * 100) : null;
      console.log(`  tech ${techId}: units=${total} rate=${rate === null ? 'n/a' : rate + '%'} (${transformed}/${decided} decided)`, mix);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
