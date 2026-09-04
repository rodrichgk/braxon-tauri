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
await tryQuery('distinct ServiceTechnique on LigCde', `SELECT DISTINCT ServiceTechnique FROM LigCde LIMIT 40`);
await tryQuery('LigCde with ServiceTechnique=305, open', `
  SELECT NoInt_Ligcde, NoIntervention, NomClient, ServiceTechnique
  FROM LigCde WHERE ServiceTechnique = '305' AND "Soldée" = False
`);
await tryQuery('LigCde with ServiceTechnique=305, any Soldee', `
  SELECT NoInt_Ligcde, NoIntervention, NomClient, ServiceTechnique
  FROM LigCde WHERE ServiceTechnique = '305'
  LIMIT 20
`);
await conn.close();
