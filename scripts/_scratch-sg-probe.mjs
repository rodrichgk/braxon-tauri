import odbc from 'odbc';

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

// Boolean-flag candidates that could plausibly be the grid's short-label
// checkbox columns: devis / SG / HD / soldée.
const CANDIDATES = [
  'Devis', 'Soldée', 'Garantie', 'Garantieinter', 'SGConstructeur',
  'SGConstructRefusee', 'SGNonDemandée', 'SGRAS', 'SGRefuseeAutreMotif',
  'SGRefuseePanneDiff', 'Dorma_SGconstructeur', '48H', 'TIBCO_J1',
  'Zebra_TeteSousGarantie',
];

async function main() {
  const conn = await odbc.connect(connectionString);
  try {
    const rows = await conn.query(
      `SELECT NoInt_Ligcde, NoIntervention, CodeArt, LibelleArt, PrixHT, Remise, Type_Service, ` +
      `DateLimiteLivraison, DateDernInterv, DerniereInterv, NoBL, TypeHD, TypeHD48SG ` +
      `FROM LigCde WHERE CodeArt = '0265951612' AND DateLimiteLivraison = '05/08/2026' LIMIT 20`
    );
    console.log(`=== Matching rows (${rows.length}) ===`);
    console.log(rows);

    for (const r of rows) {
      const id = r.NOINT_LIGCDE;
      console.log(`\n--- Probing boolean flags for NoInt_Ligcde=${id} ---`);
      for (const col of CANDIDATES) {
        try {
          const res = await conn.query(
            `SELECT COUNT(*) AS N FROM LigCde WHERE NoInt_Ligcde = ${id} AND "${col}" = True`
          );
          const isTrue = Number(res[0].N) > 0;
          if (isTrue) console.log(`  TRUE  : ${col}`);
        } catch (err) {
          console.log(`  ERROR : ${col} -> ${(err.odbcErrors && err.odbcErrors[0]?.message) || err.message}`);
        }
      }
    }
  } catch (err) {
    console.error('Query error:', err.odbcErrors || err);
  } finally {
    await conn.close();
  }
}

main();
