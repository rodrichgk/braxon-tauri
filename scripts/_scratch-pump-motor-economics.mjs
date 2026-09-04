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
    // ALL articles (not just 100961 prefix) with 5DF0 in Observations
    const rows = await conn.query(
      `SELECT NoInt_Ligcde, NoIntervention, CodeArt, PrixHT FROM LigCde WHERE Observations LIKE '%5DF0%' LIMIT 500`
    );
    console.log(`Total 5DF0 jobs (all articles): ${rows.length}`);

    const ligcdeIds = rows.map(r => r.NOINT_LIGCDE);
    let repaired = 0, other = 0, totalTime = 0, timeCount = 0, prices = [];
    const outcomeCounts = new Map();
    for (const r of rows) {
      const id = r.NOINT_LIGCDE;
      const steps = await conn.query(`SELECT TypeCode, TypeLibelle, "Date", HeureInterv, NoInt_interv, TempsPasse FROM Intervention WHERE NoIntLigcde = ${id} ORDER BY NoInt_interv DESC`);
      let latest = null;
      let totalSecs = 0;
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
        const p = parseFloat(r.PRIXHT);
        if (!isNaN(p) && p > 0) prices.push(p);
      } else {
        other++;
      }
    }
    console.log(`Repaired: ${repaired}, other/open: ${other}`);
    console.log('\nOutcome breakdown:');
    for (const [k, n] of [...outcomeCounts.entries()].sort((a,b)=>b[1]-a[1])) console.log(' ', k, ':', n);
    if (timeCount > 0) {
      console.log(`\nAvg total TempsPasse for repaired jobs (${timeCount} jobs with time logged): ${(totalTime/timeCount/60).toFixed(1)} minutes`);
    }
    prices.sort((a,b)=>a-b);
    if (prices.length) {
      console.log(`PrixHT for repaired jobs (${prices.length}): avg=${(prices.reduce((a,b)=>a+b,0)/prices.length).toFixed(2)} median=${prices[Math.floor(prices.length/2)]} min=${prices[0]} max=${prices[prices.length-1]}`);
    }
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
