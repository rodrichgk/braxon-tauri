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

async function main() {
  const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
  try {
    // Mirrors reman_search_interventions's new shape: family LIKE + date
    // BETWEEN + ArticleMeteor join, combined with the Open queue's
    // existing Soldée/Type_Service conditions.
    const sql = `SELECT l.NoInt_Ligcde, l.NoIntervention, l.NomClient, l.CodeArt, l.LibelleArt,
                  l.DateLimiteLivraison, l.DateDernInterv, i.TypeLibelle, c."Immat_TypeVéhicule", i.TypeCode,
                  i."Date", i.HeureInterv, i.NoInt_interv, l.Type_Service, l.Observations, l.SuiviGar_AncNoInterv,
                  am.Designation
           FROM LigCde l
           LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
           LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
           LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
           WHERE am.Designation LIKE '%ABS%' AND c.DateCommande >= '2026-07-01' AND c.DateCommande <= '2026-08-06'
             AND l."Soldée" = False AND l.Type_Service IN ('100', '101', '102', '103')
           ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
           LIMIT 20`;
    const rows = await conn.query(sql);
    console.log(`Rows returned: ${rows.length}`);
    rows.slice(0, 10).forEach(r => console.log(` - [${r.NOINTERVENTION}] ${r.DESIGNATION} | DateLimiteLivraison=${r.DATELIMITELIVRAISON}`));

    // Also check warranty_sql's shape (Garantie=True + the same conditions + ArticleMeteor join).
    const warrantySql = `SELECT l.NoInt_Ligcde
           FROM LigCde l
           LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
           LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
           LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
           WHERE am.Designation LIKE '%ABS%' AND l."Soldée" = False AND l.Type_Service IN ('100', '101', '102', '103')
             AND l.Garantie = True
           LIMIT 20`;
    const warrantyRows = await conn.query(warrantySql);
    console.log(`\nWarranty-scoped rows: ${warrantyRows.length}`);
  } catch (e) {
    console.log('ERR', e.odbcErrors || e);
  } finally {
    await conn.close();
    process.exit(0);
  }
}
