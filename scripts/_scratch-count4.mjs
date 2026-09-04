import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`
  SELECT l.NoInt_Ligcde, l.NoIntervention, l.NomClient, l.DateLimiteLivraison, l.DateDernInterv, i.TypeCode, i.TypeLibelle
  FROM LigCde l
  LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
  WHERE l."Soldée" = False
  ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
  LIMIT 5000
`);
const byLig = new Map();
for (const r of rows) if (!byLig.has(r.NOINT_LIGCDE)) byLig.set(r.NOINT_LIGCDE, r);
const excluded = new Set(['TES','AP','ARC','ATN']);
const filtered = [...byLig.values()].filter(r => (!r.TYPECODE || !excluded.has(r.TYPECODE)) && r.DATELIMITELIVRAISON);
const refs = new Set(['17441201','17446601','17458701','17431601','17456301','17422901','17464101',
              '17466201','17427601','17433701','17466501','17469101','17471501','17473301',
              '17419301','17440501']);
function toKey(s){ const [d,rest]=s.split(' '); const [dd,mm,yy]=d.split('/'); return `${yy}-${mm}-${dd}`; }
filtered.sort((a,b)=> toKey(a.DATELIMITELIVRAISON).localeCompare(toKey(b.DATELIMITELIVRAISON)));
filtered.forEach(r => {
  const mark = refs.has(r.NOINTERVENTION) ? '*** TARGET' : '';
  console.log(r.NOINTERVENTION, r.DATELIMITELIVRAISON, r.DATEDERNINTERV, r.TYPECODE, r.NOMCLIENT, mark);
});
await conn.close();
