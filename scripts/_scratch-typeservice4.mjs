import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`
  SELECT NoInt_Ligcde, NoIntervention, NomClient, DateLimiteLivraison
  FROM LigCde WHERE Type_Service = '305' AND "Soldée" = False
`);
const withDate = rows.filter(r => r.DATELIMITELIVRAISON);
console.log('exact 6 with a date:');
withDate.forEach(r => console.log(JSON.stringify(r)));
await conn.close();
