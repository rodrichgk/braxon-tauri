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
function hmsToSeconds(s) {
  if (!s) return null;
  const m = s.match(/^(-?\d+):(-?\d+):(-?\d+)/);
  if (!m) return null;
  return parseInt(m[1])*3600 + parseInt(m[2])*60 + parseInt(m[3]);
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const c1380 = await conn.query(
      `SELECT l.NoInt_Ligcde FROM LigCde l LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
       WHERE am.Famille = 'MK70' AND l.Observations LIKE '%C1380%' LIMIT 3000`
    );
    const pompe = await conn.query(
      `SELECT l.NoInt_Ligcde FROM LigCde l LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
       WHERE am.Famille = 'MK70' AND l.Observations LIKE '%DEFAUT%POMPE%' LIMIT 3000`
    );
    const c1380Ids = new Set(c1380.map(r => r.NOINT_LIGCDE));
    const pompeIds = new Set(pompe.map(r => r.NOINT_LIGCDE));
    const both = [...c1380Ids].filter(id => pompeIds.has(id));
    console.log(`C1380 (MK70): ${c1380Ids.size}`);
    console.log(`Defaut Pompe (MK70): ${pompeIds.size}`);
    console.log(`Overlap (both): ${both.length}`);
    console.log(`Union (real distinct total): ${new Set([...c1380Ids, ...pompeIds]).size}`);

    // Economics for the true union
    const unionIds = [...new Set([...c1380Ids, ...pompeIds])];
    let repaired = 0, totalTime = 0, timeCount = 0, prices = [];
    const outcomeCounts = new Map();
    for (const id of unionIds) {
      const priceRow = await conn.query(`SELECT PrixHT FROM LigCde WHERE NoInt_Ligcde = ${id}`);
      const steps = await conn.query(`SELECT TypeCode, TypeLibelle, "Date", HeureInterv, NoInt_interv, TempsPasse FROM Intervention WHERE NoIntLigcde = ${id} ORDER BY NoInt_interv DESC`);
      let latest = null; let totalSecs = 0;
      for (const s of steps) {
        const secs = hmsToSeconds(s.TEMPSPASSE);
        if (secs) totalSecs += secs;
        if (!latest || isMoreRecent(s.DATE, s.HEUREINTERV, s.NOINT_INTERV, latest.DATE, latest.HEUREINTERV, latest.NOINT_INTERV)) latest = s;
      }
      const outcome = latest ? (latest.TYPELIBELLE || latest.TYPECODE) : '(no steps)';
      outcomeCounts.set(outcome, (outcomeCounts.get(outcome) || 0) + 1);
      if (latest?.TYPECODE === 'R') {
        repaired++;
        if (totalSecs > 0) { totalTime += totalSecs; timeCount++; }
        const p = parseFloat(priceRow[0]?.PRIXHT);
        if (!isNaN(p) && p > 0) prices.push(p);
      }
    }
    console.log(`\nTrue union economics (${unionIds.length} distinct jobs):`);
    console.log('Outcomes:', JSON.stringify(Object.fromEntries(outcomeCounts)));
    console.log(`Repair rate: ${(repaired/unionIds.length*100).toFixed(1)}%`);
    if (timeCount) console.log(`Avg time: ${(totalTime/timeCount/60).toFixed(1)} min (n=${timeCount})`);
    prices.sort((a,b)=>a-b);
    if (prices.length) console.log(`Price: avg=${(prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(2)} median=${prices[Math.floor(prices.length/2)]} (n=${prices.length})`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
