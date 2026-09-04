import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = False LIMIT 5000`);
console.log('open LigCde count (capped at 5000):', rows.length);
const idx = rows.findIndex(r => r.NOINT_LIGCDE === 39059);
console.log('39059 (17427601) present:', idx >= 0);
await conn.close();
