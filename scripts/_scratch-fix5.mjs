import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
async function tryQuery(label, sql) {
  try {
    const rows = await conn.query(sql);
    console.log(`\n=== ${label} (${rows.length} rows) ===`);
    rows.forEach(r => console.log(JSON.stringify(r)));
  } catch (err) {
    console.log(`FAIL ${label}:`, err.odbcErrors ? err.odbcErrors.map(e => e.message).join(' | ') : err.message);
  }
}
await tryQuery('Soldee=False AND TypeCode IS NULL', `
  SELECT l.NoInt_Ligcde
  FROM LigCde l LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l.NoInt_Ligcde = 39059 AND l."Soldée" = False AND i.TypeCode IS NULL
`);
await tryQuery('Soldee=False AND (TypeCode IS NULL)  -- parens only', `
  SELECT l.NoInt_Ligcde
  FROM LigCde l LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l.NoInt_Ligcde = 39059 AND l."Soldée" = False AND (i.TypeCode IS NULL)
`);
await tryQuery('Soldee=False AND (TypeCode IS NULL OR TypeCode = 5)', `
  SELECT l.NoInt_Ligcde
  FROM LigCde l LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l.NoInt_Ligcde = 39059 AND l."Soldée" = False AND (i.TypeCode IS NULL OR i.TypeCode = 'XYZ')
`);
await conn.close();
