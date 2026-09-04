import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');

const params305 = await conn.query(`SELECT DISTINCT NoInt_param FROM Tech_Service WHERE LibService = '305'`);
const set305 = new Set(params305.map(r => r.NOINT_PARAM));

const rows = await conn.query(`
  SELECT l.NoInt_Ligcde, l.NoIntervention, l.NomClient, l.DateLimiteLivraison, i.NoIntTechn, i.NoInt_interv, i.TypeCode
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l."Soldée" = False
  ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
  LIMIT 5000
`);
const byLig = new Map();
for (const r of rows) if (!byLig.has(r.NOINT_LIGCDE)) byLig.set(r.NOINT_LIGCDE, r);

const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 30);
function toDate(s) {
  if (!s) return null;
  const [d] = s.split(' ');
  const [dd,mm,yy] = d.split('/');
  return new Date(`${yy}-${mm}-${dd}`);
}

const commercial = [...byLig.values()].filter(r => r.NOINTTECHN && set305.has(r.NOINTTECHN));
console.log('commercial (305-tech, no staleness filter):', commercial.length);

const commercialFresh = commercial.filter(r => {
  const d = toDate(r.DATELIMITELIVRAISON);
  return d && d >= cutoff;
});
console.log('commercial (305-tech, deadline within last month or future):', commercialFresh.length);
commercialFresh.forEach(r => console.log(JSON.stringify(r)));

const commercialNoDateReq = commercial.filter(r => {
  const d = toDate(r.DATELIMITELIVRAISON);
  return !d || d >= cutoff;
});
console.log('\ncommercial (305-tech, not stale, date optional):', commercialNoDateReq.length);
await conn.close();
