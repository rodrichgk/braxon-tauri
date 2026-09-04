import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
async function tryQuery(label, sql) {
  try {
    const rows = await conn.query(sql);
    console.log(`OK ${label}: ${rows.length} rows`);
    rows.slice(0,3).forEach(r => console.log(' ', JSON.stringify(r)));
  } catch (err) {
    console.log(`FAIL ${label}:`, err.odbcErrors ? err.odbcErrors.map(e => e.message).join(' | ') : err.message);
  }
}
await tryQuery('Soldee=False AND Type_Service=305 (equality combo)', `
  SELECT NoInt_Ligcde, NoIntervention FROM LigCde
  WHERE "Soldée" = False AND Type_Service = '305'
`);
await conn.close();
