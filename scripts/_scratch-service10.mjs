import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');

const params305 = await conn.query(`SELECT DISTINCT NoInt_param FROM Tech_Service WHERE LibService = '305'`);
const set305 = new Set(params305.map(r => r.NOINT_PARAM));
console.log('305-tagged params:', [...set305]);

const rows = await conn.query(`
  SELECT l.NoInt_Ligcde, l.NoIntervention, l.NomClient, i.NoIntTechn, i.NoInt_interv, i.TypeCode
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l."Soldée" = False
  ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
  LIMIT 5000
`);
const byLig = new Map();
for (const r of rows) if (!byLig.has(r.NOINT_LIGCDE)) byLig.set(r.NOINT_LIGCDE, r);
console.log('total open (deduped, latest per job):', byLig.size);

const commercial = [...byLig.values()].filter(r => r.NOINTTECHN && set305.has(r.NOINTTECHN));
console.log('\ncount whose LATEST technician is 305-tagged:', commercial.length);
commercial.forEach(r => console.log(JSON.stringify(r)));
await conn.close();
