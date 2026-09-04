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
await tryQuery('all open interventions with technician tagged service 305', `
  SELECT i.NoInt_interv, i.NoIntTechn, i.TypeCode, i.TypeLibelle, l.NoInt_Ligcde, l.NoIntervention, l.NomClient
  FROM Intervention i, Tech_Service x, LigCde l
  WHERE i.NoIntTechn = x.NoInt_param
    AND x.LibService = '305'
    AND i.NoIntLigcde = l.NoInt_Ligcde
    AND l."Soldée" = False
`);
await conn.close();
