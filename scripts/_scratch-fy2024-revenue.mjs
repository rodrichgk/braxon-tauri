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
    const fromYmd = '2024-04-01', toYmdStr = '2025-03-31';
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
    console.log('FY2024-2025 Revenue (HT):', revenue.toFixed(2));

    // Sub-account breakdown of 61x/62x for the same window
    const factRows = await conn.query(
      `SELECT l.CpteGeneral, l.MtNet FROM Lig_FactureFr l LEFT JOIN FactureFr f ON l.NoIntFactureFr = f.NoIntFactureFr
       WHERE f.DateFacture BETWEEN '${fromYmd}' AND '${toYmdStr}' LIMIT 30000`
    );
    const byAccount = new Map();
    for (const r of factRows) {
      const acct = (r.CPTEGENERAL || '').trim();
      if (!(acct.startsWith('61') || acct.startsWith('62'))) continue;
      const amt = parseFloat(r.MTNET) || 0;
      const key = acct.slice(0,3);
      byAccount.set(key, (byAccount.get(key) || 0) + amt);
    }
    console.log('\n61x/62x sub-accounts (3-digit), FY2024-2025:');
    for (const [k, v] of [...byAccount.entries()].sort((a,b)=>b[1]-a[1])) console.log(' ', k, ':', v.toFixed(2));
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
