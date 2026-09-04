import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
async function tryQuery(label, sql) {
  try {
    const rows = await conn.query(sql);
    console.log(`\n=== ${label} (${rows.length} rows) ===`);
    rows.slice(0, 20).forEach(r => console.log(JSON.stringify(r)));
    return rows;
  } catch (err) {
    console.log(`FAIL ${label}:`, err.odbcErrors ? err.odbcErrors.map(e => e.message).join(' | ') : err.message);
    return null;
  }
}
await tryQuery('distinct Salarie.Service', `SELECT DISTINCT Service FROM Salarie LIMIT 40`);
await tryQuery('Salarie with Service=305', `SELECT NoInt_salarie, Nom, Prenom, Service, Fonction FROM Salarie WHERE Service = '305'`);
await tryQuery('distinct Commande.Service', `SELECT DISTINCT Service FROM Commande LIMIT 40`);
await tryQuery('Commande with Service=305', `SELECT NoInt_Cde, NomClient, Service FROM Commande WHERE Service = '305' LIMIT 20`);
await conn.close();
