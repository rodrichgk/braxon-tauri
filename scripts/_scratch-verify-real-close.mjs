import odbc from 'odbc';

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

async function main() {
  const conn = await odbc.connect(connectionString);
  try {
    const lig = await conn.query(
      `SELECT NoInt_Ligcde, NoIntervention, "Soldée", "DernièreInterv", DateDernInterv, TechDernInterv,
              NomDernierTech, Nettoyage, CausePanne, SemaineGarantie, "HeureLigSoldée", ServiceTechnique
       FROM LigCde WHERE NoInt_Ligcde = 39480`
    );
    console.log('LigCde state:', lig[0]);

    const hist = await conn.query(
      `SELECT NoInt_interv, NoIntTechn, TypeCode, TypeLibelle, "Date", HeureInterv, Commentaire, NiveauPanne
       FROM Intervention WHERE NoIntLigcde = 39480 ORDER BY NoInt_interv ASC`
    );
    console.log('\nFull history:');
    hist.forEach(r => console.log(' -', r));
  } catch (err) {
    console.error('Query error:', err.odbcErrors || err);
  } finally {
    await conn.close();
  }
}

main();
