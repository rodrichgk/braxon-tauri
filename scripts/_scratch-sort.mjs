import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`
  SELECT l.NoInt_Ligcde, l.NoIntervention, l.DateLimiteLivraison, i.TypeCode
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l."Soldée" = False
  ORDER BY l.DateLimiteLivraison ASC, l.NoInt_Ligcde DESC
  LIMIT 60
`);
console.log('total:', rows.length);
rows.slice(0, 15).forEach(r => console.log(JSON.stringify(r)));
const idx = rows.findIndex(r => r.NOINTERVENTION === '17427601');
console.log('17427601 at index', idx);
await conn.close();
