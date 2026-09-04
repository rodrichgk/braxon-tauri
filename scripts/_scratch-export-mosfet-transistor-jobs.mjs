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
    // 4D's LIKE is case-sensitive (confirmed live — an uppercase-only
    // search missed real lowercase "transistor" mentions in technician
    // comments), so every plausible casing is OR'd explicitly rather than
    // relying on a single pattern.
    const variants = ['MOSFET', 'Mosfet', 'mosfet', 'MosFET', 'TRANSISTOR', 'Transistor', 'transistor', 'transitor', 'Transitor'];
    const clause = variants.map(v => `i.Commentaire LIKE '%${v}%'`).join(' OR ');
    const jobRows = await conn.query(
      `SELECT DISTINCT l.NoInt_Ligcde, l.NoIntervention, l.CodeArt, am.Famille, l.Observations, l.PrixHT
       FROM Intervention i
       JOIN LigCde l ON i.NoIntLigcde = l.NoInt_Ligcde
       LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
       WHERE ${clause} LIMIT 2000`
    );
    console.log(`Distinct jobs: ${jobRows.length}`);

    const out = [['Job Ref', 'Ligcde', 'Family', 'CodeArt', 'Customer-reported symptom', 'Latest step type', 'Latest step outcome', 'Technician comment (mosfet/transistor step)', 'PrixHT']];
    for (const r of jobRows) {
      const id = r.NOINT_LIGCDE;
      const steps = await conn.query(`SELECT TypeCode, TypeLibelle, Commentaire, "Date", HeureInterv, NoInt_interv FROM Intervention WHERE NoIntLigcde = ${id} ORDER BY NoInt_interv DESC`);
      let latest = null;
      let mosfetComment = '';
      for (const s of steps) {
        const c = s.COMMENTAIRE || '';
        if (variants.some(v => c.includes(v)) && !mosfetComment) mosfetComment = c;
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
        mosfetComment,
        r.PRIXHT ?? '',
      ]);
    }
    const csv = out.map(row => row.map(csvEscape).join(',')).join('\r\n');
    const outPath = 'docs/jobs-mosfet-transistor-repairs.csv';
    fs.writeFileSync(outPath, '﻿' + csv, 'utf8');
    console.log(`Wrote ${out.length - 1} jobs to ${outPath}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
