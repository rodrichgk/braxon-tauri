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

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toDDMMYYYY(ymd) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    // 1) What does each open-job TypeCode we've seen (AP/ARC/ATN/ARD/ST/TES/ER/PA)
    // actually mean, per its own TypeLibelle? Only look at rows for jobs
    // currently open (Soldée=False) so this reflects live-queue meaning, not
    // whatever a TypeCode meant on some ancient closed job.
    console.log('--- TypeCode -> TypeLibelle, open jobs only ---');
    const openIds = await conn.query(
      `SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = False AND Type_Service IN ('100','101','102','103') LIMIT 5000`
    );
    const idList = openIds.map(r => r.NOINT_LIGCDE).filter(Boolean);
    console.log(`Open bench jobs: ${idList.length}`);
    if (idList.length > 0) {
      const chunk = idList.slice(0, 3000).join(',');
      const rows = await conn.query(
        `SELECT TypeCode, TypeLibelle FROM Intervention WHERE NoIntLigcde IN (${chunk})`
      );
      const seen = new Map();
      for (const r of rows) {
        const code = r.TYPECODE || '(blank)';
        const lib = r.TYPELIBELLE || '(blank)';
        const key = `${code} :: ${lib}`;
        seen.set(key, (seen.get(key) || 0) + 1);
      }
      const sorted = [...seen.entries()].sort((a, b) => b[1] - a[1]);
      for (const [key, count] of sorted.slice(0, 40)) {
        console.log(`  ${count.toString().padStart(5)}  ${key}`);
      }
    }

    // 2) Commande.StatutDossier for currently-open jobs, to check "ATTENTE
    // ACCORD" volume live right now (not historical).
    console.log('\n--- Commande.StatutDossier, open jobs only ---');
    const statusRows = await conn.query(
      `SELECT c.StatutDossier, COUNT(*) as n FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l."Soldée" = False AND l.Type_Service IN ('100','101','102','103')
       GROUP BY c.StatutDossier`
    ).catch(async () => {
      // COUNT(*) may crash this driver on some setups — established
      // fallback: pull raw rows and count in JS instead.
      const raw = await conn.query(
        `SELECT c.StatutDossier FROM LigCde l
         LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
         WHERE l."Soldée" = False AND l.Type_Service IN ('100','101','102','103') LIMIT 5000`
      );
      const counts = new Map();
      for (const r of raw) {
        const key = r.STATUTDOSSIER || '(blank)';
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      return [...counts.entries()].map(([StatutDossier, n]) => ({ STATUTDOSSIER: StatutDossier, N: n }));
    });
    for (const r of statusRows) {
      console.log(`  ${String(r.N ?? r.n).padStart(5)}  ${r.STATUTDOSSIER ?? r.StatutDossier ?? '(blank)'}`);
    }

    // 3) Jobs closed TODAY (Soldée=True, DateDernInterv = today), outcome mix.
    const today = todayYmd();
    const todayDDMM = toDDMMYYYY(today);
    console.log(`\n--- Jobs closed today (${today} / ${todayDDMM}) ---`);
    const closedTodayIds = await conn.query(
      `SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = True AND DateDernInterv LIKE '${todayDDMM}%' AND NomClient <> '' LIMIT 2000`
    );
    console.log(`Closed today (raw LigCde count): ${closedTodayIds.length}`);
    const ids = closedTodayIds.map(r => r.NOINT_LIGCDE).filter(Boolean);
    if (ids.length > 0) {
      const chunk = ids.join(',');
      const steps = await conn.query(
        `SELECT NoIntLigcde, TypeCode, TypeLibelle, "Date", HeureInterv, NoInt_interv FROM Intervention WHERE NoIntLigcde IN (${chunk})`
      );
      const latestByJob = new Map();
      for (const s of steps) {
        const id = s.NOINTLIGCDE;
        const existing = latestByJob.get(id);
        const key = `${s.DATE || ''} ${s.HEUREINTERV || ''} ${s.NOINT_INTERV || 0}`;
        if (!existing || key > existing.key) {
          latestByJob.set(id, { key, TypeCode: s.TYPECODE, TypeLibelle: s.TYPELIBELLE });
        }
      }
      const mix = new Map();
      for (const [, v] of latestByJob) {
        const label = `${v.TypeCode || '(blank)'} :: ${v.TypeLibelle || '(blank)'}`;
        mix.set(label, (mix.get(label) || 0) + 1);
      }
      console.log(`Distinct closed-today jobs (dedup by latest step): ${latestByJob.size}`);
      for (const [label, count] of [...mix.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${count.toString().padStart(5)}  ${label}`);
      }
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
