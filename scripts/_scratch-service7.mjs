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
await tryQuery('full table names, no alias', `
  SELECT Intervention.NoInt_interv
  FROM Intervention, Tech_Service
  WHERE Intervention.NoIntTechn = Tech_Service.NoInt_param
  LIMIT 5
`);
await tryQuery('LEFT JOIN syntax', `
  SELECT i.NoInt_interv, ts.LibService
  FROM Intervention i
  LEFT JOIN Tech_Service ts ON i.NoIntTechn = ts.NoInt_param
  LIMIT 5
`);
await tryQuery('quoted Tech_Service', `
  SELECT i.NoInt_interv
  FROM Intervention i, "Tech_Service" ts
  WHERE i.NoIntTechn = ts.NoInt_param
  LIMIT 5
`);
await conn.close();
