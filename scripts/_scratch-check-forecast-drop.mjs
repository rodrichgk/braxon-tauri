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

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    // Mirrors forecast_open_queue_core's exact filters.
    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.DateLimiteLivraison, i.TypeCode
       FROM LigCde l
       LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
       WHERE l."Soldée" = False AND l.Type_Service IN ('100', '101', '102', '103')
       ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
       LIMIT 5000`
    );
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffYmd = toYmd(`${String(cutoff.getDate()).padStart(2, '0')}/${String(cutoff.getMonth() + 1).padStart(2, '0')}/${cutoff.getFullYear()}`);
    const seen = new Set();
    let unitsWithTech = 0;
    for (const r of rows) {
      const id = r.NOINT_LIGCDE;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const dd = toYmd(r.DATELIMITELIVRAISON);
      if (!dd || dd < cutoffYmd) continue;
      unitsWithTech++;
    }
    console.log(`Current live units_with_tech (matching forecast_open_queue_core exactly): ${unitsWithTech}`);

    // How many jobs closed today so far, and when (to see the timeline of departures).
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const closedToday = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoIntervention, l.DateDernInterv
       FROM LigCde l
       WHERE l."Soldée" = True AND l.Type_Service IN ('100','101','102','103') AND l.DateDernInterv = '${todayStr}'`
    );
    console.log(`Jobs closed today (any of the 4 bench services): ${closedToday.length}`);

    // New arrivals today (DateCommande = today) that are bench-service jobs.
    const arrivedToday = await conn.query(
      `SELECT l.NoInt_Ligcde FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE c.DateCommande = '${todayStr.split('/').reverse().join('-')}' AND l.Type_Service IN ('100','101','102','103')`
    );
    console.log(`New bench-service arrivals today (DateCommande=today): ${arrivedToday.length}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
