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
    const today = new Date();
    const from = new Date(today); from.setDate(from.getDate() - 365);
    const fromYmd = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
    const toYmdStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    console.log(`Window: ${fromYmd} to ${toYmdStr}\n`);

    // 1. Revenue (validated methodology)
    const revRows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoInt_cde, l.DateDernInterv, c.MtHT_Lignes, i.TypeCode, i."Date", i.HeureInterv, i.NoInt_interv
       FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
       WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '${fromYmd}' AND '${toYmdStr}' AND c.StatutDossier = 'EXPEDIE'
       ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC LIMIT 20000`
    );
    const latestRev = new Map();
    for (const r of revRows) {
      const id = r.NOINT_LIGCDE; if (!id) continue;
      const cur = latestRev.get(id);
      if (!cur || isMoreRecent(r.DATE, r.HEUREINTERV, r.NOINT_INTERV, cur.DATE, cur.HEUREINTERV, cur.NOINT_INTERV)) latestRev.set(id, r);
    }
    let revenue = 0; const countedCde = new Set();
    for (const [, r] of latestRev) {
      if (r.TYPECODE === 'REE') continue;
      const cde = r.NOINT_CDE; if (cde && countedCde.has(cde)) continue; if (cde) countedCde.add(cde);
      const amt = parseFloat(r.MTHT_LIGNES); if (!isNaN(amt)) revenue += amt;
    }
    console.log('Revenue (HT, trailing 365d):', revenue.toFixed(2));

    // 2. COGS / subcontracted / external charges
    const factRows = await conn.query(
      `SELECT l.CpteGeneral, l.MtNet FROM Lig_FactureFr l LEFT JOIN FactureFr f ON l.NoIntFactureFr = f.NoIntFactureFr
       WHERE f.DateFacture BETWEEN '${fromYmd}' AND '${toYmdStr}' LIMIT 30000`
    );
    let parts = 0, subcontracted = 0, external = 0;
    for (const r of factRows) {
      const acct = (r.CPTEGENERAL || '').trim(); const amt = parseFloat(r.MTNET) || 0;
      if (['601','602','606'].includes(acct.slice(0,3))) parts += amt;
      else if (acct.slice(0,3) === '604') subcontracted += amt;
      else if (['61','62'].includes(acct.slice(0,2))) external += amt;
    }
    console.log('Parts/materials COGS:', parts.toFixed(2));
    console.log('Subcontracted services:', subcontracted.toFixed(2));
    console.log('External charges (rent/insurance/fees):', external.toFixed(2));

    // 3. PrixHT distribution for closed R (Réparation) jobs
    const prixRows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.PrixHT, i.TypeCode, i."Date", i.HeureInterv, i.NoInt_interv
       FROM LigCde l LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
       WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '${fromYmd}' AND '${toYmdStr}'
       ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC LIMIT 20000`
    );
    const latestPrix = new Map();
    for (const r of prixRows) {
      const id = r.NOINT_LIGCDE; if (!id) continue;
      const cur = latestPrix.get(id);
      if (!cur || isMoreRecent(r.DATE, r.HEUREINTERV, r.NOINT_INTERV, cur.DATE, cur.HEUREINTERV, cur.NOINT_INTERV)) latestPrix.set(id, r);
    }
    const repairPrices = [];
    for (const [, r] of latestPrix) {
      if (r.TYPECODE === 'R') {
        const p = parseFloat(r.PRIXHT);
        if (!isNaN(p) && p > 0) repairPrices.push(p);
      }
    }
    repairPrices.sort((a,b) => a-b);
    const sum = repairPrices.reduce((a,b)=>a+b,0);
    console.log(`\nRepaired jobs with PrixHT>0: ${repairPrices.length}`);
    console.log('Avg PrixHT:', (sum/repairPrices.length).toFixed(2));
    console.log('Median:', repairPrices[Math.floor(repairPrices.length/2)]);
    console.log('Min/Max:', repairPrices[0], '/', repairPrices[repairPrices.length-1]);
    console.log('P25/P75:', repairPrices[Math.floor(repairPrices.length*0.25)], '/', repairPrices[Math.floor(repairPrices.length*0.75)]);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
