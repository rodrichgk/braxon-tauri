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
await tryQuery('distinct Type_Service on LigCde', `SELECT DISTINCT Type_Service FROM LigCde LIMIT 40`);
await tryQuery('LigCde with Type_Service=305, open', `
  SELECT NoInt_Ligcde, NoIntervention, NomClient, Type_Service
  FROM LigCde WHERE Type_Service = '305' AND "Soldée" = False
`);
await conn.close();
