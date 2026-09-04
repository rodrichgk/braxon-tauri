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
// Join Intervention -> Tech_Service via NoIntTechn = NoInt_param, filter LibService=305
await tryQuery('Interventions whose NoIntTechn is tagged LibService=305', `
  SELECT i.NoInt_interv, i.NoIntTechn, i.TypeCode, i.TypeLibelle, l.NoIntervention, l.NomClient, l."Soldée"
  FROM Intervention i, Tech_Service ts, LigCde l
  WHERE i.NoIntTechn = ts.NoInt_param
    AND ts.LibService = '305'
    AND i.NoIntLigcde = l.NoInt_Ligcde
`);
await conn.close();
