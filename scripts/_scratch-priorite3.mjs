import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
async function tryQuery(label, sql) {
  try {
    const rows = await conn.query(sql);
    console.log(`OK ${label}: ${rows.length} rows`);
    return rows;
  } catch (err) {
    console.log(`FAIL ${label}:`, err.odbcErrors ? err.odbcErrors.map(e => e.message).join(' | ') : err.message);
    return null;
  }
}
await tryQuery('bracket table name', `SELECT * FROM [PrioritéEnCours] LIMIT 5`);
await tryQuery('quoted table name', `SELECT * FROM "PrioritéEnCours" LIMIT 5`);
await conn.close();
