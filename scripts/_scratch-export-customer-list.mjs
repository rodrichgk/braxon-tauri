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

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    // Families requested: MK100, MK70, MK60, MK61, Bosch 8.0 — "Bosch 8.1"
    // was checked live and doesn't exist as a distinct family; the real
    // neighboring values are "Bosch 8.0" and "Bosch 9.0". Add/remove
    // strings in this list to adjust scope.
    const families = ['MK100', 'MK70', 'MK60', 'MK61', 'Bosch 8.0'];
    const famClause = families.map(f => `am.Famille = '${f}'`).join(' OR ');

    // Fault criteria: the two fault codes discussed (C1380 = MK70,
    // 5DF0/5DF1 = MK61) plus text-described faults that don't get a DTC
    // code — "motor running all the time" (checked live: "tourne en
    // permanence" 5, "tourne tout le temps" 2, "MOTOR RUNS" 2) and
    // MK100's real top fault, "DESEQUILIBRE DE FREINAGE" (brake
    // imbalance) — checked live, 431 jobs, 93.7% repair rate, 11.8 min
    // avg, 398€ avg price, the best economics found in this whole
    // investigation. Add more phrasings here if you know other wording
    // technicians use.
    const faultClause = [
      "l.Observations LIKE '%C1380%'",
      "l.Observations LIKE '%5DF0%'",
      "l.Observations LIKE '%5DF1%'",
      "l.Observations LIKE '%tourne en permanence%'",
      "l.Observations LIKE '%tourne tout le temps%'",
      "l.Observations LIKE '%MOTOR RUNS%'",
      "l.Observations LIKE '%DESEQUILIBRE%FREINAGE%'",
    ].join(' OR ');

    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoInt_cde, l.CodeArt, am.Famille, c.NoInt_Client
       FROM LigCde l
       LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE (${faultClause}) AND (${famClause})
       LIMIT 2000`
    );
    console.log(`Matching jobs: ${rows.length}`);
    const famBreakdown = new Map();
    for (const r of rows) famBreakdown.set(r.FAMILLE, (famBreakdown.get(r.FAMILLE) || 0) + 1);
    console.log('By family:', JSON.stringify(Object.fromEntries(famBreakdown)));

    const jobsByClient = new Map();
    for (const r of rows) {
      const clientId = r.NOINT_CLIENT;
      if (!clientId) continue;
      jobsByClient.set(clientId, (jobsByClient.get(clientId) || 0) + 1);
    }
    console.log(`Distinct clients: ${jobsByClient.size}`);

    const dataRows = [];
    for (const [clientId, jobCount] of jobsByClient) {
      const clt = await conn.query(`SELECT Nom, Ville, CP, Tel, e_mail FROM Client WHERE NoIntClt = ${clientId}`);
      if (!clt.length) continue;
      const addr = await conn.query(`SELECT Adr1, Adr2, CP, Ville, NomContact FROM Clt_adrLivr WHERE NoInt_clt = ${clientId} LIMIT 1`);
      const c = clt[0];
      const a = addr[0] || {};
      const fullAddr = [a.ADR1, a.ADR2].filter(Boolean).join(', ');
      const contactName = (a.NOMCONTACT && a.NOMCONTACT !== c.NOM) ? a.NOMCONTACT : '';
      dataRows.push([
        contactName,
        c.NOM || '',
        fullAddr,
        a.VILLE || c.VILLE || '',
        a.CP || c.CP || '',
        c.TEL || '',
        c.E_MAIL || '',
        jobCount,
      ]);
    }
    dataRows.sort((a, b) => b[7] - a[7]);

    const header = ['Contact Name', 'Shop Name', 'Address', 'City', 'Postal Code', 'Phone', 'Email', 'Matching Jobs'];
    const csv = [header, ...dataRows].map(row => row.map(csvEscape).join(',')).join('\r\n');
    const outPath = 'docs/customer-list-c1380-5df0-motor-running.csv';
    fs.writeFileSync(outPath, '﻿' + csv, 'utf8');
    console.log(`\nCSV written to ${outPath} (${dataRows.length} customers)`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
