import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
async function tryQuery(label, sql) {
  try {
    const rows = await conn.query(sql);
    console.log(`\n=== ${label} (${rows.length} rows) ===`);
    rows.forEach(r => console.log(JSON.stringify(r)));
    return rows;
  } catch (err) {
    console.log(`FAIL ${label}:`, err.odbcErrors ? err.odbcErrors.map(e => e.message).join(' | ') : err.message);
    return null;
  }
}
await tryQuery('Salarie with those NoInt_param ids', `SELECT NoInt_salarie, Nom, Prenom, Service, Fonction FROM Salarie WHERE NoInt_salarie IN (65,67,68,69,71,72,73)`);
await tryQuery('all Tech_Service rows with LibService=305', `SELECT LibService, NoInt_param, NoInt_TechServ FROM Tech_Service WHERE LibService = '305'`);
await conn.close();
