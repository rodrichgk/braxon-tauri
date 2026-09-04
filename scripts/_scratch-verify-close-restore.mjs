import odbc from 'odbc';

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

async function main() {
  const conn = await odbc.connect(connectionString);
  try {
    const lig = await conn.query(
      'SELECT "Soldée", "DernièreInterv", DateDernInterv, TechDernInterv, NomDernierTech, CausePanne, SemaineGarantie FROM LigCde WHERE NoInt_Ligcde = 39480'
    );
    console.log('LigCde now:', lig[0]);
    const rows = await conn.query('SELECT NoInt_interv FROM Intervention WHERE NoInt_interv = 101409');
    console.log('Test step 101409 still exists:', rows.length > 0);
  } catch (err) {
    console.error('Query error:', err.odbcErrors || err);
  } finally {
    await conn.close();
  }
}

main();
