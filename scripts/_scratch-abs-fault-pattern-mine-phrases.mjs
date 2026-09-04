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

// Hydraulic-side vs ECU/calculateur-side "X défectueux(se)" confirmations —
// the cleanest ground-truth signal (an explicit defect confirmation, not
// just a test performed) from the live-verified ABS Tests & Actions ids.
const HYD_DEFECT_CONFIRMED = new Set([2154, 3805, 2166]); // 018 electrovanne, 021 capteur pression, 022 moteur-pompe
const ECU_DEFECT_CONFIRMED = new Set([3820, 3810]); // 019 aucune communication, 020 calculateur ABS defectueux

const STOPWORDS = new Set([
  'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'UN', 'UNE', 'ET', 'EN', 'AU', 'AUX', 'A', 'SUR', 'SUR', 'AVEC', 'SANS',
  'PAS', 'PLUS', 'EST', 'ETRE', 'CE', 'CETTE', 'SON', 'SA', 'SES', 'IL', 'ELLE', 'QUI', 'QUE', 'DANS', 'PAR',
  'POUR', 'OU', 'NE', 'SE', 'AL', 'AIL', 'PANNE', 'PERMANENTE', 'INTERMITENTE', 'PERMANENT', 'INTERMITTENT',
  'THE', 'AND', 'OF', 'TO', 'IN', 'ON', 'IS', 'WITH', 'FOR', 'NO', 'A', 'AN', 'AT', 'WAS', 'ARE',
]);

function tokenize(text) {
  const norm = (text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ');
  return norm.split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.Observations
       FROM LigCde l
       WHERE l."Soldée" = True AND l.Type_Service = '101'`
    );
    const withObs = rows.filter(r => r.OBSERVATIONS && r.OBSERVATIONS.trim().length > 0);
    console.log(`Closed 101 jobs with Observations: ${withObs.length}`);

    // Classify every one of them via Zebra_LigCdeTest (not just the
    // phrase-matched subset this time) to get real base rates and a
    // bigger ECU sample for comparison.
    let hyd = [], ecu = [], both = 0, unclear = 0;
    let i = 0;
    for (const r of withObs) {
      const testRows = await conn.query(
        `SELECT NoInt_ParamTest FROM Zebra_LigCdeTest WHERE NoInt_LigCde = ${r.NOINT_LIGCDE}`
      );
      const ids = testRows.map(t => t.NOINT_PARAMTEST);
      const h = ids.some(id => HYD_DEFECT_CONFIRMED.has(id));
      const e = ids.some(id => ECU_DEFECT_CONFIRMED.has(id));
      if (h && e) both++;
      else if (h) hyd.push(r.OBSERVATIONS);
      else if (e) ecu.push(r.OBSERVATIONS);
      else unclear++;
      i++;
      if (i % 1000 === 0) console.log(`  ...scanned ${i}/${withObs.length}`);
    }
    console.log(`\nBase rates across ALL closed 101 jobs: HYDRAULIC=${hyd.length} ECU=${ecu.length} BOTH=${both} UNCLEAR(no defect-confirm test)=${unclear}`);

    // Word frequency within each class.
    const freq = (texts) => {
      const counts = new Map();
      for (const t of texts) {
        const seen = new Set(tokenize(t)); // count once per job, not per occurrence
        for (const w of seen) counts.set(w, (counts.get(w) || 0) + 1);
      }
      return counts;
    };
    const hydFreq = freq(hyd);
    const ecuFreq = freq(ecu);

    // Words strongly associated with HYDRAULIC: frequent in hyd set, rare in ecu set.
    console.log('\n=== Top words associated with HYDRAULIC (min 15 occurrences) ===');
    const hydRanked = [...hydFreq.entries()]
      .filter(([, c]) => c >= 15)
      .map(([w, c]) => ({ w, hydCount: c, hydRate: c / hyd.length, ecuCount: ecuFreq.get(w) || 0, ecuRate: (ecuFreq.get(w) || 0) / ecu.length }))
      .sort((a, b) => (b.hydRate - b.ecuRate) - (a.hydRate - a.ecuRate));
    hydRanked.slice(0, 40).forEach(x => console.log(`  ${x.w}: hyd=${x.hydCount} (${(x.hydRate * 100).toFixed(1)}%)  ecu=${x.ecuCount} (${(x.ecuRate * 100).toFixed(1)}%)`));

    console.log('\n=== Top words associated with ECU (min 3 occurrences, small sample) ===');
    const ecuRanked = [...ecuFreq.entries()]
      .filter(([, c]) => c >= 3)
      .map(([w, c]) => ({ w, ecuCount: c, ecuRate: c / ecu.length, hydCount: hydFreq.get(w) || 0, hydRate: (hydFreq.get(w) || 0) / hyd.length }))
      .sort((a, b) => (b.ecuRate - b.hydRate) - (a.ecuRate - a.hydRate));
    ecuRanked.slice(0, 40).forEach(x => console.log(`  ${x.w}: ecu=${x.ecuCount} (${(x.ecuRate * 100).toFixed(1)}%)  hyd=${x.hydCount} (${(x.hydRate * 100).toFixed(1)}%)`));

    console.log('\n=== Sample of 25 raw ECU-classified Observations (small class, worth reading directly) ===');
    ecu.slice(0, 25).forEach(o => console.log(` - "${o}"`));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
