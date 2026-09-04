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

// Hydraulic-side vs ECU/calculateur-side ABS test/action ids (from
// src/lib/testsActionsSystematiques.ts ABS section, live-verified ids).
const HYDRAULIC_IDS = new Set([3806, 3807, 2154, 3805, 2166, 2149, 2151, 2153, 3812, 3811]); // 013,014,018,021,022,023,024,025,031,032 (mixed — see below, trimmed to clear hydraulic ones
const HYD_DEFECT_CONFIRMED = new Set([2154, 3805, 2166]); // 018 electrovanne, 021 capteur pression, 022 moteur-pompe
const ECU_DEFECT_CONFIRMED = new Set([3820, 3810]); // 019 aucune communication, 020 calculateur ABS defectueux
const HYD_NO_DEFECT = new Set([3814, 3816, 3815]); // 036 pas de defaut hydraulique, 037 capteur pression, 038 moteur ABS
const ECU_NO_DEFECT = new Set([3813, 3817]); // 034 pas de defaut calculateur, 035 pas de code defaut memoire

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.Observations, l.LibelleArt
       FROM LigCde l
       WHERE l."Soldée" = True AND l.Type_Service = '101'`
    );
    console.log(`Total closed Type_Service=101 (ABS) jobs: ${rows.length}`);

    const withObs = rows.filter(r => r.OBSERVATIONS && r.OBSERVATIONS.trim().length > 0);
    console.log(`With non-empty Observations: ${withObs.length}`);

    // Show a sample of raw Observations text so we can see real phrasing.
    console.log('\n=== Sample of 20 raw Observations values ===');
    withObs.slice(0, 20).forEach(r => console.log(` - [${r.NOINT_LIGCDE}] "${r.OBSERVATIONS}"`));

    const norm = s => (s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
      .toUpperCase();

    const PHRASES = [
      'DESEQUILIBRE DE FREINAGE',
      'FREINE TOUTE SEULE',
      'FREINE TOUT SEUL',
      'BLOQUEE',
      'BLOQUE',
      'AVG', 'AVD', 'ARG', 'ARD',
    ];

    console.log('\n=== Phrase match counts across all Observations (closed 101 jobs) ===');
    for (const p of PHRASES) {
      const matches = withObs.filter(r => norm(r.OBSERVATIONS).includes(norm(p)));
      console.log(`  "${p}": ${matches.length} jobs`);
    }

    // Jobs matching the specific symptom phrases the user described.
    const symptomMatches = withObs.filter(r => {
      const o = norm(r.OBSERVATIONS);
      return o.includes('DESEQUILIBRE') || o.includes('FREINE TOUTE SEULE') || o.includes('FREINE TOUT SEUL')
        || (o.includes('BLOQUE') && (o.includes('AVG') || o.includes('AVD') || o.includes('ARG') || o.includes('ARD')));
    });
    console.log(`\nJobs matching the described symptom phrasing: ${symptomMatches.length}`);
    symptomMatches.slice(0, 15).forEach(r => console.log(` - [${r.NOINT_LIGCDE}] "${r.OBSERVATIONS}"`));

    if (symptomMatches.length === 0) {
      console.log('\nNo direct phrase matches — will need to inspect raw text more broadly.');
      return;
    }

    // For matched jobs, pull their Zebra_LigCdeTest selections and classify.
    console.log('\n=== Tests & Actions selections for matched jobs ===');
    let hydCount = 0, ecuCount = 0, bothCount = 0, neitherCount = 0;
    for (const r of symptomMatches) {
      const testRows = await conn.query(
        `SELECT NoInt_ParamTest FROM Zebra_LigCdeTest WHERE NoInt_LigCde = ${r.NOINT_LIGCDE}`
      );
      const ids = testRows.map(t => t.NOINT_PARAMTEST);
      const hasHydDefect = ids.some(id => HYD_DEFECT_CONFIRMED.has(id));
      const hasEcuDefect = ids.some(id => ECU_DEFECT_CONFIRMED.has(id));
      const hasHydNoDefect = ids.some(id => HYD_NO_DEFECT.has(id));
      const hasEcuNoDefect = ids.some(id => ECU_NO_DEFECT.has(id));
      let classification = 'unclear';
      if (hasHydDefect && !hasEcuDefect) { classification = 'HYDRAULIC'; hydCount++; }
      else if (hasEcuDefect && !hasHydDefect) { classification = 'ECU'; ecuCount++; }
      else if (hasHydDefect && hasEcuDefect) { classification = 'BOTH'; bothCount++; }
      else { neitherCount++; }
      console.log(` - [${r.NOINT_LIGCDE}] ids=${JSON.stringify(ids)} -> ${classification} (hydNoDefect=${hasHydNoDefect}, ecuNoDefect=${hasEcuNoDefect})`);
    }
    console.log(`\nClassification summary: HYDRAULIC=${hydCount} ECU=${ecuCount} BOTH=${bothCount} UNCLEAR=${neitherCount}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
