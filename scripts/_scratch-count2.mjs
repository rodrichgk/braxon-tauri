import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`
  SELECT l.NoInt_Ligcde, l.NoIntervention, l.DateLimiteLivraison, i.TypeCode, i.NoInt_interv
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l."Soldée" = False
  ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
  LIMIT 5000
`);
const byLig = new Map();
for (const r of rows) {
  if (!byLig.has(r.NOINT_LIGCDE)) byLig.set(r.NOINT_LIGCDE, r);
}
const excluded = new Set(['TES','AP','ARC','ATN','ER']);
const uncategorized = [...byLig.values()].filter(r => !r.TYPECODE || !excluded.has(r.TYPECODE));
const withDate = uncategorized.filter(r => r.DATELIMITELIVRAISON);
console.log('total open (deduped):', byLig.size);
console.log('uncategorized:', uncategorized.length);
console.log('uncategorized AND has date:', withDate.length);
const refs = new Set(['17441201','17446601','17458701','17431601','17456301','17422901','17464101',
              '17466201','17427601','17433701','17466501','17469101','17471501','17473301',
              '17419301','17440501']);
const matchSet = new Set(withDate.map(r=>r.NOINTERVENTION));
console.log('extra (in withDate, not target):', withDate.map(r=>r.NOINTERVENTION).filter(r=>!refs.has(r)));
console.log('missing (in target, not withDate):', [...refs].filter(r=>!matchSet.has(r)));
// check the 5 previously-missing refs directly
for (const ref of ['17441201','17446601','17456301','17422901','17469101']) {
  const r = byLig.get([...byLig.values()].find(v=>v.NOINTERVENTION===ref)?.NOINT_LIGCDE);
  console.log(ref, '->', JSON.stringify(r));
}
await conn.close();
