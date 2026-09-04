import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
async function tryQuery(label, sql) {
  try {
    const rows = await conn.query(sql);
    console.log(`\n=== ${label} (${rows.length} rows) ===`);
    rows.slice(0, 10).forEach(r => console.log(JSON.stringify(r)));
    const idx = rows.findIndex(r => r.NOINTERVENTION === '17427601');
    console.log('17427601 at index', idx);
  } catch (err) {
    console.log(`FAIL ${label}:`, err.odbcErrors ? err.odbcErrors.map(e => e.message).join(' | ') : err.message);
  }
}
await tryQuery('CASE WHEN null-last trick', `
  SELECT NoInt_Ligcde, NoIntervention, DateLimiteLivraison
  FROM LigCde
  WHERE "Soldée" = False
  ORDER BY (CASE WHEN DateLimiteLivraison IS NULL THEN 1 ELSE 0 END), DateLimiteLivraison ASC
  LIMIT 60
`);
await conn.close();
