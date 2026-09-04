import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`
  SELECT NoInt_Ligcde, NoIntervention, NomClient, DateLimiteLivraison
  FROM LigCde WHERE Type_Service = '305' AND "Soldée" = False
`);
console.log('total Type_Service=305 open:', rows.length);
const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
function toDate(s) { if (!s) return null; const [d]=s.split(' '); const [dd,mm,yy]=d.split('/'); return new Date(`${yy}-${mm}-${dd}`); }
const fresh = rows.filter(r => { const d = toDate(r.DATELIMITELIVRAISON); return d && d >= cutoff; });
console.log('not stale (has date, within last month or future):', fresh.length);
fresh.forEach(r => console.log(JSON.stringify(r)));
const withDate = rows.filter(r => r.DATELIMITELIVRAISON);
console.log('\nhas any date at all:', withDate.length);
const noDate = rows.filter(r => !r.DATELIMITELIVRAISON);
console.log('no date at all:', noDate.length);
await conn.close();
