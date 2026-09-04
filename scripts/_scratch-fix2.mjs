import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
async function tryQuery(label, sql) {
  try {
    const rows = await conn.query(sql);
    console.log(`\n=== ${label} (${rows.length} rows) ===`);
    rows.slice(0, 5).forEach(r => console.log(JSON.stringify(r)));
  } catch (err) {
    console.log(`FAIL ${label}:`, err.odbcErrors ? err.odbcErrors.map(e => e.message).join(' | ') : err.message);
  }
}
await tryQuery('Intervention rows for LigCde 39059', `SELECT NoInt_interv, TypeCode, TypeLibelle FROM Intervention WHERE NoIntLigcde = 39059`);

await tryQuery('total open LigCde count', `SELECT COUNT(*) AS N FROM LigCde l WHERE l."Soldée" = False`);

await tryQuery('NOT IN + IS NULL syntax test', `
  SELECT l.NoInt_Ligcde, l.NoIntervention, i.TypeCode
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l."Soldée" = False
    AND (i.TypeCode IS NULL OR i.TypeCode NOT IN ('TES','AP','ARC','ATN','ER'))
  ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
  LIMIT 10
`);

await tryQuery('does 17427601 (39059) show up with the fixed ordering, no type filter', `
  SELECT l.NoInt_Ligcde, l.NoIntervention, i.TypeCode
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l."Soldée" = False
  ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
  LIMIT 500
`);
