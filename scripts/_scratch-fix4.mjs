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
await tryQuery('direct check on 39059 with LEFT JOIN', `
  SELECT l.NoInt_Ligcde, l.NoIntervention, i.TypeCode, i.NoInt_interv
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l.NoInt_Ligcde = 39059
`);
await tryQuery('39059 with Soldee filter only', `
  SELECT l.NoInt_Ligcde, l.NoIntervention
  FROM LigCde l
  WHERE l.NoInt_Ligcde = 39059 AND l."Soldée" = False
`);
await tryQuery('39059 with full filter', `
  SELECT l.NoInt_Ligcde, l.NoIntervention, i.TypeCode
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l.NoInt_Ligcde = 39059
    AND l."Soldée" = False
    AND (i.TypeCode IS NULL OR i.TypeCode NOT IN ('TES','AP','ARC','ATN','ER'))
`);
await conn.close();
