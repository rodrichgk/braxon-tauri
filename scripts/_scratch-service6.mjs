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
await tryQuery('2-table: Intervention x Tech_Service', `
  SELECT i.NoInt_interv, i.NoIntTechn, i.TypeLibelle
  FROM Intervention i, Tech_Service ts
  WHERE i.NoIntTechn = ts.NoInt_param AND ts.LibService = '305'
  LIMIT 20
`);
await conn.close();
