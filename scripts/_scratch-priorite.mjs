import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
const rows = await conn.query(`SELECT DateMisePriorité, NoIntervention, Service FROM PrioritéEnCours ORDER BY NoIntervention`);
console.log('total rows:', rows.length);
rows.forEach(r => console.log(JSON.stringify(r)));
const refs = new Set(['17441201','17446601','17458701','17431601','17456301','17422901','17464101',
              '17466201','17427601','17433701','17466501','17469101','17471501','17473301',
              '17419301','17440501']);
const matchSet = new Set(rows.map(r=>r.NOINTERVENTION));
console.log('exact match with target 16:', refs.size === matchSet.size && [...refs].every(r=>matchSet.has(r)));
await conn.close();
