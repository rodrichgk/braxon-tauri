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
    console.log(`Window: ${fromYmd} to ${toYmdStr} (trailing 365 days)`);

    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.DateDernInterv, i.TypeCode, i."Date", i.HeureInterv, i.NoInt_interv
       FROM LigCde l LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
       WHERE l."Soldée" = True AND l.Type_Service = '101' AND l.DateDernInterv BETWEEN '${fromYmd}' AND '${toYmdStr}'
       ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC LIMIT 20000`
    );
    const latest = new Map();
    for (const r of rows) {
      const id = r.NOINT_LIGCDE; if (!id) continue;
      const cur = latest.get(id);
      if (!cur || isMoreRecent(r.DATE, r.HEUREINTERV, r.NOINT_INTERV, cur.DATE, cur.HEUREINTERV, cur.NOINT_INTERV)) latest.set(id, r);
    }
    const byMonth = new Map();
    let totalRepaired = 0;
    for (const [, r] of latest) {
      if (r.TYPECODE !== 'R') continue;
      totalRepaired++;
      const ymd = toYmd(r.DATEDERNINTERV);
      if (!ymd) continue;
      const month = ymd.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) || 0) + 1);
    }
    console.log(`\nTotal ABS (Type_Service=101) repairs, trailing 365 days: ${totalRepaired}`);
    console.log('By month:');
    for (const [m, n] of [...byMonth.entries()].sort()) console.log(` ${m}: ${n}`);
    const months = [...byMonth.keys()];
    console.log(`\nDistinct months with data: ${months.length}`);
    console.log(`Average per month (÷12): ${(totalRepaired/12).toFixed(1)}`);
    console.log(`Average per month (÷distinct months): ${(totalRepaired/months.length).toFixed(1)}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
