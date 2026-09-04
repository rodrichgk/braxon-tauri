import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`
  SELECT l.NoInt_Ligcde, l.NoIntervention, l.DateLimiteLivraison, i.TypeCode
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l."Soldée" = False
  ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
  LIMIT 5000
`);
const byLig = new Map();
for (const r of rows) if (!byLig.has(r.NOINT_LIGCDE)) byLig.set(r.NOINT_LIGCDE, r);

const excluded = new Set(['TES','AP','ARC','ATN']); // ER removed from exclusion
const filtered = [...byLig.values()].filter(r => (!r.TYPECODE || !excluded.has(r.TYPECODE)) && r.DATELIMITELIVRAISON);
console.log('count:', filtered.length);

const refs = new Set(['17441201','17446601','17458701','17431601','17456301','17422901','17464101',
              '17466201','17427601','17433701','17466501','17469101','17471501','17473301',
              '17419301','17440501']);
const matchSet = new Set(filtered.map(r=>r.NOINTERVENTION));
console.log('exact match:', refs.size === matchSet.size && [...refs].every(r=>matchSet.has(r)));
console.log('extra:', filtered.map(r=>r.NOINTERVENTION).filter(r=>!refs.has(r)));
console.log('missing:', [...refs].filter(r=>!matchSet.has(r)));
await conn.close();
