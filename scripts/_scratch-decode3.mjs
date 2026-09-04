import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
for (const svc of ['100','101','102','103','104','114','305']) {
  const rows = await conn.query(`SELECT LibelleArt FROM LigCde WHERE Type_Service = '${svc}' LIMIT 300`);
  const counts = {};
  for (const r of rows) {
    // bucket by first significant word
    const lib = (r.LIBELLEART || '').trim();
    let key = lib.split(' ').slice(0,2).join(' ');
    if (!key) key = '(vide)';
    counts[key] = (counts[key]||0) + 1;
  }
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  console.log(`\n=== Type_Service=${svc} (sample ${rows.length}) top LibelleArt prefixes ===`);
  top.forEach(([k,v]) => console.log(`  ${v}x  ${k}`));
}
await conn.close();
