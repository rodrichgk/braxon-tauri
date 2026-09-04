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

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    // Does ATTENTE ACCORD correlate with "never touched by a technician"
    // (no Intervention rows at all) vs "has been worked, now stuck on a
    // revised quote"? Sample 300 open ATTENTE ACCORD jobs and check.
    const attenteJobs = await conn.query(
      `SELECT l.NoInt_Ligcde FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l."Soldée" = False AND l.Type_Service IN ('100','101','102','103')
         AND c.StatutDossier = 'ATTENTE ACCORD' AND l.NomClient <> ''
       LIMIT 300`
    );
    const ids = attenteJobs.map(r => r.NOINT_LIGCDE).filter(Boolean);
    console.log(`Sampled ATTENTE ACCORD open jobs: ${ids.length}`);
    if (ids.length > 0) {
      const chunk = ids.join(',');
      const steps = await conn.query(
        `SELECT NoIntLigcde, TypeCode FROM Intervention WHERE NoIntLigcde IN (${chunk})`
      );
      const withSteps = new Set(steps.map(s => s.NOINTLIGCDE));
      console.log(`Of ${ids.length} ATTENTE ACCORD jobs, ${withSteps.size} have at least one Intervention row (ever touched).`);
      const typeCodeCounts = new Map();
      for (const s of steps) {
        const tc = s.TYPECODE || '(blank)';
        typeCodeCounts.set(tc, (typeCodeCounts.get(tc) || 0) + 1);
      }
      console.log('TypeCode distribution among their Intervention rows:');
      for (const [tc, n] of [...typeCodeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
        console.log(`  ${n.toString().padStart(4)}  ${tc}`);
      }
    }

    // Same check for EN ATELIER and blank StatutDossier — do THEY have
    // Intervention rows (i.e. actually being worked)?
    for (const status of ['EN ATELIER', '']) {
      const label = status || '(blank)';
      const jobs = await conn.query(
        `SELECT l.NoInt_Ligcde FROM LigCde l
         LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
         WHERE l."Soldée" = False AND l.Type_Service IN ('100','101','102','103')
           AND ${status ? `c.StatutDossier = '${status}'` : `(c.StatutDossier IS NULL OR c.StatutDossier = '')`}
           AND l.NomClient <> '' LIMIT 300`
      );
      const jids = jobs.map(r => r.NOINT_LIGCDE).filter(Boolean);
      console.log(`\nStatutDossier=${label}: ${jids.length} open jobs sampled`);
      if (jids.length > 0) {
        const chunk = jids.join(',');
        const steps = await conn.query(`SELECT NoIntLigcde, TypeCode FROM Intervention WHERE NoIntLigcde IN (${chunk})`);
        const withSteps = new Set(steps.map(s => s.NOINTLIGCDE));
        console.log(`  ${withSteps.size} of ${jids.length} have at least one Intervention row`);
      }
    }

    // Cross-check: of jobs with NO Intervention row at all (truly
    // untouched), what's their StatutDossier distribution?
    console.log('\n--- StatutDossier of open jobs with ZERO Intervention rows ---');
    const allOpen = await conn.query(
      `SELECT l.NoInt_Ligcde, c.StatutDossier FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l."Soldée" = False AND l.Type_Service IN ('100','101','102','103') AND l.NomClient <> ''
       LIMIT 2000`
    );
    const openIds = allOpen.map(r => r.NOINT_LIGCDE).filter(Boolean);
    const chunk2 = openIds.join(',');
    const stepRows = await conn.query(`SELECT DISTINCT NoIntLigcde FROM Intervention WHERE NoIntLigcde IN (${chunk2})`);
    const touchedIds = new Set(stepRows.map(r => r.NOINTLIGCDE));
    const untouchedStatus = new Map();
    for (const r of allOpen) {
      if (touchedIds.has(r.NOINT_LIGCDE)) continue;
      const s = r.STATUTDOSSIER || '(blank)';
      untouchedStatus.set(s, (untouchedStatus.get(s) || 0) + 1);
    }
    const totalUntouched = [...untouchedStatus.values()].reduce((a, b) => a + b, 0);
    console.log(`Untouched (no Intervention row) among ${openIds.length} sampled: ${totalUntouched}`);
    for (const [s, n] of [...untouchedStatus.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n.toString().padStart(4)}  ${s}`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
