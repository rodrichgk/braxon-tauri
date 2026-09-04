import odbc from 'odbc';

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

async function tryQuery(conn, label, sql) {
  try {
    const rows = await conn.query(sql);
    console.log(`\n=== ${label} ===`);
    console.log(rows[0]);
  } catch (err) {
    console.log(`\n=== ${label} (ERROR) ===`);
    console.log((err.odbcErrors && err.odbcErrors[0]?.message) || err.message);
  }
}

async function main() {
  const conn = await odbc.connect(connectionString);
  try {
    await tryQuery(conn, 'Time candidates', `SELECT "CumulTpsTechnique", "TpsTechniqueCorrigé", "DelaiTechnique", "DelaiTotalReel" FROM LigCde WHERE NoInt_Ligcde = 39500`);
    await tryQuery(conn, 'Commande amounts', `SELECT "MtHT_Lignes", "MtHT_Port", "MtPort", "MtHT_Total", "TotalTVA", "TotalTTC", "Ref_Client" FROM Commande WHERE NoInt_Cde = 38999`);
    await tryQuery(conn, 'ArticleMeteor', `SELECT CodeArt, Designation, Constructeur, Famille, Gamme FROM ArticleMeteor WHERE CodeArt = '10091514493'`);
  } finally {
    await conn.close();
  }
}

main();
