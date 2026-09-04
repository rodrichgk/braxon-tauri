import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`
  SELECT NoInt_Ligcde, NoIntervention, NomClient, DateLimiteLivraison
  FROM LigCde WHERE Type_Service = '305' AND "Soldée" = False AND DateLimiteLivraison IS NOT NULL
`);
console.log('all 6 with a date:');
rows.forEach(r => console.log(JSON.stringify(r)));
await conn.close();
