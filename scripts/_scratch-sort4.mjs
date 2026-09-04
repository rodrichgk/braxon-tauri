import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
async function tryQuery(label, sql) {
  try {
    const rows = await conn.query(sql);
    console.log(`\n=== ${label} (${rows.length} rows) ===`);
    rows.slice(0, 8).forEach(r => console.log(JSON.stringify(r)));
    const idx = rows.findIndex(r => r.NOINTERVENTION === '17427601');
    console.log('17427601 at index', idx);
  } catch (err) {
    console.log(`FAIL ${label}:`, err.odbcErrors ? err.odbcErrors.map(e => e.message).join(' | ') : err.message);
  }
}
await tryQuery('dated jobs, soonest deadline first', `
  SELECT l.NoInt_Ligcde, l.NoIntervention, l.DateLimiteLivraison, i.TypeCode
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l."Soldée" = False AND l.DateLimiteLivraison IS NOT NULL
  ORDER BY l.DateLimiteLivraison ASC, l.NoInt_Ligcde DESC
  LIMIT 60
`);
await tryQuery('undated jobs, most recent first', `
  SELECT l.NoInt_Ligcde, l.NoIntervention
  FROM LigCde l
  WHERE l."Soldée" = False AND l.DateLimiteLivraison IS NULL
  ORDER BY l.NoInt_Ligcde DESC
  LIMIT 10
`);
await conn.close();
