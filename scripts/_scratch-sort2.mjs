import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`SELECT NoInt_Ligcde, NoIntervention, DateLimiteLivraison, DateDernInterv FROM LigCde WHERE NoInt_Ligcde = 39059`);
console.log(JSON.stringify(rows));
await conn.close();
