import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`
  SELECT l.NoInt_Ligcde, l.NoIntervention, i.TypeCode
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l."Soldée" = False
  ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
  LIMIT 1000
`);
console.log('total rows:', rows.length);
const idx = rows.findIndex(r => r.NOINTERVENTION === '17427601');
console.log('17427601 at index', idx, idx>=0 ? JSON.stringify(rows[idx]) : '');
await conn.close();
