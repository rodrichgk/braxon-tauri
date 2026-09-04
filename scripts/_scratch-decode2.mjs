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
// For each Type_Service value, sample a few LigCde rows to see what kind of article/work they represent
for (const svc of ['100','101','102','103','104','114','305']) {
  await tryQuery(`Type_Service=${svc} sample`, `
    SELECT NoIntervention, NomClient, CodeArt, LibelleArt, Famille, Gamme
    FROM LigCde WHERE Type_Service = '${svc}' LIMIT 5
  `);
}
await conn.close();
