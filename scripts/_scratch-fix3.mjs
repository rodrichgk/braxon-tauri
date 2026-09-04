import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`
  SELECT l.NoInt_Ligcde, l.NoIntervention, l.NomClient, i.TypeCode
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l."Soldée" = False
    AND (i.TypeCode IS NULL OR i.TypeCode NOT IN ('TES','AP','ARC','ATN','ER'))
  ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
  LIMIT 1000
`);
console.log('total rows:', rows.length);
const found = rows.find(r => r.NOINTERVENTION === '17427601');
console.log('17427601 found at position', rows.indexOf(found), ':', JSON.stringify(found));
await conn.close();
