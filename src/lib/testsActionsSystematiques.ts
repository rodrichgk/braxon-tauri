// Tests & Actions Systématiques — REMAN's checklist that's mandatory in
// the native 4D client before closing certain jobs. Segmented by article
// family: an ABS job only shows the ABS section, a dashboard job only
// shows the Compteur section, etc. — confirmed directly, not guessed.
//
// This reference list lives *only* inside 4D's own client structure —
// there is no backing SQL table for it (confirmed live, 2026-08-04:
// `NoInt_ParamTest`, the id 4D uses per item, doesn't match any of
// REMAN's 266 tables; it's a UI-list resource, not queryable data).
// Transcribed directly from the 4D client, code by code, including the
// Status/Type column: 1 = diagnostic, 2 = test performed, 3 = résultat
// (the repair action taken / finding) — confirmed directly, not inferred
// from the earlier blue/green screenshot colors.
//
// `noIntParamTest` is the real internal id 4D writes into its own
// `Zebra_LigCdeTest` junction table when an item is selected — required
// to write a real, meaningful selection, not just the label text.
// `null` means "known label, not yet verified".
//
// GENERAL/ABS/DIRECTION_ASSISTEE/TRANSMISSION ids confirmed live
// 2026-08-05: job 17479901 (a real ABS job) had every item checked in the
// native 4D client, then diffed against `Zebra_LigCdeTest`. Turned out to
// answer more than just ABS — the same selection screen included the
// GENERAL codes (001-008) *and* Direction Assistée *and* Transmission
// alongside ABS, confirming all four share one category (matches
// `ZebraParamTest_CategTest`: id 116/code 001 links to categories 1, 2,
// *and* 3 — the general codes are shared across every top-level category,
// not ABS-specific). Also filled two gaps history alone couldn't resolve:
// code 111's header id and code 120 (never selected by anyone before this).
// One item, ABS code 039 ("Pas de défaut de communication"), did *not*
// appear in the 62 rows this produced despite every other ABS item (013-038)
// matching cleanly — flagged directly, not silently left as a guess; still
// `null` until that's resolved. COMPTEUR/MULTIMEDIA/COMODO/
// MODULE_ELECTRONIQUE weren't shown on this ABS job at all (confirms the
// segmentation) and remain fully unverified.
//
// COMPTEUR/MULTIMEDIA ids confirmed live 2026-08-05: job 17481601 (a real
// Compteur job, Type_Service=102) had every item selected in the native
// 4D client by a technician doing real work (not a throwaway test job —
// left untouched, not cleaned up). All 46 resulting rows matched the
// already-transcribed codes exactly, cross-confirming GENERAL's ids too.
// One gap, Multimedia code 102 ("Remplacement écran tactile"), did *not*
// appear despite every other Multimedia item (082-101) matching cleanly —
// same pattern as ABS code 039, flagged not guessed, still `null`.
//
// Type_Service correlation (see reman.rs's InterventionQueue doc comment):
// 100/101 = ABS + power steering, 102 = Compteur/Multimedia (now
// confirmed above), 103 = body electronics/airbag. Checked live
// 2026-08-05: every currently-open Type_Service=103 job in the shop
// returns "Cet article n'est pas paramétré pour les tests" in the native
// 4D client — 4D itself doesn't gate closing those jobs on this checklist,
// so COMODO/MODULE_ELECTRONIQUE staying unverified/unenforced here matches
// 4D's real behavior, not just an unfilled gap. Type_Service=100 remains
// unverified (no open 100 job checked live yet).

export type TestActionType = 1 | 2 | 3;

export type TestActionSection =
  | 'GENERAL'
  | 'ABS'
  | 'COMPTEUR'
  | 'DIRECTION_ASSISTEE'
  | 'MULTIMEDIA'
  | 'TRANSMISSION'
  | 'COMODO'
  | 'MODULE_ELECTRONIQUE';

export interface TestActionItem {
  code: string;
  label: string;
  type: TestActionType;
  noIntParamTest: number | null;
}

export const TEST_ACTION_SECTION_LABELS: Record<TestActionSection, string> = {
  GENERAL: 'GENERAL',
  ABS: 'TESTS ET ACTIONS ABS',
  COMPTEUR: 'TESTS ET ACTIONS COMPTEUR',
  DIRECTION_ASSISTEE: 'TESTS ET ACTIONS DIRECTION ASSISTEE',
  MULTIMEDIA: 'TESTS ET ACTIONS MULTIMEDIA',
  TRANSMISSION: 'TESTS ET ACTIONS TRANSMISSION',
  COMODO: 'TESTS ET ACTIONS COMODO',
  MODULE_ELECTRONIQUE: 'TESTS ET ACTIONS MODULE ELECTRONIQUE',
};

export const TEST_ACTION_SECTIONS: Record<TestActionSection, TestActionItem[]> = {
  // Shared across every category (confirmed live: code 001/id 116 links to
  // categories 1, 2, *and* 3 in ZebraParamTest_CategTest) — shown ahead of
  // whichever specific section applies, not a section of its own in 4D's
  // own UI, but broken out here since it isn't ABS-specific.
  GENERAL: [
    { code: '001', label: 'Panne intermittente confirmée', type: 1, noIntParamTest: 116 },
    { code: '002', label: 'Panne permanente confirmée', type: 1, noIntParamTest: 467 },
    { code: '003', label: 'Panne non confirmée', type: 1, noIntParamTest: 3809 },
    { code: '004', label: 'Codes défauts confirmés', type: 1, noIntParamTest: 464 },
    { code: '005', label: 'Codes défauts effacés', type: 3, noIntParamTest: 465 },
    { code: '006', label: 'Codes défaut persistant', type: 3, noIntParamTest: 3808 },
    { code: '007', label: 'Dommage(s) physique(s) - court-circuit', type: 3, noIntParamTest: 3823 },
    { code: '008', label: 'Dommage liquide - oxydation', type: 3, noIntParamTest: 3824 },
  ],
  ABS: [
    { code: '013', label: 'Test du moteur - pompe', type: 2, noIntParamTest: 3806 },
    { code: '014', label: 'Test hydraulique - électrovannes', type: 2, noIntParamTest: 3807 },
    { code: '015', label: 'Test fonctionnel du calculateur ABS', type: 2, noIntParamTest: 2145 },
    { code: '016', label: 'Test du réseau CAN BUS - Communication', type: 2, noIntParamTest: 2146 },
    { code: '017', label: 'Vérification du circuit imprimé et composants', type: 2, noIntParamTest: 2144 },
    { code: '018', label: 'Electrovanne(s) défectueuse(s)', type: 1, noIntParamTest: 2154 },
    { code: '019', label: 'Aucune communication', type: 1, noIntParamTest: 3820 },
    { code: '020', label: 'Calculateur ABS défectueux', type: 1, noIntParamTest: 3810 },
    { code: '021', label: 'Capteur de pression défectueux', type: 1, noIntParamTest: 3805 },
    { code: '022', label: 'Moteur - pompe défectueux(se)', type: 1, noIntParamTest: 2166 },
    { code: '023', label: 'Remplacement du bloc capteur pression', type: 3, noIntParamTest: 2149 },
    { code: '024', label: 'Remplacement du bloc hydraulique', type: 3, noIntParamTest: 2151 },
    { code: '025', label: 'Remise en état hydraulique - électrovannes', type: 3, noIntParamTest: 2153 },
    { code: '026', label: 'Remise en état du moteur - pompe', type: 3, noIntParamTest: 2157 },
    { code: '027', label: 'Remise en état des soudures', type: 3, noIntParamTest: 2138 },
    { code: '028', label: 'Remise en état du connecteur', type: 3, noIntParamTest: 2139 },
    { code: '029', label: 'Remplacement de composants', type: 3, noIntParamTest: 2141 },
    { code: '030', label: 'Mémoire échangée', type: 3, noIntParamTest: 2142 },
    { code: '031', label: "Echange complet de l'ABS", type: 3, noIntParamTest: 3812 },
    { code: '032', label: "Reprogrammation de l'ABS", type: 3, noIntParamTest: 3811 },
    { code: '033', label: 'Calculateur ABS reprogrammé', type: 3, noIntParamTest: 2132 },
    { code: '034', label: 'Pas de défaut du calculateur ABS', type: 1, noIntParamTest: 3813 },
    { code: '035', label: 'Pas de code(s) défaut en mémoire', type: 1, noIntParamTest: 3817 },
    { code: '036', label: 'Pas de défaut de la partie hydraulique', type: 1, noIntParamTest: 3814 },
    { code: '037', label: 'Pas de défaut du capteur de pression', type: 1, noIntParamTest: 3816 },
    { code: '038', label: 'Pas de défaut du moteur ABS', type: 1, noIntParamTest: 3815 },
    // Did NOT appear among the 62 rows job 17479901 produced despite every
    // other ABS item (013-038) matching cleanly — confirmed missing, not
    // guessed. Flagged directly; still unresolved.
    { code: '039', label: 'Pas de défaut de communication', type: 1, noIntParamTest: null },
  ],
  COMPTEUR: [
    { code: '046', label: 'Test des aiguilles', type: 2, noIntParamTest: 3827 },
    { code: '047', label: "Test d'écran LCD", type: 2, noIntParamTest: 3828 },
    { code: '048', label: 'Test éclairage - voyant(s)', type: 2, noIntParamTest: 3829 },
    { code: '049', label: 'Vérification du circuit imprimé et/ou connecteur(s)', type: 2, noIntParamTest: 3830 },
    { code: '050', label: 'Vérification processeur - mémoire', type: 2, noIntParamTest: 3837 },
    { code: '051', label: 'Aiguille(s) défectueuse', type: 1, noIntParamTest: 3838 },
    { code: '052', label: 'Ecran LCD défectueux', type: 1, noIntParamTest: 3839 },
    { code: '053', label: 'Eclairage - voyant(s) défectueux', type: 1, noIntParamTest: 3840 },
    { code: '054', label: 'Circuit imprimé et/ou connecteur(s) endommagé(s)', type: 1, noIntParamTest: 3841 },
    { code: '055', label: 'Défaut de processeur - mémoire', type: 1, noIntParamTest: 3842 },
    { code: '056', label: 'Remise en état - remplacement aiguille(s)', type: 3, noIntParamTest: 3843 },
    { code: '057', label: 'Remise en état - remplacement écran LCD', type: 3, noIntParamTest: 3844 },
    { code: '058', label: 'Remise en état circuit imprimé et/ou connecteur(s)', type: 3, noIntParamTest: 3845 },
  ],
  DIRECTION_ASSISTEE: [
    { code: '062', label: 'Test du calculateur', type: 2, noIntParamTest: 3850 },
    { code: '063', label: 'Test du moteur', type: 2, noIntParamTest: 3854 },
    { code: '064', label: 'Test capteur(s) couple - position', type: 2, noIntParamTest: 3855 },
    { code: '064', label: 'Test fonctionnel de la direction', type: 2, noIntParamTest: 3857 },
    { code: '065', label: 'Défaut du calculateur', type: 1, noIntParamTest: 3858 },
    { code: '066', label: 'Défaut du moteur', type: 1, noIntParamTest: 3859 },
    { code: '067', label: 'Défaut capteur(s) couple - position', type: 1, noIntParamTest: 3860 },
    { code: '068', label: 'Défaut fonctionnel de la direction', type: 1, noIntParamTest: 3861 },
    { code: '069', label: 'Remise en état - remplacement du calculateur', type: 3, noIntParamTest: 3862 },
    { code: '070', label: 'Remise en état - remplacement du moteur', type: 3, noIntParamTest: 3863 },
    { code: '071', label: 'Remplacement capteur', type: 3, noIntParamTest: 3864 },
    { code: '072', label: 'Remise en état - remplacement de la direction', type: 3, noIntParamTest: 3865 },
  ],
  MULTIMEDIA: [
    { code: '082', label: "Test de l'alimentation", type: 2, noIntParamTest: 3870 },
    { code: '083', label: 'Test de la communication', type: 2, noIntParamTest: 3871 },
    { code: '084', label: "Test de l'écran", type: 2, noIntParamTest: 3872 },
    { code: '085', label: 'Test du mécanisme CD', type: 2, noIntParamTest: 3873 },
    { code: '086', label: 'Test du logiciel', type: 2, noIntParamTest: 3874 },
    { code: '087', label: 'Vérification circuit-imprimé et/ou composant(s)', type: 2, noIntParamTest: 3875 },
    { code: '088', label: "Défaut d'alimentation", type: 1, noIntParamTest: 3876 },
    { code: '089', label: 'Défaut de communication', type: 1, noIntParamTest: 3877 },
    { code: '090', label: 'Défaut écran', type: 1, noIntParamTest: 3878 },
    { code: '091', label: 'Ecran cassé', type: 1, noIntParamTest: 3879 },
    { code: '092', label: 'Défaut du mécanisme CD', type: 1, noIntParamTest: 3880 },
    { code: '093', label: 'Défaut logiciel - mémoire corrompue', type: 1, noIntParamTest: 3881 },
    { code: '094', label: 'Défaut circuit-imprimé et/ou composant(s)', type: 1, noIntParamTest: 3882 },
    { code: '095', label: 'Remise en état alimentation', type: 3, noIntParamTest: 3883 },
    { code: '096', label: 'Remise en état communication', type: 3, noIntParamTest: 3884 },
    { code: '097', label: 'Remise en état - remplacement écran LCD', type: 3, noIntParamTest: 3885 },
    { code: '098', label: 'Remplacement mécanisme CD', type: 3, noIntParamTest: 3886 },
    { code: '099', label: 'Mise à jour - réinstallation logicielle', type: 3, noIntParamTest: 3887 },
    { code: '100', label: 'Remise en état circuit-imprimé', type: 3, noIntParamTest: 3890 },
    { code: '101', label: 'Remplacement composant(s)', type: 3, noIntParamTest: 3891 },
    // Did NOT appear among the 46 rows job 17481601 produced despite every
    // other Multimedia item (082-101) matching cleanly — confirmed missing,
    // not guessed, same as ABS code 039. Flagged directly, unresolved.
    { code: '102', label: 'Remplacement écran tactile', type: 3, noIntParamTest: null },
  ],
  TRANSMISSION: [
    { code: '112', label: 'Vérification du circuit-imprimé', type: 2, noIntParamTest: 3895 },
    { code: '113', label: 'Vérification des capteurs', type: 2, noIntParamTest: 3896 },
    { code: '114', label: 'Vérification des électrovannes', type: 2, noIntParamTest: 3897 },
    { code: '115', label: 'Circuit-imprimé endommagé', type: 1, noIntParamTest: 3898 },
    { code: '116', label: 'Capteur(s) défectueux', type: 1, noIntParamTest: 3900 },
    { code: '117', label: 'Electrovanne(s) défetueuse(s)', type: 1, noIntParamTest: 3904 },
    { code: '118', label: 'Remise en état du circuit-imprimé', type: 3, noIntParamTest: 3905 },
    { code: '119', label: 'Remise en état - remplacement capteur(s)', type: 3, noIntParamTest: 3906 },
    { code: '120', label: 'Remise en état - remplacement électrovanne(s)', type: 3, noIntParamTest: 3902 },
  ],
  COMODO: [
    { code: '132', label: 'Test du comodo', type: 2, noIntParamTest: null },
    { code: '133', label: 'Comodo défectueux', type: 1, noIntParamTest: null },
    { code: '134', label: 'Remise en état du comodo', type: 3, noIntParamTest: null },
  ],
  MODULE_ELECTRONIQUE: [
    { code: '142', label: 'Vérification circuit-imprimé et/ou composant(s)', type: 2, noIntParamTest: null },
    { code: '143', label: 'Test alimentation', type: 2, noIntParamTest: null },
    { code: '144', label: 'Test communication', type: 2, noIntParamTest: null },
    { code: '144', label: 'Test logiciel', type: 2, noIntParamTest: null },
    { code: '145', label: 'Circuit-imprimé et/ou composant(s) défectueux', type: 2, noIntParamTest: null },
    { code: '146', label: "Défaut d'alimentation", type: 1, noIntParamTest: null },
    { code: '147', label: 'Défaut de communication', type: 1, noIntParamTest: null },
    { code: '148', label: 'Défaut logiciel', type: 1, noIntParamTest: null },
    { code: '149', label: 'Remise en état alimentation', type: 3, noIntParamTest: null },
    { code: '150', label: 'Remise en état communication', type: 3, noIntParamTest: null },
    { code: '151', label: 'Mise à jour - réinstallation logicielle', type: 3, noIntParamTest: null },
    { code: '152', label: 'Remise en état circuit-imprimé', type: 3, noIntParamTest: null },
    { code: '153', label: 'Remise en état - remplacement composant(s)', type: 3, noIntParamTest: null },
  ],
};
