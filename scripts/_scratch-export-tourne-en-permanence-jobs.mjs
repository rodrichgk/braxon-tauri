import net from 'net';
import odbc from 'odbc';
import fs from 'fs';

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

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v).replace(/\r?\n/g, ' ').trim();
  if (/[",;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toYmd(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function isMoreRecent(dA, hA, idA, dB, hB, idB) {
  const ymdA = toYmd(dA) || ''; const ymdB = toYmd(dB) || '';
  if (ymdA !== ymdB) return ymdA > ymdB;
  const hA2 = hA || ''; const hB2 = hB || '';
  if (hA2 !== hB2) return hA2 > hB2;
  return (idA || 0) > (idB || 0);
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    // "Pump/motor runs continuously" — the symptom, not the 5DF0/5DF1 DTC
    // (checked live, zero overlap between them). All families, since this
    // symptom was found scattered thin across many (Bosch 8.0 has the most).
    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoIntervention, l.CodeArt, am.Famille, l.Observations, l.PrixHT
       FROM LigCde l LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
       WHERE l.Observations LIKE '%MOTEUR%PERMANENCE%' OR l.Observations LIKE '%PERMANENCE%MOTEUR%'
          OR l.Observations LIKE '%TOURNE%PERMANENCE%' OR l.Observations LIKE '%TOURNE EN PERMANENCE%'
          OR l.Observations LIKE '%TOURNE TOUT LE TEMPS%' OR l.Observations LIKE '%MOTOR RUNS%'
          OR l.Observations LIKE '%MOTOR%CONTINUOUSLY%' OR l.Observations LIKE '%MOTOR%NON STOP%'
          OR l.Observations LIKE '%MOTOR%NONSTOP%'
       LIMIT 500`
    );

    const out = [['Job Ref', 'Ligcde', 'Family', 'CodeArt', 'Customer-reported symptom', 'Latest step type', 'Latest step outcome', 'Technician comment', 'PrixHT', 'Mentions mosfet/transistor']];
    for (const r of rows) {
      const id = r.NOINT_LIGCDE;
      const steps = await conn.query(`SELECT TypeCode, TypeLibelle, Commentaire, "Date", HeureInterv, NoInt_interv FROM Intervention WHERE NoIntLigcde = ${id} ORDER BY NoInt_interv DESC`);
      let latest = null;
      let mentionsMosfet = false;
      for (const s of steps) {
        const c = (s.COMMENTAIRE || '').toUpperCase();
        if (c.includes('MOSFET') || c.includes('MOS FET') || c.includes('TRANSISTOR')) mentionsMosfet = true;
        if (!latest || isMoreRecent(s.DATE, s.HEUREINTERV, s.NOINT_INTERV, latest.DATE, latest.HEUREINTERV, latest.NOINT_INTERV)) latest = s;
      }
      out.push([
        r.NOINTERVENTION || '',
        String(id),
        r.FAMILLE || '',
        r.CODEART || '',
        r.OBSERVATIONS || '',
        latest?.TYPECODE || '(no steps)',
        latest?.TYPELIBELLE || '',
        latest?.COMMENTAIRE || '',
        r.PRIXHT ?? '',
        mentionsMosfet ? 'YES' : '',
      ]);
    }
    const csv = out.map(row => row.map(csvEscape).join(',')).join('\r\n');
    const outPath = 'docs/jobs-pump-motor-runs-continuously.csv';
    fs.writeFileSync(outPath, '\uFEFF' + csv, 'utf8');
    console.log(`Wrote ${out.length - 1} jobs to ${outPath}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
