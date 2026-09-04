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
  const m = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    // 1) Of the "with_technician"-eligible open bench population (not
    // ATTENTE ACCORD, not CLOTURE), how many have a DateLimiteLivraison
    // set at all, and of those, how many are within a month (the
    // forecast panel's own staleness cutoff)?
    console.log('--- DateLimiteLivraison staleness among non-ATTENTE-ACCORD/CLOTURE open jobs ---');
    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.DateLimiteLivraison, c.StatutDossier
       FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l."Soldée" = False AND l.Type_Service IN ('100','101','102','103') AND l.NomClient <> ''
       LIMIT 20000`
    );
    const today = new Date();
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    let total = 0, noDeadline = 0, staleOverMonth = 0, fresh = 0;
    let excludedAttenteOrCloture = 0;
    for (const r of rows) {
      const status = r.STATUTDOSSIER || '';
      if (status === 'ATTENTE ACCORD' || status === 'CLOTURE') { excludedAttenteOrCloture++; continue; }
      total++;
      const ymd = toYmd(r.DATELIMITELIVRAISON);
      if (!ymd) { noDeadline++; continue; }
      const d = new Date(ymd);
      if (d < monthAgo) staleOverMonth++;
      else fresh++;
    }
    console.log(`Excluded (ATTENTE ACCORD/CLOTURE): ${excludedAttenteOrCloture}`);
    console.log(`Remaining candidate "with technician" population: ${total}`);
    console.log(`  no DateLimiteLivraison at all: ${noDeadline}`);
    console.log(`  DateLimiteLivraison > 1 month past: ${staleOverMonth}`);
    console.log(`  fresh (forecast's real "units_with_tech"): ${fresh}`);

    // 2) ATTENTE ACCORD jobs — DateCommande age distribution, to find a
    // sane recency cutoff. Bucket by how many months old.
    console.log('\n--- ATTENTE ACCORD jobs, DateCommande age distribution ---');
    const attenteRows = await conn.query(
      `SELECT l.NoInt_Ligcde, c.DateCommande FROM LigCde l
       LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l."Soldée" = False AND l.Type_Service IN ('100','101','102','103')
         AND c.StatutDossier = 'ATTENTE ACCORD' AND l.NomClient <> ''
       LIMIT 20000`
    );
    const buckets = { '<=30d': 0, '31-90d': 0, '91-365d': 0, '>365d': 0, noDate: 0 };
    for (const r of attenteRows) {
      const ymd = toYmd(r.DATECOMMANDE);
      if (!ymd) { buckets.noDate++; continue; }
      const days = (today - new Date(ymd)) / (24 * 60 * 60 * 1000);
      if (days <= 30) buckets['<=30d']++;
      else if (days <= 90) buckets['31-90d']++;
      else if (days <= 365) buckets['91-365d']++;
      else buckets['>365d']++;
    }
    console.log(`Total ATTENTE ACCORD: ${attenteRows.length}`);
    console.log(buckets);

    // 3) Sanity: total annual volume, for comparison (Soldée=True,
    // DateDernInterv in the last 365 days, same bench Type_Service scope).
    const oneYearAgo = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
    const y = oneYearAgo.toISOString().slice(0, 10);
    const t = today.toISOString().slice(0, 10);
    const annualRows = await conn.query(
      `SELECT NoInt_Ligcde FROM LigCde
       WHERE "Soldée" = True AND DateDernInterv BETWEEN '${y}' AND '${t}'
         AND Type_Service IN ('100','101','102','103') AND NomClient <> '' LIMIT 20000`
    );
    console.log(`\nAnnual closed volume (bench, trailing 365d): ${annualRows.length}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
