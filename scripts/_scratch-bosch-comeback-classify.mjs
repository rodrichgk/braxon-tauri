// READ-ONLY. Classify Bosch ABS comebacks (warranty link populated) as
// "has a pressure sensor" (-> really Bosch 8.1 / ATE-with-sensor) vs
// "no pressure mention" (-> could be genuine Bosch 8.0). SELECT only.
import net from 'net';
import odbc from 'odbc';
import { writeFileSync } from 'fs';

const PROXY_PORT = 19812, REMAN_HOST = '192.168.77.10', REMAN_PORT = 19822;
const server = net.createServer(cl => {
  const rm = net.connect(REMAN_PORT, REMAN_HOST, () => { cl.pipe(rm); rm.pipe(cl); });
  rm.on('error', () => cl.destroy()); cl.on('error', () => rm.destroy());
});
server.on('error', async e => { if (e.code === 'EADDRINUSE') await main(); else { console.error(e); process.exit(1); } });
server.listen(PROXY_PORT, '127.0.0.1', async () => { await main(); });

const OUT = [];
const log = (...a) => { const s = a.join(' '); OUT.push(s); console.log(s); };
const clip = (s, n = 500) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

// pressure-sensor wording / codes -> unit HAS a pressure sensor
const PRESS_RE = /capteur.{0,8}pression|capteur.{0,8}pressoin|\bpression\b|pressure sensor|press\.?\s*sensor|master.?cyl|maitre.?cylindre|\bc0131\b|\bc1301\b|\bc1302\b|\bc1288\b|\bc1440\b|\bc1016\b|\bc1132\b|\bc1142\b|\bc1a99\b|\bc1028\b|\bc0040\b.{0,30}pression|\b01435\b|\b1435\b|\b5301\b|\b5302\b|\b249\s?bar|incoherence capteur pression/i;
// codes that point at a specific OEM
const OEM_RE = {
  VAG:   /\b0143\d\b|\b0077\d\b|\b011\d\d\b|\b4835\b|\b4845\b|N30\/4|\bVAG\b|audi|volkswagen|\bvw\b|\bskoda\b|\bseat\b|passat|golf|polo/i,
  Renault: /\bDF0\d\d\b|\bDF1\d\d\b|renault|scenic|megane|clio|laguna|kangoo|dacia|logan|sandero|espace|trafic|master|modus/i,
  PSA:   /peugeot|citroen|citroën|\bDS\d|\b207\b|\b208\b|\b308\b|\b3008\b|\bc3\b|\bc4\b|\bc5\b/i,
  FordVolvo: /\bford\b|volvo|fiesta|focus|mondeo|transit|\bs40\b|\bv50\b|\bc30\b/i,
  GM:    /opel|vauxhall|corsa|astra|insignia|zafira|meriva/i,
  Merc:  /mercedes|\bmb\b|\bw169\b|\bw245\b|\bw204\b|\bvito\b|\bsprinter\b/i,
  BMW:   /\bbmw\b|\bmini\b/i,
  Nissan: /nissan|micra|note|qashqai|juke/i,
};

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    // every Bosch-family comeback (warranty link populated)
    const rows = await conn.query(`
      SELECT l.NoInt_Ligcde, l.NoIntervention, l.Famille, l.LibelleArt, l.CodeArt,
             l.DateDernInterv, l."DernièreInterv", l.Observations, l.SuiviGar_AncNoInterv
      FROM LigCde l
      WHERE l."Soldée" = True AND l.SuiviGar_AncNoInterv > '0'
        AND (l.Famille LIKE '%osch 8%' OR l.LibelleArt LIKE '%osch 8%' OR l.LibelleArt LIKE '%8.0%' OR l.LibelleArt LIKE '%8.1%')
      ORDER BY l.NoInt_Ligcde DESC LIMIT 4000`);
    log(`Bosch 8.x comebacks with a warranty link: ${rows.length}\n`);

    const buckets = { pressure: [], nopressure: [] };
    for (const r of rows) {
      // pull this job's intervention comments + the previous job
      const iv = await conn.query(
        `SELECT TypeCode, TypeLibelle, Commentaire FROM Intervention WHERE NoIntLigcde = ${r.NOINT_LIGCDE} ORDER BY NoInt_interv ASC LIMIT 40`);
      const prevNo = String(r.SUIVIGAR_ANCNOINTERV).trim().replace(/'/g, "''");
      const prev = await conn.query(
        `SELECT NoInt_Ligcde, NoIntervention, LibelleArt, CodeArt, Observations, DateDernInterv
         FROM LigCde WHERE NoIntervention = '${prevNo}' LIMIT 2`);
      let prevIv = [];
      if (prev[0]) prevIv = await conn.query(
        `SELECT TypeCode, TypeLibelle, Commentaire FROM Intervention WHERE NoIntLigcde = ${prev[0].NOINT_LIGCDE} ORDER BY NoInt_interv ASC LIMIT 40`);

      const allText = [r.OBSERVATIONS, r.LIBELLEART, ...(iv.map(x => x.COMMENTAIRE)),
                       prev[0]?.OBSERVATIONS, prev[0]?.LIBELLEART, ...(prevIv.map(x => x.COMMENTAIRE))]
                       .filter(Boolean).join('  ||  ');
      const hasPress = PRESS_RE.test(allText);
      const oem = Object.entries(OEM_RE).filter(([, re]) => re.test(allText)).map(([k]) => k);
      // pull explicit fault-code tokens
      const codes = [...new Set((allText.toUpperCase().match(/\b(?:DF0\d\d|DF1\d\d|C[01][0-9A-F]{3}|C[01][0-9A-F]{2}|[0-9]{4,5}|DTC[0-9A-F]{4,7})\b/g) || [])
        .filter(x => !/^(0000|1111|2222)$/.test(x)))].slice(0, 12);

      const rec = {
        job: r.NOINTERVENTION, fam: r.FAMILLE, lib: clip(r.LIBELLEART, 60), art: r.CODEART,
        date: r.DATEDERNINTERV, oem: oem.join('/') || '?', codes,
        obs: clip(r.OBSERVATIONS, 260),
        prevLib: clip(prev[0]?.LIBELLEART, 50), prevArt: prev[0]?.CODEART,
        prevObs: clip(prev[0]?.OBSERVATIONS, 220),
        ivKey: clip(iv.map(x => x.COMMENTAIRE).filter(Boolean).join(' ~ '), 400),
        prevIvKey: clip(prevIv.map(x => x.COMMENTAIRE).filter(Boolean).join(' ~ '), 400),
      };
      buckets[hasPress ? 'pressure' : 'nopressure'].push(rec);
    }

    for (const [name, arr] of Object.entries(buckets)) {
      log(`\n\n########################  ${name.toUpperCase()}  (${arr.length})  ########################`);
      for (const r of arr) {
        log(`\n• ${r.job}  [${r.fam}] ${r.lib}  art=${r.art}  oem=${r.oem}  ${r.date}`);
        log(`   codes: ${r.codes.join(', ') || '—'}`);
        log(`   OBS: ${r.obs}`);
        if (r.ivKey) log(`   notes: ${r.ivKey}`);
        log(`   << prev ${r.prevLib} art=${r.prevArt}  OBS: ${r.prevObs}`);
        if (r.prevIvKey) log(`      prev notes: ${r.prevIvKey}`);
      }
    }

    // quick OEM tally
    const tally = {};
    for (const r of buckets.pressure) for (const o of (r.oem === '?' ? ['?'] : r.oem.split('/'))) tally[o] = (tally[o] || 0) + 1;
    log(`\n\n=== OEM tally among PRESSURE comebacks ===`);
    for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) log(`   ${k}: ${v}`);

    writeFileSync('bosch-comeback-classify.out.txt', OUT.join('\n'));
    log('\n(full output -> bosch-comeback-classify.out.txt)');
  } catch (e) {
    log('ERR', JSON.stringify(e.odbcErrors || e.message || e));
  } finally {
    try { await conn.close(); } catch {}
    process.exit(0);
  }
}
