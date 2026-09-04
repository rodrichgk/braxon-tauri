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

const ligcdeIds = [1070,1989,3150,6878,8236,9794,10546,11353,12290,15687,15924,18047,21438,22962,25682,25833,28348,28787,29028,29959,30198,30232,31350,33001,34117,36465,39261,39720];

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    const results = [];
    for (const id of ligcdeIds) {
      const lig = await conn.query(`SELECT NoIntervention, "Soldée" FROM LigCde WHERE NoInt_Ligcde = ${id}`);
      const soldee = lig[0]?.SOLDÉE === 'true' || lig[0]?.SOLDÉE === true;
      const steps = await conn.query(`SELECT TypeCode, TypeLibelle, "Date", HeureInterv, NoInt_interv FROM Intervention WHERE NoIntLigcde = ${id} ORDER BY NoInt_interv DESC`);
      let latest = null;
      for (const s of steps) {
        if (!latest || isMoreRecent(s.DATE, s.HEUREINTERV, s.NOINT_INTERV, latest.DATE, latest.HEUREINTERV, latest.NOINT_INTERV)) latest = s;
      }
      results.push({ id, ref: lig[0]?.NOINTERVENTION, soldee, typeCode: latest?.TYPECODE, typeLibelle: latest?.TYPELIBELLE });
    }
    for (const r of results) console.log(r.ref, '| soldee=', r.soldee, '|', r.typeCode, '-', r.typeLibelle);

    const byOutcome = new Map();
    for (const r of results) {
      const key = r.soldee ? (r.typeLibelle || r.typeCode || '(unknown)') : 'IN PROGRESS';
      byOutcome.set(key, (byOutcome.get(key) || 0) + 1);
    }
    console.log('\n--- Breakdown ---');
    for (const [k, n] of [...byOutcome.entries()].sort((a,b) => b[1]-a[1])) console.log(k, ':', n);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
