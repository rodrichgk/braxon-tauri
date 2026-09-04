import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`
  SELECT l.NoInt_Ligcde, l.NoIntervention, l.DateLimiteLivraison, i.TypeCode
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l."Soldée" = False
  ORDER BY l.NoInt_Ligcde DESC
  LIMIT 5000
`);
// dedupe by ligcde keeping first (most recent intervention due to no secondary sort though - just take any, we mainly need typecode presence)
const byLig = new Map();
for (const r of rows) {
  if (!byLig.has(r.NOINT_LIGCDE)) byLig.set(r.NOINT_LIGCDE, r);
}
const excluded = new Set(['TES','AP','ARC','ATN','ER']);
const uncategorized = [...byLig.values()].filter(r => !r.TYPECODE || !excluded.has(r.TYPECODE));
console.log('total open (deduped):', byLig.size);
console.log('uncategorized (no excluded typecode):', uncategorized.length);
const withDate = uncategorized.filter(r => r.DATELIMITELIVRAISON);
console.log('uncategorized AND has a delivery date:', withDate.length);
const refs = new Set(['17441201','17446601','17458701','17431601','17456301','17422901','17464101',
              '17466201','17427601','17433701','17466501','17469101','17471501','17473301',
              '17419301','17440501']);
const matchSet = new Set(withDate.map(r=>r.NOINTERVENTION));
console.log('withDate refs match target list exactly:', refs.size === matchSet.size && [...refs].every(r=>matchSet.has(r)));
console.log('withDate refs NOT in target:', withDate.map(r=>r.NOINTERVENTION).filter(r=>!refs.has(r)));
console.log('target refs NOT in withDate:', [...refs].filter(r=>!matchSet.has(r)));
await conn.close();
