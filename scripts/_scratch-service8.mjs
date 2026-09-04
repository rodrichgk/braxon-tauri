import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
async function tryQuery(label, sql) {
  try {
    const rows = await conn.query(sql);
    console.log(`OK ${label}: ${rows.length} rows`);
    rows.slice(0,5).forEach(r => console.log(JSON.stringify(r)));
  } catch (err) {
    console.log(`FAIL ${label}:`, err.odbcErrors ? err.odbcErrors.map(e => e.message).join(' | ') : err.message);
  }
}
await tryQuery('alias x instead of ts', `
  SELECT i.NoInt_interv, x.LibService
  FROM Intervention i, Tech_Service x
  WHERE i.NoIntTechn = x.NoInt_param AND x.LibService = '305'
  LIMIT 20
`);
await conn.close();
