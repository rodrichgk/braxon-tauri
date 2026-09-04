import odbc from 'odbc';

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

const BOOL_CANDIDATES = [
  'Garantie', 'Garantieinter', 'SGConstructeur', 'SGConstructRefusee',
  'SGNonDemandée', 'SGRAS', 'SGRefuseeAutreMotif', 'SGRefuseePanneDiff',
  'ND', 'RAS', 'Réparation', 'Vente', 'EchgeS', 'AvanceES', 'Devis',
  'Devisrefusé', 'Soldée', 'ES_Majoré', 'ES_NonMajoré',
];

async function main() {
  const conn = await odbc.connect(connectionString);
  try {
    const rows = await conn.query(
      `SELECT l.NoInt_Ligcde, l.NoIntervention, l.NomClient, l.CodeArt, l.LibelleArt, l.MarqueBis,
              l.Famille, l.Segmentation, l.Type_Service, l.NoSerie, l.DelaiLigneCde, l.DateLimiteLivraison,
              l.CommentaireInterne, l."Commentaire Gar int", l."motif refu dbal", l."MOTIF REFU REP",
              l.PrixHT, l.Remise, l.MtHT_FM, l.NoInt_cde, l.TechDernInterv, l.NomDernierTech,
              c.NoInt_Client, c."Immat_TypeVéhicule"
       FROM LigCde l LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
       WHERE l.NoIntervention = '17473101'`
    );
    console.log('=== LigCde/Commande row ===');
    console.log(rows[0]);
    const r = rows[0];
    const id = r.NOINT_LIGCDE;
    const cdeId = r.NOINT_CDE;
    const clientId = r.NOINT_CLIENT;

    console.log(`\n--- Boolean probe for NoInt_Ligcde=${id} ---`);
    for (const col of BOOL_CANDIDATES) {
      const res = await conn.query(`SELECT COUNT(*) AS N FROM LigCde WHERE NoInt_Ligcde = ${id} AND "${col}" = True`);
      if (Number(res[0].N) > 0) console.log(`  TRUE : ${col}`);
    }

    if (clientId) {
      const client = await conn.query(
        `SELECT NoIntClt, Nom, Intitule, Ville, CP, Tel, e_mail, NomContact FROM Client WHERE NoIntClt = ${clientId}`
      );
      console.log('\n=== Client ===');
      console.log(client[0]);
      const addr = await conn.query(
        `SELECT NoInt_adLivr, Adr1, Adr2, CP, Ville, NomContact, Tel, e_mail FROM Clt_adrLivr WHERE NoInt_clt = ${clientId} LIMIT 5`
      );
      console.log('\n=== Clt_adrLivr (first 5) ===');
      console.log(addr);
    }

    if (cdeId) {
      const cols = await conn.query(
        `SELECT COLUMN_NAME, DATA_TYPE FROM _USER_COLUMNS WHERE TABLE_NAME = 'Commande' ORDER BY COLUMN_NAME`
      );
      console.log(`\n=== Commande columns (${cols.length}) ===`);
      for (const c of cols) console.log(`  ${c.COLUMN_NAME} (${c.DATA_TYPE})`);
    }

    console.log('\n=== Full Intervention history for this LigCde ===');
    const hist = await conn.query(
      `SELECT NoInt_interv, "Date", HeureInterv, NoIntTechn, TypeCode, TypeLibelle, Commentaire
       FROM Intervention WHERE NoIntLigcde = ${id} ORDER BY NoInt_interv ASC`
    );
    console.log(hist);
  } catch (err) {
    console.error('Query error:', err.odbcErrors || err);
  } finally {
    await conn.close();
  }
}

main();
