import odbc from 'odbc';

const USER = process.env.FOURD_USER || 'Technique';
const PASS = process.env.FOURD_PASS || '';
const connectionString = `DSN=REMAN_4D;UID=${USER};PWD=${PASS};`;

// All non-Boolean (skip type 1) LigCde columns, to grep for the
// "Panne Permanente ... ROUES QUI BLOQUENT" text and confirm which field
// holds it — never guess field meaning from naming alone.
const TEXT_LIKE_COLS = [
  'Ajustabilite', 'AncCodeArt', 'AncienNoserie', 'CausePanne', 'ClientDLM',
  'CodeArt', 'CodeArtBis', 'CodeClient', 'CodeClientSGConstr', 'CodeRplctNextiraone',
  'CodeStock', 'CodeStockGénéré', 'Comen_Saisie_ma', 'Comment_AttenteAccord', 'Comment_FM',
  'Commentaire Gar int', 'CommentaireInterne', 'CommentCorrectAnomalieTps', 'CommentRefusTF',
  'CommentRelanceSGRAS', 'CommentRetour', 'Couleur', 'DateCode', 'DerInterv_technique',
  'DernièreInterv', 'DerniereInterventionPT', 'DestinationPieceClt', 'detaille_int_sg',
  'GI_tech', 'Indice', 'IndiceCorrigé', 'LibArtBis', 'LibelleArt', 'LibMet',
  'LibTechOrdreCorrectDLM', 'LocAD', 'MarqueBis', 'motif refu dbal', 'MOTIF REFU REP',
  'MotifAnomalieTempsPT', 'NoAvoir_lié', 'NoCompte', 'NoCpteAnal', 'NoIdentAD_Swap',
  'Nointerv_avce', 'NoInterv_recu', 'NoIntervention', 'NomClient', 'NomClientSGConstr',
  'NomDernierTech', 'NomStock', 'NoPrioritéAD', 'NoSerie', 'noserie1', 'NumIntervAD',
  'NumIntervADGenere', 'NumIntervErics', 'NumIntervLiée', 'NumIntervSGConstr',
  'Observations', 'OperateurRefusRASADLC', 'OperateurResultatPrelvt', 'OperateurRetour',
  'Prelevt_commentRefusE', 'Prelevt_commentRefusN', 'Prelevt_commentRefusT', 'Ref_Art',
  'Ref_CltAmecSpie', 'RefCde_NV', 'Segmentation', 'ServiceTechnique',
  'StockPiecePanneRecycleRebut', 'SuiviGar_AncNoInterv', 'TexteAnnulG', 'TexteAnomalieTemps',
  'TexteConfPrix', 'TexteRelance', 'TexteRelanceConfPrix', 'Type_Service', 'TypeHD',
  'TypeHD48SG', 'Vérif_Err_MAg', 'VersCarte', 'Versionlogiciel', 'verif gre',
];

async function main() {
  const conn = await odbc.connect(connectionString);
  try {
    const cols = TEXT_LIKE_COLS.map(c => `"${c}"`).join(', ');
    const rows = await conn.query(`SELECT ${cols} FROM LigCde WHERE NoInt_Ligcde = 39500`);
    console.log('=== Grepping for "Panne Permanente" / "ROUES QUI" across LigCde text columns ===');
    const row = rows[0];
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'string' && v && (v.includes('Panne') || v.includes('ROUES') || v.includes('multiplex'))) {
        console.log(`  MATCH: ${k} = ${JSON.stringify(v)}`);
      }
    }
    console.log('\n=== All non-empty values (for context) ===');
    for (const [k, v] of Object.entries(row)) {
      if (v !== null && v !== '' && v !== undefined) console.log(`  ${k}: ${JSON.stringify(v)}`);
    }

    console.log('\n=== Time/amount candidates ===');
    const t = await conn.query(
      `SELECT CumulTpsTechnique, TpsTechniqueCorrigé, DelaiTechnique, DelaiTotalReel FROM LigCde WHERE NoInt_Ligcde = 39500`
    );
    console.log(t[0]);

    const cde = await conn.query(
      `SELECT MtHT_Lignes, MtHT_Port, MtPort, MtHT_Total, TotalTVA, TotalTTC, Ref_Client
       FROM Commande WHERE NoInt_Cde = 38999`
    );
    console.log(cde[0]);

    const art = await conn.query(
      `SELECT CodeArt, Designation, Constructeur, Famille, Gamme FROM ArticleMeteor WHERE CodeArt = '10091514493'`
    );
    console.log('\n=== ArticleMeteor ===');
    console.log(art[0]);
  } catch (err) {
    console.error('Query error:', err.odbcErrors || err);
  } finally {
    await conn.close();
  }
}

main();
