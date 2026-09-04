import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = False ORDER BY NoInt_Ligcde DESC LIMIT 5000`);
console.log('open LigCde count (ordered, capped 5000):', rows.length);
console.log('min in this window:', Math.min(...rows.map(r=>r.NOINT_LIGCDE)), 'max:', Math.max(...rows.map(r=>r.NOINT_LIGCDE)));
const idx = rows.findIndex(r => r.NOINT_LIGCDE === 39059);
console.log('39059 present:', idx>=0, 'at index', idx);
await conn.close();
