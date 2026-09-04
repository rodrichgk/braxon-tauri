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
const commercial = [...byLig.values()].filter(r => r.NOINTTECHN && set305.has(r.NOINTTECHN));
const counts = {};
for (const r of commercial) counts[r.TYPECODE] = (counts[r.TYPECODE]||0)+1;
console.log('TypeCode distribution among 305-tech jobs:', counts);
const nonST = commercial.filter(r => r.TYPECODE !== 'ST');
console.log('non-ST count:', nonST.length);
nonST.forEach(r => console.log(JSON.stringify(r)));
await conn.close();
