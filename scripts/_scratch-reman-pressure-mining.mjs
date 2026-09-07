// READ-ONLY mining of the REMAN 4D ERP for Bosch 8.0 / 8.1 / 9.0 ABS jobs:
// pressure-sensor / hydraulic-block / calibration / steering-angle mentions,
// and warranty comebacks (SuiviGar_AncNoInterv link). SELECT only.
import net from 'net';
import odbc from 'odbc';
import { writeFileSync } from 'fs';

const PROXY_PORT = 19812, REMAN_HOST = '192.168.77.10', REMAN_PORT = 19822;
const server = net.createServer(client => {
  const remote = net.connect(REMAN_PORT, REMAN_HOST, () => { client.pipe(remote); remote.pipe(client); });
  remote.on('error', () => client.destroy());
  client.on('error', () => remote.destroy());
});
server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') { await main(); } else { console.error('Proxy error:', err); process.exit(1); }
});
server.listen(PROXY_PORT, '127.0.0.1', async () => { await main(); });

const OUT = [];
const log = (...a) => { const s = a.join(' '); OUT.push(s); console.log(s); };

// keyword buckets (lower-cased haystack)
const KW = {
  pressure:  [/capteur.{0,6}pression/, /\bpression\b/, /press\.?\s*sensor/, /pressure sensor/, /g20[01]\b/],
  hydraulic: [/hydraulique/, /bloc hydro/, /\bhydro\b/, /bloc de frein/, /partie hydraulique/],
  calibrate: [/calibr/, /apprentissage/, /\boffset\b/, /initialis/, /\braz\b/, /remise .{0,4}z[ée]ro/, /mise .{0,4}z[ée]ro/, /\bz[ée]ro\b/, /codage/, /\bcoding\b/, /adaptation/],
  steering:  [/angle .{0,4}volant/, /angle .{0,4}braquage/, /capteur .{0,4}angle/, /\bbraquage\b/, /steering angle/, /\bsas\b/, /avr\b/],
  swap:      [/non r[ée]parable/, /irr[ée]parable/, /[ée]change/, /\bswap\b/, /remplac.{0,20}bloc/, /hs\b/],
  comeback:  [/retour/, /garantie/, /revient/, /re-?venu/, /\bsav\b/, /r[ée]clamation/, /toujours .{0,10}(d[ée]faut|probl)/, /encore .{0,10}(d[ée]faut|probl)/],
};
function tag(text) {
  const h = (text || '').toLowerCase();
  const hits = [];
  for (const [k, res] of Object.entries(KW)) if (res.some(r => r.test(h))) hits.push(k);
  return hits;
}

async function main() {
  let conn;
  try {
    conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  } catch (e) {
    log('CONNECT FAILED:', JSON.stringify(e.odbcErrors || e.message));
    process.exit(1);
  }
  try {
    // 0. What Famille values exist that look Bosch-ish / MK-ish?
    const famRows = await conn.query(
      `SELECT Famille FROM LigCde WHERE Famille IS NOT NULL AND (Famille LIKE '%osch%' OR Famille LIKE '%8.%' OR Famille LIKE '%9.%' OR Famille LIKE '%MK%' OR Famille LIKE '%ATE%' OR Famille LIKE '%TRW%') LIMIT 40000`
    );
    const famCount = new Map();
    for (const r of famRows) { const f = (r.FAMILLE || '').trim(); if (f) famCount.set(f, (famCount.get(f) || 0) + 1); }
    log('=== LigCde.Famille values (Bosch/MK/ATE/TRW-ish), with row counts ===');
    for (const [f, c] of [...famCount.entries()].sort((a, b) => b[1] - a[1])) log(`  ${c.toString().padStart(6)}  ${f}`);

    // Also from ArticleMeteor.Designation
    const desRows = await conn.query(
      `SELECT Designation FROM ArticleMeteor WHERE Designation IS NOT NULL AND (Designation LIKE '%osch 8%' OR Designation LIKE '%osch 9%' OR Designation LIKE '%8.0%' OR Designation LIKE '%8.1%' OR Designation LIKE '%9.0%' OR Designation LIKE '%9.1%') LIMIT 20000`
    );
    const desCount = new Map();
    for (const r of desRows) { const d = (r.DESIGNATION || '').trim(); if (d) desCount.set(d, (desCount.get(d) || 0) + 1); }
    log('\n=== ArticleMeteor.Designation values mentioning Bosch 8.x / 9.x ===');
    for (const [d, c] of [...desCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) log(`  ${c.toString().padStart(5)}  ${d}`);

    // 1. Pull closed ABS jobs for Bosch 8.x / 9.x, with observations + comeback link.
    const targets = [
      { name: 'Bosch 8.0', like: "(Famille LIKE '%osch 8.0%' OR LibelleArt LIKE '%osch 8.0%' OR LibelleArt LIKE '%8.0%')" },
      { name: 'Bosch 8.1', like: "(Famille LIKE '%osch 8.1%' OR LibelleArt LIKE '%osch 8.1%' OR LibelleArt LIKE '%8.1%')" },
      { name: 'Bosch 9.0', like: "(Famille LIKE '%osch 9.0%' OR LibelleArt LIKE '%osch 9.0%' OR LibelleArt LIKE '%9.0%')" },
      { name: 'Bosch 9.1', like: "(Famille LIKE '%osch 9.1%' OR LibelleArt LIKE '%osch 9.1%' OR LibelleArt LIKE '%9.1%')" },
    ];

    const allJobs = [];
    for (const t of targets) {
      const rows = await conn.query(
        `SELECT l.NoInt_Ligcde, l.NoIntervention, l.Famille, l.LibelleArt, l.CodeArt, l.Type_Service,
                l.DateDernInterv, l."DernièreInterv", l.Observations, l.SuiviGar_AncNoInterv, l.NomClient
         FROM LigCde l
         WHERE l."Soldée" = True AND ${t.like}
         ORDER BY l.NoInt_Ligcde DESC LIMIT 6000`
      );
      for (const r of rows) allJobs.push({ bucket: t.name, ...r });
      log(`\n[${t.name}] closed jobs matched: ${rows.length}`);
    }

    // de-dupe by NoInt_Ligcde (a job can match 8.0 and "8.0" LibelleArt etc.)
    const seen = new Set();
    const jobs = allJobs.filter(j => { const id = j.NOINT_LIGCDE; if (seen.has(id)) return false; seen.add(id); return true; });
    log(`\nUnique jobs after de-dupe: ${jobs.length}`);

    // 2. Keyword-tag each job's Observations.
    const flagged = [];
    for (const j of jobs) {
      const t = tag(j.OBSERVATIONS);
      const isComeback = j.SUIVIGAR_ANCNOINTERV && String(j.SUIVIGAR_ANCNOINTERV).trim() > '0';
      if (t.length || isComeback) flagged.push({ ...j, _tags: t, _comeback: isComeback });
    }
    log(`\nJobs with a keyword hit in Observations or a comeback link: ${flagged.length}`);

    // 3. For each flagged job, also pull its Intervention comments.
    for (const j of flagged) {
      const iv = await conn.query(
        `SELECT NoInt_interv, "Date", HeureInterv, TypeCode, TypeLibelle, NiveauPanne, Commentaire
         FROM Intervention WHERE NoIntLigcde = ${j.NOINT_LIGCDE} ORDER BY NoInt_interv ASC LIMIT 60`
      );
      j._iv = iv;
      const ivTags = new Set(j._tags);
      for (const row of iv) for (const x of tag(row.COMMENTAIRE)) ivTags.add(x);
      j._allTags = [...ivTags];
    }

    // 4. Resolve comebacks to their previous job.
    for (const j of flagged) {
      if (!j._comeback) continue;
      const prevNo = String(j.SUIVIGAR_ANCNOINTERV).trim();
      const prev = await conn.query(
        `SELECT l.NoInt_Ligcde, l.NoIntervention, l.Famille, l.LibelleArt, l.Type_Service, l.DateDernInterv,
                l."DernièreInterv", l.Observations
         FROM LigCde l WHERE l.NoIntervention = '${prevNo.replace(/'/g, "''")}' LIMIT 3`
      );
      j._prev = prev[0] || null;
      if (j._prev) {
        const pv = await conn.query(
          `SELECT TypeCode, TypeLibelle, Commentaire FROM Intervention WHERE NoIntLigcde = ${j._prev.NOINT_LIGCDE} ORDER BY NoInt_interv ASC LIMIT 60`
        );
        j._prevIv = pv;
      }
    }

    // 5. Report — comebacks first, then keyword-only jobs.
    const fmt = (s, n = 400) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
    log('\n\n########## COMEBACKS (Bosch 8.0 / 8.1 / 9.0 / 9.1) ##########');
    for (const j of flagged.filter(x => x._comeback)) {
      log(`\n--- job ${j.NOINTERVENTION} (ligcde ${j.NOINT_LIGCDE})  [${j.bucket}]  ${fmt(j.LIBELLEART, 80)}`);
      log(`    date=${j.DATEDERNINTERV}  svc=${j.TYPE_SERVICE}  laststep=${fmt(j['DERNIÈREINTERV'], 40)}  tags=${j._allTags.join(',')}`);
      log(`    OBS: ${fmt(j.OBSERVATIONS, 600)}`);
      for (const iv of (j._iv || [])) {
        if (!iv.COMMENTAIRE) continue;
        log(`      · [${iv.TYPECODE || '?'} ${fmt(iv.TYPELIBELLE, 24)}] N${iv.NIVEAUPANNE || ''} ${fmt(iv.COMMENTAIRE, 300)}`);
      }
      if (j._prev) {
        log(`    << PREVIOUS job ${j._prev.NOINTERVENTION} (ligcde ${j._prev.NOINT_LIGCDE})  ${fmt(j._prev.LIBELLEART, 80)}  svc=${j._prev.TYPE_SERVICE}  date=${j._prev.DATEDERNINTERV}`);
        log(`       prev OBS: ${fmt(j._prev.OBSERVATIONS, 500)}`);
        for (const pv of (j._prevIv || [])) {
          if (!pv.COMMENTAIRE) continue;
          log(`         · [${pv.TYPECODE || '?'} ${fmt(pv.TYPELIBELLE, 24)}] ${fmt(pv.COMMENTAIRE, 260)}`);
        }
      } else {
        log(`    << PREVIOUS job ${j.SUIVIGAR_ANCNOINTERV} — not resolved in LigCde`);
      }
    }

    log('\n\n########## KEYWORD-ONLY JOBS (no comeback link, but pressure/hydraulic/calibration/steering wording) ##########');
    for (const j of flagged.filter(x => !x._comeback)) {
      // only show the ones that hit pressure/calibrate/steering (skip pure swap/comeback wording noise)
      const interesting = j._allTags.some(t => ['pressure', 'calibrate', 'steering', 'hydraulic'].includes(t));
      if (!interesting) continue;
      log(`\n--- job ${j.NOINTERVENTION} (ligcde ${j.NOINT_LIGCDE})  [${j.bucket}]  ${fmt(j.LIBELLEART, 80)}  tags=${j._allTags.join(',')}`);
      log(`    OBS: ${fmt(j.OBSERVATIONS, 500)}`);
      for (const iv of (j._iv || [])) {
        if (!iv.COMMENTAIRE) continue;
        const it = tag(iv.COMMENTAIRE);
        if (!it.some(t => ['pressure', 'calibrate', 'steering', 'hydraulic'].includes(t))) continue;
        log(`      · [${iv.TYPECODE || '?'} ${fmt(iv.TYPELIBELLE, 24)}] ${fmt(iv.COMMENTAIRE, 320)}`);
      }
    }

    writeFileSync('reman_pressure_mining.out.txt', OUT.join('\n'));
    log('\n(full output also written to reman_pressure_mining.out.txt)');
  } catch (e) {
    log('ERR', JSON.stringify(e.odbcErrors || e.message || e));
  } finally {
    try { await conn.close(); } catch {}
    process.exit(0);
  }
}
