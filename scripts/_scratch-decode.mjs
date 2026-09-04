import odbc from 'odbc';
const conn = await odbc.connect('DSN=REMAN_4D;UID=Technique;PWD=;');
async function tryQuery(label, sql) {
  try {
    const rows = await conn.query(sql);
    console.log(`\n=== ${label} (${rows.length} rows) ===`);
    rows.forEach(r => console.log(JSON.stringify(r)));
    return rows;
  } catch (err) {
    console.log(`FAIL ${label}:`, err.odbcErrors ? err.odbcErrors.map(e => e.message).join(' | ') : err.message);
    return null;
  }
}
await tryQuery('Salarie: Service + Fonction per person', `
  SELECT Service, Fonction, Nom, Prenom FROM Salarie ORDER BY Service
`);
