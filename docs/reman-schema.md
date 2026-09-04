# REMAN 4D schema — priority tables

Captured live from the 4D server (`192.168.77.10:19822`, via the local
proxy + `UID=Technique`) on 2026-07-30 using `scripts/explore-4d.mjs`
against `_USER_COLUMNS`. Full raw dump for all 266 tables is not checked
in; this file keeps only the 8 tables scoped for the REMAN browse view.

Column format: `Name (type)` where `type` is the numeric code the 4D ODBC
driver reports for `DATA_TYPE` — the driver doesn't return human-readable
type names. The mapping below is **inferred from column naming
conventions**, not documented by the driver, and should be treated as a
strong guess, not ground truth:

| Code | Inferred meaning | Evidence |
|---|---|---|
| 1  | Boolean          | `Anglais`, `Blocage`, `ADCS`, `Affacturé` — all yes/no flags |
| 3  | Integer          | `NbFact`, `DelaiGarantie`, `JrsEcheance` — small counts/day-deltas |
| 4  | Long integer / internal record pointer | every `NoInt*` field — these are the 4D relation keys |
| 6  | Real / currency  | `PrixHT`, `Tarif1..6`, `PA`, `TxEscpte` — money and rate fields |
| 8  | Date             | every `Date*` field |
| 9  | Time             | every `Heure*` field, `TempsPasse`, `CumulTpsTechnique` |
| 10 | Text             | everything else — names, codes, comments |

Confirm against real query results before relying on exact SQL type
handling (e.g. date/time parsing) in the Rust layer.

## Table relationships (the important part)

**There is no direct foreign key from `Intervention` to `Client`.** The
join chain is four tables deep:

```
Intervention.NoIntLigcde
    → LigCde.NoInt_Ligcde   (LigCde's own PK)
      LigCde.NoInt_cde
    → Commande.NoInt_Cde    (Commande's own PK)
      Commande.NoInt_Client
    → Client.NoIntClt       (Client's own PK)
```

`LigCde` is not in scope for the browse UI (it's a huge internal workflow
table — see column count below) but the join has to pass through it to
resolve which client an intervention belongs to. `LigCde.CodeClient` (text)
looked like it might be a shortcut, but its type doesn't match
`Client.Code` cleanly — don't rely on it without verifying against real
rows first.

Other relationships:
- `DetailInterv.NoIntIntervAppel` → `Intervention.NoInt_interv` (line items
  for an intervention; naming asymmetry — "IntervAppel" vs "interv" — is
  the driver's, not a typo here).
- `Clt_adrLivr.NoInt_clt` → `Client.NoIntClt` (delivery addresses for a
  client); `Clt_adrLivr.NoInt_adLivr` is its own PK.
- `Stock` / `StockSWAP` / `A_StockAtester` key off `CodeArt` (text article
  code), matching `ArticleMeteor.CodeArt` — no `NoInt*` relation for these,
  join on the text code.

Several column names contain spaces or accented characters (e.g.
`Commentaire Gar int`, `verif GRE`, `Activité`, `Générique`) — these
**must** be bracket- or quote-escaped in SQL (4D ODBC uses
`[Commentaire Gar int]` or double quotes depending on the query grammar —
verify the working form empirically, the notes' example queries didn't
exercise this).

## Columns

### Intervention (33 cols)
```
AncD_DepartDateL (8)      AncD_DepartTech (8)        AncDateLimiteLivr (8)
AncDateLimiteTech (8)     AncDelaiLog1 (3)           AncDelaiLog2 (3)
AncDelaiTechnique (3)     AncH_DepartDateL (9)       AncH_DepartTech (9)
Commentaire (10)          Date (8)                   DateDevisPièce (8)
DateLimiteInitialeLivr (8) DateLimiteInitialeTech (8) DelaiCorrigé (3)
DevisRefusé (1)           GarderAppareil (1)         HeureAcceptDevis (9)
HeureInterv (9)           HeureNum (6)               Heures (10)
NbJrsRepClient (3)        NiveauPanne (3)             NoInt_interv (4)  -- PK
NoIntEtapeEnCours (4)     NoIntLigcde (4)             NoIntTechn (4)
NomMachine (10)           Possesseur (10)             PrixForfait (6)
TempsPasse (9)            TypeCode (10)               TypeLibelle (10)
verif GRE (10)
```

### DetailInterv (7 cols)
```
CodeArt (10)          LibArt (10)           Libart2 (10)
NoIntDetail (4)  -- PK  NoIntIntervAppel (4)  -- FK -> Intervention.NoInt_interv
PrixHT (6)            PrixNet (6)           Remise (6)
```

### Client (270 cols — abbreviated to the fields likely useful for a browse/search UI; full list was captured but most are pricing/relance/statistics internals not needed here)
```
Code (3)               CodeTarif (3)           Commentaire (10)
Comment4D (10)         CP (10)                 e_mail (10)
Fax (10)               Intitule (10)           Nom (10)
NomContact (10)        NoIntClt (4)  -- PK      Pays (10)
Region (10)            Tel (10)                TypeClt (10)
Ville (10)
```
See the raw discovery output (re-run `scripts/explore-4d.mjs` if needed) for
the remaining ~250 columns — mostly `C_*`/`Y_*` prefixed pricing, relance
(follow-up call scheduling), and statistics fields not relevant to a
read-only browse view.

### Clt_adrLivr (43 cols)
```
ADCS (1)                  Adr1 (10)                  Adr2 (10)
Anglais (1)                C_modeOpMateriel (10)      C_ModeOpPrestation (10)
CdtTarif_IDF (1)          CEME (1)                    CiblePrioritaire (1)
Classe (10)                CodeClientAlpha (10)       CodeClientFormatTri (10)
CodeclientRattacht (3)    CodeCltAffacturéLivré (10) Commentaire (10)
CP (10)                   CYLX (1)                    DateCreation (8)
DateDebut_Part (8)        DateFin_Part (8)            DateModif (8)
e_mail (10)                email_envoiDoc (10)        email_envoiMotPasse (10)
envoiDocPdf (10)           Fax (10)                    Ferme (1)
GroupStats (10)           HeureModif (9)              Mail_Fax_secondaire (10)
MailUPS (10)              MD5 (10)                     ModeOpBL (10)
ModeOPCde (10)            ModeOpNettoyage (10)         ModeOPTech (10)
MotPasse (10)             NbMeca (3)                    NbreCltFinal (3)
NoInt_adLivr (4)  -- PK    NoInt_clt (4)  -- FK -> Client.NoIntClt
NoIntAdrLivrRattacht (4)  Nom_CP_Ville (10)             NomContact (10)
NomLivré (10)             NoProspect (10)               ObjectifAnnuel (6)
Partenaire (10)           PasLivraison (1)              Pays (10)
Priorité (3)               Referentiel_Part (6)         Region (10)
Repr (10)                  ReprPartenaire (10)          SectGeo (10)
Service (10)                SoutienComm (10)            Tel (10)
TSavecPort (1)              Ville (10)
```
Note: `Clt_adrLivr.MotPasse` (10) looks like it stores a plaintext password
and `MD5` (10) a hash — this table has more in it than just addresses.
Do **not** select these two columns in any query the browse UI runs.

### Stock (19 cols)
```
AppartenanceTIBCO (1)   CodeArt (10)             Couleur (10)
CoutVariable (6)        DateSortie (8)           Famille (10)
G_F (10)                Gamme (10)               IDF (1)
Indice (10)             Invent (1)               LibelleArt (10)
Localisation (10)       Neuf (1)                 NoBLclt (4)
NoIdentif (10)          NoInt_Stock (4)  -- PK   NoIntLigCdeVte (4)
NoSerie (10)            Observation (10)         PA (6)
ProvCodeStockEricsson (10) ProvenanceAD (1)      ProvenanceStockErics (1)
```

### StockSWAP (9 cols)
```
ad (3)              Cle (10)             CodeArticle (10)
Couleur (10)         Indice (10)          NoIntSWAP (4)  -- PK
QteReservée (3)      QtéSWAP (3)          rotation (3)
rotation99 (3)
```

### ArticleMeteor (99 cols — abbreviated; identifying/pricing fields shown, the rest are stock-min/max and statistics per warehouse)
```
CodeArt (10)  -- PK (text, joined against by Stock/StockSWAP/A_StockAtester)
CodeCatalog (10)       CodeConstructeur (10)   Constructeur (10)
Designation (10)       Famille (10)             Gamme (10)
NoInt_art (4)          Service (10)             Type (10)
```
See raw discovery output for the remaining pricing (`Tarif1..6`,
`CMUP*`) and per-warehouse stock-threshold columns.

### A_StockAtester (46 cols)
```
AncCodeArt (10)         AncTechRefusTF (10)      AttenteEmbal (1)
AttenteNettoy (1)        AttenteTestFinal (1)     CodeArt (10)
CommentRefusTF (10)      Couleur (10)             DateEmbal (8)
DateEntree (8)           DateIntervRefusTF (8)    DateNettoy (8)
DateSortie (8)           DateTestFinal (8)        Defect (1)
Famille (10)             Gamme (10)               GarantieInterneNett (3)
GarantieInterneT (3)     HeureEmbal (9)           HeureIntervRefusTF (9)
HeureNettoy (9)          HeureTestFinal (9)       HistoTF (10)
Indice (10)              LibelleArt (10)          MotifRefus (10)
NoCdeTest (4)            NoIdentif (10)           NoIdentifSWAP (10)
NoInt_DemGarant (4)      NoInt_TechEmballage (3)  NoInt_TechNett (3)
NoInt_testFinal (3)      NoIntStockAT (4)  -- PK  Noserie (10)
Observation (10)         PasFacturation (1)       RefusGarantie (1)
Service (10)             ServiceRefusTF (10)      StockAD (1)
StockSWAP (1)            Technicien (10)
```

## Confirmed against the live server (2026-07-30)

- **`LIMIT n` works, `SELECT TOP n` does not** ("Failed to parse statement").
  Always use `LIMIT`.
- Both `[Bracket Name]` and `"Double Quote"` work for spaced/accented
  column names (e.g. `[verif GRE]`). Either is fine; pick one and be
  consistent — the Rust code uses double quotes.
- Result column names always come back **upper-cased** regardless of the
  case used in the query or the driver's own column listing (e.g.
  `NoInt_interv` → `NOINT_INTERV`, `"verif GRE"` → `VERIF GRE`). Row-mapping
  code must match on the upper-cased name.
- **`?` parameter placeholders do not work** — a query with one silently
  fails to execute (empty error). This means every query has to be built
  by string interpolation, not driver-side binding. That makes safe
  escaping of user search input mandatory: single quotes must be doubled
  (`'` → `''`) before being interpolated into any `LIKE '%...%'` clause.
  Confirmed empirically — a hand-crafted injection payload
  (`a' OR '1'='1`) was neutralized by doubling the quote and executed as
  an inert literal search string, not as SQL. **Every read-side query in
  `reman.rs` must run user input through this escape before interpolating
  it**; do not add a query that skips it.
- The 4-table `Intervention → LigCde → Commande → Client` join was tested
  live and returns correct-looking data (real client names against real
  intervention rows) — the join chain documented above is confirmed
  correct, not just inferred from column names.

## Confirmed against the live Rust (odbc-api) integration

- **Never `SELECT` a Boolean-typed 4D column** (any `(1)`-typed column in
  the tables above, e.g. `Stock.Neuf`, `Client.Blocage`). The 4D ODBC
  driver reports type metadata for Boolean columns that overflows the
  `i16` `odbc-api`'s `TextRowSet::for_cursor` expects, and it hard-panics
  (`Failed to retrieve data type from ODBC driver ... SQLLEN could not be
  converted to a 16 Bit integer`) rather than returning an error. Reproduced
  live: a query selecting only `Stock.Neuf` panics; the same query with
  every other column intact but `Neuf` removed succeeds. The panic is
  contained by `spawn_blocking` (surfaces as a normal command error, not an
  app crash) but the query still never returns data — there is no
  workaround currently in place, the column is simply left out. This is
  why `reman.rs`'s `StockUnit` doesn't carry a "new/used" field even though
  `Stock.Neuf` exists.
  - **Exception, confirmed live**: filtering on a Boolean column in `WHERE`
    *without selecting it* does not crash — `odbc-api` only introspects
    columns that appear in the result set. `WHERE l."Soldée" = True` works
    fine as a join filter as long as `Soldée` isn't in the `SELECT` list.
    Comparison must use the `True`/`False` keywords, not `1`/`0` — `= 1`
    fails to parse. This is how `reman_search_interventions`'s
    open/closed queue filter is implemented. **This doesn't crash, but it
    isn't safe to combine with other conditions** — see "Intervention
    queue — corrected field mapping" below for a *different*, more subtle
    bug: `l."Soldée" = X` combined with almost any second WHERE condition
    silently returns 0 rows, no error, no crash. The two bugs are
    independent; this one is about the odbc-api Rust crate not crashing,
    that one is about the 4D SQL engine itself returning wrong results.
- The full read path — search + detail for all three entities, including
  the 4-table `Intervention → Client` join — was run end-to-end from Rust
  against the live server and returned correct data (verified 2026-07-30).

## Intervention status / workflow queues

The old 4D client's menu (`Saisie Interventions`, `Suivi service
commercial`, `Suivi des attentes de pieces`, `Suivi attentes
renseignements`, `Interventions en attente de nettoyage`, `Interventions
Soldées`, `Etapes de réparation en cours`, `Demandes d'achat`) maps onto
`Intervention.TypeCode` plus the `Soldée` flag on the joined `LigCde`
record. Confirmed live by cross-referencing distinct `TypeCode`/
`TypeLibelle` pairs and the `Soldée=True`/`False` result sets:

| Menu item | Filter |
|---|---|
| Saisie Interventions (default) | `LigCde.Soldée = False` (open/active), no `TypeCode` filter — this is the workshop's incoming worklist |
| Interventions Soldées | `LigCde.Soldée = True` (closed/settled) |
| Suivi service commercial | `Intervention.TypeCode = 'TES'` ("Transfert Service commercial") |
| Suivi des attentes de pieces | `TypeCode = 'AP'` ("Attente de Pièces") |
| Suivi attentes renseignements | `TypeCode = 'ARC'` ("Attente Rens. Clt") |
| Interventions en attente de nettoyage | `TypeCode = 'ATN'` ("Attente Nettoyage") |
| Etapes de réparation en cours | `TypeCode = 'ER'` ("Etape de réparation") |

`Intervention.TypeCode` has 29 distinct live values total (not just the 7
above) — the rest (`ARD`, `VAL`, `DA`, `ES`, `RAS`, `NDL`, `ST`, `R`, `PA`,
`RST`, `VST`, `T114`, `REE`, `TRAIT`, `RSTNF`, `RRC`, `RSTND`, `V`, `ND`,
`TREP`, `NET`) don't have a corresponding menu item in the screenshot this
mapping was built from and aren't filtered into a dedicated queue.

The TypeCode-filtered queues are *not* additionally filtered by `Soldée`
— closed interventions weren't observed carrying a "waiting" TypeCode in
the live sample, so the two filters are treated as independent rather than
compounded. Revisit if a closed job is ever seen with a TypeCode that also
maps to an open queue.

## Intervention queue — corrected field mapping (2026-07-30)

The first pass of the Intervention queue displayed `Intervention.NomMachine`
and `Intervention.Possesseur` as "the machine"/"the owner". **This was
wrong.** A technician's real 4D worklist screenshot was cross-referenced
against a live record and neither field held what was assumed:

```
Real screenshot row: interv=17441201, client="Garage Cotleur - Charnoz sur
Ain", véhicule="AUDI A6 V AVANT (F2) PHASE 1", plaque="FF593XY", technicien="Jack Wall"

The matching Intervention row (NoInt_interv=100687):
  NomMachine  = "WSFRA08"   (a workstation hostname)
  Possesseur  = "bba-t"     (not a name — a workstation user account)
```

Both fields are 4D's own "which workstation/session touched this record"
metadata, not business data. **Never surface `Intervention.NomMachine` or
`Intervention.Possesseur` in the UI.**

The screen is actually built from `LigCde` — the real job ticket — not
`Intervention`, which is a per-visit log entry against a `LigCde` job
(a `LigCde` can have zero, one, or several `Intervention` rows over its
life). Confirmed field-by-field against the same real record
(`LigCde.NoInt_Ligcde = 39199`):

| Screenshot column | Real field | Notes |
|---|---|---|
| `interv` | `LigCde.NoIntervention` | text, e.g. `"17441201"` — **not** `Intervention.NoInt_interv` (that's a much smaller internal counter, currently ~100k, unrelated to this displayed number) |
| `nom client` | `LigCde.NomClient` | present directly on LigCde, no join needed |
| `code article` | `LigCde.CodeArt` | |
| `libellé article` | `LigCde.LibelleArt` | |
| `plaque imm.` + `véhicule` | `Commande.Immat_TypeVéhicule` | **one text field**, e.g. `"FF593XY AUDI A6 V AVANT (F2) PHASE 1"` — split on the first space (plate has no spaces in every sample seen); reached via `LigCde.NoInt_cde = Commande.NoInt_Cde` |
| `lim. livraison` | `LigCde.DateLimiteLivraison` | confirmed exact match against the screenshot |
| `D dern. int.` | `LigCde.DateDernInterv` | |
| status column (e.g. "Etape de réparation") | `Intervention.TypeLibelle` | via `LigCde.NoInt_Ligcde = Intervention.NoIntLigcde`, most recent row (`ORDER BY NoInt_interv DESC LIMIT 1`) |
| `S` column (101/102/103) | **unresolved** | not `Salarie.Service`, not `NoIntEtapeEnCours` — see below |
| `Technicien` column | **unresolved** | see below |

### Still unresolved: Technicien / "S" columns

Traced as far as: the real record's `Intervention.NoIntTechn` (65) equals
`LigCde.TechDernInterv` (also 65) — consistent with each other — but no
`Salarie.NoInt_salarie = 65` exists. A name search for the actual
technician shown (`Salarie.Prenom LIKE '%Gabhy%'`) found exactly one
record (`NoInt_salarie = 5`), so there isn't a second/duplicate roster at
higher IDs either — `NoIntTechn` doesn't cleanly resolve to `Salarie` for
at least this record. `EtapeEncours` (which has literal `NomTech`/`Service`
text columns, no join needed) is live-confirmed **empty** (0 rows,
unfiltered), so it isn't the source either. **Do not guess this mapping
further without new evidence** — the Intervention queue currently omits
the Technicien and "S" columns rather than show unverified data.

### Fix: free-text search never matched the reference number (2026-07-31)

The search box's own placeholder text promised "client, article, or
reference," but the `WHERE` clause's `LIKE` conditions only ever covered
`NomClient`/`CodeArt`/`LibelleArt` — `NoIntervention` (the reference shown
to the user everywhere, e.g. `17456001`) was missing entirely. Reported
directly: searching for a reference just seen in a queue's own list
returned nothing. Fixed by adding `l.NoIntervention LIKE '%...%'` to the
same OR group; verified live against three real references pulled from a
closed-jobs screenshot.

### Query shape now used (`reman_search_interventions` / `reman_get_intervention`)

```sql
SELECT l.NoInt_Ligcde, l.NoIntervention, l.NomClient, l.CodeArt, l.LibelleArt,
       l.DateLimiteLivraison, l.DateDernInterv, i.TypeLibelle, c."Immat_TypeVéhicule", i.TypeCode
FROM LigCde l
LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
WHERE l."Soldée" = False  -- or the TypeCode filter for the other queues
ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
LIMIT 5000
```

`LEFT JOIN` (confirmed supported by this SQL dialect) so a `LigCde` job
with no `Intervention` row yet (freshly opened, untouched) or no linked
`Commande` still appears rather than silently vanishing — an inner join
here was the original bug: it returned **0 rows** for the exact filter
that returns real data with `LEFT JOIN`. Results are de-duplicated by
`NoInt_Ligcde` in Rust (keeping the first — i.e. most recent — occurrence)
since one job can join to several `Intervention` rows.

Everything past this SELECT — the Open queue's "already has its own page"
exclusion, and sorting by delivery deadline — happens in Rust, not SQL.
Both moves were forced by dialect bugs discovered live while building the
"Suivi d'interventions" (formerly "Saisie Interventions") default queue,
none of which surface as query errors — they just silently return wrong
row counts:

- **A WHERE condition on the driving table's Boolean column, combined
  with *any* second condition, can silently zero out matching rows** —
  reproduced with two unrelated combinations: `l."Soldée" = False AND
  i.TypeCode IS NULL` (condition on a LEFT-JOINed table) and
  `l."Soldée" = False AND l.DateLimiteLivraison IS NOT NULL` (second
  condition on the *same* table, no join involved at all). Each half
  works fine alone; combined, 0 rows. Not just an `IN`/`NOT IN` quirk —
  plain `IS NULL`/`IS NOT NULL` too. Given how many forms of this broke,
  don't trust *any* WHERE clause combining a Boolean column with another
  condition — verify empirically before adding one, or better, avoid it
  and filter in Rust instead.
- **`ORDER BY i.NoInt_interv DESC` (the joined table's id) silently drops
  every row with no matching `Intervention`** from a `LIMIT`-bounded
  result — the untouched jobs sort past the window before the app ever
  sees them, even though the LEFT JOIN itself returns them correctly with
  no `ORDER BY`, or with `ORDER BY` on the driving table's own id. Always
  order by a column on the table you're actually paginating, not a
  LEFT-JOINed one, when NULLs on the join are expected and matter.
- **`ORDER BY DateLimiteLivraison ASC` sorts NULLs first**, not last —
  confirmed live (this table has a heavy tail of brand-new, undated jobs
  that flooded the top of every "soonest deadline" query). No `CASE
  WHEN`/`NULLS LAST` support found (a `CASE WHEN ... THEN ... END` in
  `ORDER BY` failed to parse). Fetch unsorted-by-date, then sort in Rust:
  dated rows ascending by a reformatted `YYYY-MM-DD` key (`delivery_sort_key`
  in `reman.rs` — the raw `DD/MM/YYYY` string sorts wrong lexicographically
  across month/year boundaries), undated rows after, in whatever order
  they arrived (`Vec::sort_by` is stable, so this falls out for free).
- This shop has **thousands** of `LigCde` rows with `Soldée = False`
  (a 5000-row unfiltered fetch spanned `NoInt_Ligcde` 26693–39552, i.e.
  most of the recent id range) — don't assume "open" is a small set.

### Open queue exclusion rule (confirmed by the person who built this workflow, 2026-07-30)

An earlier version of this filter excluded `ER` ("Etape de réparation")
from the Open queue on the assumption that every categorized `TypeCode`
meant "has its own page, hide it here." That was wrong. Per direct
confirmation:

- **Stays in Open** (still active, technician's own work): `ER` (Etape de
  réparation), `PA` (Pièces arrivées — parts arrived, back in the
  technician's hands), and untouched jobs (no `Intervention` row / no
  `TypeCode` yet).
- **Excluded from Open** (handed off elsewhere, has its own queue/isn't
  the technician's to act on right now): `TES` (Commercial), `AP`
  (AwaitingParts — still waiting, as opposed to `PA` which is the same
  thing but arrived), `ARC` (AwaitingInfo), `ATN` (AwaitingCleaning),
  `ARD` (awaiting the client's quote response), `ST` (sent to a
  subcontractor). See `CATEGORIZED_TYPE_CODES` in `reman.rs`.
- **A job with a delivery deadline more than a month in the past is
  excluded** — stale/stuck, needs different handling than the daily
  follow-up list. A job with *no* deadline set yet is not stale (it just
  hasn't been scheduled) but is also excluded from Open for now — a job
  needs a `DateLimiteLivraison` to appear. This last part is an inference
  from testing, not something explicitly confirmed — worth revisiting if
  it turns out untouched/unscheduled intake should be visible somewhere.

Verified against a real screenshot of 16 specific jobs the workflow owner
identified as "the only jobs that should be on the list": the corrected
rule reproduces 15 of the 16 exactly. The one miss (`17431601`, `TypeCode
= ST`) contradicts the "ST is excluded" rule taken literally, but given
this is a live, multi-technician system and the screenshot was a snapshot
from an earlier moment, the discrepancy is more likely explained by the
data having moved since the screenshot was taken than by the rule being
wrong — not chased further.

### Commercial queue — the real mechanism (2026-07-30, superseding two earlier wrong guesses)

`Suivi service commercial` went through three versions before landing on
the right one. Both intermediate versions were plausible, live-tested, and
still wrong — worth keeping the trail since the wrong turns are as
instructive as the right answer.

**v1 — `TypeCode = 'TES'` only.** The original guess, from the TypeCode's
literal name ("Transfert Service commercial"). Wrong: too narrow, and
wrong mechanism entirely (see v3).

**v2 — `TypeCode IN ('TES', 'ARD')`.** The workflow owner captured live
traffic (`capture service commercial.pcapng`, port **19823** — 4D's native
client-server protocol, a different port from the SQL engine on 19822,
proprietary binary format, not SQL) while viewing the real screen.
Decoding UTF-16LE strings out of the raw TCP payload (the protocol is
otherwise opaque, but embeds plain-text field values) surfaced one real
record — intervention `17294801`, `GARAGE SCHIFANO`, status `Attente
Réponse Devis` (`TypeCode = 'ARD'`), not `TES`. Adding `ARD` looked like
real progress: it's exactly the kind of thing commercial would track. But
`TypeCode IN ('TES', 'ARD')` matched **1332** total jobs — nowhere close
to the 6 the real screen showed, and no staleness filter existed yet to
explain the gap.

**v3 — `LigCde.Type_Service = '305'` (correct, verified exact).** Chasing
the 1332-vs-6 gap led first to `Tech_Service` (a table mapping
`NoInt_param` — which matches `Intervention.NoIntTechn`, *not*
`Salarie` — to service codes including `305`). That looked promising (an
operator/technician "which desk" tag) but the numbers still didn't
converge: filtering by "the job's latest technician is 305-tagged" gave
44 jobs, not 6, even after excluding `ST`. Directly asked whether the real
6 was one person's queue or the whole team's — confirmed **team-wide**,
and confirmed the complete list of real service codes: `100, 101, 102,
103, 104, 114, 305`. That exact list is `LigCde.Type_Service`'s distinct
values (a field already in the schema dump, dismissed earlier without
checking its actual values) — **not** `Tech_Service` or
`LigCde.ServiceTechnique` (checked too, tops out at `114`, no `305`).
`Type_Service` classifies which desk owns the *line*, independent of the
technician who last touched it; `Tech_Service` was a red herring that
happened to share the same code, one of several unrelated places `305`
legitimately appears.

`LigCde.Type_Service = '305' AND Soldée = False` alone matches 429 open
lines — but 423 of them have no `DateLimiteLivraison` at all (stock/parts
lines, not live quotes). Requiring a date: **exactly 6**, matching the
real screen precisely, verified through the actual Rust code path
(`cargo test`, not just a scratch script). One of the 6 —
`17294801`/GARAGE SCHIFANO, the same job from the v2 capture — is over
two months past its deadline and *still shown*: confirms Commercial gets
no staleness cutoff (chasing an old unanswered quote is the commercial
desk's actual job), unlike the technician's daily Open worklist which
does exclude month-plus-stale jobs.

**Dialect note confirmed along the way**: `l."Soldée" = False AND
l.Type_Service = '305'` (two equality conditions) works fine combined —
the Boolean-combined-with-anything bug documented earlier is specifically
about `IS NULL`/`IS NOT NULL`, not equality. Also: **table alias `ts` fails
to parse** (`Tech_Service ts` → "Failed to parse statement"; renaming the
alias to anything else fixes it) — another silent-until-you-hit-it dialect
quirk, presumably a reserved word collision.

### Staleness filter — every queue except Closed and Commercial

An earlier pass extended the ">1 month past deadline" exclusion to every
queue except Closed, reasoning it was the same principle validated for
Open. That was reasonable *given the v2 Commercial filter* (1332 jobs,
genuinely needed pruning) but wrong once Commercial got the correct v3
filter: its true count is already 6 without any staleness cutoff, and one
of those 6 is deliberately more than two months stale. Reverted to
Open-only, then **Subcontractor added back in** once it existed (see next
section) — its unfiltered list was dominated by jobs from 2024, the same
shape of problem Commercial had before its filter was corrected, and
unlike Commercial there's no confirmed exact count to say otherwise.

**Then extended to AwaitingParts/AwaitingInfo/AwaitingCleaning/
RepairInProgress too (2026-07-30)**, once it became clear they had the
exact same problem, just unreported until checked directly. These four
were originally filtered by `TypeCode` alone (e.g. `TypeCode = 'AP'`),
with no `Soldée`/`Type_Service`/date/staleness scoping at all — they're
sub-statuses of the bench worklist (step 2 in the workflow below), not
independent desks, so they needed the same `Soldée = False AND
Type_Service IN ('100','101','102','103')` scoping Open has. Confirmed
live: unscoped `TypeCode = 'AP'` returns 4566 rows, of which 4549 are
already `Soldée = True` (closed) and 4463 are more than a month past
their deadline — almost the entire result set was closed/stale history,
exactly as reported ("just showing all history... as well as old stuff").

**Second bug found in the same pass, same day**: adding the Soldée/
Type_Service scoping still left the query filtering `i.TypeCode IN
('AP')` directly in SQL — but `Intervention` is a *history* table, one
row per status change, and that WHERE matches any row a job ever had,
not its current one. A job that went `AP` → `PA` (parts arrived) →
`ER` (repair in progress) still satisfies `TypeCode = 'AP'` because that
row still exists, so it kept showing up under "Attente de pièces" long
after moving on. Reported directly: the real screen showed 5 jobs, ours
showed 8 — confirmed live that 3 of those 8 had already progressed past
`AP` (two to `PA`, one all the way to `ER`). Fixed by dropping the
`TypeCode` condition from SQL entirely for these four queues (SQL now
only scopes `Soldée`/`Type_Service`, same as Open) and instead checking
the TypeCode of each job's single most-recent `Intervention` row in
Rust — the same latest-row dedup Open already relies on for its exclusion
list, just used for an inclusion match instead. Verified live:
`awaiting_parts` now returns exactly 5, matching the real screen.
Verified via temporary `cargo test`s against the live server, then
removed both times.

**Third bug, same day**: `AwaitingInfo` ("Attente renseignements") also
needs the staleness cutoff *removed*, same exception as Commercial.
Reported directly: job `17085301` (internal id `35771`) was missing.
Confirmed live: its `DateLimiteLivraison` is `02/03/2026` — five months
past — but the job has been actively cycling through statuses since (`ER`
→ `ARC` → `RRC` → `ER` → ... → `ARC` again, last touched `22/06/2026`,
the date actually visible on the real screen). This desk exists
specifically to wait on the *client* to answer, same as Commercial
waiting on a quote response — the original delivery estimate going stale
doesn't mean the job did, and pruning by it hides exactly the jobs this
desk needs to chase. Not extended to AwaitingParts (confirmed exact with
the cutoff in place, see above), AwaitingCleaning, or RepairInProgress —
no evidence either way for those yet.

## The full workshop flow (confirmed by the workflow owner, 2026-07-30)

A unit comes in and gets registered: assigned a `Famille`/`Segmentation`
(what kind of part it is) and a **`Type_Service`** (which bench owns it).
From then on:

1. **The technician bench queue** — `Type_Service IN ('100','101','102','103')`
   — shows every open, dated line currently sitting at one of the four
   in-house repair benches. This is `InterventionQueue::Open` /
   "Suivi d'interventions", confirmed by matching 15 of the 16-job
   real-worklist target from earlier (the 16th, `17471501`, is
   `Type_Service = '114'` — sent to a subcontractor, a different desk).
2. **Working the job** — the technician changes the line's status via a
   dropdown (the exact one in the screenshot this section is named after):
   `Etape de réparation` / `Transfert Service commercial` / `En attente de
   validation` / `Attente de Pièces` / `Pièces arrivées` / `Attente Rens.
   Clt` / `Réponse Rens. Clt` / `Attente Nettoyage` / `Pièce Nettoyée` /
   `Réparation` / `Vente` / `Echange Standard`. These are `TypeCode`/
   `TypeLibelle` values (cross-references cleanly against the 29 distinct
   codes found earlier: ER, TES, VAL, AP, PA, ARC, RRC, ATN, NET, R, V, ES).
   Per the workflow owner, **picking some of these also changes
   `Type_Service`** — e.g. picking "Transfert Service commercial" is
   presumably what moves a line's `Type_Service` to `305`. Not verified
   directly (would need write access or a capture of that exact
   transition), but it's consistent with everything observed: a job's
   `Type_Service` reflects *current* desk ownership, and it changes as the
   job moves between desks.
3. **Cleaning sub-flow**: `Attente Nettoyage` (ATN, awaiting cleaning) →
   cleaner does the work → sets it to `Pièce Nettoyée` (NET). Both are
   `TypeCode` values within the same bench (no dedicated cleaning
   `Type_Service` — cleaning happens without leaving the bench that owns
   the line).
4. **Commercial desk** — `Type_Service = '305'`. Confirmed exact (6 jobs,
   see above). Handles quotes/administrative work regardless of what kind
   of part is involved (its lines show no dominant article type, unlike
   the technical benches — see the code-meaning table below).
5. **Subcontractor** — `Type_Service = '114'`. New queue, added per the
   workflow owner's direct instruction ("the 114 are the [ones] we send
   sous-traitance, add a page for that as well"). Filtered the same way as
   Commercial (needs a date) plus the Open-style staleness cutoff (see
   above — unlike Commercial, no confirmed reason yet to skip it, and the
   raw data strongly suggested it was needed).

### What each `Type_Service` code actually means

No lookup/label table exists for these codes anywhere in the schema —
this is inferred from what kind of `LibelleArt` dominates each code
across a 300-row sample per code, i.e. real statistical signal, not a
guess from 5 rows or from the code's number alone:

| Code | What it handles | Evidence (dominant `LibelleArt` in a 300-row sample) |
|---|---|---|
| 100 | ABS calculateurs (overflow/secondary bench) | 58% "Calculateur ABS" in a small (33-row) pool |
| 101 | ABS + power steering (main bench) | 41% "Calculateur ABS" + "Hydrolic ABS" + "Direction Assistée" |
| 102 | Dashboards & multimedia | "Compteur" (Ford/Renault/PSA/VW/Audi) + "Multimedia PSA" dominate |
| 103 | Body electronics & airbag | "Module Electronique" + "BSI PSA" + "Calculateur Airbag" + "UCH Renault" + "COMODO PSA" |
| 104 | Engine ECUs (in-house, secondary) | 67% "Calculateur Moteur" in a small (24-row) pool |
| 114 | **Sent to a subcontractor** | 86% "Calculateur Moteur" in a 300-row sample — reads like "engine-ECU bench" by article type alone, but the workflow owner corrected this: it's not a bench at all, it's the subcontractor hand-off queue (engine ECUs apparently being the article type most commonly outsourced) |
| 305 | Commercial desk | No dominant article type — 40% still `CODE GENERIQUE` (not yet identified), the rest a mix (AdBlue reservoirs, ABS units, ...). The absence of a pattern *is* the pattern: this is an administrative queue, not a repair specialty |

100–104 read as **physical repair benches grouped by specialty** (with
two benches each for the two highest-volume categories, ABS and engine
ECUs). 114 and 305 are not benches at all — they're where a line goes
when it leaves the technical floor, for a subcontractor or for
commercial/admin handling respectively.

## Demandes d'achat (purchase requests)

Lives in `DemandeHA`, not in `Intervention`. `Interv_DemandeHA` links a
request back to a job, but its `NoIntervention` field is **not**
`Intervention.NoInt_interv` — it's a differently-scoped text identifier
(observed values like `"17477701"`, 8 digits, vs. `Intervention.NoInt_interv`
values in the hundreds/low hundred-thousands). The actual join target is
unresolved; treat `DemandeHA` as a standalone list for now, not
cross-linked to the Interventions queues.

### DemandeHA (29 cols)
```
Boitier (10)              CodeArticle (10)          CodeFrRetenu (10)
Constructeur (10)         DateDemande (8)           DateModif (8)
DateReception (8)         Descriptif (10)           Echantillon (1)
Etape (10)                HeureDemande (9)          HeureModif (8)
LibArt (10)                LibArtCplt (10)           MaterielConcerné (10)
NoAppelOffre (4)          NoBR (4)                   NoCdeFr (4)
NoDemande (4)              NoInt_DemandeHA (4)  -- PK NoIntCdeFr (4)
NomTech (10)               NoRegpt (4)               ODBC_PlusModif (1)
Qté (6)                    QtéAppelOffre (6)         QteReçue (6)
Ref_constructeur (10)      Service (10)               ZoneCommentaire_HA (10)
ZoneCommentaire_tech (10)
```

`Etape` (text, safe to select — not Boolean) has exactly 6 distinct live
values: `en demande`, `en commande`, `localisée`, `receptionnée`,
`clôturée`, `Abandonnée`. The first three read as open/pending, the last
three as terminal. `reman_search_achat`'s default (empty query) list
filters to the first three, newest first.

### Interv_DemandeHA (5 cols)
```
NoInt_DemandeHA (4)         NoInt_IntervDemandeHA (4)  -- PK
NoIntervention (10)         NoIntLigCdeFr (4)
PièceReçue (1)
```

## Analytics dashboard (`reman_analytics`, 2026-07-31)

Read-only aggregate dashboard — intake volume, repairability, family
breakdown, technician activity — driven by `LigCde`/`Commande`/
`Intervention`, not by any of 4D's own built-in reporting tables (all
found dead, see below). Two independent live sources feed it:

**Intake + outcomes** — by `Commande.DateCommande` (join via
`LigCde.NoInt_cde = Commande.NoInt_Cde`). There is no creation-date field
directly on `LigCde` — confirmed live by probing ~15 candidate column
names (`DateCreation`, `DateEntree`, `DateSaisie`, `DateAppel`,
`DateReception`, `DateArrivee`, `H_Creation`, ...), all nonexistent.
`Commande.DateCommande` is the closest available proxy for "when this
unit came in" and tracks closely with a job's own history in samples
checked (order date a few days to a few months before the job's most
recent visit, consistent with normal turnaround).

### Correction: open/closed must come from `Soldée`, not guessed from TypeCode (2026-07-31)

The first version read each job's outcome purely off its most recent
`Intervention.TypeCode`, treating any code not in a small recognized set
as "still in progress" — deliberately avoiding `LigCde.Soldée` to sidestep
the Boolean-combined-with-a-second-condition dialect bug documented
elsewhere in this file. **This was wrong**, caught immediately by the
person who runs this workflow: reported directly against a real
"Interventions Soldées" (closed) screenshot that the dashboard's ~49%
in-progress figure looked way too high. The screenshot showed `Validation
Sous-Traitance` (`VST`) as a real closed job's terminal status — a code
the first version's heuristic didn't recognize as terminal, so every
subcontractor job closed via that path was silently miscounted as still
open.

Fixed by using `LigCde.Soldée` as the actual ground truth for open vs.
closed, confirmed live that combining it with a `BETWEEN` range on a
LEFT-JOINed table's column (`l."Soldée" = True AND c.DateCommande BETWEEN
'...' AND '...'`) works fine — extending the existing confirmed-safe
pattern (`Soldée` combined with a second *equality* condition) to a range
comparison too, verified with a direct side-by-side count rather than
assumed. Since `run_query` can never `SELECT` a Boolean column (crashes
`odbc-api`, see below), the closed/open split runs as a second query
returning just the closed ids, intersected against the intake set in
Rust — `TypeCode` is now only used to pick *which kind* of closed outcome
a job landed on, never to decide open-vs-closed. Verified live: closed
count via this method (2701 for the Jan-Jul 2026 range) matches an
independently-run `Soldée`-only count exactly. In-progress dropped from
49% to 45% for that range with the fix.

That remaining 45% is not a bug — confirmed by splitting the same range
into weekly buckets and checking the closed rate per bucket: a stable
53-60% closed rate from January through mid-June, then a sharp drop for
the most recent weeks (50% → 36% → 12% for the last week of July) as
units that simply haven't had time to close yet drag the aggregate down.
Textbook right-censoring from a range ending "today," not a data problem
— the UI surfaces this directly (a tooltip on the in-progress KPI) rather
than hiding or silently correcting for it.

**Where the "in progress" jobs actually are** (`open_status_breakdown`,
requested directly — "where are the 1000s of open jobs, what states are
they in").

First version grouped by each open job's latest `Intervention.TypeLibelle`
and found 2155 of 2213 open jobs (97%) had no `Intervention` row at all —
labeled "not started." **Correction, same day**: reported directly
against 5 concrete job references pulled from that "not started" bucket —
the real 4D order screen showed all 5 as `ATTENTE ACCORD` ("awaiting
agreement"), a real, named status the `Intervention.TypeLibelle` approach
couldn't see at all, because these jobs are waiting on the *client* before
any technician work even starts — there's no `Intervention` row to read a
status off because the workflow hasn't reached that point yet.

Found the real field the same way as everything else that's turned out
reliable this session — verified against ground truth, not guessed:
`Commande.StatutDossier`. Discovery method worth keeping: `conn.columns()`
(`SQLColumns` catalog) hangs indefinitely regardless of table size
(confirmed dead against both a 2-column and a 300+-column table, not just
slow) — but `cursor.column_names()` from a live `SELECT * FROM table
LIMIT 1`, called *before* binding any buffers, returns the full column
list without ever hitting the Boolean-column panic (that panic is
specifically inside `TextRowSet::for_cursor`, not in getting the result
set's own column metadata). This is how `LigCde` (324 columns) and
`Commande` (119 columns) got fully enumerated after guessing individual
names had gone as far as it usefully could.

`StatutDossier` has exactly 6 distinct values (recent 3000 orders
sampled): `EXPEDIE` (1531), `ATTENTE ACCORD` (1190), `CLOTURE` (108),
`EN ATELIER` (87), `NULL` (55), `EN CHEMIN` (29). Cross-referenced against
`Soldée` (200-row samples per value): `EXPEDIE` is 100% `Soldée = True`;
`ATTENTE ACCORD`, `CLOTURE`, and `EN CHEMIN` are 100% `Soldée = False`;
`EN ATELIER` is mixed (21/88 closed — presumably `StatutDossier` lagging
briefly behind the actual close). Note `CLOTURE` ("closed", by the word)
is *not* a repaired outcome and is *not* `Soldée = True` — its exact
business meaning wasn't chased further (cancelled order? administratively
closed pending something else?), but it is empirically open, not closed,
so it's included in `outcomes.in_progress` and the `open_status_breakdown`
correctly either way.

Corrected result for the Jan-Jul 2026 range: **1800 of 2213 open jobs
(81%) are `ATTENTE ACCORD`** — waiting on the client, not the shop. Only
67 are `EN ATELIER` (actually being worked), 253 `CLOTURE`, 64 with no
`StatutDossier` at all, 29 `EN CHEMIN`. Values are kept verbatim (French,
as shown on the real screen) rather than translated or re-labeled — same
approach as `Intervention.TypeLibelle` elsewhere in this file. The
`StatutDossier IS NULL` case is returned from the backend as `""`, not a
hardcoded English string, so the frontend can translate the "no status"
fallback label per the active locale.

**Repair rate was always closed-jobs-only, not changed by this pass** —
worth confirming directly since it was raised alongside the above: the
KPI has computed `repaired / (total - inProgress)` since the first
version, i.e. already only among jobs with a final outcome. The dropped
in-progress jobs were never in that denominator; what changed here is
*which* jobs get sorted into "in progress" vs. a real closed outcome
(the `Soldée` ground-truth fix above), not the repair-rate formula
itself.

### `ATTENTE ACCORD` excluded entirely; "repair rate" renamed "transformation rate" (2026-07-31)

Two more corrections requested directly, same day, after seeing the
`ATTENTE ACCORD` finding above in the running dashboard:

1. **`ATTENTE ACCORD` jobs are now excluded from the analytics dataset
   entirely** — not just relabeled in the open-status breakdown. Reason
   given directly: they dominated every chart (81% of "in progress" for
   the Jan-Jul 2026 range) and some sit there indefinitely if the client
   never follows up, so counting them as "intake" measures how many
   quotes went out, not how many units the shop is actually processing.
   Implemented as a filter in the Rust aggregation loop in
   `reman_analytics` (`if !is_closed && status == "ATTENTE ACCORD" {
   continue; }`), applied *before* `total_intake`/`daily_intake`/
   `outcomes`/`top_families`/`open_status_breakdown` are touched, so the
   exclusion is total, not just cosmetic. Only ever excludes jobs that are
   *currently* sitting in that status (confirmed live: 100% `Soldée =
   False`) — a job that later gets the client's go-ahead moves to a
   different `StatutDossier` and starts counting normally from then on;
   this doesn't retroactively remove anything from a job's history once
   it's moved past that stage. Verified live: `total_intake` for Jan-Jul
   2026 dropped from 4914 to 3114 (the 1800 `ATTENTE ACCORD` jobs), and
   `outcomes.in_progress` dropped from 2213 to 413 — the `open_status_breakdown`
   is now just `CLOTURE` (253), `EN ATELIER` (67), no-status (64), and
   `EN CHEMIN` (29), a much more actionable list. The `decided` (closed)
   count — 2701 — is unaffected either way, since `ATTENTE ACCORD` jobs
   were never `Soldée = True` in the first place.

2. **"Repair rate" renamed "transformation rate"**, and its definition
   changed: requested directly — "it's not the repair rate but
   transformation rate, on the job that come how many (percentage) do we
   repair or exchange or sell right, that's what's important. the mix."
   Two changes to match:
   - `V` ("Vente" — sold as a separate replacement unit) is no longer
     folded into `ES` ("Echange Standard") under one `standard_exchange`
     bucket — it's now its own `Outcome::Sold` / `OutcomeBreakdown.sold`
     field, so "the mix" (the outcome donut and the per-family stacked
     bars) shows repaired/exchanged/sold as three distinct slices, not
     two. Verified live the split sums correctly: `standard_exchange`
     (324) + `sold` (23) = 347, matching the old combined count exactly.
   - The KPI numerator changed from `repaired` alone to `repaired +
     standard_exchange + sold` — any outcome where the client's unit was
     actually turned around, as opposed to `non_repairable`/`no_fault_found`
     (nothing was done) or `sent_to_subcontractor`/`other`. Denominator
     unchanged (`decided` = total closed jobs). Verified live for the
     Jan-Jul 2026 range: transformation rate = 58.3% (1576 of 2701 closed
     jobs), up from the old repair-only rate of 45.5% — the gap is exactly
     the exchanged (324) and sold (23) jobs that a pure "repaired" count
     didn't credit.

### `CLOTURE` excluded too, same as `ATTENTE ACCORD` (2026-07-31)

Reported directly against the running dashboard: `CLOTURE` (253 jobs for
the Jan-Jul range) showing up in "Where the open jobs are" is wrong —
"clôturé" means closed, it shouldn't read as an open job regardless of
what `Soldée` says. Requested a real job reference to check firsthand
before accepting the fix; provided 10 (`17464001`, `17389101`,
`17382401`, `17378801`, `17375301`, `17369601`, `17356201`, `17355301`,
`17352602`, `17352601`) pulled live from `Commande.StatutDossier =
'CLOTURE'`. All 10 confirmed `Soldée = False` (consistent with the
earlier 200-sample correlation) — but also, checked while pulling these,
**every one of the 10 had neither `LigCde.DateDernInterv` nor
`DateLimiteLivraison` set at all**. No technical activity ever happened
on any of them. Reads as administratively-voided/cancelled orders (a
duplicate line, a client backing out before the unit even arrived, a
data-entry correction) rather than jobs that were worked and closed some
other way — consistent with the word itself, just not reflected in
`Soldée`.

Excluded with the exact same mechanism as `ATTENTE ACCORD` — added to the
same `if !is_closed && (status == "ATTENTE ACCORD" || status ==
"CLOTURE") { continue; }` check in `reman_analytics`, so it's a full
exclusion (intake, outcomes, family breakdown, open-status breakdown),
not just hidden from one chart. Verified live: `in_progress` for the
Jan-Jul range dropped from 413 to **161** (`EN ATELIER` 66 + no-status 64
+ `EN CHEMIN` 31 — sums exactly), and `total_intake` dropped accordingly.
`decided`/`transformation_rate` unaffected, same reasoning as the
`ATTENTE ACCORD` fix: `CLOTURE` was never `Soldée = True`.

**Full live TypeCode/TypeLibelle distribution** (recent 5000 `Intervention`
rows, most-recent-first — this is what `Categ_ND`-adjacent business logic
turned out to actually be, not the placeholder/empty `Categ_ND` and
`TypeND_CatND` tables which exist but are essentially unused, 2-3 rows
total):

The "outcome bucket" column below only applies once a job is confirmed
`Soldée = True` — `classify_outcome()` checks that first and returns
`InProgress` unconditionally for anything still open, regardless of what
its latest `TypeCode` happens to be. A code like `ER` sitting on an *open*
job means nothing about outcome; the same code could never appear as an
open job's status the day after a hypothetical instantaneous close, so
"in progress" below just means "not a recognized terminal code" — which
only matters for the small number of `Soldée = True` jobs whose latest
code isn't one of the ones below (the `Other` bucket, confirmed live at
~9 jobs out of 2701 closed for the Jan-Jul 2026 range — negligible).

| Code | Count | Libellé | Outcome bucket (if closed) |
|---|---|---|---|
| ER | 1035 | Etape de réparation | in progress (mid-workflow) |
| R | 637 | Réparation | **repaired** |
| TES | 602 | Transfert Service commercial | in progress (mid-workflow) |
| RAS | 308 | NFF | **NFF** |
| ATN | 259 | Attente Nettoyage | in progress (mid-workflow) |
| NET | 252 | Pièce Nettoyée | in progress (mid-workflow) |
| PA | 227 | Pièces arrivées | in progress (mid-workflow) |
| AP | 211 | Attente de Pièces | in progress (mid-workflow) |
| ST | 203 | Envoi sous-traitance | in progress (mid-workflow) |
| ES | 185 | Echange Standard | **standard exchange** |
| ARD | 141 | Attente Réponse Devis | in progress (mid-workflow) |
| VAL | 140 | En attente de validation | in progress (mid-workflow) |
| DA | 137 | Devis - Réponse Client | in progress (mid-workflow) |
| NDL | 107 | ND(final) | **non-repairable** |
| VST | 101 | Validation Sous-Traitance | **sent to subcontractor** — confirmed terminal via the real "Interventions Soldées" screenshot; the bug this section documents |
| RST | 93 | Retour sous-traitance | **sent to subcontractor** (folded in with VST — both are the generic subcontractor-closure codes, as opposed to `RSTND`/`RSTNF` which specify the outcome) |
| RSTNF | 88 | Retour Ss-traitance (NFF) | **NFF** |
| ARC | 53 | Attente Rens. Clt | in progress (mid-workflow) |
| RAS | 45 | R.A.S. = SWAP | **NFF** (same code as above, different libellé) |
| T114 | 39 | Transfert service sous-traitance | in progress (mid-workflow — a handoff action, not itself seen as a closed job's terminal code) |
| REE | 30 | Retour en l'état | **NFF** (folded in — per the workflow owner, unsure what this specifically means beyond "probably NFF"; small count either way) |
| TREP | 25 | Transfert Service Technique | in progress (mid-workflow) |
| R | 20 | Réparation = SWAP | **repaired** |
| RRC | 19 | Réponse Rens. Clt | in progress (mid-workflow) |
| RSTND | 19 | Retour ss-traitance (ND) | **non-repairable** |
| V | 19 | Vente | **standard exchange** |
| ND | 5 | Non Dépannable = Défect | **non-repairable** |

`classify_outcome()` in `reman.rs` encodes this mapping. Confirms the
user's own description of the flow directly: `ND`/`NDL` is exactly "non
dépannable", `RAS` is exactly NFF, `ES`/`V` are the standard-exchange/sale
path for units sent to the commercial desk instead of repaired.

**Technician activity** — by `Intervention.NoIntTechn` +
`Intervention."Date"` (bare `Date` fails to parse — same reserved-word
quirk as `ts`; quoting fixes it, confirmed live). `Intervention` is a
per-visit log, so this is a materially better activity signal than
`LigCde.TechDernInterv`, which only ever holds the *last* technician and
loses every earlier hand-off.

**4D's own reporting tables are dead.** Found via `conn.tables()` catalog
listing (266 tables total) and checked with `SELECT *`:
- `A_StockAtester` (testing/triage table with exactly the fields this
  dashboard would want — `DateEntree`, `Defect`, `MotifRefus`, `Famille`,
  `Service`, `Technicien`) — **confirmed empty**, 0 rows.
- `EtapeEncours` — confirmed empty (already known from an earlier
  investigation, see "Still unresolved: Technicien / S columns" above).
- `StatMensuelTech`/`StatMensuelServ`/`StatMensuelle`/`stat_men_tech` —
  pre-aggregated monthly stats tables (per-technician: `ND`, `RAS`, `ES`,
  `NBP`, `CA`; per-service: same shape) that would have been perfect —
  **confirmed stale**: `MAX(Periode)` across `StatMensuelTech` is
  `202202` (February 2022), over 4 years out of date. Whatever nightly
  job used to populate these stopped years ago. Do not build anything on
  these tables without re-checking recency first.
- `conn.columns()` (the `SQLColumns` ODBC catalog metadata call) hung
  indefinitely against this driver — killed after 3 minutes with zero
  output. `conn.tables()` (`SQLTables`) worked fine and fast. Column
  discovery for unfamiliar tables should use `SELECT * ... LIMIT n` (with
  `cursor.column_names()` via `use odbc_api::ResultSetMetadata;` to get
  the names) instead — same Boolean-column panic risk as `run_query`
  applies, just catch it per-table with `spawn_blocking(...).await` (a
  `JoinError::Panic`, not a Rust `Result::Err`, since `TextRowSet::for_cursor`
  panics rather than erroring on the type it can't handle).

### Correction: technician names resolved from `LigCde.NomDernierTech`, not `StatMensuelTech` (2026-07-31)

The first version's only id→name mapping was `StatMensuelTech.NointTech`/
`NomTech` — 9 rows, ids 65-73, only resolving 4 of 13 technician ids seen
on recently-touched jobs (the rest fell back to "Tech #<id>").

Requested directly: "find a way to get technician names directly."
Prompted by a real screenshot of 4D's own technician-login dropdown
(`"Veuillez vous identifier"`) showing a live roster of ~10 current
technicians, several with names that don't appear anywhere in
`StatMensuelTech` at all (`Archimed Said`, `Comenda David`, `Cortes
david`, `Ducerf Jerome`, `Gabhy Kiba`, `Malatray Lilian`) — confirming a
better source has to exist somewhere. Found it: `LigCde.NomDernierTech`,
a **text** column (not an id) holding the technician's name directly.
Confirmed live against 5 real jobs from an earlier "Interventions
Soldées" screenshot — exact match on every one (`"Phil Wood"`, `"Gabhy
Kiba"` ×2, `"Hugues Cerveau"`, `"Abdel Guitni"`) against the screen's own
"technicien (serv tech)" column. This is very likely what the real screen
itself reads from — no id resolution at all on the 4D side either.

`LigCde.TechDernInterv` (the id used everywhere else — the same id space
as `Intervention.NoIntTechn`, confirmed earlier) sits on the same row, so
a live id→name map is built from `SELECT TechDernInterv, NomDernierTech
FROM LigCde WHERE NomDernierTech IS NOT NULL ORDER BY NoInt_Ligcde DESC
LIMIT 5000`, keeping the *first* (i.e. most recent) name seen per id.
Most-recent-wins matters: checked live, id `72` has both `"Larissa
Hostina"` (the `StatMensuelTech`-era name) and `"Maida Thomas"` in its
history within the sampled window — presumably a reassigned id after the
first person left — and recency correctly resolves to whichever is
actually current now.

Checked against the same 11 previously-unresolved ids from the earlier
technician leaderboard: **9 of 11 now resolve** (up from 4 of 13 with the
old source), including the two biggest previously-unnamed contributors
(`3569` → `"Gabhy Kiba"`, 566 units; `2958` → `"Malatray Lilian"`, 774
units). The 2 that still don't resolve (`3389`, 602 units — the
*second*-busiest technician overall, and `3270`, 4 units) aren't missing
data so much as a real gap in what `NomDernierTech` can see: it only
reflects a job's *final* touch, so a technician who's consistently an
*earlier* hand-off on jobs that get finished by someone else never shows
up as anyone's `NomDernierTech`, no matter how many jobs they actually
worked. `reman_analytics` still falls back to "Tech #<id>" for those,
with a caveat line in the UI rather than pretending full coverage exists.

**Date range filtering**: `Commande.DateCommande BETWEEN 'YYYY-MM-DD' AND
'YYYY-MM-DD'` works (ISO format), confirmed live — as does plain `>=`/`<=`
with the same format. `DD/MM/YYYY` literals also work and return
identical results; `MM/DD/YYYY` does not parse. ISO is what
`reman_analytics` uses since it's trivial to produce from an HTML
`<input type="date">`. A 7-month range (2026-01-01 to 2026-07-31) returned
4914 `LigCde` rows — sized `LIMIT 20000` on both aggregate queries with
that as the reference point, generous headroom for a year+ range.

## Today's forecast (`reman_forecast_open_queue`, 2026-07-31)

Requested directly on the "Suivi d'interventions" (Open queue) page:
"how many units are with tech at this time and estimate how much repair
exchange, nd, nff we are going to do... based on family." Not a real
predictive model — a weighted average of each family's historical outcome
mix, applied to whatever's currently on the bench.

**Current bench population**: same `WHERE`/Rust-side filtering as
`InterventionQueue::Open` in `reman_search_interventions` (category
exclusion via `CATEGORIZED_TYPE_CODES`, delivery date required, >1-month
staleness cutoff) plus `Famille`, grouped by family. Confirmed live
2026-07-31: **19 units** across 12 families, most families with only 1-3
units each (MK60 highest at 3) — this bench worklist really is small day
to day, not the thousands-of-rows scale of the underlying `Soldée =
False` population.

**Historical rate per family**: same `Soldée`-ground-truth approach as
`reman_analytics`'s family breakdown, `FORECAST_LOOKBACK_DAYS = 180`
(6 months), restricted to families actually on the bench right now (no
need to compute stats for every family REMAN has ever touched). All 12
families present in the live check had *some* historical data — smallest
samples were `SID 803A` (5 closed jobs) and `Jeep` (6), largest was
`MK100` (347). Families with zero historical closed jobs contribute
`unforecastable` units instead of a wild extrapolation from nothing.

**The math**: `PredictedMix::from_family_rate` — for a family with `n`
units currently on the bench and a historical breakdown of `d` decided
(closed) jobs, each outcome's predicted count is `n * (that outcome's
historical count / d)`. Summing across all families' predicted mixes
gives the total predicted mix for the whole bench. Verified live: for the
19-unit sample, the predicted mix summed to exactly 19.00 (floating point,
by construction — each family's fractions always sum to 1 when `d > 0`).
Sample predicted mix: ~6.5 repaired, ~1.6 non-repairable, ~5.4 NFF, ~4.3
exchanged, ~0.08 sold, ~1.2 sent to subcontractor, ~0.01 other.

**Deliberately not exposed as a tunable**: the 180-day lookback and the
"today" framing are fixed, not a date-range picker like the Analytics
page — this is meant as an at-a-glance panel on the technician worklist,
not a second analytics surface. If the lookback window turns out to
matter (e.g. seasonal effects), revisit then rather than guessing at
configurability up front.

## "My Jobs" — claiming a REMAN technician identity (2026-07-31)

Requested directly: "find a way to get technician names directly" (led to
the `NomDernierTech` discovery above) then "we need a method to claim a
tech... reorganize the suivi des interventions based on my jobs... add a
page for that but keep suivi des interventions as a global thing."

**No REMAN-side identity to link to.** REMAN has no login of its own —
technicians just pick their name from a dropdown per job (the
`"Veuillez vous identifier"` screen referenced earlier). There's nothing
to authenticate against, and a BRAXON username doesn't reliably map to a
4D name anyway (`"gabhy"` in BRAXON vs. `"Gabhy Kiba"` in 4D) — so this is
a manual, explicit claim, not an auto-detected link.

**Storage**: two new nullable columns on Postgres `"AppUser"`,
`reman_tech_id` and `reman_tech_name`, added the same lazy
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` way `role` was added earlier.
Both are stored (not just the id) because REMAN has no user table of its
own to resolve the id back to a name from later — the id is what drives
the actual filter, the name is what the UI displays. Set via
`commands::update_user_reman_tech(user_id, tech_id, tech_name)`; passing
`None` for both clears the claim.

**Picker source**: `reman_list_technicians` — the same live
`(TechDernInterv, NomDernierTech)` source as `reman_analytics`'s name
map (most-recent-per-id, `"Superviseur"` and id `"0"` excluded since
neither is a real individual to claim), exposed as its own command so the
frontend can populate a dropdown without pulling the whole analytics
payload just to list technicians.

**Filtering "my jobs"**: `reman_search_interventions` gained an optional
`tech_id` parameter — `AND l.TechDernInterv = <id>`, combined with
whatever queue is already selected, so *any* existing queue tab (Open,
Awaiting Parts, Closed, ...) becomes personal simply by passing this
along. New dialect gotcha found doing this: **`TechDernInterv` is
numeric, not text** — a quoted comparison (`= '3569'`) fails to execute
(`Failed to execute statement`, no useful detail beyond that), while an
unquoted numeric literal (`= 3569`) works fine, alone or combined with
the Boolean `Soldée` and the `Type_Service` equality/IN conditions
already in use elsewhere. Confirmed live incrementally (isolated each
condition before combining) — this wasn't the Boolean-combination bug
from elsewhere in this file, since even `Type_Service` + `TechDernInterv`
alone (no Boolean involved) failed until unquoted. Implemented by parsing
the id as `i64` first (same pattern as `parse_id` elsewhere) and
interpolating the unquoted number — deliberately the one condition in
this function that isn't string-escaped, because it's never treated as a
string.

**Frontend**: `InterventionsTab` (the existing "Suivi d'interventions"
component) took an optional `techId` prop rather than becoming a new
component — the personal view is the *same* queue-tabbed UI, just with
the filter threaded through, so it stays a single source of truth instead
of two copies drifting apart. A new "My Jobs" tab wraps it: shows a
technician picker (populated from `reman_list_technicians`) if nothing's
claimed yet, otherwise renders `InterventionsTab` with `techId` fixed to
the claim, plus a small "not you? change" affordance. The global "Suivi
d'interventions" tab is untouched — this is additive, not a
reorganization of the existing page, matching "keep suivi des
interventions as a global thing." The bench forecast panel (`RemanForecast`,
documented above) only renders on the unfiltered Open queue view — a
per-technician forecast wasn't asked for and would need its own
family-mix-vs-bench-population logic to mean anything, so it's left for a
later request rather than guessed at now.

## Family source corrected: `ArticleMeteor.Famille`, not `LigCde.Famille` (2026-07-31)

Reported directly, with a screenshot of the real article-lookup screen
(typing a known `CodeArt` auto-resolves its family from a "fiche" —
a `No`/`Intitulé` pair, `69` → `MK100`): "the families you choose are the
wrong names... if we ever had this ref in our shop, someone must have
created a fiche for that so it will take the same... can we get access to
that, that's gonna be the way we separate them."

Investigated live before changing anything: `LigCde.Famille` and
`ArticleMeteor.Famille` (joined on `CodeArt`) agreed on every real article
code checked (15 recent `LigCde` rows, no mismatches). The one real
finding was generic placeholder codes (`GENABS`, `GENTAB`, `GENCAM`,
`GENMUL` — "CODE GENERIQUE ..." literally, used before a technician has
identified the exact part) have `Famille = NULL` on *both* sides — not a
source disagreement, just genuinely not-yet-classified. Separately
confirmed **zero** currently-open bench jobs have a null family, so this
doesn't affect today's forecast either way.

Switched to `ArticleMeteor.Famille` anyway, regardless of the live check
not finding a divergence: it's the architecturally correct source per the
user's own explanation (a `CodeArt`-keyed reference record — the "fiche
article" — populated once and reused, vs. `LigCde.Famille` which is a
per-order copy with no guarantee of staying in sync going forward, even
if it happened to agree in every sample checked this session).
`reman_analytics`'s `intake_sql` and `reman_forecast_open_queue`'s
`queue_sql`/`hist_sql` all gained a `LEFT JOIN ArticleMeteor am ON
l.CodeArt = am.CodeArt` and now select `am.Famille` instead of
`l.Famille`. `LigCde.Famille` itself is no longer read anywhere in
`reman.rs`.

**Dialect note found along the way**: comparing two joined tables'
same-named columns (`l.Famille <> am.Famille`) fails to *execute*
(`Failed to execute statement`, no further detail) even though selecting
both side by side works fine — and `!=` fails to *parse* at all (this
dialect only accepts `<>`). Not chased further since the fix didn't end
up needing the comparison — logged here so a future "are these two
columns ever different" check doesn't waste time rediscovering it.

## Family source corrected again: parsed `ArticleMeteor.Designation`, not `ArticleMeteor.Famille` (2026-07-31)

The `ArticleMeteor.Famille` switch above turned out to still be wrong.
Reported directly: "you are still not getting the correct list of
libellé, can you show it to me? like all the libellé you managed to pull?"

Dumped the full live `Famille` distribution (544 distinct values over a
5000-article sample) and it's semantically mixed at inconsistent
granularity: car brands (`PSA` 622, `RENAULT` 316...), ABS module lines
(`MK100` 118, `Bosch 9.0` 166...), and roughly 400 ultra-specific
single-occurrence engine ECU codes (`EDC 16C34`, `ME 7.4.7`, etc.) —
three different axes flattened into one field. Checked `ArticleMeteor.Gamme`
as an alternative (128 distinct values, dominated by manufacturer/supplier
names — Bosch, ATE, Delphi, VDO, Continental, Magneti Marelli, Siemens,
Visteon, TRW, Valeo, Sagem) — a clean field, but a different axis entirely
(manufacturer, not "family" as pictured).

Presented all three axes (raw `Famille`, `Gamme`, and a proposed
parse-from-text approach) via `AskUserQuestion`; the user picked "Parsed
from Designation/LibelleArt" — extracting the meaningful part from text
like "Calculateur ABS ATE MK100" (the manufacturer + model after the
component-type phrase).

**First implementation attempt was backwards.** The first cut of
`derive_family()` stripped the leading component-type phrase and kept the
*remainder* (manufacturer + model, e.g. `"Calculateur ABS ATE MK100"` →
`"ATE MK100"`, `"Compteur Renault"` → `"Renault"`) — grouping by
brand/manufacturer. Corrected immediately, same day: "what is just renault
or fiat or jeep telling me about the type of unit we had? nothing, i don't
care about the brand, but knowing it was a compteur so dashboard is
usefull to me you get it now?" The axis that matters is *what kind of
part it is* (dashboard, ABS computer, engine ECU, power steering...), not
which car it came out of.

**Second attempt over-corrected the other way.** Changed `derive_family()`
to match a known leading component-type phrase and return only its
canonical label, discarding everything after it — `"Calculateur ABS ATE
MK100"`, `"Calculateur ABS Bosch 8.0"`, and `"Calculateur ABS TRW"` all
collapsed into one `"Calculateur ABS"` bucket. Flagged immediately, same
day: "why are you stripping the libellé, i never asked you that
'Calculateur ABS ATE MK100' ('Calculateur ABS Bosch 8.0') ('Calculateur
ABS TRW') those are the families i want not just ABS." The manufacturer +
model *is* meaningful for these parts (different hardware, different
repair procedure) — car brand and manufacturer/model aren't the same kind
of "not useful," and the first fix conflated them.

Asked directly via `AskUserQuestion` whether to keep that distinction only
for parts where it's diagnostic (Calculateur ABS/Moteur) while still
collapsing car-brand-suffixed parts (Compteur/Multimedia/Comodo/etc.) to
their bare type, or to stop parsing altogether. User chose the latter:
**keep everything, never strip.**

**Final implementation** — `derive_family()` is now the identity function
on the trimmed `ArticleMeteor.Designation` text (`None` only for
empty/whitespace-only strings); no prefix table, no stripping, no
collapsing. `"Calculateur ABS ATE MK100"`, `"Calculateur ABS Bosch 8.0"`,
and `"Compteur Renault"` are each their own family, exactly as they read
on the real article "fiche." Checked live that this doesn't starve the
bench forecast's historical-rate lookup of samples now that families are
closer to per-SKU: for the 26-unit bench sampled, 0 came back
`unforecastable` and every family's 180-day historical sample was still
comfortably sized (11 to 342 closed jobs) — these designations repeat
often enough in day-to-day intake that per-SKU granularity doesn't
meaningfully thin the data.

`reman_analytics`'s `intake_sql` and `reman_forecast_open_queue`'s
`queue_sql`/`hist_sql` select `am.Designation` instead of `am.Famille` and
run it through `derive_family()` in Rust after the query returns.
`ArticleMeteor.Famille` is no longer read anywhere in `reman.rs`.

## "Today's forecast" auto-refresh + forecast-vs-actual comparison (2026-07-31)

Two more requests against the running forecast panel, same day: "we're
receiving units in about 10 minutes the forecast should update right?"
and "at 5pm15 you should compare what the forecast was and what we
really did so you can update our model right?"

**Auto-refresh**: `RemanForecast.tsx` now re-fetches every 3 minutes
(`AUTO_REFRESH_MS`) via `setInterval`, not just once on mount. A
background refresh failure no longer blanks the panel — only a *first*
load failing, or a genuinely empty bench, hides it now; a stale-but-
present forecast survives a transient blip. A small refresh icon
(spinning while in flight) and an "updated Xm ago" label were added so
staleness is visible rather than silent.

**Forecast-vs-actual**: not a real model-retraining loop (out of scope
for a session feature, and "the model" is just the rolling 180-day
historical rate lookup, which already self-updates continuously as more
jobs close) — what's actually buildable and useful is a snapshot-and-
compare mechanism:
- New Postgres table `"RemanForecastSnapshot"` (BRAXON's own DB, not
  REMAN's 4D — the forecast is derived data REMAN has no concept of, so
  there's nowhere on the 4D side this could live even with write access):
  `id`, `created_at`, `units_with_tech`, `predicted_json`, `job_ids_json`.
- `OpenQueueForecast` gained a `job_ids: Vec<String>` field — the exact
  `LigCde` ids behind a prediction, not just the aggregate counts, since
  those specific ids are what gets checked back on later.
- `commands::reman_snapshot_forecast(force: bool)` — idempotent per
  calendar day unless `force`: the first call of the day computes and
  persists the forecast as that day's baseline; every later call that
  same day (including the frontend's own periodic refresh) just reads
  the existing row back rather than moving the baseline. `RemanForecast`
  fires this once on mount, fire-and-forget.
- `commands::reman_compare_forecast_to_actual()` — reads back the most
  recent snapshot's `job_ids`, calls the new `reman::reman_actual_outcomes(ids)`
  (not a `#[tauri::command]` itself, a plain `pub async fn` — same
  closed/`classify_outcome` logic as everywhere else in `reman.rs`, just
  scoped to a specific id list via an unquoted numeric `IN (...)` list)
  to see what's actually happened to each of those units since, and
  returns predicted vs. actual side by side. `None` if no snapshot exists
  yet (e.g. asked before the bench has been open at all that day).
- Verified live end-to-end: a real snapshot (21 units) inserted
  successfully, and `reman_actual_outcomes` against those same 21 ids
  correctly reported all 21 still `in_progress` (expected — checked
  moments after the snapshot, nothing had time to close yet).
- Frontend: a "Compare to actual" expandable section next to "By family"
  on the forecast panel, showing a predicted-vs-actual table per outcome
  plus a "still open" row — lazily fetched only when opened, not on every
  render.

## Comparison panel auto-refresh + the frozen-baseline scope gap (2026-07-31)

Two follow-up reports against "Compare to actual," same day. First: "still
compare to actual is keeping the 10:58 old prediction why? it should
update as well" — the panel only ever fetched once, when first opened
(`toggleComparison`'s `if (next && !comparison) loadComparison()`).
Fixed: `RemanForecast.tsx` now polls `reman_compare_forecast_to_actual`
every `AUTO_REFRESH_MS` while the section is expanded (stops when
collapsed), background ticks are silent (no loading-state flicker), same
pattern as the main panel's own auto-refresh.

Second, after that fix landed: "compare to actual is showing old stuff
btw and i even repaired a few units still not showing up in there." This
was a real scope bug, not staleness — verified live before touching any
code: the day's snapshot (taken 08:58, 21 units) already correctly showed
`repaired: 3` for its own 21 ids (the backend math was right), but a
separate check found **9 units had landed on the bench since 08:58** that
were completely invisible to the comparison, because `job_ids_json` is
written once at snapshot time and never touched again — any unit that
arrives afterward, however it's later closed, can never appear in
"actual" for the rest of that day.

**Fix**: added `commands::reman_track_bench_ids(ids)` — merges newly-seen
bench ids into today's snapshot's `job_ids_json` (a Postgres-only
`UPDATE`, no extra 4D query) without touching `predicted_json` or
`units_with_tech`, which stay exactly as captured at the original
baseline (that's still "what we forecast that morning"). Called from
`RemanForecast.tsx`'s `load()` after every fetch — main-panel refresh and
comparison refresh both already pull `job_ids` from
`reman_forecast_open_queue`, so this reuses data already in hand rather
than querying 4D a second time. Verified live: before the merge the
snapshot tracked 21 ids; after running the merge against the live bench,
30 — exactly the 21 original plus the 9 found missing.

Since "actual"'s tracked set can now grow past the original
`unitsWithTech` count, `ForecastComparisonView`'s subtitle switches to a
"plus N more that arrived since" wording once the two diverge
(`compare_subtitle_grown`), rather than a fixed count that would
under-represent how many units are actually being tracked.

## `job_ids` was still too narrow after the tracking fix above (2026-07-31)

Same day, after the `reman_track_bench_ids` fix landed: "where are you
getting the actual repairs and exchanges and so n it should be in
interventions soldées, check the latest date D dern Interv section, it's
still showing 3 which is false." Investigated live before changing
anything (established pattern — never guess): pulled full intervention
history for all 30 tracked ids. The `repaired: 3` figure itself was
internally consistent (exactly 3 of the 30 were `Soldée = True` with a
final `TypeCode = 'R'`, all dated 31/07/2026) — the classification wasn't
wrong. But a broader shop-wide query (`Soldée = True`, latest `TypeCode =
'R'`, closed today, no category/id restriction) found **6** jobs, not 3.
The missing 3 (job ids 39519, 39450, 39116) were never in `job_ids` at
all, for any snapshot poll that day.

Root cause: `OpenQueueForecast.job_ids` was populated from the same
Rust-side–filtered subset as `units_with_tech`/`by_family` — i.e. only
rows that also had a set, non-stale `DateLimiteLivraison` *and* weren't
already claimed by a more specific sub-queue (`CATEGORIZED_TYPE_CODES`:
AP/ARC/ATN/ER). Those exclusions exist so the *displayed* forecast panel
matches what "Suivi d'interventions" shows on screen — they were never
meant to decide whether a job was real. A job sitting in "Attente de
Pièces" at every poll before it got repaired, or one with no delivery
estimate set yet, is still an active job — but it was invisible to
tracking its entire life, from first appearing on the bench to closing.

**First fix attempt was too broad**: removed the date/staleness/
categorized filter from `job_ids` entirely (kept it for `units_with_tech`).
Verified live before shipping it — `job_ids.len()` jumped from 24 to
**4942**, nearly hitting `queue_sql`'s own `LIMIT 5000`. This confirmed
the date/staleness filter isn't just a display nicety: this shop has
thousands of `Soldée = False` rows with no delivery date or a
long-abandoned one (same population `InterventionQueue::Open`'s own
staleness cutoff was built to exclude), and without it `job_ids` mostly
filled up with ancient cruft, not active work — every one of those extra
~4900 ids would also have gone through `reman_track_bench_ids`'s merge
and swelled the Postgres-side `job_ids_json` and every subsequent
`reman_actual_outcomes` `IN (...)` query accordingly.

**Narrowed fix**: `job_ids` keeps the date/staleness requirement (a valid,
non-stale `DateLimiteLivraison`) but drops only the `categorized`
exclusion — that one's purely about not double-showing a job across
sub-tabs, not a signal that the job isn't real. Verified live: `job_ids`
went from 24 (matching `units_with_tech` exactly, the old behavior) to
33 — a handful of legitimately-active jobs mid-flight through a
sub-status, not thousands of stale ones. `units_with_tech`/`by_family`
(the numbers actually shown on the forecast panel) are untouched — same
filtering, same figures as before.

Note this doesn't retroactively recover the 3 jobs already missed that
day (39519/39450/39116) — they closed before this fix existed, so
tracking never saw them while they were still open. Going forward, any
job matching this broader criterion gets folded into `job_ids` (and, via
`reman_track_bench_ids`, into the day's snapshot) the first time a poll
catches it still open.

## "Actual" redesigned as shop-wide, not id-tracked at all (2026-07-31)

The narrowed `job_ids` fix above was itself rejected, same day: "the
problem is that your actual is based on previously tracked unit, that
shouldn't be it, it should be shop wise, because even if some units are
in Attente de pièce, before getting closed they go to pièces arrivées
and then we can say repaired or exchange or whatever, so change the way
you do it because i want to see all the jobs closed today not just the
ones tracked at 10:58 that's insane." Any id-list-tracking design — no
matter how the list gets populated or grown — has the same shape of
problem: a job only counts if some earlier poll happened to see it while
it was still open and passing whatever filter that poll used. The fix
isn't a better filter; it's not filtering by a tracked list at all.

**Redesign**: `reman::reman_actual_outcomes_today()` replaces
`reman_actual_outcomes(ids)` entirely. No id list, no snapshot lookup —
just: every `LigCde` row with `Type_Service IN (100,101,102,103)`,
`Soldée = True`, and `DateDernInterv` equal to today's date (`DD/MM/YYYY`,
confirmed live to have no time component so a plain string match is
safe), classified by its latest `TypeCode` via the existing
`classify_outcome`. A job doesn't need to have ever been polled open by
this app to count — only that it closed today. Verified live: went from
3 repaired (the old id-tracked figure) to 7 repaired + 2 non-repairable +
2 NFF + 1 standard exchange = 12 real closures shop-wide, a few minutes
after the previous fix's diagnostic had found 6.

Removed as part of this: `commands::reman_track_bench_ids` (the
newly-arrived-ids merge command from the previous fix, now fully
unused) and its registration in `main.rs`; the frontend's matching
`invoke('reman_track_bench_ids', ...)` call after every forecast poll;
the "still open" row in `ForecastComparisonView` (`actual.inProgress` is
now always 0 by construction, since the query only ever selects
`Soldée = True` rows — there's no "still open, out of the ones we're
tracking" concept left to show); and the `compare_subtitle_grown`
i18n variant (nothing left to grow). `predicted` is unchanged — still the
frozen morning baseline from `reman_snapshot_forecast`, still the "what
we forecast heading into today" side of the comparison; only what
"actual" measures changed, from "what happened to a specific tracked
list" to "what happened shop-wide." The `RemanForecastSnapshot` table
still has a `job_ids_json` column (harmless — `reman_snapshot_forecast`
still writes the morning's bench population into it for potential future
reference) but nothing reads it anymore.

## Rounding-sum display bug, and letting `predicted` grow with new arrivals (2026-07-31)

Two more reports against the forecast panel, same session: "when you see
the forcast and the likelyness underneath, the numbers don't add up" and
"i don't know why you keep in compare actual the prediction, the one
snapshot at 10:58 even the prediction should be updated there... the
prediction should update only when a new unit comes in atelier and is in
these services 101 100 102 103."

**Rounding bug**: `PredictedMix::from_family_rate` returns exactly
`Self::default()` (all-zero) for a family with no historical sample, so
the *true* float sum of `predicted`'s seven buckets equals
`units_with_tech` exactly whenever `unforecastable = 0` — confirmed by
inspection of the Rust source, not a data problem. The visible mismatch
(a screenshot showing Repaired ~7 / Standard exchange ~3 / Sold ~0 / NFF
~6 / Non-repairable ~1 = 17, against "18 with technicians" at the top)
was purely a frontend display bug: each bucket was rounded independently
via `Math.round`, and independently-rounded parts don't reliably sum to
the rounded whole (e.g. raw 6.6/2.6/0.3/5.6/0.9, true sum 18.0, rounds to
7/3/0/6/1 = 17). Fixed with a standard largest-remainder rounding helper
(`roundToSum` in `RemanForecast.tsx`): floor every value, then hand the
leftover units to whichever values have the largest fractional part, so
the displayed parts always sum to exactly the displayed whole. Applied to
both the main panel's legend and the comparison table's "Predicted"
column.

**Letting `predicted` grow**: the previous redesign left `predicted`
permanently frozen at the day's first computation (deliberately, at the
time — "that's what makes it a prediction vs. what really happened").
Corrected: the *concept* of a frozen baseline was fine, but freezing it
forever wasn't — new units keep landing on the bench all day, and none of
them were ever reflected in what "predicted" claimed to cover.

- `reman::predicted_mix_from_family_counts()` — the family-rate lookup
  and aggregation logic in `reman_forecast_open_queue` was extracted into
  a shared helper, since it's now called from two places with two
  different sources for "how many of each family": the live
  `Soldée = False` bench scan, or an explicit id list.
- `reman::reman_predicted_mix_for_ids(ids)` — new. Given a fixed set of
  `LigCde` ids, looks up each one's family (via the same `ArticleMeteor`
  join + `derive_family()`) and runs them through the shared helper.
  Verified live: recomputing over the *same* ids the live queue scan
  found gives the same unit count and a predicted total that still sums
  to that count (e.g. 27 tracked ids → predicted buckets summing to
  ≈27.0); a simulated 39-id growth run summed to ≈39.0.
- `commands::reman_grow_forecast_baseline(ids)` — replaces the earlier
  `reman_track_bench_ids`. Merges newly-seen bench ids into today's
  snapshot's `job_ids_json` same as before, but when (and only when) that
  merge actually finds something new, it also recomputes
  `predicted_json`/`units_with_tech` from the grown id list via
  `reman_predicted_mix_for_ids` and writes those back too. No new ids
  found → no recompute, no write at all — directly matching "the
  prediction should update only when a new unit comes in." Called from
  `RemanForecast.tsx`'s `load()` after every poll, reusing that call's
  own `jobIds` (already scoped to Type_Service 100/101/102/103, matching
  "these services" exactly) rather than a separate 4D query.

`ForecastComparisonView`'s subtitle now reads "grows as new units land"
instead of implying a fixed count.

## The whole snapshot/growing-baseline idea dropped — comparison is just live now (2026-07-31)

The "let predicted grow" fix directly above lasted about as long as it
took to reload the page. Reported immediately, with a screenshot: the top
panel said "Repaired ~7" and the "Compare to actual" section right below
it said "Predicted ~8" for the same label — "on top says 7 repairs but in
predicted just underneath it says repairs wtf is happening?" The two
numbers were forecasting two genuinely different populations (18 units
live on the bench right now vs. 21 units cumulatively tracked since the
morning, some of which had already closed) — a real distinction, but a
confusing one to show side by side under the same "Repaired" label.
Presented the tradeoff via `AskUserQuestion` (keep both but label them
more clearly, or collapse to one live number); the user's answer went
further than either option: "drop the morning's prediction and just use
the growing forecast which should be live," plus a second question —
"this morning before we made some changes it was like 12 repair now it's
7 or 8? how having more units is decreasing the amount of repairs?"

That second question has a real (non-bug) answer worth recording: predicted
scales with `units_with_tech`, and that count is *live*, not cumulative —
it shrinks whenever units finish and leave the open queue, same as it
grows when new ones arrive. Going from ~26-27 units/~11 predicted repairs
earlier in the day down to 18 units/~7 later isn't a regression; it's a
lot of those original units having already been repaired and left the
"currently open" count, while `actual` (shop-wide closures today) keeps
accumulating separately and correctly climbs.

**Final design**: deleted the entire persistence layer. No more
`RemanForecastSnapshot` Postgres table usage, no `reman_snapshot_forecast`,
no `reman_grow_forecast_baseline`, no `reman::reman_predicted_mix_for_ids`,
no `job_ids` field on `OpenQueueForecast` (nothing consumes it anymore).
`commands::reman_compare_forecast_to_actual` is now a ~6-line command with
no `State<AppState>` parameter at all (no Postgres access needed): call
`reman::reman_forecast_open_queue()` for `predicted`/`units_with_tech` —
the *exact same* live call the top panel itself makes — and
`reman::reman_actual_outcomes_today()` for `actual`. `ForecastComparison`
dropped `snapshot_created_at` entirely; the subtitle no longer references
a time ("i don't want to see this 10:58"). The frontend's `load()` no
longer fires a companion `reman_grow_forecast_baseline` call, and there's
no more mount-time `reman_snapshot_forecast` call either — one query per
side, both live, nothing to keep in sync.

The physical `"RemanForecastSnapshot"` table itself was left alone in
Postgres (harmless leftover, no code creates or reads it anymore) rather
than issued a `DROP TABLE` — consistent with not making destructive schema
changes without being asked.

## Forecast auto-refresh intervals brought down to 60s, and a status-shuffle bug found by testing them (2026-07-31)

Once the queue lists and forecast panel both auto-refreshed, the user
asked to test it — and while testing, found a real bug: "i just saw the
forecast go from 7 to 6 it should never go dozn from originql vqlue only
up if we have more units, i actually moved to cleaning and it changed
which shouldn't be the case."

Root cause: `reman_forecast_open_queue` was excluding any unit whose
current `TypeCode` was in `CATEGORIZED_TYPE_CODES` (`TES`, `AP`, `ARC`,
`ATN` — "Attente Nettoyage", `ARD`, `ST`) from `units_with_tech` and the
predicted mix, copying the same check `reman_search_interventions` uses
for its Open-queue *display*. That exclusion exists there to avoid
double-showing a job across UI sub-tabs (Suivi d'interventions vs.
Attente de Pièces vs. ...) — a display concern, not a signal that the job
left the bench. The forecast is one aggregate number with no sub-tabs, so
applying that same exclusion meant a purely administrative status change
(moving a unit into cleaning) made it vanish from the count, the same way
finishing the job would have — indistinguishable from the user's point of
view, and exactly the "why does this go down" confusion reported.

Fixed: dropped the `categorized` check from `reman_forecast_open_queue`'s
gate (kept the date-required + staleness checks, which are the ones doing
real work — see the `job_ids` explosion note above from when *those* were
mistakenly dropped instead). Verified live: `units_with_tech` went from
18 to 27 for the exact same live bench state — a sane jump matching the
~9 categorized-status units found earlier, not an explosion. Now the
count only moves for the two reasons the user asked for: a genuinely new
open job joining (increase), or `Soldée` flipping to `True` (decrease) —
moving between sub-statuses on an already-open job no longer touches it
either way.

Separately, `AUTO_REFRESH_MS` (`RemanForecast.tsx`) and
`INTERVENTIONS_REFRESH_MS` (`Reman.tsx`) both went from 3 minutes to 60
seconds, requested directly: "3 minutes is a lot let's bring it down to
60 seconds." `COMPARISON_REFRESH_MS` inherits the same value. Worth
watching: the forecast panel's refresh runs the full 180-day historical
scan each time (unlike the queue lists' lighter query), so 60s is a more
aggressive cadence for that specific one — flagged to the user as worth
decoupling back to a slower interval if it turns out to load the 4D
server noticeably.

## Shared Postgres cache + nightly 4D history ETL (2026-07-31)

Raised directly, with up to 15 BRAXON instances open at once during a shop
day: every instance polled 4D independently, and the worst offender was
`reman_forecast_open_queue`'s historical-rate lookup (what's now
`predicted_mix_from_family_counts`) — a 180-day `hist_sql`/`closed_sql` scan
(`LIMIT 20000` each) run fresh on *every* client's *every* 60s refresh. 4D
sits behind a hand-rolled TCP proxy (`spawn_local_proxy`, this file's own
port-forward workaround for the driver hardcoding port 19812) and was never
built for that kind of concurrent load. Two fixes requested together: back
the historical rates up into BRAXON's own Postgres nightly instead of
scanning 4D live for them, and for whatever *does* still need a live 4D
read, have one client refresh per interval while the rest read a shared
Postgres row instead of all hitting 4D independently. User confirmed
Postgres runs on an always-on server, so a Postgres-backed claim mechanism
works regardless of which (if any) BRAXON client happens to be open at any
given moment — no dedicated always-on BRAXON process needed.

**New tables, all in BRAXON's own Postgres** (REMAN's 4D stays untouched,
read-only, exactly as before):

- `"RemanClosedJobHistory"` (`ligcde_id` PK, `family`, `type_code`,
  `date_commande`, `date_closed`, `outcome`, `captured_at`) — one row per
  closed `LigCde` job seen in the last `FORECAST_LOOKBACK_DAYS` (180).
  `outcome` is `Outcome::as_str()` (`"repaired"`, `"non_repairable"`, ...),
  the same bucket names `OutcomeBreakdown`'s fields already use everywhere
  else in this file. `family` always gets the same `"(unspecified)"`
  fallback the rest of this file already uses for a blank/NULL
  `ArticleMeteor.Designation` — stored as the literal string, not NULL, so
  it still matches the live bench population's own family keys when the
  forecast queries this table by family (`family = ANY($1)`).
- `"RemanEtlState"` (`etl_key` PK, `last_run_date`, `claimed_at`) — one row
  (`'closed_job_history'`), tracks the last calendar day the ETL
  successfully completed.
- `"RemanLiveCache"` (`cache_key` PK, `payload_json`, `updated_at` default
  `'-infinity'`) — one row per live-query cache key, currently
  `'bench_queue'` and `'actual_outcomes_today'`.

**Nightly ETL** (`run_closed_job_history_etl`): re-runs the *exact* same
`hist_sql`/`closed_sql` shape the live forecast used to query 4D with
directly, but persists the result instead of returning it — a single
`UNNEST`-based parameterized upsert (`ON CONFLICT (ligcde_id) DO UPDATE`,
real Postgres parameter binding, unlike 4D's broken `?` placeholders) tagged
with one `captured_at` timestamp per run, followed by
`DELETE ... WHERE captured_at < $that_run's_timestamp` — mark-and-sweep, so
jobs that fell out of the rolling 180-day window get pruned automatically
and the table never needs a separate cleanup job. Idempotent, safe to re-run
any time. Verified live end-to-end (`cargo test`, `RemanClosedJobHistory`
already had real 4D data at the time, since the local proxy happened to
already be running from another instance): first run populated the table
with a real nonzero row count matching a direct `SELECT COUNT(*)`; running
it a second time immediately after produced the exact same count with no
duplicates, confirming both the upsert and the prune are safe to repeat.

`std::time::SystemTime`, not `chrono::DateTime`, is used for the
`captured_at`/prune-cutoff parameter — `tokio-postgres`'s chrono
integration needs an extra Cargo feature this project doesn't enable, and
`SystemTime` already maps to `TIMESTAMPTZ` without it.

**Daily trigger, no dedicated server needed** (`try_run_daily_etl` +
`spawn_etl_scheduler`): BRAXON is a desktop app with no always-on process of
its own, so "once a day" is enforced by a Postgres claim instead of a real
cron — `spawn_etl_scheduler` (started from `main.rs` next to the existing
`spawn_local_proxy()` call) checks every 30 minutes, and whenever local time
is past 3am, attempts one atomic `UPDATE ... WHERE last_run_date IS DISTINCT
FROM today AND (claimed_at IS NULL OR claimed_at < now() - interval '30
minutes') RETURNING etl_key`. Whichever BRAXON instance's tick wins that
claim runs the ETL and, only on success, writes `last_run_date = today`; a
crashed or errored run leaves `last_run_date` untouched so the 30-minute-old
claim simply goes stale and another tick (this instance or another) retries
automatically. The loop checks immediately on startup (before its first
sleep), so a fresh launch at 3:05am still catches that day's run rather than
waiting for the next 30-minute tick. Verified live: seeding
`last_run_date = today` directly and calling `try_run_daily_etl` again
returned `false` (declined, no second 4D hit) rather than re-running.

**Historical-rate read path switches from 4D to Postgres**
(`predicted_mix_from_family_counts`): now a Postgres query
(`SELECT family, outcome, COUNT(*) FROM "RemanClosedJobHistory" WHERE
family = ANY($1) GROUP BY family, outcome`, still scoped to only the
families actually on the bench, same optimization the old 4D version already
did) instead of the live `hist_sql`/`closed_sql` scan. The aggregation math
downstream (`PredictedMix::from_family_rate`, per-family fractions, the
`unforecastable` count) is untouched — this only changed where the
`OutcomeBreakdown` per family comes from. Verified live by seeding known
rows (3 repaired + 1 non-repairable) under a throwaway family key and
checking the predicted mix for 8 bench units on that family came back
`~6.0` repaired / `~2.0` non-repairable exactly, matching the 3:1 historical
ratio. This alone — independent of the live-cache work below — removes the
heaviest recurring 4D query from every client's hot path entirely.

**Shared live-state cache** (`cached_or_refresh`, generic over any
`cache_key`): one atomic conditional `UPDATE ... WHERE updated_at < now() -
make_interval(secs => 60) RETURNING payload_json` as the mutex. A row
returned means this caller won the claim (cache was stale) and must run the
passed-in `refresh` future and write the result back; no row means someone
else refreshed within the last `LIVE_CACHE_TTL_SECONDS` (60, matching
`RemanForecast.tsx`'s `AUTO_REFRESH_MS`/`Reman.tsx`'s
`INTERVENTIONS_REFRESH_MS`) or is mid-refresh — just read whatever's
cached. `refresh` is passed as an already-constructed `Future` (an `async
{}` block), not a closure, since it only needs to be polled in the two
narrow branches that actually need a fresh value (won the claim, or the
one-time cold-start case where `payload_json` is still NULL right after
table creation) — polling it unconditionally would defeat the whole point.
Verified live: three calls in a row against a real `RemanLiveCache` row —
first call (fresh/reset row) claimed and ran the refresh future exactly
once; a second call immediately after, within the TTL window, returned the
*first* call's payload without running its own refresh future at all; a
third call, after manually backdating `updated_at` past the TTL, re-claimed
and ran its own refresh future, confirmed via an atomic call counter shared
across all three calls.

Two cache keys currently wired up: `'bench_queue'` (the live half of
`reman_forecast_open_queue` — today's `queue_sql` scan of who's on the
bench, by family; payload is a small `CachedBenchQueue { units_with_tech,
family_counts }` struct) and `'actual_outcomes_today'`
(`reman_actual_outcomes_today`, called from
`commands::reman_compare_forecast_to_actual`; payload is `OutcomeBreakdown`
directly). Both `reman_forecast_open_queue` and `reman_actual_outcomes_today`
gained Postgres access (`State<'_, AppState>` / `&tokio_postgres::Client`
respectively) for the first time — this is the first Postgres access inside
`reman.rs` itself rather than `commands.rs`, deliberate, since the domain
logic (`Outcome`, `classify_outcome`, `derive_family`, `OutcomeBreakdown`,
`PredictedMix`) already lived here; this is a caching layer in front of that
existing logic, not a rewrite of it.

Net effect in steady state with 15 clients polling every 60s: at most one
client per minute actually queries 4D for the bench queue, at most one per
minute for today's actual outcomes, and zero query 4D for historical rates
at all — down from 15× a 180-day scan plus 15× two lighter live queries,
every single minute.

**Deliberately untouched**: `AUTO_REFRESH_MS` (`RemanForecast.tsx`) and
`INTERVENTIONS_REFRESH_MS` (`Reman.tsx`) both stay at 60 seconds — the point
of this work was reducing 4D load at the existing refresh cadence, not
changing the cadence itself. No frontend code changed at all: adding a
`State<'_, AppState>` parameter to a `#[tauri::command]` doesn't change its
JS call signature (Tauri auto-injects managed state), so
`invoke('reman_forecast_open_queue')` /
`invoke('reman_compare_forecast_to_actual')` needed zero edits.
`reman_search_interventions` (the per-queue worklists in `InterventionsTab`)
was left un-cached — explicitly lower priority than the two hot paths above
since those queries are lighter than the historical scan ever was; revisit
if it turns out to matter once the above is live for a while.

## Refresh cadence to 30s, and "SG" (warranty) surfaced on the Open queue (2026-08-02)

Two follow-ups against the shared-cache work above, same broad request:
"we could even bring it down to 30 seconds right, that would still be okay
right?" and, from a real 4D grid screenshot ("no, devis, SG, HD, soldée,
code article, ..."): "reorganize the suivi d'intervertions page to display
the most important on top, like the latest and warranty units, SG is under
warranty on the image, check that out."

**30-second cadence**: `RemanForecast.tsx`'s `AUTO_REFRESH_MS` (and the
`COMPARISON_REFRESH_MS` that inherits it) dropped from 60s to 30s, matched
by `LIVE_CACHE_TTL_SECONDS` in `reman.rs` dropping to `30.0` — the client
poll rate and the shared-cache TTL are deliberately kept equal so a faster
poll actually delivers fresher data rather than just re-serving the same
cached row twice as often. This is safe specifically because both of
`reman_forecast_open_queue`'s queries go through `cached_or_refresh`: 4D
load stays "at most one query per cache key per 30s, fleet-wide," regardless
of client poll rate. **`Reman.tsx`'s `INTERVENTIONS_REFRESH_MS` was
deliberately left at 60s** — `reman_search_interventions` (the queue
worklists `InterventionsTab` drives) was never wired into the cache (that
was Part C in the shared-cache plan, explicitly skipped as a lower-priority
stretch goal), so it still hits 4D directly on every poll; halving that
interval would double real 4D load, not absorb it into a cache the way the
forecast panel's change does. Revisit if Part C ever gets built.

**"SG" identified as `LigCde.Garantie`**: not guessed — found by taking the
exact job from the user's screenshot (`CodeArt = '0265951612'`,
`DateLimiteLivraison = '05/08/2026'`, matched to `NoInt_Ligcde = 39516`,
ref `17474701`, `GARAGE DU FLAYOSQUET`) and probing every warranty-ish
Boolean column on `LigCde` (`Garantie`, `Garantieinter`, `SGConstructeur`,
`SGConstructRefusee`, `SGNonDemandée`, `SGRAS`, `SGRefuseeAutreMotif`,
`SGRefuseePanneDiff`, `Dorma_SGconstructeur`, `Zebra_TeteSousGarantie`, ...)
one at a time via `SELECT COUNT(*) WHERE NoInt_Ligcde = 39516 AND "<col>" =
True` (never selecting a Boolean column directly — see the standing
`run_query` panic rule). `Garantie` was the only one that came back `True`
— exactly matching the screenshot's "SG checked, devis/HD/soldée
unchecked." `LigCde.DerniereInterv`/`TypeHD`/`TypeHD48SG` were also seen on
this pass (candidates for the screenshot's other short-label columns) but
not chased further — out of scope for what was actually asked.

**Open queue reorg** (`reman_search_interventions`, scoped to
`InterventionQueue::Open` only, per direct choice — not applied to the
other queue tabs): warranty units are now pinned to the top of the list as
a group (sorted among themselves by soonest deadline, same as before),
followed by everything else in the existing soonest-deadline-first order —
"the latest" was confirmed to mean the same urgency dimension the list
already sorted by, not a separate recency signal. Since `Garantie` is a
Boolean column, its per-row value can't be `SELECT`ed directly (same
`run_query` panic rule); a second lightweight query fetches just the ids
where `Garantie = True` under the same Open-queue conditions
(`Soldée`/`Type_Service`), and Rust intersects that id set against the main
result the same way `Soldée`/closed-id sets are already intersected
elsewhere in this file (e.g. `reman_analytics`'s `closed_sql`). Verified
live that combining `Garantie = True` with the Open queue's other
conditions doesn't trip the documented "Boolean combined with a second
condition silently zeroes rows" bug (that bug's only confirmed trigger is
`IS NULL`/`IS NOT NULL`, not equality/`IN` — this is a new combination, so
it was checked rather than assumed): a manual per-row probe across 60
sampled open-bench jobs found exactly 1 with `Garantie = True`, and that
same id was the only one present in the combined query's result. End-to-end
verified via `cargo test` against the live server: the Open queue's own
`reman_search_interventions("", "open", None)` returned that same job
(`39516`) as its one `under_warranty = true` row, correctly sorted first
among 16 total rows.

`InterventionSummary` gained `under_warranty: bool` (always `false` outside
the Open queue, where the warranty-id lookup never runs). Frontend
(`Reman.tsx`) shows a small "Sous garantie"/"Under warranty" badge next to
the client name for any row with `underWarranty === true`, next to the
existing status badge — new `reman.under_warranty` i18n key in both
`en.json`/`fr.json`.

## Full job-detail view, including the complete step history (2026-08-03)

Requested directly, with a real 4D job-detail screenshot (job `17473101`):
"when i open the job... we should be able to see more infos about the
job... you have all the different steps with dates and hours, you can
click on each step and open it to view like the comment you entered per
step." Previously `reman_get_intervention` only returned a thin slice
(reference/status/article/vehicle/delivery/last-visit, one client line, the
*latest* step's comment, and parts/lines).

Every new field was found by taking that exact job (`NoIntervention =
'17473101'` → `NoInt_Ligcde = 39500`, `NoInt_Cde = 38999`,
`NoInt_Client = 4258`) and querying live 4D directly, cross-checking each
screenshot value against a real column:

- Client name/city/CP: `Client.Nom`/`Ville`/`CP`. Contact name/tel/email:
  `Client.NomContact`/`Tel`/`e_mail` (not `Clt_adrLivr`'s copies — the
  screenshot's "Contact" box matches `Client`'s own fields exactly).
  Address: `Clt_adrLivr.Adr1`/`Adr2`/`CP`/`Ville`, first row for the
  client (the job form only ever shows one, unlike `reman_get_client`'s
  full address list). Ref. client: `Commande.Ref_Client`.
- Marque: **`ArticleMeteor.Gamme`, not `Constructeur`** (empty on this
  article) — confirmed `Gamme = "ATE"` matches the screenshot exactly,
  consistent with the earlier finding (see "Family source corrected again"
  above) that `Gamme` is the manufacturer/supplier axis. Famille/
  Segmentation/Service: `LigCde.Famille`/`Segmentation`/`Type_Service`
  (the *raw* fields, read directly for this detail view — unlike the
  forecast/analytics `derive_family()` pipeline, this is just mirroring
  what the real form shows for one job, not aggregating).
- Délai ligne: `LigCde.DelaiLigneCde`. **Commentaire client**:
  `LigCde.Observations` — found by grepping every LigCde text column on the
  real row for the screenshot's actual comment text ("Panne Permanente -
  ROUES QUI BLOQUENT..."), since nothing about the column name would have
  suggested it. Commentaire Interne: `LigCde.CommentaireInterne`.
- "OFFRE RETENUE" checkboxes + Sous garantie/ND/RAS: `LigCde.Réparation`/
  `Vente`/`EchgeS`/`AvanceES`/`Garantie`/`ND`/`RAS` — all Boolean, probed
  live one at a time against the real row; only `Réparation` came back
  `True`, matching the screenshot's checked box.
- Valorisation: `Commande.MtHT_Lignes`/`MtHT_Port`/`MtHT_Total`/`TotalTVA`/
  `TotalTTC` (395/0/395/79/474 — Lignes+Port=HT, HT×1.20=TTC, checks out
  against the real screen).
- Temps passé: **sum of `Intervention.TempsPasse`** across every step for
  the job, not a `LigCde`-level field (`CumulTpsTechnique` was tried first
  and was `00:00:00`, not the screenshot's `00:00:20` — the real per-step
  values were `00:00:20` + `00:00:00`, summing to the right answer).
- **Full step history**: every `Intervention` row for the `LigCde` (not
  just the latest), `ORDER BY NoInt_interv DESC` so index 0 matches the
  screenshot's own most-recent-first order. The step grid's "intervention"
  column is `TypeLibelle`; each step's own comment is `Intervention.Commentaire`
  — row 1's comment text matched the screenshot's "Commentaires
  techniques" panel exactly, confirming that panel is (at least in this
  UI) just the one populated step comment, not some separately-maintained
  aggregate field.

**Skipped, deliberately, for this pass**: "Garantie Refusée à l'arrivée" +
its "Motif" field — both candidate text columns (`motif refu dbal`,
`MOTIF REFU REP`) were empty on the sample, and none of the
`SGRefusee*`/`SGConstructRefusee` Boolean candidates were `True` either, so
which one is real couldn't be disambiguated without a populated example.
"Accessoires" — no matching field found anywhere in `LigCde`'s 324 columns;
the box was empty in the sample too. The "Dossier" button is a 4D
form-navigation affordance, not data.

### New bug found and fixed along the way: `SELECT COUNT(*)` panics exactly like a Boolean column

The first version of the new "which Boolean flags are set" helper
(`probe_boolean`) used `SELECT COUNT(*) AS N FROM LigCde WHERE ... AND
"<col>" = True` — reusing `COUNT(*)`, never tried anywhere else in this
file before. It panicked with the *exact* documented Boolean-column error
("Failed to retrieve data type from ODBC driver. The SQLLEN could not be
converted to a 16 Bit integer...") even though the column itself was never
selected, only filtered on (the already-proven-safe shape). Pinpointed via
a step-by-step trace through `reman_get_intervention`'s new query sequence
(every plain-column `SELECT` tested fine in isolation; only the `COUNT(*)`
shape reproduced the panic, every time, reliably). Whatever type metadata
the 4D driver reports for an *aggregate* result column apparently hits the
same `TextRowSet` overflow as a Boolean column — a second, previously
undiscovered trigger for the same underlying `odbc-api` limitation.
**`run_query`'s doc comment now warns against `COUNT(*)`/any aggregate,
not just Boolean columns.** Fixed by having `probe_boolean` select the
row's own PK and check non-emptiness instead — the same non-aggregate
shape already used by `reman_search_interventions`'s `warranty_ids`
lookup. Verified live, stable across repeated runs after the fix.

### Also refactored: shared `technician_name_map()`

The `(TechDernInterv, NomDernierTech)` id→name map — previously duplicated
inline in both `reman_analytics` and `reman_list_technicians` — was
factored into a shared private `technician_name_map()`, now also used to
resolve each step's technician in `reman_get_intervention`. Same known gap
as before: an id that was never anyone's *last* touch (e.g. `3389`,
confirmed via this exact job's real step history — `NomDernierTech`
resolves `3569` to `"Gabhy Kiba"` but not `3389`, even though the real
screenshot shows that step as `"Archimed Said"`) falls back to `None`/
`"Tech #<id>"`, not a regression.

**Frontend**: `Reman.tsx`'s expanded job panel gained the new identity
fields, an outcome-badge row (reusing the existing
`reman.analytics.outcome_*` i18n keys where the concept matches — Réparation/
Vente/Echange/ND/RAS — plus one new `outcome_avance` key), a Montants
block, and a new `StepHistory` component: each step is its own collapsible
row (same expand/collapse idiom as the job row itself, "one level deeper"),
showing its own comment only if it has one.

## First write path: adding an "Etape de réparation" step (2026-08-03)

REMAN access had been strictly read-only for the app's entire history until
this. Requested directly: "we are going to add a feature to modify/add
content to the db... first i'll add that with 4D so you can see how db
changes so we can reproduce that." Scope deliberately narrow — only
`TypeCode = 'ER'` ("Etape de réparation"), not a general-purpose step
writer. Other `TypeCode` transitions almost certainly have their own
undiscovered side effects (see the `Nettoyage` finding below) and are out
of scope until separately investigated the same way this one was.

### Investigation method

Before writing any Rust, the real behavior was reverse-engineered entirely
through live before/after diffs — first watching the user add steps
through the actual 4D client (as two different real technicians, on two
different jobs, with and without a comment), then two raw-SQL tests run
directly against 4D (bypassing the 4D client entirely) to separate what the
*database* enforces from what's merely 4D client-side business logic. All
manual/raw-SQL testing used the Node `odbc` package directly (a throwaway
script, not committed) — deliberately chosen because it doesn't hit the
`odbc-api`/Rust-specific `TextRowSet` panics documented throughout this
file, so it was safe to use for broad exploration (including `SELECT *`)
without tripping them.

**Confirmed via manual adds in the real 4D client** (job `17473101` /
`NoInt_Ligcde = 39500`, technician "Gabhy Kiba" = id `3569`; a second test
on job `17470701` / `NoInt_Ligcde = 39480`, technician "Phil Wood" = id `68`):

- Adding a step creates one `Intervention` row and updates
  `LigCde.DernièreInterv`/`DateDernInterv`/`TechDernInterv` to mirror it
  (confirmed: these stay unchanged if the new values happen to match what
  was already there — e.g. a second `ER` add right after the first left
  them untouched — so they're unconditionally recomputed every time, not
  conditionally patched), plus `LigCde.heureModif` (generic audit
  timestamp, bumped every time).
- For the one specific transition tested (`NET` "Pièce Nettoyée" → `ER`),
  `LigCde.Nettoyage` (Boolean) flipped `true → false`. A second `ER → ER`
  add left it `false → false`. Both are consistent with **"adding an ER
  step always sets `Nettoyage = False`"**, unconditionally — the rule this
  implementation applies. This is presented as one concrete example of a
  broader, unverified category: other `TypeCode`s likely have their own
  bespoke `LigCde` side effects nobody has tested yet. Don't assume this
  implementation's side-effect list is complete for any step type other
  than `ER`.
- `NomDernierTech` did **not** update on either manual add (even though
  `TechDernInterv` did both times) — refines the earlier-documented
  resolution gap for technician id `3389`/"Archimed Said" (see "Correction:
  technician names resolved from LigCde.NomDernierTech" above): it's not
  simply "last touch," more likely only updates on whatever step actually
  *closes* a job. Not chased further — irrelevant here since this write
  path never touches `NomDernierTech`.
- **The id counter (`NoInt_interv`) is a single global sequence shared
  across every job and every technician** — confirmed by the Phil Wood
  test on a completely different job continuing the exact same numeric
  sequence as the Gabhy Kiba test. Gaps are real and expected: a step added
  on job A, then job B, produced ids `101379` then `101381` — `101380`
  never existed anywhere, consumed by unrelated live 4D activity in that
  window. This is a live, contested, multi-writer counter; never assume a
  computed "next" value is safely ours until the write actually succeeds.

### Two raw-SQL tests against the live database directly

**Test 1 — what does a bare `INSERT` actually do, with no id supplied?**
`INSERT INTO Intervention (NoIntLigcde, NoIntTechn, "Date", TypeCode,
TypeLibelle, Commentaire, HeureInterv) VALUES (...)` (omitting
`NoInt_interv`) succeeded, but the new row's `NoInt_interv` defaulted to
`0` — proving id assignment is **not** a database-level auto-increment,
it's 4D client-side logic invisible to SQL. Same story for
`NoIntEtapeEnCours` (defaulted to `0` instead of a real incrementing
value — manual adds showed this field *also* increments by exactly 1 per
step, e.g. `63686` → `63687`, so it's presumably another 4D-client-managed
counter; not reproduced or needed here) and the workstation-metadata
fields `NomMachine`/`Possesseur` (already documented elsewhere in this file
as 4D session metadata, never business data — defaulted to empty via raw
SQL, as expected, since an ODBC connection has no "workstation" concept).
**Critically, `LigCde` was completely untouched** by the raw insert — none
of `DernièreInterv`/`DateDernInterv`/`TechDernInterv`/`Nettoyage` updated.
Confirms none of the side effects observed via the 4D client are database
triggers; they have to be replicated by hand.

The stray `id = 0` row this test created briefly confused the real 4D
client's own UI when the user tried to delete it there (plausibly because
4D treats `0` on an auto-numbered field as "unsaved/new," not a real
existing record) — removed instead via the same raw-SQL path
(`DELETE FROM Intervention WHERE NoInt_interv = 0 AND NoIntLigcde = 39500`),
which worked cleanly. Confirms SQL deletes are a reliable fallback even
when the 4D client itself gets confused by SQL-originated data.

**Test 2 — does `NoInt_interv` actually enforce uniqueness?** This is what
makes a "read max, write max+1, retry on conflict" allocation strategy
safe or not. Using an obviously-fake negative id (`-999001` — 4D's own
counter only ever produces positive values, so this can never collide with
anything real) confirmed unused first (checked `Intervention` and
`DetailInterv`), then inserted twice with different `Commentaire` values.
**The second insert failed outright** (`Failed to execute statement`); only
the first row's content survived — no silent overwrite, no duplicate.
Cleaned up immediately after. This is the one fact that makes the retry
strategy below trustworthy: a collision is a catchable error, never silent
corruption.

### Implementation (`src-tauri/src/reman.rs`)

- **`run_write(sql)`** — new sibling to `run_query`, for
  `INSERT`/`UPDATE`/`DELETE` only. `run_query` can't be reused: it treats
  `conn.execute()` returning `Ok(None)` (the *normal* outcome for a
  write — no rows come back) as an error, since it always expects a result
  set. `run_write` just treats "the driver didn't reject the statement" as
  success.
- **`next_intervention_id()`** — deliberately `SELECT NoInt_interv FROM
  Intervention ORDER BY NoInt_interv DESC LIMIT 1`, not `MAX(NoInt_interv)`.
  `COUNT(*)` was already proven (see `run_query`'s doc comment, and the
  job-detail-view section above) to panic exactly like a Boolean column —
  an aggregate result column apparently hits the same `TextRowSet`
  overflow — so `MAX()` is untrusted until proven otherwise, and there's
  already a proven-safe non-aggregate shape used throughout this file for
  "latest row" lookups.
- **`add_repair_step(ligcde_id, tech_id, comment)`** — up to
  `MAX_ID_RETRY_ATTEMPTS` (5) attempts: read the next id, try the insert;
  on success, immediately run one `UPDATE LigCde SET "DernièreInterv" =
  'Etape de réparation', DateDernInterv = ..., TechDernInterv = ...,
  Nettoyage = False, heureModif = ... WHERE NoInt_Ligcde = ...` to
  replicate the observed side effects; on failure, loop (a fresh
  `next_intervention_id()` read picks up whatever else has landed in the
  meantime). Not wrapped in an explicit transaction — untested whether 4D's
  SQL engine over ODBC supports one at all; if the `UPDATE` somehow fails
  after a successful `INSERT`, the new step exists but its `LigCde` mirror
  wasn't applied — recoverable (retry, or a real 4D user's next own edit
  will recompute those fields anyway), not silent corruption, so accepted
  as a known v1 limitation rather than solved now.
- **`reman_add_repair_step(ligcde_id, tech_id, comment)`** — the
  `#[tauri::command]` wrapper; on success, returns a fresh
  `reman_get_intervention` result rather than making the frontend do a
  second round trip.
- Verified live end-to-end (`cargo test`, real job `39500`, tech `3569`):
  the returned detail showed the new step with the right `TypeCode`/
  `tech_id`/comment, `Nettoyage` correctly became `false`, then the test
  deleted its own row and restored every mirrored `LigCde` field to its
  exact prior value, verified by re-reading them back — zero permanent
  trace. **One thing this session could not verify before now**: whether
  `odbc-api`'s `conn.execute()` (used by both `run_write` and, transitively,
  every existing `run_query` call) panics for a Boolean-column `UPDATE` the
  same way it does for a Boolean-column `SELECT`. It does not — confirmed
  live via this same test (`UPDATE ... SET Nettoyage = False` inside
  `add_repair_step` executed and was later verified restored correctly) —
  a write statement returns no result set to introspect, so the
  `TextRowSet` metadata path that panics for Boolean `SELECT`s and
  `COUNT(*)`/aggregates never runs for writes at all.

### Frontend (`src/pages/Reman.tsx`)

New `AddRepairStepForm`, rendered inside `InterventionRow`'s expanded
panel next to `StepHistory`. Reuses the exact same claimed-technician
identity `MyJobsTab` already established (`useSession()`'s `remanTechId`/
`remanTechName`) — no new identity plumbing. No claim yet → a hint pointing
at "My Jobs" instead of a form. Claimed → an optional comment textarea (4D
itself treats a blank comment as fine, confirmed via the "no comment" manual
test) plus an "Add" button showing who it'll be attributed to. On success,
the returned `InterventionDetail` replaces the row's local `detail` state
directly — the new step and updated `statut` appear immediately, no extra
fetch.

## Second write path: closing a job as "Réparation" (2026-08-03)

Follow-on from the `ER` write above: the user closed job `17473101` for
real through the 4D client using the "Réparation" outcome, specifically so
it could be before/after diffed. Same narrow-scope discipline as the `ER`
write — only `TypeCode = 'R'`, not the other closing outcomes (`Vente`,
`Echange Standard`, `ND`, `RAS`, ...), which almost certainly have their
own side effects (proven below: outcomes aren't interchangeable). This is
a bigger, harder-to-reverse action than adding a step — it permanently
flips `Soldée = True` and computes a real warranty date.

### Confirmed live

**New `Intervention` row**: same shape as the `ER` row, plus `NiveauPanne`
now populated (`TypeCode = 'R'`, `TypeLibelle = 'Réparation'`).

**`LigCde` side effects** (12 fields changed in the real diff):
- `"Soldée"` → `True`.
- `"DernièreInterv"`/`DateDernInterv`/`TechDernInterv` mirror the new step,
  same pattern as the `ER` write (didn't show as "changed" in the real
  diff only because they already held the right values from an earlier
  `ER` step that same day — confirmed still unconditionally recomputed,
  not conditionally skipped).
- **`NomDernierTech` → the technician's real name.** New finding: this
  field only updates on the step that *closes* a job, not on every step
  (both earlier `ER` adds left it unchanged). Resolves the resolution gap
  documented earlier in this file for id `3389`/"Archimed Said" — that
  technician was never anyone's *closing* touch in the sampled window, not
  simply never their "last" touch. This is the first write in this file
  that needs a technician's **name**, not just their id.
- `Nettoyage` → `True` — confirmed the *opposite* direction from the `ER`
  write (which sets it `False`). Asked directly what this flag actually
  means: not "is a cleaning step currently active," but a QA/tracking flag
  — closing flips it `True` so "the direction can track that... and tell
  technicians to follow these steps properly." Reproduced by direction only
  (`ER → False`, `close-as-Réparation → True`), business meaning not
  modeled further — proof outcomes aren't interchangeable, the reason the
  `ER` write never generalized to other `TypeCode`s.
- `CausePanne` → confirmed **positional** mapping, verified against the
  actual code a real selection produced (not assumed from the dropdown's
  visual order, which turned out fine here but was flagged as a real risk
  first): `1`=Usure normale, `2`=Casse, `3`=Surtension, `4`=Chute de
  liquide, `5`=Oxydation anormale. `0` = not set (never write it). A `6`
  exists in historical `LigCde` data but isn't reachable from the normal
  technician dropdown — not exposed.
- `SemaineGarantie` → warranty-expiry code. Confirmed 2-year warranty
  (stated directly by the user) matching a real "Fin de Garantie: 2028/31"
  screenshot against the observed value `202831`. Formula: today's ISO
  week with the year advanced by 2 (`(iso_year + 2) * 100 + iso_week`) —
  deliberately not date-arithmetic (add 730 days, re-derive the ISO week),
  which can drift a week at ISO year boundaries.
- `"HeureLigSoldée"` → now (accented column, needs quoting).
- `DerInterv_technique`/`DateDerInterv_technique`/`HeureDerInterv_technique`
  → a *second*, separate "last technical intervention" mirror, only
  populated on close (was empty/null before). Not chased further than
  reproducing the observed values.
- `ServiceTechnique` → mirrors the job's current `Type_Service` — read
  fresh at write time in `close_job_as_repaired`, not assumed/hardcoded.
- `heureModif` → **discovered live to be uncontrollable**: both the
  original close and this implementation's own verification test tried to
  set it to an explicit value, and both got silently overridden to the
  real current time instead. Reads as a database/4D-managed "row last
  touched" stamp that ignores whatever an `UPDATE` explicitly asks for.
  Harmless (purely cosmetic audit field) but worth knowing before assuming
  any write can control it.

**Mandatory fields, confirmed via direct clarification, not inferred**:
`Cause panne` (1–5, mapping above) and `Niveau panne` (1–3, "how difficult
the fault was" — an arbitrary technician judgment call, not a further
enum) are both required in the real 4D form to close as Réparation.

### Implementation (`src-tauri/src/reman.rs`)

`close_job_as_repaired`/`reman_close_job_as_repaired` — same shape as
`add_repair_step`/`reman_add_repair_step` (same `next_intervention_id()`
retry-on-conflict allocation, same `run_write`), extended with the extra
mandatory fields and the larger `LigCde` update. Validates `cause_panne`
∈ `1..=5` and `niveau_panne` ∈ `1..=3` server-side, not just via the
frontend's `<select>`s.

**`InterventionDetail` gained `pub soldee: bool`** (an 8th `probe_boolean`
call in `reman_get_intervention`, alongside the existing 7 — still one
on-demand detail fetch, not a hot path) so the frontend can hide both write
forms once a job is actually closed.

Verified live end-to-end (`cargo test`, real job `17470701` /
`NoInt_Ligcde 39480`, confirmed open beforehand): the returned detail
showed `soldee: true`, the right `statut`, and `Nettoyage` correctly
became `true`; the warranty code actually written to `LigCde` was
cross-checked against the same formula computed independently in the test
(not pinned to the historical `202831` anchor, which stopped matching
between two test runs simply because real time had moved into a new ISO
week — a flaw in the test's first draft, not the formula); cleanup deleted
the test row and restored all `LigCde` fields to their exact prior values
except `heureModif` (see above — provably not restorable via `UPDATE`,
excluded from the restore assertion rather than treated as a failure).

### Frontend (`src/pages/Reman.tsx`)

New `CloseAsRepairedForm`, same identity pattern as `AddRepairStepForm`
but also needs `remanTechName` (for `NomDernierTech`). Two `<select>`s
(Cause panne — 5 literal French options, kept untranslated in both locales
per the same precedent as every other REMAN-native label like
`queue_open`; Niveau panne — `1`/`2`/`3`), an optional comment, and a
"Close" button. Both `AddRepairStepForm` and `CloseAsRepairedForm` now
render only when `!detail.soldee` — neither write action is offered on an
already-closed job.

## Connection exhaustion fixed: one connection per operation, serialized app-wide (2026-08-03)

Closing a job through the new write feature produced a real error:
`ODBC emitted an error calling 'SQLConnect'... Access denied. No more
connections possible.` Confirmed live (direct DB read) that the write had
already fully succeeded before the error — every field exactly right,
including the new `Intervention` row. The error came from the *second*
half of the command chain.

**Root cause**: every single `run_query`/`run_write` call opened its own
fresh ODBC connection, never reused. `reman_get_intervention` alone runs
~15 queries (head, steps, technician map, client, address, marque, 8
`probe_boolean` calls, lines) → 15 connections. A "close job" click chains
the write (~4 connections) and a `reman_get_intervention` refresh
afterward (~15) → **~19 connections for one click**. With up to 15
concurrent BRAXON instances, this was always going to hit whatever
connection cap 4D enforces — this was just the first time it actually did.

**Two directions discussed, one rejected**: writing to BRAXON's own
Postgres first and 4D second (an eventually-consistent "local-first"
pattern) was considered and explicitly rejected. 4D is the actual source
of truth for REMAN data, and the entire write feature above was built by
carefully reverse-engineering 4D's *own* side effects specifically so
BRAXON's writes stay consistent with it — decoupling "user sees success"
from "4D confirmed it" would undermine that and add real complexity
(reconciliation, retry, staleness) to solve a problem that was actually
just connection *count*, not connection *reliability*.

**Fix**: `with_reman_connection`, a single choke point replacing every
direct `environment()?.connect(...)` call in the file:

```rust
fn with_reman_connection<T>(f: impl FnOnce(&Connection<'static>) -> Result<T, String>) -> Result<T, String> {
    static LOCK: OnceLock<std::sync::Mutex<()>> = OnceLock::new();
    let _guard = LOCK.get_or_init(|| std::sync::Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let env = environment()?;
    let conn = env.connect(DSN, REMAN_UID, REMAN_PWD, ConnectionOptions::default())
        .map_err(|e| format!("REMAN connection failed: {e}"))?;
    f(&conn)
}
```

Acquires a process-wide lock (only one logical 4D operation in flight at a
time from this instance, however many concurrent commands are requested),
opens exactly one connection, and hands it to `f` — every query inside
reuses that same connection instead of opening its own. A plain
`std::sync::Mutex`, not `tokio::sync::Mutex`, is correct: every call site
is already fully synchronous inside one outer `spawn_blocking` with no
`.await` inside the critical section. Poison-tolerant (`unwrap_or_else`
recovers from a poisoned lock) since the guarded state is just `()` — a
prior panic (e.g. the documented Boolean-column `TextRowSet` panic) can't
leave any real invariant inconsistent, so there's no reason to let a
poisoned lock permanently wedge all future 4D access.

`run_query`, `run_write`, `probe_boolean`, `technician_name_map`, and
`next_intervention_id` all gained a `conn: &Connection<'static>` first
parameter and stopped connecting themselves. `reman_get_intervention`'s
body was extracted into a standalone `get_intervention_sync(conn, id_num)`
so the write commands could call it directly on their *own* already-open
connection — `reman_add_repair_step` and `reman_close_job_as_repaired` now
do the write **and** the refresh in one `with_reman_connection` block, one
connection, one lock acquisition, collapsing the ~19-connection "close a
job" flow down to exactly **1**. Every other command
(`reman_search_interventions`, client/stock/achat searches,
`reman_analytics`, `reman_list_technicians`, the live halves of
`reman_forecast_open_queue`/`reman_actual_outcomes_today` inside
`cached_or_refresh`, and the nightly ETL's `hist_sql`/`closed_sql` pair)
got the same mechanical wrap — no logic changes, purely threading `conn`
through what was already there.

Verified live: `env.connect(` now appears in exactly one place in the
whole file (grepped to confirm). Two live tests (temporary, removed after)
against a dynamically-found currently-open job (both prior test jobs this
session — `17473101`, `17470701` — are now genuinely closed for real,
proving hardcoded test-job ids go stale) confirmed a plain read still
works and a full `add_repair_step` round trip (write, verify, delete,
restore) still behaves identically post-refactor.

**Deliberately not done**: serializing 4D access *across* all 15 BRAXON
instances (e.g. via a Postgres-coordinated lock, same claim pattern as the
live cache). Per-instance serialization alone is already a ~19x reduction
in peak connections per instance; only worth the added complexity of a
distributed lock if this turns out to be insufficient in practice.

## Real incident: BRAXON's id allocation wedged 4D's own server-side counter (2026-08-03)

Hours after the write feature shipped, a real technician hit a real 4D
error trying to transfer job `17472501` to Service Commercial:
`La clé d'index existe déjà` / `Clé dupliqué: 101419 sur le champ
NoInt_interv`. Then it got worse — reported directly: "i can no longer
transfert anything to service commercial", confirmed across multiple PCs,
and every subsequent attempt failed on the exact same id (`101419`) rather
than different ones. Live-diagnosed while it was happening (not
reproduced/guessed after the fact): the real `MAX(NoInt_interv)` had
stopped advancing entirely — no successful save had landed anywhere in the
shop for ~10 minutes, across multiple technicians on multiple machines.

**Root cause, more serious than the collision-retry logic already accounted
for**: 4D maintains its own **persistent, server-side "next auto-number"
counter** for the `Intervention` table, entirely separate from the table's
actual `MAX(NoInt_interv)`, and it only advances when 4D's *own* save flow
succeeds. BRAXON's writes go in via raw SQL, bypassing that flow
completely — so every id BRAXON ever claimed was invisible to 4D's
counter. The first time 4D's counter naturally reached a number BRAXON had
already taken, 4D's save failed — and because the counter doesn't advance
on a *failed* save either, it kept proposing that exact same doomed number
forever, blocking every subsequent save shop-wide until something outside
BRAXON's reach resets it (most likely: restarting the 4D **server**
process, not just a client — this counter is server-side state, not
something visible or resettable via SQL/ODBC).

This is a stronger finding than the "read max, write max+1, retry on
conflict" design worked out earlier: that logic is safe *for BRAXON's own
writes* (a collision with itself, or with 4D, produces a catchable error,
confirmed via the earlier duplicate-id test), but it does nothing to
protect **4D's own client** from colliding with an id BRAXON silently
claimed — 4D has no retry, and unlike BRAXON's own error handling, a
wedged 4D counter doesn't self-heal.

**Fix**: `BRAXON_ID_RANGE_START = 900_000_000`. `next_intervention_id` now
only ever looks at (and allocates within) `NoInt_interv >= 900000000` —
far above anything 4D's own client will reach (it was at ~101,420 as of
this incident; even at a wildly generous 1000 real interventions/day this
shop would take millennia to reach this). This doesn't just reduce the
collision window, it makes the entire failure class structurally
impossible: BRAXON and 4D's own counter are never competing for the same
number at all, ever again. Confirmed live (read-only, deliberately no
write performed while the shop was mid-incident): the new range is
currently completely empty and BRAXON's next computed id would be
`900000001`, nowhere near 4D's wedged `101419`. A full write-based
round-trip re-verification (matching the rigor of every other write in
this file) is still owed once the shop's 4D server is confirmed healthy
again — deliberately deferred rather than adding another write during an
active incident.

**Lesson for any future direct-SQL write into a table 4D's own client also
writes to**: assume 4D maintains its own hidden, persistent, non-self-healing
allocation state for *any* auto-numbered field, not just this one. The
only fully safe pattern found so far is a disjoint id range, not
tighter collision handling.

## Correction: the first "resolved" read was wrong — recurrence, not recovery (2026-08-03)

An earlier version of this section claimed the incident was resolved after
seeing real rows `101419`/`101420` on job `17469101` and `MAX(NoInt_interv)`
sitting at `101420` with no errors. **That was a misreading, caught by the
person who actually did the write**: those two rows were not a native 4D
save clearing the counter — they were BRAXON's own write feature
(`add_repair_step` / `close_job_as_repaired`, raw SQL insert) landing on
job `17469101` again, tech `3569` (Gabhy), i.e. **the exact same root
cause recurring**, not the fix. Proof: checked 30 minutes later and
`MAX(NoInt_interv)` was still `101420` — zero saves had succeeded anywhere
in the shop the entire time, across multiple technicians. The block was
never actually lifted; BRAXON's raw insert just happened to be invisible
to 4D's counter the same way the original collision was, except this time
it collided with *itself*.

**Real fix, once correctly diagnosed**: since 4D's counter is not reachable
via SQL/ODBC at all (confirmed, no Design/structure access available),
the only usable lever was to free the exact slot the counter was stuck
proposing. Snapshotted both rows in full first (`scripts/
_snapshot-101419-101420.json` — every non-Boolean column, so the real
repair documentation Gabhy entered isn't lost), then deleted `Intervention`
rows `101419` and `101420` (`DELETE FROM Intervention WHERE NoInt_interv
IN (101419, 101420)`), explicitly confirmed by the user first given the
destructive/production nature of the action. Verified live immediately
after: a real native 4D save landed cleanly at `101421` (tech `2403`,
`TES`/Transfert Service commercial) within seconds of the delete — the
counter advanced past the stuck value on its own the next time 4D's client
tried, exactly as expected once the real conflicting row was gone. The
shop-wide block is confirmed over this time — a genuine new save
succeeded, not just an absence of errors.

**Lesson, sharper than the first pass**: a wedged 4D auto-number counter
does not clear itself just because *a* row happens to exist at that
number — it clears when 4D's *own* save flow succeeds there, which
requires the slot to actually be free from 4D's perspective. Any row
occupying that slot, however it got there (BRAXON, a stray manual insert,
anything not routed through 4D's native save), keeps the block alive.
Freeing the slot (delete/renumber) is a legitimate recovery lever precisely
because 4D's own retry logic is dumb but harmless: it keeps proposing the
same number until a save at that number succeeds, and a doomed retry
against an occupied slot fails exactly the same way it already was —
there's no way to make a stuck counter worse by leaving it stuck, only by
occupying the slot it wants.

**`BRAXON_ID_RANGE_START` is now more clearly the actual fix, not
optional.** Today's whole detour — two full rounds of the same collision,
one deliberately caused by testing the "add a step into the gap" idea —
happened entirely because the currently-running BRAXON instance was still
using the pre-fix `next_intervention_id` (plain `MAX+1`, no range floor).
Root cause, once precisely traced: the write feature has never been in an
official release (nothing this session has ever been committed), and only
ran on one dev machine — but since 4D's auto-number counter is shared
shop-wide, one dev machine's bad writes were enough to jam saves for
everyone. `17470701` (a different job/`LigCde`, tested and closed earlier
the same day) was a red herring raised in conversation — its own crash was
the separate, already-fixed connection-exhaustion bug; the id-collision
trigger was specifically the `17469101` close.

**Deployed the fix (2026-08-03, same incident)**: confirmed with the user
this write feature has only ever run in `npm run tauri dev` on this one
machine, never as an installed release, so no git commit/tag/push was
needed to "deploy" it — `cargo build --bin braxon` with
`BRAXON_ID_RANGE_START` already in the source was sufficient, and no
`braxon.exe` process was running to go stale. Confirmed via a real (not
round-trip) test write afterward: `add_repair_step` + `close_job_as_repaired`
against job `17469101` allocated ids `900000000`/`900000001` — the fix
works as intended.

**Then used the now-fixed feature to restore what was deleted**: re-ran
`add_repair_step`/`close_job_as_repaired` for job `17469101` using the
exact content captured before deletion (technician comment, `CausePanne`,
`NiveauPanne`), landing at `900000000` (ER) / `900000001` (R). Verified
live: `LigCde`'s fields were untouched by any of this (`Soldée`,
`CausePanne`, `SemaineGarantie`, `NomDernierTech` all survived the original
delete, as expected since `close_job_as_repaired` writes them onto
`LigCde`, not `Intervention`) and the job's latest-step display, which had
regressed to a stale "Pièce Nettoyée" after the delete, now correctly
reads "Réparation" again. This whole restore only became possible/safe
*because* the range fix was already active — done as a real write through
the fixed feature, not a manual SQL patch, doubling as its first real
production validation.

This remains the actual fix — deploying an official release (git commit +
tag + push, triggering the auto-updater for the shop's other ~14 PCs) is
still a separate, not-yet-taken step, needed before other technicians can
use the write feature at all.

## Revenue analytics diffed against 5 months of real shop reports (2026-08-04)

The rough revenue KPI/chart added to `reman_analytics` was checked against
the shop's own real monthly "Rapport de production" PDFs (user-supplied,
Mar-Jul 2026), not just the single July report used to build the first two
fixes (REE exclusion, HT not TTC — see above). Diffing all 5 months at once
surfaced a third, much larger issue that a single month's data didn't make
obvious:

**`Soldée = True` alone overcounts, and inconsistently by month** — March
was the tell: 535 jobs in our cohort vs. the report's 473, a 13% gap far
bigger than any other month (April was only 2% off). A job can be
internally marked repaired (`Soldée = True`) without having actually
shipped back to the client yet — this is a *production* report, measuring
what shipped, not what's sitting internally closed. Fixed by also
requiring `Commande.StatutDossier = 'EXPEDIE'`. Confirmed live: this
brought March's cohort from 535 down to 469, a 4-job gap against the
report's 473 — closing 94% of that month's gap. Also confirmed live
(2026-08-04) that combining `Soldée = True` (same table, equality) +
`DateDernInterv BETWEEN` (same table, range) + `StatutDossier =` (joined
table, equality) all in one query returns the exact same result as the
safe split-and-intersect pattern used elsewhere in this file for Boolean
columns — didn't just assume it from the individually-confirmed-safe
pieces.

**Result across all 5 months, with all three fixes (REE excluded, HT not
TTC, `StatutDossier = 'EXPEDIE'`) applied**:

| Month | Real volume | Ours | Real montant (HT) | Ours | Diff |
|---|---|---|---|---|---|
| Mars | 473 | 469 | 111 590,0 € | 114 983,0 € | +3 393,0 € (3,0%) |
| Avril | 404 | 402 | 87 292,5 € | 90 377,5 € | +3 085,0 € (3,5%) |
| Mai | 322 | 322 | 78 065,0 € | 77 520,0 € | -545,0 € (0,7%) |
| Juin | 396 | 392 | 101 546,5 € | 102 946,5 € | +1 400,0 € (1,4%) |
| Juillet | 405 | 394 | 101 486,5 € | 101 856,5 € | +370,0 € (0,4%) |

Job counts are now within 0-11 of the real figures across all 5 months
(down from up to 62 before this fix), and revenue is within 0.4%-3.5%
(down from 25% for July before the REE/HT fixes). March and April still
carry a real ~3% revenue gap despite their job counts being almost exact —
i.e. a handful of specific jobs' amounts, not the cohort definition, are
now the likely remaining source. Not chased further — "rough" was the
explicit target, and three real, verified fixes (not guesses) got this
from unusable (25-off) to a small single-digit-percent gap. Revisit with
whoever produces these reports if exactness ever becomes a requirement.

Also checked and ruled out as a cause of the residual gap:
`LigCde."MtAvoir_Lié"`/`"NoAvoir_lié"` (linked credit note amount/number) —
completely empty (zero nonzero values, zero even populated) across the
entire July cohort. Refunds/credit notes exist as a concept in the schema
but weren't a factor in any of the checked months.

### Explained: the weekly reports have a structural cutoff the monthly ones don't

Pushed further per direct request ("check weekly data instead") — diffed 5
of the weekly "Rapport de production SNN" PDFs (S3, S7, S11, S15, S19,
spread Jan-May 2026) against the same live query, full job-by-job for the
smallest (S19, 84 real jobs). Found the same small ~2-3% band in every
usable week (S28's window was mis-derived from ISO week math and thrown
out — a 30% gap there was a calendar bug on this end, not a data issue)
and one concrete new case: job `17193301` (a real `R`/Réparation outcome)
has a blank `StatutDossier` — not `EXPEDIE`, not the `NULL` sentinel
`reman_analytics` already handles, genuinely empty — and gets excluded by
the current filter even though it looks like a legitimately shipped job.
It carries `HT = 0` though, so it only explains a job-count-off-by-one,
not any of the euro gap.

**Root cause, confirmed directly by the person who produces these
reports**: the weekly export runs Fridays at 16:00, but the shop closes at
16:30 — every single weekly report structurally misses the last half hour
of Friday's activity by construction. That's exactly consistent with what
was observed: a small, consistent handful of jobs and euros unaccounted
for in every week, no single bad row, no fixable query bug. The monthly
reports don't have this specific cutoff problem, which is why July's
monthly figure (0.4% off) is the more trustworthy validation than any
single week. Decision: leave the revenue analytics as-is — the three
verified fixes above are real and correct; this last stretch is a report
tool export-timing artifact, not something to chase further in BRAXON.

## Technician roster (roles + active/inactive) and two leaderboard identity fixes (2026-08-04)

Added an admin-only roster page (requested directly, "hidden for everyone
else but me") to assign roles — technicien, commercial, responsable
technique, responsable de site, freely combinable — to each real
technician id, and mark people who've left so they stop appearing in
current-facing views. Lives entirely in BRAXON's own Postgres
(`"RemanTechnicianRoster"`, tech_id primary key, one boolean column per
role plus `is_active`); 4D is untouched, has no concept of any of this.
Gated on `currentUser.remanTechId === '3569'` (Gabhy Kiba) both in the UI
(the tab doesn't render for anyone else) and server-side in
`reman_list_roster`/`reman_update_roster_entry` (reject any other
`requesting_tech_id`) — a client-side hide alone isn't a real boundary.
`reman_list_technicians` and `reman_analytics`'s technician leaderboard
both now exclude ids marked inactive; a person's historical closed jobs
are completely untouched by any of this, only current-facing pickers/
charts change.

Testing this surfaced two long-standing identity gaps in the leaderboard,
both resolved the same day per direct clarification:

**`3389` finally resolves — Archimed Saïd, logistics, not a repair
technician.** This id has been a documented unresolved case since
2026-07-30/31 (see the `NomDernierTech` sections above) — it's never a
job's *last* touch, so `technician_name_map`'s `LigCde.NomDernierTech`
source never names it, and it always fell back to `Tech #3389` in the UI.
Confirmed directly: he ships/receives units to/from subcontractors and
hands off to the subcontractor's own closing technician, so he's
structurally never the final touch on a job — this isn't a data gap that
will ever close on its own. Fixed with a manual `or_insert` fallback at
the end of `technician_name_map` (real 4D data still wins if it's ever
actually present; this only fills the gap 4D itself can't).

**Jobs closed under the generic "Superviseur" account (id `2403`) get
reattributed to whoever did that job's "En attente de validation" (VAL)
step.** Confirmed directly: this happens when the responsable technique
closes a job on someone else's behalf, not their own work — crediting it
to "Superviseur" was crediting the wrong person, not a real 4th category
of technician. `reman_analytics`'s technician-activity computation now
does a second targeted query (`NoIntLigcde IN (...)  AND TypeCode = 'VAL'`,
scoped only to jobs whose `NoIntTechn` was `2403`) and substitutes that
job's VAL-step technician wherever Superviseur would otherwise get the
credit — verified live against 20 real Superviseur-attributed jobs, all
20 had a real VAL-step technician to reattribute to. A job with no VAL
step anywhere in its history stays attributed to Superviseur — no
fallback was specified for that case, and it wasn't observed in the
sample.

## Third write path: mark a job "Attente Nettoyage" (2026-08-04)

Same shape as `add_repair_step` — no mandatory extra fields, just an
optional comment, `TypeCode = 'ATN'` / `TypeLibelle = 'Attente Nettoyage'`.
Reverse-engineered the same way as the first two write paths: tracked a
real job (`17478501` / `NoInt_Ligcde 39559`, a fresh, previously-untouched
job) through a live `add_repair_step` from BRAXON followed immediately by
a real native-4D "Attente Nettoyage" step, then diffed.

Confirmed:
- `LigCde.DernièreInterv`/`DateDernInterv`/`TechDernInterv` update to
  mirror the new step — same as ER. Whichever write (BRAXON or native 4D)
  happens *chronologically last* wins on these fields, independent of the
  two systems' very different `NoInt_interv` numbering (the BRAXON ER
  write landed at `900000002`, the native ATN write landed at 4D's own
  `101452` seconds later and correctly overwrote what the ER write had
  just set — a real side-by-side confirmation that `BRAXON_ID_RANGE_START`
  doesn't interfere with 4D's own sequencing or business logic at all).
- `NomDernierTech` stays untouched — confirmed again, same as ER: only a
  job's actual *closing* step sets it.

**`Nettoyage = False` is set on this transition, but this one is an
inference, not a directly-observed side effect** — worth flagging clearly
since every other side effect documented in this file was confirmed via a
live before/after diff. Searched 300 recent `ATN` steps for a job that had
already gone through `NET` (cleaned, `Nettoyage = True`) and then received
a *fresh* `ATN` as its latest step, to watch whether `Nettoyage` got reset
back to `False` — found zero such cases. That specific reversal (cleaned,
then sent back to awaiting-cleaning) doesn't seem to happen in real
workflow usage, so there's no historical natural experiment available and
no live case was tracked with `Nettoyage` starting `True` either (the
tracked job, `17478501`, already had `Nettoyage = False` beforehand, so the
observed transition didn't distinguish "sets false" from "leaves alone").
Implemented as `Nettoyage = False` anyway on the strength of the ER
precedent (a step *before* ATN in the workflow, confirmed to force it
false) plus the field's own stated purpose (tracking whether cleaning is
actually done, so direction can catch a skipped step) — leaving a stale
`True` on a job now explicitly marked awaiting cleaning would undermine
exactly that. Revisit if a real `NET` → `ATN` case is ever observed to
behave differently.

Verified live end-to-end (write, assert every field including the id-range
check, delete, restore) against a dynamically-found open job — same
discipline as the other two write paths, temporary test removed after.

### Frontend

`MarkAwaitingCleaningForm` — identical shape/pattern to
`AddRepairStepForm` (comment optional, submits as the claimed
`remanTechId`/`remanTechName`), rendered between the ER and close-as-
repaired forms, same `!detail.soldee` gate. Distinct button color
(`bg-warning`, vs. ER's `bg-accent` and close's `bg-success`) purely so
the three actions are visually distinguishable at a glance.

## Real bug: BRAXON_ID_RANGE_START silently broke "latest step" everywhere (2026-08-04)

Reported directly against job `17478501`: the technician added an ER step
from BRAXON, then moved the job to "Attente Nettoyage" from the native 4D
client — but BRAXON's own job-detail view kept showing "Etape de
réparation" as the status. "it should check the latest job from the time
markings right which i guess it's not."

**Root cause, traced immediately**: every place in this file that needs
"a job's current/latest step" picked it via `ORDER BY NoInt_interv DESC`
+ first-row-wins. That was a safe assumption right up until
`BRAXON_ID_RANGE_START` (900,000,000+) went live — a BRAXON-written row's
id is now *always* numerically bigger than any ordinary 4D id (~101,xxx),
so `NoInt_interv DESC` permanently ranks any BRAXON write as "the latest
step," even when a real native-4D step happens afterward with a far
smaller id. The id-range fix solved the collision problem correctly; this
downstream consequence for every *read* that relied on id-ordering as a
proxy for recency was never traced through at the time.

**This wasn't just a display bug.** The identical assumption was baked
into seven places, and grepping for `NoInt_interv DESC` found all of them:

| Site | What broke |
|---|---|
| `get_intervention_sync` | `statut`/`commentaire`/`lines` — the exact reported bug |
| `reman_search_interventions` | Status label *and* which queue a job appears in (a job's real TypeCode drives inclusion/exclusion) |
| `reman_analytics`'s `intake_sql` | Outcome classification — a closed job's repaired/NFF/etc. bucket in the pie chart and family breakdown |
| Revenue's REE-exclusion query | Whether a job's amount gets counted — the exact mechanism the earlier revenue-accuracy work depended on |
| `run_closed_job_history_etl`'s `hist_sql` | The outcome persisted into `"RemanClosedJobHistory"`, which trains the forecast panel's predicted mix |
| `reman_actual_outcomes_today` | Today's actual-outcomes comparison against the forecast |

Two sites use the same `NoInt_interv DESC` shape but were checked and
confirmed **not** affected, not just assumed safe:
- `next_intervention_id` — this one's supposed to compare raw ids (it's
  finding the highest id already used within BRAXON's own range to
  allocate the next one), unrelated to chronology. Left untouched.
- `reman_forecast_open_queue`'s bench-queue query joins `Intervention`
  only to dedupe by job — `i.TypeCode` is fetched but never actually
  read anywhere in that function (confirmed by checking, not assumed);
  family and staleness both come from `LigCde`/`ArticleMeteor` fields,
  which don't depend on which `Intervention` row got picked. No fix
  needed.
- The Superviseur → VAL reattribution query (see above) is scoped to
  `TypeCode = 'VAL'` only, and BRAXON has no VAL-writing feature — every
  VAL row for a job is native-4D, so plain `NoInt_interv` ordering among
  them is still internally consistent. Left as-is, flagged as fragile if
  BRAXON ever gains a VAL write path.

**Fix**: `is_more_recent_step(date_a, heure_a, id_a, date_b, heure_b,
id_b)` — a shared helper comparing actual chronological time (`"Date"`
normalized via the existing `to_ymd`, then `HeureInterv`, both of which
sort correctly as plain strings) with `NoInt_interv` demoted to a
tiebreaker for genuinely-identical timestamps, not the primary sort. Every
affected query now selects `i."Date"`/`i.HeureInterv`/`i.NoInt_interv`
alongside whatever it already fetched, and the "first row wins" dedup
became "replace the stored row whenever a strictly more recent one shows
up." The SQL's own `ORDER BY NoInt_interv DESC` is left in place at each
site (harmless, no longer trusted) rather than removed, to keep the diffs
minimal.

Verified live against the exact reported case: job `17478501`'s `statut`
now correctly returns `"Attente Nettoyage"` (previously `"Etape de
réparation"`), confirmed via a temporary test calling
`get_intervention_sync` directly, removed after confirming.

## "Interventions Soldées" now sorts most-recently-closed first (2026-08-04)

The Closed queue was reusing the same sort as every open queue —
`delivery_sort_key(&a.date_dern_interv)`, warranty-then-soonest-deadline —
which is meaningless once a job is closed (there's no deadline left to
race against), and produced an arbitrary-looking 50 jobs after
`.truncate(50)`. Reported directly: "WHEN I GO INTO INTERVENTIONS soldées,
it should show the latest jobs first." Fixed by giving
`InterventionQueue::Closed` its own branch in the final sort, ordering by
`delivery_sort_key(&a.date_dern_interv)` **descending** (most recent
`DateDernInterv` first) instead of falling through to the shared
open-queue ordering.

## Fourth feature: Tests & Actions Systématiques (2026-08-04 → 2026-08-05)

4D's native client refuses to close certain jobs without a checklist of
"Tests & Actions Systématiques" first — segmented by article family (an
ABS job sees the ABS checklist, a dashboard job sees Compteur, etc.).
BRAXON's close-as-repaired flow didn't enforce this at all, so a job
closed through BRAXON could skip a check 4D would have refused to let
through.

**Schema.** Selections live in `Zebra_LigCdeTest` (`NoInt_LigCdeTest` PK,
`NoInt_LigCde` FK to the job, `NoInt_ParamTest` the item id, `LibParamTest`
its label text at time of selection). `Zebra_CategTest` and
`ZebraParamTest_CategTest` define which items belong to which top-level
category. Confirmed live: **`NoInt_ParamTest` has no backing SQL reference
table** — it's a UI-list resource baked into 4D's client structure, not
queryable data (checked against all 266 of REMAN's tables). That means the
reference list (codes, labels, and their real ids) couldn't be pulled by
querying 4D directly — it had to be transcribed from the native client and
then id-verified against real write behavior.

**Id verification.** Historical `Zebra_LigCdeTest` rows were too ambiguous
to reconstruct current ids from alone — the same `NoInt_ParamTest` showed
different label text at different points in time, especially in the
general/ABS range, so guessing was refused outright. Instead: the user
selected **every single item** in the native 4D client on a real ABS job,
`17479901` (ligcde `39574`), and the resulting 62 `Zebra_LigCdeTest` rows
were diffed to resolve real ids for GENERAL (001-008), ABS (013-038 of
27), DIRECTION_ASSISTEE (062-072), and TRANSMISSION (112-120) — including
filling two gaps history alone couldn't answer (code 111's header id, and
code 120, which had never been selected by anyone before this job). The
selection screen turned out to bundle all four sections together for an
ABS job, confirming `ZebraParamTest_CategTest`: code 001/id 116 links to
categories 1, 2, *and* 3 — GENERAL is shared across every top-level
category, not ABS-specific.

One gap remains open: ABS code `039` ("Pas de défaut de communication")
did *not* appear among the 62 rows despite every other ABS item (013-038)
matching cleanly. Left as `noIntParamTest: null` in
`src/lib/testsActionsSystematiques.ts` rather than guessed — a `null` item
is simply omitted from the checklist UI (see below), not silently wrong.
COMPTEUR/MULTIMEDIA/COMODO/MODULE_ELECTRONIQUE weren't shown on this ABS
job at all (confirming the family segmentation) and remain fully
unverified — deferred explicitly by the user ("we're in august in
france, we don't have a lot of units in the shop... we'll add the other
ones later"), to be filled in once real jobs of those families move
through the shop.

The 62 test rows written to job `17479901` during verification were
deleted afterward, same cleanup discipline as every other live-write
investigation this session.

**Backend** (`src-tauri/src/reman.rs`). A disjoint safe id range,
`ZEBRA_TEST_ID_RANGE_START = 900_000_000` (own constant — separate table,
separate id space from `Intervention`'s `BRAXON_ID_RANGE_START`, so no
collision risk reusing the same numeric value), with a `next_zebra_test_id`
allocator following the same `ORDER BY ... DESC LIMIT 1` + fallback
pattern already used for intervention ids. `write_tests_actions(conn,
ligcde_id, selections)` inserts one `Zebra_LigCdeTest` row per selected
item, retrying id allocation up to `MAX_ID_RETRY_ATTEMPTS` on collision.
`close_job_as_repaired` now takes a `tests_actions: &[TestActionSelection]`
param and enforces it as **mandatory for `Type_Service = "101"` only** —
the only service with a live-verified id list — returning an error before
any write happens if the list is empty on a 101 job. Other services are
left alone entirely for now (no partial/guessed checklist shown), per the
user's own scoping call.

**Frontend** (`src/pages/Reman.tsx`, `src/lib/testsActionsSystematiques.ts`).
`AddStepForm` gained a `service` prop (already available on
`InterventionDetail` as `Type_Service`, passed from `InterventionRow`) and
a `requiresTestsActions = stepType === 'R' && service === '101'` check.
When true, the close-as-repaired form shows a section-grouped scrollable
checklist (GENERAL/ABS/Direction Assistée/Transmission) sourced from
`TESTS_ACTIONS_101_SECTIONS`/`TESTS_ACTIONS_101_FLAT` (both derived from
`TEST_ACTION_SECTIONS` in the new lib file), filtering out any item whose
`noIntParamTest` is still `null` — this is what makes code `039` and the
four unverified sections disappear from the UI rather than show as
unusable checkboxes. Selections are tracked as a `Set<number>` of
`noIntParamTest` ids; the submit button is disabled whenever
`requiresTestsActions` is true and nothing is selected, matching 4D's own
mandatory enforcement instead of just relying on the backend rejection.
On submit, selected ids are mapped back to `{ noIntParamTest, label: "<code> - <label>" }`
pairs and passed as `testsActions` alongside the existing close-job
fields; selection state resets on close/cancel the same way
`comment`/`causePanne`/`niveauPanne` already did.

Verified end-to-end live (temporary test, removed after confirming): a
real write with a non-empty `tests_actions` list succeeded and produced
the expected `Zebra_LigCdeTest` rows; a `Type_Service = "101"` job closed
with an empty list was rejected before any write occurred; cleanup
restored the job to its prior state.

**Extending to the other bench services (2026-08-05).** `Type_Service`
100/101/102/103 are the four in-house benches (see the correlation note
at [reman.rs:216-227](../src-tauri/src/reman.rs#L216)). Two findings so
far, both confirmed live rather than inferred from the correlation alone:

- **102 = Compteur + Multimedia, confirmed and now fully enforced.** Job
  `17481601` (ligcde `39591`, "Compteur Toyota", `Type_Service = 102`) is
  a real job a technician was actively working — not a throwaway
  verification job, so the resulting rows were read and left in place,
  not cleaned up. All 46 rows produced by selecting everything in the
  native 4D client matched the GENERAL (8), COMPTEUR (13), and MULTIMEDIA
  (20, of 21) codes already transcribed, cross-confirming GENERAL's ids
  a second time via an independent job. One gap: Multimedia code 102
  ("Remplacement écran tactile") did not appear, same pattern as ABS code
  039 — flagged, left `null`, not guessed. `close_job_as_repaired`'s
  mandatory check and `AddStepForm`'s `TESTS_ACTIONS_SECTIONS_BY_SERVICE`
  map were both extended from `type_service == "101"` to `"101" ||
  "102"` to match.
- **103 requires no checklist at all, confirmed — not just deferred.**
  Every currently-open `Type_Service = 103` job the user tried in the
  native 4D client returned "Cet article n'est pas paramétré pour les
  tests" ("this article isn't configured for tests") instead of opening
  the Tests & Actions screen. So for these articles, 4D's own close flow
  doesn't gate on this checklist either — BRAXON leaving 103 unenforced
  matches 4D's actual behavior, not just a gap waiting to be filled. Worth
  re-checking if 103 articles with different configurations show up later,
  but nothing to build against right now.
- **100** (same family as 101 per the correlation) remains unverified —
  no open 100 job has been checked live yet.

## Fifth feature: personal saved notes & Tests/Actions presets (2026-08-05)

Requested directly: retyping the same comment ("Nettoyage effectué, RAS",
etc.) and re-checking the same Tests & Actions items job after job is
slow — technicians want a personal, pickable list for both instead.
Scoping decisions (via AskUserQuestion): **personal per `tech_id`**, not
shop-wide (each tech only sees/manages their own); covers **both** free
comments and Tests & Actions selections, not just comments; available
**everywhere a comment box exists** — ER, ATN, and close-as-repaired all
share `AddStepForm`'s one textarea. Entirely BRAXON's own state — 4D has
no concept of this at all, same boundary as the technician roster.

**Backend** (`src-tauri/src/reman.rs`). Two new tables added to the
existing `ensure_reman_cache_tables` (same Postgres already used for the
roster and the forecast cache):

```sql
CREATE TABLE "RemanSavedComment" (
    id SERIAL PRIMARY KEY, tech_id TEXT NOT NULL, text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE "RemanSavedTestActionPreset" (
    id SERIAL PRIMARY KEY, tech_id TEXT NOT NULL, service TEXT NOT NULL,
    name TEXT NOT NULL, param_ids_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Presets are scoped by `service` (`Type_Service`) as well as `tech_id` —
a preset saved against a 101 job's checklist is meaningless applied to a
102 job's different item set, so it's simply not offered there.
`param_ids_json` stores a JSON array of `NoInt_ParamTest` ints (same
"JSON as TEXT" pattern already used for `RemanLiveCache.payload_json`).
Six new commands: `reman_list_saved_comments`/`reman_add_saved_comment`/
`reman_delete_saved_comment` and the equivalent three for presets. Delete
is scoped to `WHERE id = $1 AND tech_id = $2` — a technician can only ever
delete their own entries, even though the UI never offers anyone else's
id.

Verified live (temporary `#[tokio::test]`, removed after confirming): a
full insert → list → delete round trip against the real Postgres for both
tables, including the JSON array round-tripping correctly through
`param_ids_json`.

**Frontend** (`src/pages/Reman.tsx`). `AddStepForm` loads
`savedComments` lazily (once a comment box is actually showing, keyed on
`[stepType, techId]`) and `savedPresets` lazily (once
`requiresTestsActions` is true, keyed on `[requiresTestsActions, service,
techId]`) — not on every row expand. Saved comments render as small
pill chips above the textarea; clicking one **replaces** the current
comment text (not appends — simpler mental model, still editable after).
A bookmark icon inside the textarea's corner saves whatever's currently
typed. Saved presets render the same way inside the Tests & Actions box;
clicking one replaces the current `selectedParamIds` set. Saving a preset
needs a name, so it's the one case with a small inline text input (no
modal component exists in this codebase) that appears next to a "save
current selection as preset" toggle, confirmed with Enter or the Save
button, cancelled with Escape. Every chip (both comments and presets) has
its own small delete button; deletes are optimistic (removed from local
state immediately, Postgres call is fire-and-forget) since a failed
delete just means a stale entry reappears on next load — not worth a
loading/error state for.

## Tests & Actions Systématiques made available on every step, not just close (2026-08-05)

Requested directly: forcing the whole checklist to happen at close-time
was slower than logging items as they're actually performed across
ER/ATN steps. `AddStepForm` now shows the checklist (when the job's
`service` has a live-verified list — 101/102) on **every** step type, not
just `R`; it's still only *mandatory* at close, matching 4D.

**Backend.** `InterventionDetail` gained `tests_actions_selected: Vec<i64>`
— every `NoInt_ParamTest` already in `Zebra_LigCdeTest` for the job, from
any prior step, populated by a new `selected_test_action_ids` helper and
read on every `get_intervention_sync` call. `add_repair_step` and
`add_awaiting_cleaning_step` both gained the same `tests_actions: &[TestActionSelection]`
parameter `close_job_as_repaired` already had, writing through the same
`write_tests_actions` function. `reman_add_repair_step` and
`reman_mark_awaiting_cleaning` (Tauri commands) both gained a
`tests_actions` parameter to match.

Two correctness issues this raised, both fixed:
- **Duplicate rows across steps.** The same item could now arrive at
  `write_tests_actions` more than once (checked on ER, then reopened at
  close and resubmitted). Fixed by querying what's already recorded for
  the job first and skipping anything already present — the real
  boundary check, not just trusting the frontend to only send new ids.
  Verified live (temporary `#[tokio::test]`, removed after confirming):
  calling `write_tests_actions` twice with the same selection against a
  real open job produced exactly one row, not two.
- **Close-time mandatory check was looking at the wrong list.** It was
  checking whether *this specific close call's* `tests_actions` was
  empty — but a job that already has items checked from an earlier ER
  step would correctly send an empty *new*-selections list at close time,
  and got wrongly blocked. Fixed to check `selected_test_action_ids`
  (everything recorded so far) combined with whatever's newly submitted,
  not the new submission alone.

**Frontend.** `testsActionsSelected` seeds `selectedParamIds` whenever a
step's form opens (not on every render — re-seeding on a later,
unrelated detail refresh would fight a technician mid-edit). Already-
recorded items render checked and disabled (BRAXON has no delete-
selection feature, so unchecking one that's already in `Zebra_LigCdeTest`
isn't a real option) with a tooltip explaining why. Applying a saved
preset merges into the already-selected set rather than replacing it, for
the same reason. On submit, only the ids not already in
`testsActionsSelected` are sent — the backend also de-dupes as the real
boundary, but no reason to resend what's already known to be old.

## Sixth feature: ABS intake fault hint — hydraulic vs ECU (2026-08-05)

Requested directly, with the exact insight behind it: most hydraulic ABS
faults show up as "DESEQUILIBRE DE FREINAGE, LA VOITURE FREINE TOUTE
SEULE, SORTIE AVG OU AVD ou ARG ARD BLOQUEE" in the client's reported
symptom — and since every closed job's real outcome is sitting in the
database, that pattern could be mined and validated before building
anything, not just assumed.

**Methodology.** `LigCde.Observations` is the client-reported symptom at
intake (confirmed earlier — it's `InterventionDetail.commentaire_client`,
column index 13 of `get_intervention_sync`'s head query). Mined all 13,680
closed `Type_Service=101` (ABS) jobs with non-empty `Observations` against
their real `Zebra_LigCdeTest` "X défectueux" confirmations — the cleanest
ground truth available (018 "Electrovanne défectueuse"/021 "Capteur de
pression défectueux"/022 "Moteur-pompe défectueux" = hydraulic-confirmed;
019 "Aucune communication"/020 "Calculateur ABS défectueux" = ECU-
confirmed). Only 1,773 of the 13,680 (13%) ever got one of these two
specific codes logged — 1,456 hydraulic, 266 ECU, 51 both — so this is a
hint from real outcomes on a minority of jobs, not something that will
fire on every ABS job, and is presented that way (a small badge, not a
diagnosis).

Word-frequency comparison between the hydraulic-confirmed and
ECU-confirmed groups (`scripts/_scratch-abs-fault-pattern-mine-phrases.mjs`)
turned up a mostly disjoint vocabulary on each side, confirmed with the
user before building:

- **Hydraulic terms**: déséquilibre, freinage, bloquent/bloquée(s)/bloque,
  pédale molle/à fond, freine toute seule/freinent, fuite, purge/purger,
  the literal DTC code `C1380` (115 hydraulic-confirmed jobs vs 1
  ECU-confirmed — a near-single-code signal).
- **ECU terms**: pas de comms/no comms/communication, voyant(s) allumé(s),
  signal implausible, calculateur, capteur de vitesse, ESP.

**Backend** (`src-tauri/src/reman.rs`). `classify_abs_fault_hint(type_service,
observations)` — pure, lexical (substring match on accent-stripped
uppercased text via a hand-rolled `normalize_for_match`, no external
unicode-normalization crate pulled in for one field), returns
`Option<AbsFaultHint>` (`Hydraulic`/`Ecu`). Returns `None` for anything
that isn't `Type_Service = "101"`, and `None` when the text matches both
sides or neither — an ambiguous or silent job gets no badge rather than a
guess. Wired into both `InterventionSummary` (the list/queue view — the
`reman_search_interventions` query gained `l.Type_Service, l.Observations`
as two more indices) and `InterventionDetail` (reusing the `service`/
`commentaire_client` fields already fetched, no extra query). Permanent
unit test (`classify_abs_fault_hint_matches_real_observations_examples`,
kept — not a temporary live-verification test, since it's pure logic with
no DB dependency) asserts against real Observations text pulled from the
mining run.

Live spot-checked against currently-**open** jobs, not just the closed
dataset it was mined from (`scripts/_scratch-abs-fault-hint-live-spotcheck.mjs`):
of 5,757 open 101 jobs with symptom text, 1,075 would show the hydraulic
badge and 549 the ECU badge today — with sensible-looking real examples on
both sides ("panne hydraulique, probleme sur le freinage", "C1380 PUMP
MOTOR" → hydraulic; "NO COMMS AND LIGHT ON DASH", "FAUTE CALCULATEUR" →
ECU).

**Frontend** (`src/pages/Reman.tsx`). A small badge next to the existing
warranty/status badges on each job card — amber `BeakerIcon` +
"Likely hydraulic" or blue `CpuChipIcon` + "Likely ECU", with a tooltip
explicitly framing it as a hint from historical patterns, not a
diagnosis. Shows on the collapsed row (the whole point — useful the
moment a job lands, before anyone's opened it), inherited automatically
into the expanded detail view too since `InterventionDetail extends
InterventionSummary`.

## Seventh feature: warranty comeback tracking, surfaced from 4D's own field (2026-08-05)

Prompted by a correction: an earlier suggestion to build repeat-repair
detection from scratch was met with "4d already tracks that... check now
17481001, it's linked to his previous job 17423601." Investigated live
rather than assumed — `LigCde.SuiviGar_AncNoInterv` ("Suivi Garantie -
Ancien N° Intervention") is a real, well-populated text field holding a
prior job's `NoIntervention` reference. Confirmed on the named example:
job 17481001 → prior job 17423601, whose order `Comment_PreCde` read
*"Connecteur cassé sur précédent dossier NFF, très certainement arrivé
comme ça. Demande d'achat faite : 5949"* — staff had already manually
noted the comeback in free text, independent of the structured field.

**Prevalence, checked before building anything**: 3,261 of 38,551 LigCde
rows (8.5%) have this field set. In a 200-job sample, 86.5% resolved to a
real `LigCde` row (the rest likely predate current retention or use an
older reference format) — high enough to build on, not so perfect that
"couldn't resolve" should be silently treated as an error rather than a
normal `None`.

Two parts, per explicit scoping ("both"):

**1. Per-job link** (`src-tauri/src/reman.rs`). `PreviousJobLink` — id,
reference, `DateDernInterv`, `NomDernierTech` (reliable here specifically
because it's only ever set by a job's *closing* step, same fact already
established for the ER/ATN write features), `"DernièreInterv"` status
label, and the prior job's own `JobOutcomeFlags` (reusing the exact
`probe_boolean` set `get_intervention_sync` already uses for the *current*
job's outcome). `resolve_previous_job(conn, prev_reference)` resolves it;
`Ok(None)` (not an error) when the reference doesn't resolve. Wired into
`InterventionDetail.previous_job` (full resolution, one extra query, only
on the detail view) and `InterventionSummary.has_previous_job` (a plain
boolean, added as one more SELECT column on the existing search query —
no extra query at list-scale). Frontend: a red "Comeback" badge on the
job card (list level, `hasPreviousJob`) and a small panel in the expanded
detail (`previousJob`) showing who closed the prior job, when, its status,
and its outcome badges (reusing the existing `OutcomeBadges` component
directly — no new UI for that part).

**2. Comeback analytics** (`reman_analytics`). `SuiviGar_AncNoInterv`
added to the existing `intake_sql` (one more column, no new query), tallied
inside the same dedup/exclusion loop already computing `total_intake`/
`outcomes`/`by_family`. Every distinct previous-job reference in the
selected window gets batch-resolved in a single `NoIntervention IN (...)`
query (not per-row — would be an N+1 query pattern against 4D otherwise)
for its closing technician (`TechDernInterv`) and family
(`ArticleMeteor.Designation`, same `derive_family` already used for
`top_families`). Exposed as `comeback_count` (raw total) plus
`comebacks_by_technician`/`comebacks_by_family` (top-10, raw counts).

**Deliberately a count, not a rate**: dividing by a technician's or
family's activity *within the same window* would be methodologically
shaky — the comeback's own denominator (the *prior* job) can fall well
outside the selected date range, so a "rate" would silently mix two
different time periods into one number that looks precise but isn't.
Documented as a known simplification in `ComebackStat`'s doc comment
rather than presented as more rigorous than it is. Same reasoning, the
Superviseur→VAL reattribution used elsewhere in `reman_analytics` isn't
applied to the *previous* job's technician here (that reattribution query
is itself scoped to the current window); a previous job still attributed
to the generic Superviseur account is simply excluded from the technician
breakdown rather than credited to nobody in particular.

Live spot-checked (`scripts/_scratch-comeback-analytics-spotcheck.mjs`,
replicating the same query/tally shape independently): a 6-month window
found 323 comeback-linked jobs (of 4,082 total in that window), 314/320
(98%) unique previous-job references resolved, and the top families were
almost entirely ABS calculateur variants (ATE MK61/MK100/MK60, Bosch
8.0/9.0/5.7) — consistent with this being an ABS-heavy shop, not a random
or garbled result.

## Correction: NFF-then-exchange comebacks were being misattributed as repair failures (2026-08-05)

Reported directly against a real case: "17477701 i think is a bit
different i don't think it even left the shop... but for sure it was no
fault found but the customer requested the exchange anyway so cases like
this nff but exchange should be handle differently." Investigated live
rather than assumed:

- Job **17456901** (the linked previous job): closed `RAS = True`
  ("Réparation" was *also* `True` on the same row — 4D lets both flags be
  set simultaneously, a real quirk worth knowing about if anything ever
  reads those booleans directly instead of via the TypeCode-based
  `classify_outcome`, which correctly used the chronologically-latest
  step's TypeCode — `RAS`, the actual last step — and wasn't affected by
  this). `Observations`: *"ABS déjà contrôlé en NFF sans diag à
  disposition, le client final insiste pour refaire passer l'ABS."* Real
  bon-de-livraison (`NoBL = 27304`) — this one genuinely shipped back to
  the client as NFF.
- Job **17477701** (linked via `SuiviGar_AncNoInterv = 17456901`):
  `EchgeS = True`, everything else `False`, still `Soldée = False` and
  `NoBL = 0` — confirms the "hasn't left the shop" read was correct, it's
  mid-process. `Comment_AttenteAccord`: *"Echange suite à demande client,
  pas de reprise ni de remboursement."* The client disputed a correct NFF
  finding and got an exchange anyway, per shop policy — not a failed
  repair coming back.

**The gap this exposed**: the warranty-comeback analytics built the same
day counted every `SuiviGar_AncNoInterv`-linked job identically, which
would have attributed this exchange to whichever technician closed
17456901 as NFF — exactly backwards, since they diagnosed it correctly.

**Fix** (`reman_analytics`): one more WHERE-only query (same shape as
`nff_prev_refs`, Boolean columns can't be `SELECT`ed) against the same
batch of previous-job references, checking which ones were closed `RAS =
True`. Those are still counted in the overall `comeback_count` (a real
event worth knowing about shop-wide) but excluded from
`comebacks_by_technician`/`comebacks_by_family` — the two breakdowns that
exist specifically to surface repair-*quality* issues, which an NFF
dispute isn't. New field `comeback_after_nff_count` tracks how many were
excluded and why, surfaced in the KPI card's subtitle and a caveat line
under the two leaderboards rather than silently dropped.

Live spot-checked (`scripts/_scratch-comeback-analytics-spotcheck.mjs`,
extended with the same NFF check): of the 323 comebacks in a 6-month
window, **67 (21%) had a previous job correctly closed as NFF** — a
meaningful share, not an edge case. The technician ranking shifted
noticeably once excluded (one technician's count dropped from 34 to 17 —
over half of what looked like "repair failures" were actually correctly-
diagnosed NFF disputes).

**Frontend** (`src/pages/Reman.tsx`): the per-job previous-job panel now
checks `previousJob.outcome.noFaultFound` and renders neutral (not
danger-red) with a different title ("Re-opened after job #X, closed as No
Fault Found") when the prior job was NFF — the red "warranty comeback"
framing is reserved for cases where a completed repair actually came
back. The list-level badge itself was softened to neutral styling too,
since at list scale there's no cheap way to know the previous job's
outcome without an extra query per row — the detail view is where the
distinction is actually made.

## Comeback exclusion broadened beyond RAS: the SG-refusal fields (2026-08-06)

Asked directly: "did you manage to find the garantie refusee ou garantie
nff fields in db?" — three more fields had already surfaced in the raw
`LigCde` column dumps from the 17477701 investigation but hadn't been
confirmed or used: `SGRAS`, `SGRefuseeAutreMotif`, `SGRefuseePanneDiff`
(255/697/52 rows set, respectively; the rest of the `SG*` cluster —
`SGConstructRefusee`, `SGNonDemandée`, `AttRepCltSGRAS`,
`ReponseCltSGRASOK`, `SGConstructeur`, `RefusRASADLC` — exist as columns
but are never set in the current dataset, likely legacy/unused).

Confirmed directly by the workflow owner what distinguishes them: `SGRAS`
= tested a warranty unit, found nothing wrong (a warranty-specific NFF);
`SGRefuseePanneDiff`/`SGRefuseeAutreMotif` = the warranty *claim* was
refused (different fault than claimed, or another stated reason) —
staff has to write in what the actual problem was for either. A live
sample of `SGRefuseePanneDiff`/`SGRefuseeAutreMotif` jobs mostly showed
`Réparation = True` — the unit *was* fixed, just billed rather than
covered free under warranty — which read initially as contradicting a
simple "not a real defect" story, but actually supports the same
conclusion via different reasoning: a warranty refused as "different
fault" is evidence the *new* complaint is unrelated to what was
originally repaired, not proof the original repair failed.

**Fix**: `WARRANTY_REFUSAL_FIELDS` (`reman.rs`) — `RAS` plus the three SG
fields — replaces the RAS-only check everywhere the earlier NFF exclusion
was applied. `reman_analytics`'s exclusion query became one `OR`-joined
WHERE clause across all four columns (still a single query against the
batch of previous-job references, not per-row). `PreviousJobLink` gained
`warranty_refused: bool` (RAS from the already-fetched `outcome`, plus the
three SG fields probed directly for that one job) so the frontend doesn't
need to know the individual field list — `comeback_after_nff_count` /
`comebacksByTechnician`'s exclusion / the per-job panel's neutral-vs-red
styling were all renamed from NFF-specific naming (`comeback_after_nff_count`
→ `comeback_excluded_count`, `outcome.noFaultFound` check →
`warrantyRefused`) to reflect the broader scope, with copy updated to
match ("not attributable to a failed repair" rather than "after a
correctly-closed NFF").

Live spot-checked (`scripts/_scratch-comeback-analytics-spotcheck.mjs`,
extended with the broader OR condition): a 6-month window's exclusion
count went from 67 (RAS only) to **73 of 321 comebacks (23%)** — the three
SG fields caught real cases RAS alone missed.

## Forecast accuracy check + a real bug found in the investigation script (2026-08-06)

Asked directly: "we've been doing this forecast for days now... do we have
the entire data for this period so we can compare... are we way off or
not?" Answer: no persisted comparison history exists — confirmed by
re-reading `commands::ForecastComparison`'s own doc comment, which records
that a persisted-snapshot design was tried and explicitly dropped the same
day it was built (two different attempts, both abandoned): showing a
frozen morning prediction next to the live one confused what was actually
two different populations. What ships today (`reman_compare_forecast_to_actual`)
is deliberately live-only, by design, not an oversight.

Reconstructed the comparison directly from real data instead
(`scripts/_scratch-forecast-accuracy-check.mjs`) — and hit a real bug in
the investigation script itself worth recording: 4D returns date columns
as `"DD/MM/YYYY..."` strings, and JS's native `Date` parser silently
assumes `MM/DD/YYYY`. For any day-of-month ≤ 12 this doesn't throw, it
just **silently produces the wrong date** (scattering what should have
been a tight 60-day window across all of 2026). Day > 12 correctly failed
outright and got skipped. Fixed with a small `toYmd()` helper mirroring
`reman.rs`'s own `to_ymd` (regex-parse `DD/MM/YYYY`, don't hand it to
`new Date()`) — a reminder that this exact footgun is *why* `to_ymd`
exists in the real codebase, and any throwaway script touching 4D dates
needs the same discipline, not just the shipped Rust.

Also caught mid-investigation: a naive "all open bench rows" count came
back as 9,497 — wildly higher than the real forecast ever shows. The real
`reman_forecast_open_queue` query (see `forecast_open_queue_core`) filters
further: only rows with a `DateLimiteLivraison` set, and not more than a
month past it (same staleness cutoff used everywhere else in this file).
Re-run with that filter: **23 units** — consistent with prior examples in
this file ("18 units live right now").

**Findings, once the script was actually correct:**
- August intake really did drop — weekly totals ran ~140–180 units/week
  through June–July, down to 67 in the (partial) week of Aug 1st.
- The forecast is rate-based (each family's 180-day historical outcome
  mix applied to whatever's *currently* on the bench), not a volume
  forecast — so fewer arrivals shrinks the bench and the absolute
  predicted numbers with it, but shouldn't bias the *mix*. Checked
  directly: August's actual outcome mix (47 closed jobs) vs. the 180-day
  baseline — `repaired` matched to one decimal place (42.6% vs 42.6%);
  the largest gap was `sent_to_subcontractor` (14.9% vs 7.4%), plausibly
  just noise on a 47-job sample this early in the month, not a confirmed
  trend.

## Daily forecast snapshot at 17:25, storage-only (2026-08-06)

Requested directly, specifically so the question above can be answered
from real stored data next time instead of reconstructed by hand each
time: "you can take a snapshot but at 5:25pm so we can see if what we're
doing is accurate or not, but it doesn't need to be displayed." Not the
same thing as the abandoned persisted-snapshot *display* designs above —
this one is never rendered anywhere, so it can't reproduce the "two
different numbers on screen" confusion that killed those.

**Implementation** (`src-tauri/src/reman.rs`). `reman_forecast_open_queue`
was split into a thin Tauri-command wrapper plus `forecast_open_queue_core(client)`
— the same core logic, now callable from a background task that has no
`State` to construct. `try_run_forecast_snapshot` captures exactly what a
user looking at the live panel would see at that moment
(`forecast_open_queue_core` + `reman_actual_outcomes_today`, the same two
calls `commands::reman_compare_forecast_to_actual` makes) and upserts one
row per calendar day into `"RemanForecastDailySnapshot"`
(`snapshot_date UNIQUE`, `predicted_json`/`by_family_json`/`actual_json` —
same "JSON as TEXT" pattern as `RemanLiveCache`). `spawn_forecast_snapshot_scheduler`
(started from `main.rs` next to `spawn_etl_scheduler`) polls every 10
minutes and fires once local time passes 17:25; the same claim-based
"run once a day" pattern as `try_run_daily_etl`, reusing `"RemanEtlState"`
with a new `etl_key` (`'forecast_snapshot'`) rather than a second
coordination table.

**A genuine leftover found while building this**: a table already named
`"RemanForecastSnapshot"` (no "Daily") existed live in Postgres — one
stale row from 2026-07-31, Prisma-style `id TEXT` PK, `job_ids_json`
column — exactly matching the *first* abandoned persisted-snapshot design
described in `commands::ForecastComparison`'s doc comment, apparently
never cleaned up when that design was dropped. Confirmed via a direct
`information_schema.columns` check before assuming anything, then used a
distinct name (`RemanForecastDailySnapshot`) rather than risk altering or
dropping a table that wasn't created by this change — flagging it here as
known cruft rather than touching it unilaterally.

Verified live end-to-end (temporary `#[tokio::test]`, removed after
confirming): ran the exact capture body — `forecast_open_queue_core` +
`reman_actual_outcomes_today` + JSON round-trip through the real
`predicted_json`/`actual_json` shape — against a fake `snapshot_date`
(so it wouldn't mark *today's* real `'forecast_snapshot'` claim as
already run, which would have silently blocked tonight's actual 17:25
capture), then cleaned up the test row. Real capture not yet observed
live (today's 17:25 hasn't happened yet as of this writing) — the claim
logic and JSON shape are verified; the scheduled firing itself will
confirm the first time it actually runs.

**Deliberately not attempting** the deeper methodology refinements raised
alongside this request (aged-WIP filtering by 90th-percentile TAT,
segmenting fresh-vs-stale bench units, a chi-square goodness-of-fit test
on the August delta) — those are reasonable directions, but building them
now would be tuning a model against a single day's snapshot. The stated
purpose of this feature is to *accumulate* real day-by-day data first;
revisit once there are enough real snapshots to actually test whether the
"stuck bench" bias hypothesis holds for this shop's data, rather than
assume it does.

## Per-unit dwell time added to the snapshot, same day, before the first real capture

Immediately after the snapshot above shipped, a specific follow-up plan
was laid out for once 3–4 weeks of data exist: an age-distribution decay
curve (what fraction of the bench is under 3–4 days old) and an
outcome-shift-by-dwell-time check (does the eventual repaired/NFF/exchange
mix differ for units closed within 48h vs. units still open after 7+
days). Caught before building either analysis: **the snapshot as shipped
couldn't answer either question** — it only stored aggregate counts
(`predicted_json`/`by_family_json`/`actual_json`), never anything at the
individual-unit level. Waiting 3–4 weeks on that schema would have meant
the wait was for nothing.

Fixed same day, before the first real 17:25 capture could happen:
`bench_units_with_dwell(conn)` — a second, lighter-weight query (not
routed through the shared 30-second `"bench_queue"` cache the *live*
panel depends on; this only runs once a day from the snapshot capture, no
reason to burden the live cache's payload with a per-unit list nobody
viewing the live panel needs) — returns every bench unit's id, family, and
`days_on_bench` (`Commande.DateCommande`, the same "intake" date
`reman_analytics` already uses elsewhere in this file, diffed against
today). Stored as a new `bench_units_json` column.

Interesting parallel: the *first* abandoned persisted-snapshot design
(the orphaned `"RemanForecastSnapshot"` table found earlier) also stored a
per-unit id list (`job_ids_json`) — but that design was killed for a
*display* reason (two competing numbers on screen), not because storing
unit-level data was itself wrong. Since this snapshot is storage-only and
never rendered, the same underlying idea is safe to reuse here without
resurrecting the problem that killed it there.

**A real bug caught immediately by the verification test, not shipped**:
the new query had no `ORDER BY`, unlike `forecast_open_queue_core`'s
(`ORDER BY l.NoInt_Ligcde DESC`). Checked live
(`scripts/_scratch-debug-bench-dwell-query.mjs`): without it, 4D's
`LIMIT 5000` silently returned the **oldest** 5000 rows (`NoInt_Ligcde`
58, 60, 66… from January 2022, all with `DateLimiteLivraison = NULL`) —
every one of them then correctly filtered out by the same staleness
check, leaving zero. The temporary test caught this directly: it asserts
`bench_units_with_dwell`'s count matches `forecast_open_queue_core`'s
`units_with_tech` (same filters, must agree), which failed 0-vs-21 before
the `ORDER BY` was added and passed cleanly after.

Also `ALTER TABLE ... ADD COLUMN IF NOT EXISTS bench_units_json` alongside
the `CREATE TABLE IF NOT EXISTS` — the table had already been created (by
this same session, minutes earlier) without the column, and `CREATE TABLE
IF NOT EXISTS` doesn't retrofit columns onto an existing table.

## Second comeback-attribution fix: Archimed Saïd isn't a repairer either (2026-08-06)

Reported directly, from looking at the live "Comebacks by technician"
panel: "why is archimed saïd in there, he doesn't repair anything...
usually it's subcontractors stuff, he is a logistics guy." Investigated
live rather than assumed — a 6-month scan of every comeback attributed to
tech id `3389` found **24 of 24** traced back to a previous job that was
`Type_Service = '114'` (sent to a subcontractor) or one of a small
handful of other non-repair-desk families. This lines up exactly with
what `technician_name_map`'s doc comment already established about him
(2026-08-04): he's the logistics coordinator who ships/receives units
to/from subcontractors, and `TechDernInterv` lands on him when that
paperwork closes — not because he repaired anything.

**Fix**: `ARCHIMED_LOGISTICS_TECH_ID = "3389"` excluded from
`comebacks_by_technician` the same way `SUPERVISEUR_TECH_ID` already is —
a previous job attributed to him has nothing real to credit/blame a
technician for. Considered excluding by `Type_Service = '114'` instead
(the more "principled"-looking fix, matching the actual mechanism), but
excluding the specific known-non-repairing id is simpler and matches what
was already established about him elsewhere in this file, rather than
inferring intent from a service code.

Verified with the exact case the user was looking at: in the ~30-day
window matching their screenshot (`excluded = 10`, matching exactly),
Archimed Saïd had exactly one attributed comeback — **new job 17435501,
linked back to prior job 16852901** (`Type_Service = 114`, "Calculateur
Moteur FPT MJD 9DF") — handed to the user directly to check against the
real record.

**Also fixed the same day**: `KpiCard` in `RemanAnalytics.tsx` was
`truncate`-ing its label to one line unconditionally, clipping "Transformation
rate" / "Active technicians" / "Warranty comebacks" to "Transformation
…" etc. even with visible vertical room in the card. Reported directly
("i don't like when the text cuts while we have enough space") — removed
`truncate`, labels wrap instead.

**Reconciliation check requested directly** ("the total when you add up
comebacks by technicians for this month"): confirmed by summing every
technician in the ~30-day window (not just the UI's top-10 slice) — 30
attributed, matching `40 total - 10 excluded` exactly. Only 8 distinct
technicians appear in that window, well under the top-10 display cutoff,
so nothing was hidden from what the panel already showed; the numbers do
reconcile.

**Still open**: the user asked to cross-check specific numbers ("check
these rapport documents for warranties, like july says 26") against
external report documents — nothing named `*rapport*` exists in this
repo, so those must be files or figures outside it. Not yet resolved;
needs the actual document or the specific number to check against.

## Third fix same day: Archimed Saïd was excluded from comebacks but not the leaderboard

Reported directly, immediately after the previous fix shipped: "i still
see archimed said in the technician leaderboard, he shouldn't be in any
tech leaderboard." Correct — the earlier fix only touched
`comebacks_by_technician`; `RemanAnalytics`'s main `technicians` list
(the "Technician leaderboard" panel, built from raw `Intervention.NoIntTechn`
activity, not the comeback-linking logic at all) was a completely
separate code path that still counted him.

Checked live before fixing, not assumed: a 30-day sample showed **146
distinct "units"** attributed to id `3389` — every single one under a
logistics/subcontractor `TypeCode` (`NET`, `RST`, `VST`, `RSTNF`, `RAS`,
`ST`, `TES`, `T114`), never `ER`/`R` (an actual repair step). That's a
much larger leak than the comeback panel's single-digit counts — on a
"units touched" leaderboard, 146 could plausibly put him near the top,
badly distorting it.

While checking, the same live query run against `SUPERVISEUR_TECH_ID`
(2403) found a smaller but real analogous gap: 75 distinct jobs in the
same window under repair-flavored `TypeCode`s (`ER`, `ES`, `R`, `ATN`,
`VAL`, `TES`) — plausible real technician work, just logged under the
generic account. The existing Superviseur→VAL reattribution (see the
technician-activity section above) only fires when a job *has* a VAL
step; jobs with none stay attributed to `2403` and, before this fix,
would have leaked into the leaderboard the exact same way Archimed did.
Not the specific thing reported, but the same class of bug, caught by
checking rather than stopping at the one case named.

**Fix**: both `SUPERVISEUR_TECH_ID` and `ARCHIMED_LOGISTICS_TECH_ID` are
now excluded outright from the `technicians` list's final filter, not
just from the comeback breakdown. Archimed gets no VAL-style
reattribution fallback (unlike Superviseur) since there's no "real
technician" to substitute in for logistics/subcontractor coordination —
he's excluded unconditionally, same reasoning as the comeback fix.

## Search filters, a "Today" quick-range, and technician-set fault verification (2026-08-06)

Requested directly, three parts: filters on the Interventions page (family,
hydraulic/ECU fault, dates with a "Today" button — the last one also
added to Analytics), and a way for a technician who's actually read/tested
a unit to confirm (or override) the hydraulic/ECU badge instead of relying
only on the lexical guess from intake text.

**Analytics "Today"**: `QuickRange` gained a `'today'` variant (`rangeFor`
returns `from === to`, both today) alongside the existing 30d/90d/6m/1y —
purely additive, no change to the existing ranges' behavior.

**Search filters** (`reman_search_interventions`). Gained four new
optional params: `family` (substring match on `ArticleMeteor.Designation`
— the same "family" `reman_analytics`'s `top_families`/
`comebacks_by_family` already use, not `LigCde.Famille` or `Segmentation`,
to stay consistent with the one established meaning rather than introduce
a second), `faultType` ("hydraulic"/"ecu"/"both"), `dateFrom`/`dateTo`
(against `Commande.DateCommande`, same field the "Today" button filters
by). Required adding `ArticleMeteor` to both this function's main query
*and* its separate `warranty_sql` query — the family condition references
`am.*`, and 4D would reject a WHERE clause referencing a table alias
absent from that specific query's FROM/JOIN list. `family`/`dateFrom`/
`dateTo` are plain SQL `WHERE` conditions; `faultType` can't be (it needs
`classify_abs_fault_hint`, computed in Rust, plus a Postgres lookup) so
it's applied as a post-filter on the already-built `InterventionSummary`
list, via a new `fault_type_matches(hint, verified, filter)` helper
(unit-tested — a "both"-verified job matches either single-type filter,
but only the "both" filter itself requires `Both` specifically; a
verified value always overrides the lexical hint in the match). Live
SQL-verified (`scripts/_scratch-verify-search-filters-sql.mjs`) that the
new joins/conditions actually resolve against 4D combined with the
existing Open-queue conditions.

**Technician-set fault verification** — the bigger addition.
`VerifiedFaultType` (`Hydraulic`/`Ecu`/`Both` — `Both` only ever comes
from here; the lexical `AbsFaultHint` classifier stays silent rather than
guess when text matches both sides, so it can never itself resolve to
`Both`) backed by a new Postgres table, `"RemanVerifiedFaultType"`
(`ligcde_id` PK, one row per job — a current-state upsert, not a history
log). Two new commands, `reman_set_verified_fault_type`/
`reman_clear_verified_fault_type`, entirely BRAXON's own Postgres, same
boundary as the roster/saved-comments/presets — 4D has no concept of this.

A verified value always takes precedence over `abs_fault_hint` wherever
both are shown (list badge and, inherited automatically via `extends`,
the detail view) — `FaultTypeBadge` (`Reman.tsx`) renders solid/filled
when verified (plus a checkmark) vs. translucent when it's still just the
lexical guess, so a technician's own confirmed read is never visually
confused with an inferred one. The set/clear control itself lives in the
expanded detail view (three buttons — Hydraulic/ECU/Both — plus a Clear
once something's set), gated to `Type_Service = 101` (the same scope
`classify_abs_fault_hint` is verified for) and to a claimed technician
identity, same pattern as `AddStepForm`.

**A real plumbing gap this surfaced**: `get_intervention_sync` only ever
had a 4D connection, but `verified_fault_type` lives in Postgres —
merging it in couldn't happen inside that function. Rather than thread a
second connection type through it (awkward — its 4D work runs inside
`with_reman_connection`'s synchronous `spawn_blocking` closure, and
mixing in an async Postgres call there would need real restructuring),
every command that returns an `InterventionDetail` now does the 4D read
first, then merges Postgres data via a small shared tail,
`with_verified_fault_type(pg, detail)`. Six call sites updated:
`reman_get_intervention`, `reman_add_repair_step`,
`reman_mark_awaiting_cleaning`, `reman_close_job_as_repaired`, and the two
new verify/clear commands — all six previously had no `State<AppState>`
param at all (no reason to touch Postgres before), so all six gained one.
Skipping any of these would have meant `verified_fault_type` silently
reverting to stale/missing right after using a *different* write feature
on the same job (e.g. adding a repair step would have blanked out an
already-set verification in the returned detail) — worth the six-site
touch to avoid.

Live-verified end to end (temporary `#[tokio::test]`, removed after
confirming): set a verification on a real open job via the same
insert → `get_intervention_sync` → `with_verified_fault_type` path the
commands use, confirmed it round-tripped correctly, cleared it, confirmed
it was gone.

## Two follow-up fixes on the filters, same day (2026-08-06)

**Badge wording didn't change when verified.** `FaultTypeBadge` changed
color/icon for a technician-confirmed value but reused the exact same
"Likely hydraulic"/"Likely ECU" label text as the unverified guess —
reported directly ("when i set hydraulic or ecu or both, it should no
longer say likely right?"). Fixed with two new label keys
(`verified_fault_type_hydraulic`/`_ecu`) used only when `verified` is
set; `fault_type_both` didn't need a variant since the lexical hint can
never itself resolve to `Both` (see `AbsFaultHint`'s doc comment) — that
label is already verified-only.

**The date filter used the wrong field for the Closed queue.** Reported
directly: filtering "Interventions Soldées" (My Jobs) to today showed
nothing, for a job actually closed today. The date filter had been
wired to `Commande.DateCommande` (intake date) unconditionally — but a
job closed today can have been ordered weeks or months earlier, so
filtering "today" against *when it arrived* almost never matches a job
closed *today*. Confirmed live (`scripts/_scratch-check-datederninterv-filter.mjs`):
the old `DateCommande` filter returned 0 rows for a real job closed today
by the reporting technician, while `LigCde.DateDernInterv` (the same
field the Closed queue's own sort already uses — "when I go into
Interventions soldées, it should show the latest jobs first," same
underlying reasoning: intake/deadline fields don't mean much once a job
is closed) correctly found it. Also confirmed `DateDernInterv` is never
NULL (0 of a 5000-row sample), so no fallback logic was needed — a clean
`if queue == Closed { DateDernInterv } else { DateCommande }` switch.
`DateDernInterv` accepts the exact same ISO `BETWEEN` `DateCommande`
already relied on (same live check).

Same request, second half: the job card was always showing
`DateLimiteLivraison` (delivery deadline) regardless of queue —
meaningless once a job is closed, same reasoning as the date-filter fix
and the earlier Closed-queue sort fix. `InterventionRow` gained a
`showLastVisitInsteadOfDeadline` prop (`true` when rendered under the
Closed queue), swapping the card's date to `dateDernInterv` in that case
only — every other queue keeps showing the delivery deadline, still
meaningful there for triage.

## Fourth write path: "En attente de validation" (VAL) (2026-08-06)

Same live-tracking discipline as ER/ATN/close: watched a real job go
ER → VAL through the native 4D client, snapshot before/after, diffed.
First attempt (job 17485201) got overtaken by real shop activity —
another technician moved it to Commercial (`TES` → `ARD`, "Transfert
Service commercial" then "Attente Réponse Devis") before VAL could be
added; picked a second job (17482801) and tracked that one instead.

**Confirmed from the diff**:
- `TypeCode = 'VAL'`, `TypeLibelle = 'En attente de validation'`.
- `Type_Service` stays **untouched** — unlike `TES` (transfer to
  Commercial, confirmed the same day via the interrupted first attempt:
  moves `Type_Service` to `305`), VAL is a sub-status of the same bench
  work, not a desk change.
- `Nettoyage` is **not** touched — unlike ER/ATN, which both force it
  `False`.
- `NomDernierTech` stays untouched, same as every other non-closing step.
- No mandatory extra fields. A `ND` (non-repairable) flip observed in the
  diff turned out to be unrelated to VAL itself — the technician set it
  manually via a choice that exists on a standard ER step in native 4D
  (not yet exposed in BRAXON's `reman_add_repair_step`), reusing the same
  live session rather than because VAL requires or sets it. Also
  confirmed live, from the interrupted first attempt: `TES` (transfer to
  Commercial) has the same optional NFF/ND choice, but *mandatory*
  `CausePanne`/`NiveauPanne` — "just like when we close a job for repair
  reasons." Neither applies to VAL; noted here for whenever a TES write
  path gets built.

**Implementation**: `add_validation_step`/`reman_add_validation_step`
mirror `add_awaiting_cleaning_step`/`reman_mark_awaiting_cleaning`
exactly, minus the `Nettoyage = False` side effect. `StepType` in
`AddStepForm` gained `'VAL'` as a fourth option between ATN and close,
same picker/Tests-Actions/comment-box treatment as the other three.

Live-verified (temporary `#[tokio::test]`, removed after confirming):
wrote a real VAL step against an open job, confirmed `Type_Service`
unchanged and `Nettoyage` unchanged against a pre-write snapshot,
confirmed the `Intervention` row's `TypeCode`/`TypeLibelle`, then
restored `LigCde`'s mutated fields (`DernièreInterv`/`DateDernInterv`/
`TechDernInterv`) back to their pre-test values — the inserted
`Intervention` audit row itself was left in place, same precedent as
every other write-feature test this session. Caught and fixed a bug in
the test itself along the way: the restore `UPDATE` initially reused the
raw `SELECT`-fetched `DateDernInterv` value directly ("DD/MM/YYYY..."),
which 4D rejects for a *write* — needs `to_ymd`-normalized ISO, same
format every other date write in this file already uses.

## Fifth forecast redesign: cumulative "predicted for today" (2026-08-06)

The forecast panel's `predicted` mix had already gone through several
designs (see the doc comment above `reman_compare_forecast_to_actual` in
`commands.rs` for the blow-by-blow), landing — as of 2026-08-03 — on
`predicted = live 180-day rate × current bench count`, deliberately
chosen then specifically to kill a dual-number confusion bug from an
earlier "growing baseline" attempt.

That live design has a real, reported flaw: the multiplier is the
*current* bench count, and the bench count moves both up and down all
day as units get closed. Reported directly: "it was 12 all day now it
just dropped suddenly to 8, but i explicitly told you it should never go
down, the only thing that should make it change its prediction is new
units coming in, and they can't possibly decrease the repair numbers
right?" — correct: closing a unit shouldn't erase it from "today's"
predicted total, but under the live design it did, because that unit
left the open-bench population the multiplier was reading from.

Presented the tension directly (this was the exact bug the 2026-08-03
design was chosen to avoid) rather than silently reverting; the user
confirmed the intent explicitly: keep it monotonic, solve the display
confusion a different way this time instead of by reverting the idea.

**Fix**: `predicted` is now driven by a population that only grows
through the day — "every unit that has touched today," not "every unit
open right now":

```rust
fn todays_bench_population(conn: &Connection<'static>) -> Result<HashMap<String, u32>, String> {
    // Branch 1: currently open (same criteria as forecast_open_queue_core's
    // queue_sql — Soldée = False, Type_Service IN ('100','101','102','103'),
    // dated + not stale-past-a-month).
    // Branch 2: closed *today* (Soldée = True, same Type_Service filter,
    // DateDernInterv = today) — units that were open earlier today and got
    // closed before the panel was checked don't disappear from the count.
    // Union of both branches, deduped by NoInt_Ligcde.
}

pub async fn forecast_today_cumulative(client: &tokio_postgres::Client) -> Result<(u32, PredictedMix), String> {
    let family_counts = async_runtime::spawn_blocking(|| with_reman_connection(todays_bench_population)).await??;
    let units_today: u32 = family_counts.values().sum();
    let (predicted, _, _) = predicted_mix_from_family_counts(client, &family_counts).await?;
    Ok((units_today, predicted))
}
```

This can still only grow within a day (a unit already counted in the
open branch stays counted once it moves to the closed branch — the union
dedupes by id) and resets naturally at midnight since "today" is
recomputed each call, never persisted. `ensure_reman_cache_tables`
changed from private to `pub` so `commands.rs` could call it directly
alongside the new function (`reman_compare_forecast_to_actual` no longer
routes through the live `forecast_open_queue_core`/`units_with_tech`
path at all).

`ForecastComparison`'s field was renamed `units_with_tech` →
`units_today` on both sides (Rust struct and the `RemanForecast.tsx`
interface) specifically so the two numbers can't be confused for the
same thing at a glance — the main panel's live bench count (still
`unitsWithTech`, still moves both ways, unchanged) and this new
cumulative one are visually and semantically distinct now, addressed
directly per the user's "solve display separately" framing: i18n copy
was rewritten so the main panel explicitly says "right now" (`subtitle`,
`with_tech`, `caveat`) while the compare section explicitly says
"Predicted (today)" / "only grows... unlike the live count above."

Live-verified twice: first via `scripts/_scratch-verify-cumulative-forecast.mjs`,
a hand-rolled mirror of the exact SQL (open branch = 20, closed-today
branch = 18, union = 38 — matched expectations, after fixing two bugs in
the verification script itself: adding ids to the seen-set *before*
applying the dated/stale filter inflated the union, and comparing 4D's
`DD/MM/YYYY` date strings directly instead of through `toYmd()` silently
broke the closed-branch match on any day ≤ the 12th of the month). Then,
separately, an end-to-end run of the real command path (temporary
`#[tokio::test]`, removed after confirming): called
`forecast_today_cumulative` and `reman_actual_outcomes_today` against
the live DB exactly as `reman_compare_forecast_to_actual` does — returned
`units_today = 38`, matching the scratch script exactly.

## Sixth: the live panel's title still said "forecast," which is what was actually confusing (2026-08-06)

Follow-up to the cumulative redesign above, same day. Asked directly
whether the live panel (bench-count × rate, moves both ways) "means a
lot" now that a proper cumulative forecast exists below it. Presented the
tradeoff (relabel as a live composition gauge / drop it / tighten copy
only) via `AskUserQuestion`; the user chose to keep the panel and its
placement as-is and just fix the wording.

The actual mismatch: the panel's body copy already said "right now" and
"moves both up and down through the day" (from the 2026-08-03 design),
but the **title** still read "Today's forecast" — which reads as a
prediction of a day's total, directly contradicting the caveat one line
below it. Retitled to "Bench mix, right now" (no "forecast" or "today" in
the header at all), tightened the subtitle to "Estimated outcome split
for the N units on the bench right now" (states plainly what the number
*is* — a composition split, not a total-to-be-reached), and extended the
caveat to point at the cumulative panel by name: "This is a live
snapshot, not a running total for the day... For today's cumulative
total, see below." No component logic changed, i18n copy only (`en.json`/
`fr.json`); `tsc --noEmit` re-run clean after.

## Fifth write path: "Transfert Service commercial" (TES) (2026-08-07)

Same live-tracking discipline as ER/ATN/VAL/close: asked directly whether
this one could be built from what was already incidentally learned (the
interrupted first VAL attempt on 2026-08-06, when job 17485201 got
hijacked into Commercial by another technician mid-session, had already
surfaced `Type_Service` → `305` and the mandatory-CausePanne/NiveauPanne
claim) — presented the tradeoff (guess from partial data vs. a proper
before/after diff) via `AskUserQuestion`; chose to live-verify first,
same as every other write path. Watched a real job (17475301, ligcde
39522) go from the ABS bench straight to Commercial through the native
4D client, snapshot before/after
(`scripts/_scratch-snapshot-17475301-{before,after}.mjs`), diffed.

**Confirmed from the diff**:
- `TypeCode = 'TES'`, `TypeLibelle = 'Transfert Service commercial'`.
- `Type_Service` moves to `'305'` — this is what actually relocates the
  job into `InterventionQueue::Commercial` (`Type_Service = '305'`), not
  a `TypeCode` filter.
- `CausePanne` (1-5, same enum as closing-as-repaired) and `NiveauPanne`
  (1-3, stored on the `Intervention` row, same as closing) both got
  written even though the tracked technician also chose NFF that time —
  confirms they're unconditionally mandatory, not just on the ND path,
  matching what the workflow owner said ahead of time: "the one that's
  mandatory is cause de panne et niveau de panne, just like when we
  close a job for repair reasons."
- `RAS` (No Fault Found) flipped `false → true` — the technician's real
  choice on the tracked job. `ND` (non-repairable) is the other option
  on the same choice ("you have NFF or ND, not mandatory") — enforced as
  mutually exclusive in the command even though only one was ever
  observed live simultaneously with the other, since both can't
  genuinely apply to the same unit.
- `Soldée` stays **False** — TES relocates the job to a different desk,
  it doesn't close it. A Commercial-side resolution (quote
  accepted/declined, exchanged, etc.) presumably closes it later through
  its own path, not yet built.
- `Nettoyage`, `NomDernierTech`, `SemaineGarantie`, `ServiceTechnique`,
  `DerInterv_technique`/`DateDerInterv_technique`/
  `HeureDerInterv_technique` are all **untouched** — confirmed unchanged
  in the diff, same reasoning as VAL: those are specific to the step
  that actually closes a job.
- `DernièreInterv`/`DateDernInterv`/`TechDernInterv`/`heureModif` update
  the same way every other write in this file already replicates.

**Implementation**: `transfer_to_commercial_step`/
`reman_transfer_to_commercial`, mirroring `close_job_as_repaired`'s
CausePanne/NiveauPanne validation (same 1-5/1-3 range checks) but
without its Soldée/Nettoyage/warranty/closing-only side effects, plus
the new optional mutually-exclusive RAS/ND choice. Frontend: `StepType`
gained `'TES'` as a fourth-position option (between VAL and close),
reusing the existing CausePanne/NiveauPanne selects (condition widened
from `stepType === 'R'` to `stepType === 'R' || stepType === 'TES'`)
plus a 3-way radio (None/NFF/ND). Uses `onClosed`, not `onAdded` — TES
moves the job out of whatever queue it's currently rendered in
(`Type_Service` leaves `100`-`103`) even though `Soldée` never flips, so
the row needs to disappear from the current list the same way an actual
close does.

Live-verified twice: first the real native-client transfer on 17475301
(the diff above), then separately an isolated call to
`transfer_to_commercial_step` directly against a second, unrelated open
job (17489701/ligcde 39666, temporary `#[tokio::test]`, removed after
confirming) — asserted `Type_Service` → `305`, `CausePanne` written,
`Soldée` still `False`, `RAS` set per the `no_fault_found` argument, then
restored `LigCde`'s mutated fields (`Type_Service`/`CausePanne`/
`DernièreInterv`/`DateDernInterv`/`TechDernInterv`/`RAS`) back to their
pre-test values (the inserted `Intervention` audit row itself left in
place, same precedent as every other write-feature test this session).

## Finance tab: annual profit estimate (2026-08-11)

Requested directly: "can you calculate how much profit we make a year at
least try to come up with a number give me some fields so i can change in
the app" — salary per active roster technician, rent (~5000/mo), electricity,
customer reimbursements, tax, debt, "everything you can come up with for a
shop like ours," and a stock-value field.

**Revenue turned out to already exist, precisely** — `reman_analytics`'s
`total_revenue` was already validated against the shop's own production
reports (0.4%-3.5% gap, see the "Revenue accuracy" investigation earlier
in this file: HT not TTC, `StatutDossier = 'EXPEDIE'`, `REE` excluded,
deduped by `Commande`). The Finance tab calls it with a trailing-365-day
window instead of duplicating the query — confirmed live before building
anything else: **1 258 767,70 € HT** across 4 722 distinct orders for the
365 days ending 2026-08-11 (`scripts/_scratch-annual-revenue-estimate.mjs`).
That's the one number in this feature that isn't manual.

**Stock value could *not* be computed the same way.** `Stock.PA`
(purchase price) exists per unit, which looked promising — but checked
live (`scripts/_scratch-check-stock-valuation-fields.mjs`) and every
single one of 779 `Stock` rows already has a `DateSortie` set, some back
to 2022. There's no reliable "still physically on the shelf right now"
signal to filter on, so summing `PA` would count units that left years
ago as if they were current inventory — worse than an honest manual
number. Left as a plain editable field; worth revisiting with whoever
maintains physical inventory if a real "on hand" flag exists somewhere
this investigation didn't find.

**Everything else has no equivalent in 4D at all** (salaries, rent,
electricity, insurance, supplies, subscriptions, reimbursements, debt,
tax rate) — all new editable fields, all in BRAXON's own Postgres.

**Schema**:
- `RemanTechnicianRoster` gained one column, `salary_monthly DOUBLE
  PRECISION` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, not folded into
  the table's `CREATE TABLE IF NOT EXISTS` since that only runs for
  installs where the table doesn't exist yet) — salaries are inherently
  per-technician, so they live where roles/active-status already do, not
  in a separate table. Same admin gating as everything else on that
  table (`ROSTER_ADMIN_TECH_ID`).
- New singleton table `RemanFinanceSettings` (`id = 1`, one row) for the
  shop-wide monthly costs: `rent_monthly`, `electricity_monthly`,
  `reimbursements_monthly`, `insurance_monthly`, `supplies_monthly`,
  `subscriptions_monthly`, `misc_monthly`, `debt_balance`,
  `debt_monthly_payment`, `stock_value`, `tax_rate_percent`.
  `debt_balance` (outstanding, a balance-sheet figure) and
  `debt_monthly_payment` (a real recurring cash outflow, folded into the
  profit estimate as an expense) are kept as two separate fields on
  purpose — conflating them would either hide the debt entirely from the
  summary or double-subtract it.

**Commands**: `reman_get_finance_settings`/`reman_update_finance_settings`,
same admin-only shape as the roster commands (`requesting_tech_id` checked
server-side against `ROSTER_ADMIN_TECH_ID`, not just hidden client-side).
`reman_list_roster`/`reman_update_roster_entry` extended with
`salary_monthly: Option<f64>`.

**Calculation** (done client-side in `RemanFinance.tsx`, all the pieces
it needs — revenue, settings, roster — are just fetched, not recomputed):
annual salaries = (sum of `salaryMonthly` for `isActive` roster entries) ×
12; annual fixed costs = (rent + electricity + insurance + supplies +
subscriptions + reimbursements + misc + debt payment) × 12; pre-tax
profit = revenue − salaries − fixed costs; estimated tax = pre-tax profit
× `taxRatePercent` (only if positive); net profit = pre-tax profit −
tax. Stock value and debt balance are shown as their own reference
figures, not netted into the profit math — they're point-in-time
balances, not annual flows.

**Frontend**: new admin-only "Finance" tab (`RemanFinance.tsx`), gated
identically to Roster (`isRosterAdmin`, same `ROSTER_ADMIN_TECH_ID`) — a
summary card (revenue/salaries/costs/tax/pre-tax/net/stock/debt) above
grouped editable fields (Fixed costs / Debt / Other), saved via an
explicit Save button rather than per-field autosave (unlike the roster's
role checkboxes) since there are enough fields here that autosaving each
keystroke would be noisy. `RemanRoster.tsx` gained a Salary column,
autosaved on blur (not per-keystroke, unlike the existing checkboxes)
since a save-per-character would be excessive for a text field.

Live-verified (temporary `#[tokio::test]`, removed after confirming): a
full write/read round trip against `RemanFinanceSettings` (confirmed no
row existed yet, wrote one, read every field back correctly, exercised
the `ON CONFLICT` update path, then deleted it — no admin has actually
used this feature yet, so a leftover test row would misrepresent that)
and against `RemanTechnicianRoster.salary_monthly` (same
write/verify/delete shape, using a synthetic non-real tech id).

**One open question, not yet resolved**: whether `Stock.PA`/`DateSortie`
can ever answer "what's on the shelf right now" with a different query
shape (a `NoBLclt`/`Localisation`-based signal, maybe) — flagged to
revisit rather than guessed at.

## Finance tab, part 2: a real cost-of-goods number + employer charges (2026-08-11)

Same day as the Finance tab itself. Reported directly against a real
filed P&L (a company-registry "bilan" screenshot: FY 2024/2025, Chiffre
d'affaires 1.4M€, Marge brute 1.1M€, Excédent Brut d'Exploitation 49.2K€,
Résultat net 11.8K€) — the calculator's first pass (revenue only, no
COGS, flat 5000€/mo salary test values) produced a 234K€ net profit, ~20x
the real 11.8K€. The arithmetic itself was correct given its inputs; the
model was missing an entire cost category.

**Diagnosis, presented back before touching anything**: (1) no cost-of-
goods field at all — real gross margin (78.6%) implies ~21% of revenue is
merchandise cost, a category the calculator was crediting entirely as
profit; (2) the salary figures entered were acknowledged test values, and
even real ones would understate true French labor cost, which typically
runs 25-45% higher than gross salary once employer charges (charges
patronales) are added. Asked directly how to handle each (`AskUserQuestion`):
COGS → "investigate computing it from real data" (not a manual field);
employer charges → "add a charges % field."

**COGS investigation** — went looking for a real source before adding
anything:
- `Stock.PA` (purchase price per unit) was already ruled out for the
  stock-value field earlier in this same session (every one of 779 rows
  has an old `DateSortie`, no "still on hand" signal) — and separately
  has no per-year granularity anyway, so it can't answer "how much was
  spent this year" even if the on-hand question were solved.
- `Stock.NoIntLigCdeVte` (which stock unit fulfilled which job — looked
  like it might let COGS be computed per-job, matching revenue's own
  methodology) is completely unpopulated — checked live, 0 of 779 rows
  have it set. Dead end.
- `FactureFr`/`Lig_FactureFr` (real supplier invoices — 9172 header rows
  all-time, 1835 invoice + 120 credit-note lines in the trailing 365 days
  alone) is the real thing: actual money owed/paid to suppliers.
  `FactureFr.Avoir` marks credit notes; confirmed live their `MtHT` is
  already stored **negative** (sampled 15/15 negative), so a plain sum
  across both invoices and credit notes nets correctly without a separate
  subtraction step. `Lig_FactureFr.CpteGeneral` carries real French PCG
  (Plan Comptable Général) ledger codes — confirmed live it follows
  standard numbering: `60x` = Achats (merchandise/materials — the actual
  COGS), `61x`/`62x` = Services extérieurs / Autres services extérieurs
  (rent, insurance, subcontracting, fees — French GAAP's "charges
  externes," a separate P&L line below gross margin, not COGS), `21x` =
  Immobilisations (equipment/capex, not an operating expense at all).
  Trailing 365 days, live: `60x` = 438 521,80€, `61x`+`62x` =
  209 314,62€, `21x` (excluded) = 89 667,33€.

Only `60x` feeds the profit calculation as COGS, computed the same way as
revenue (live, `reman_supplier_cost_estimate`, no manual entry). `61x`+
`62x` is surfaced as a reference line next to the manual fixed-cost
fields instead of auto-applied — those fields stay admin-controlled, and
silently overwriting them risked double-counting anything the admin also
enters manually that happens to be supplier-invoiced.

Live-verified via a temporary `#[tokio::test]` calling the real
`reman_supplier_cost_estimate` command directly (not just the underlying
SQL) — returned `cogs ≈ 438 526€`, `external_charges ≈ 209 326€`,
matching the scratch-script investigation almost exactly (small drift
from a few real invoices posted between the two runs).

**Employer charges**: `FinanceSettings` gained `employer_charges_percent`
— a straight multiplier on the roster's summed salary total
(`salaries × 12 × (1 + rate/100)`), editable in a new "Payroll" field
group. `RemanFinanceSettings` gained the column via `ALTER TABLE ... ADD
COLUMN IF NOT EXISTS` (same reasoning as the roster's `salary_monthly`
column — the table already existed from earlier the same day in any
environment that had already loaded the Finance tab once).

**Frontend**: `RemanFinance.tsx`'s summary card gained a "Cost of goods"
stat line and the external-charges reference sentence; the profit formula
became `revenue − cogs − (salaries × charges multiplier) − fixed costs`,
tax and net profit computed off that corrected pre-tax figure.

## Finance tab, part 3: fiscal year picker + splitting COGS from subcontracting (2026-08-11)

Same day, third pass. Two things reported after actually using the tab
with the new COGS figure: "can we just choose the fiscal year... so we
can see previous years as well" (the tab was hardcoded to a trailing
365-day window), and "the cogs is 438526, that's insane half a million
euros almost... usually we buy stuff to sell them as standard exchange
and we do 2x so if we bought an abs 200 we sell it at 400, that should be
good right or not?" — a fair challenge: a 2x-markup exchange model
implies COGS should track roughly half of standard-exchange revenue, not
a third of *total* revenue.

**Fiscal year picker.** Confirmed from the same filed-report screenshot
used earlier ("Date de clôture: 31/03/2025" under column header "2024")
that this shop's fiscal year runs 1 April → 31 March, labeled by its
start year. `RemanFinance.tsx` gained a dropdown (current fiscal year +
5 prior), computing `{from, to}` as `{year}-04-01`/`{year+1}-03-31`
(capped at today for the in-progress year) and passing that range to both
`reman_analytics` and the now-parameterized `reman_supplier_cost_estimate`
— previously hardcoded internally to `Local::now() - 365 days`, now takes
`from_date`/`to_date` like every other date-ranged command in this file.
If the April/March boundary is ever wrong for this shop, it's a one-line
change (`FISCAL_YEAR_START_MONTH`).

**COGS split.** Re-checked the `60x` bucket at the full 6-digit account
level (still properly joined/dated via `FactureFr.DateFacture`, not the
earlier undated sample) and found it was never one thing: `601x`/`602x`/
`606x` ("Achats stockés — matières premières" / "autres approvisionnements"
/ "achats non stockés de matières et fournitures" — genuine physical
parts and consumables) is 193 607,40€ of the trailing-365-day total; the
remaining 244 914,40€ is entirely `604x` ("Achats d'études et
prestations de services") — *purchased services*, not merchandise. For a
shop that sends units to subcontractors (`VST`/"Validation Sous-
Traitance" is a real, common closing outcome, documented earlier in this
file), this is almost certainly what gets paid to those subcontractors.
`SupplierCostEstimate` now returns `parts_cogs` (601+602+606) and
`subcontracted_services` (604) as two separate fields instead of one
`cogs` total; both are still subtracted from the profit estimate (both
are real costs), just correctly labeled instead of conflated. `61x`/`62x`
external-charges reference figure unchanged.

**This split was then validated against the real filed number.** Ran the
new date-ranged command directly against the shop's *actual* fiscal year
(2024-04-01 → 2025-03-31, matching the report) in a temporary
`#[tokio::test]`: `parts_cogs = 293 372,47€`. The filed report's own
Marge Brute (1,1M€ on 1,4M€ CA) implies a real COGS of roughly 300 000€
(21,4% of CA) — a match within 2%. Strong evidence `601`/`602`/`606` is
the right boundary (matching whatever the shop's accountant nets into
"coût d'achat des marchandises vendues"), and that `604` genuinely
belongs in a different P&L line, not COGS — consistent with why the
first-pass single-`60x` figure read as roughly 45% too high against the
"buy at 200, sell at 400" mental model.

**Employer charges guidance.** Also asked directly how to know the
employer-charges percentage — nothing in REMAN's data can answer that
(it's not a business record, it's a labor-law/payroll-provider figure).
Answered in place: French employer charges typically run ~25-45% of
gross salary depending on contract/sector, and the accurate number comes
from a real payslip's "charges patronales" line or the shop's
accountant, not a guess — added as a hint line directly under the field
in `RemanFinance.tsx` rather than leaving the guidance only in chat.

## Real discovery: "Réparation = SWAP" / "R.A.S. = SWAP" / "Non Dépannable = Défect" are internal core processing, not customer jobs (2026-08-11)

Flagged directly, following the earlier "closed job outcome titles"
investigation that first surfaced these three odd-looking labels:
"[these] are all for stock units i think you can verify that." Confirmed
live, cleanly: every `LigCde` row whose latest step carries one of these
three `TypeLibelle` values has `NomClient = ''` (empty) — 100% across 824
sampled rows (136+500+188 respectively) — versus 100% *populated*
`NomClient` for their normal-outcome siblings (`Réparation`/`NFF`/
`ND(final)`, 1497 sampled). This shop reuses the same `LigCde`/
`Intervention` machinery for two different things: real customer repair
jobs, and internal triage of returned core units (repair it and put it
back in stock for a future swap = `R`/"Réparation = SWAP", confirm it's
fine as-is = `RAS`/"R.A.S. = SWAP", or scrap it = `ND`/"Non Dépannable =
Défect") — distinguished only by whether a customer is attached, not by
any dedicated flag or separate table.

**Also checked the blast radius** before deciding what to build: these
internal records carry `Type_Service = '101'` (same bench range every
other query in this file scopes to) and `Soldée = True`, so they're
currently indistinguishable from real customer jobs to `reman_analytics`,
the forecast's historical training data, the technician leaderboard, and
comeback tracking — measured live at **4.8%** of closed bench jobs in a
trailing-365-day sample (198 of 4156). Revenue itself is *not* affected —
confirmed `PrixHT = 0` and `Commande.StatutDossier = ''` (blank, not
`'EXPEDIE'`) on every sampled row, and the revenue query already requires
`StatutDossier = 'EXPEDIE'`, so these never entered that calculation.
Raised as a separate, explicit decision for the user (not fixed
silently, since it touches several already-shipped features from earlier
in this session) — not yet resolved as of this section.

**Implemented what was directly asked**: `ArticleStockDetail` gained
`processing_history: Vec<StockProcessingRecord>` — `LigCde` rows for that
`CodeArt` with `NomClient = ''`, reduced to one row per job via the same
latest-step-per-job pattern used everywhere else in this file, capped at
100, newest first. `StockProcessingRecord.outcome` keeps the raw
`TypeLibelle` text rather than re-deriving a category — the three
variants carry real distinct meaning that collapsing them would lose.
Frontend: the Stock tab's article row gained a "Core processing history"
section (`reman.stock_processing_title`), a ready/scrapped count summary,
and a scrollable list color-coded by outcome (`R`/`RAS` green = back in
stock, `ND` red = scrapped) via a small `stockOutcomeTone()` helper keyed
off `TypeCode`, not the label text, so it doesn't depend on exact French
wording matching everywhere it's used.

Live-verified via a temporary `#[tokio::test]` calling the real
`reman_get_article_stock` command against `CodeArt = '10097011533'` (seen
repeatedly across all three title samples during the investigation) —
returned 24 real processing-history rows, correctly split between
ready-for-swap (`R`/`RAS`) and scrapped (`ND`), removed after confirming.

## Excluding internal core-processing jobs from Analytics/forecast/leaderboard (2026-08-11)

Follow-up to the "Réparation = SWAP" discovery above, same day. Presented
the blast radius directly (4.8% of closed bench jobs in a trailing-365-day
sample, revenue unaffected) and asked whether to fix it now; confirmed
yes. `l.NomClient <> ''` added to every `LigCde`-scoped query that builds
customer-facing stats or trains the forecast, matching the exact same
pattern already used for the `ATTENTE ACCORD`/`CLOTURE` `StatutDossier`
exclusions earlier in this file:

- `reman_analytics`'s `intake_sql` and `closed_sql` — total intake,
  outcome breakdown, `top_families`, open-status breakdown, and (via the
  same `latest_intake` rows) comeback tracking all flow from these two
  queries, so one fix covers all of them.
- `reman_analytics`'s `tech_sql` (technician leaderboard) — this one
  didn't join `LigCde` before, so it gained a `JOIN LigCde l ON
  i.NoIntLigcde = l.NoInt_Ligcde` to reach `NomClient` at all.
- `run_closed_job_history_etl`'s `hist_sql`/`closed_sql` — the forecast's
  historical training data (`"RemanClosedJobHistory"`). Without this fix,
  stock-unit triage outcomes would quietly skew the predicted mix.
- `forecast_open_queue_core`'s `queue_sql`, `reman_actual_outcomes_today`'s
  query, `todays_bench_population`'s two branches, and
  `bench_units_with_dwell`'s query — the live bench count, today's actual
  outcomes, the cumulative forecast total, and the daily snapshot's
  dwell-time data all share this same "current bench" concept.

`revenue_sql` deliberately left untouched — confirmed live (both here and
in the original discovery) these jobs always carry `PrixHT = 0` and a
blank `Commande.StatutDossier` (never `'EXPEDIE'`), so the existing
`StatutDossier = 'EXPEDIE'` condition already excludes them; adding a
redundant filter to already-correct, already-validated code wasn't worth
the risk of a typo. `reman_search_interventions` (the actual work queues
technicians use to *process* these stock jobs) also deliberately
untouched — excluding them there would break the real workflow, not just
clean up stats.

Live-verified two ways: the four plain (non-`State`-based) forecast
functions (`forecast_open_queue_core`, `reman_actual_outcomes_today`,
`forecast_today_cumulative`) were called directly in a temporary
`#[tokio::test]` and returned sane, non-crashing small numbers (bench
count 19, today's actual outcomes summing to 9). Separately, a scratch
script mirroring `reman_analytics`'s new `closed_sql` exactly (old vs.
fixed, same trailing-365-day window) confirmed **199** jobs excluded —
matching the original discovery's 198-job measurement almost exactly.

## Stock tab default view (2026-08-11)

Reported directly ("stock page is empty") against the tab's existing
search-first behavior (same convention as Clients/Purchase requests —
nothing shows until a query is typed). Confirmed that's not a regression,
then asked whether a default view made sense given the new processing-
history feature just added; the answer was yes — see recent activity
without already knowing an article code.

New `reman_recent_stock_processing` command: same `NomClient = ''`
internal-job scoping as `StockProcessingRecord`, reduced twice — first to
the latest step per job (standard pattern), then again to the single most
recent job per `CodeArt`, since this view is one row per *article*, not
per job. Sorted newest-first, capped at 30. `StockTab` now calls this
instead of showing nothing when the search box is empty, and calls
`reman_search_stock` exactly as before once something's typed —
`ResultList`'s existing `alwaysActive` prop (already there for other
non-search-gated views) skips the "type to search" prompt for this mode.
`ArticleRow` gained an optional `recentHint` prop, showing the article's
last outcome + date as a color-coded badge (green ready-for-swap, red
scrapped, via the same `stockOutcomeTone()` keyed off `TypeCode` — the
backend now returns `last_type_code` alongside the label specifically so
the frontend doesn't have to pattern-match French label text to pick a
color).

Live-verified via a temporary `#[tokio::test]` calling
`reman_recent_stock_processing` directly — returned 30 real articles,
correctly sorted newest-first, real outcomes/dates matching what the
processing-history feature already surfaces per-article.

## Sixth write path: "Pièce Nettoyée" (NET) (2026-08-11)

Same live-tracking discipline as every other write path: "17489601 check
this job so we can add the step pièce nettoyée." Job was already sitting
at ATN (Attente Nettoyage) from an earlier step, snapshot before, watched
it go ATN → NET through the native 4D client, snapshot after, diffed.
The technician who did the cleaning was Archimed Saïd (id 3389) —
confirmed directly ("it's archimed said who cleaned it").

**Confirmed from the diff**:
- `TypeCode = 'NET'`, `TypeLibelle = 'Pièce Nettoyée'`.
- `DernièreInterv`/`DateDernInterv`/`heureModif` update the same way
  every other write in this file already replicates.
- `Nettoyage` stays untouched — consistent with the existing inference in
  `add_awaiting_cleaning_step`'s doc comment.
- **`TechDernInterv` is not touched** — genuinely different from ER/ATN/
  VAL/TES/R, which all unconditionally set it to the step's own
  technician. Stayed `3569` (who'd done the earlier ER/ATN steps) even
  though the NET step itself is logged under `3389`. Reads as consistent
  with the rest of this file's treatment of Archimed/cleaning work as not
  "technical" credit — `NomDernierTech` already only updates on a closing
  step, and this is a second, distinct field behaving the same way for
  the same underlying reason.

**Implementation**: `add_piece_cleaned_step`/`reman_mark_piece_cleaned`
mirror `add_awaiting_cleaning_step`/`reman_mark_awaiting_cleaning` minus
the `TechDernInterv`/`Nettoyage` writes. Frontend: `StepType` gained
`'NET'` between ATN and VAL, matching the real workflow order
(ER → ATN → NET → VAL/TES → R).

Live-verified (temporary `#[tokio::test]`, removed after confirming):
wrote a real NET step against an open job (attributed to Archimed's real
id, 3389, matching the live scenario), confirmed `DernièreInterv` updated
and — the specific thing worth checking here — `TechDernInterv` stayed
exactly at its pre-write value, then restored `LigCde`'s mutated fields.

## Accessoires: "Support de fixation" check before closing (2026-08-12)

Requested directly against job 17490801: "check also accessoires field
with support de fixation, this one hadd it so before closing you have to
check that you put the mounting back onto the abs."

**Not a `LigCde` field** — an earlier pass (2026-08-03, documented above
in the "Skipped, deliberately" section) looked there and correctly found
nothing. It's a separate table, `Accessoires` (`NoInt_ligCde` FK,
`NoIntParam` FK to the accessory type, `CtrlPresence` Boolean — exactly
"has this been physically confirmed present"). Confirmed live against
17490801: one row, `NoIntParam = 2200`, `CtrlPresence = True` (already
checked for that job). Confirmed at scale this is a real, non-trivial
gap, not hypothetical: 4628 total `Accessoires` rows, **730 (13.6%) with
`CtrlPresence = False`**, including real jobs that were already closed
(`Soldée = True`) with the check never confirmed.

**`NoIntParam`'s human-readable name isn't stored in any queryable 4D
table** — checked live against `Article`, `ArticleMeteor`, and
`Zebra_Accessoire` (itself completely empty, despite mirroring
`Accessoires`'s shape — presumably an unused parallel subsystem). The
accessory catalog appears to live only in 4D's own form/method layer.
Presented this gap and two decisions directly (`AskUserQuestion`): label
strategy → "start with known mappings, expand over time" (2200 =
"Support de fixation" hardcoded now, `accessoire_label()` falls back to
"Accessoire #<id>" for anything unmapped rather than guessing); close
gating → "yes, block closing until confirmed," same precedent as Tests &
Actions Systématiques.

**Implementation**:
- `accessoires_for(conn, ligcde_id)` — reads `Accessoires` for the job,
  probing `CtrlPresence` the same WHERE-only way `probe_boolean` does for
  `LigCde` (not reused directly — that helper is hardcoded to
  `LigCde`/`NoInt_Ligcde`).
- `InterventionDetail` gained `accessoires: Vec<AccessoireRecord>`,
  populated in `get_intervention_sync`.
- `close_job_as_repaired` gained a guard right after the existing Tests &
  Actions check: any unconfirmed accessory blocks the close with a clear
  error, before any write happens.
- New write command `reman_confirm_accessoire(ligcde_id, accessoire_id)`
  — a plain `UPDATE Accessoires SET CtrlPresence = True`. Unlike every
  other write path in this file, this one didn't need a native-4D
  before/after diff first: it's a single Boolean column with no other
  side effects to reverse-engineer (no `Intervention` audit row, no
  cascading `LigCde` fields), so a live write/read/restore round trip was
  judged sufficient rigor on its own.
- Frontend: `InterventionDetail` gained `accessoires`; a new
  `AccessoiresPanel` renders above `AddStepForm` only when a job actually
  has accessories (most don't) — each one shown with a one-tap "Confirm
  present" button that disappears once confirmed.

Live-verified (temporary `#[tokio::test]`, removed after confirming): the
real read for 17490801 came back exactly as expected (`"Support de
fixation"`, confirmed). Separately, on a second real open job
(17490201/ligcde 39671, `Type_Service = 103` chosen specifically to
bypass the Tests & Actions gate so the accessory error would be the one
that actually fires), inserted a synthetic unconfirmed `Accessoires` row,
confirmed `close_job_as_repaired` blocked with exactly the expected
message *before any write occurred* (safe to test directly — the guard
always returns early), confirmed the write path clears it, then deleted
the synthetic row — nothing needed restoring on `LigCde`/`Intervention`
since the blocked close never got that far.

## Forecast accuracy history surfaced in the app (2026-08-14)

The 17:25 daily snapshot (`RemanForecastDailySnapshot`, built 2026-08-06)
was deliberately storage-only at the time — "it doesn't need to be
displayed." Once a real week of data existed, asked directly: "how was
the prediction, are we spot on or way off... can we look at it in the
app?"

**Checked the data first, in chat, before building anything.** 8 days
captured (2026-08-06 → 2026-08-13). Two showed `actual` all-zero
(2026-08-08, 2026-08-09) — confirmed live these are genuine (Saturday/
Sunday, zero `Intervention` steps logged at all, zero jobs closed — shop
closed, not a capture bug), not something to silently average in as if
the shop underperformed. Across the 6 real weekdays (72 total closures):
repaired ran hotter than predicted (53% actual vs. 44% predicted), NFF
ran cooler (15% vs. 25%), exchange/non-repairable close. Flagged as a
real but small-sample signal (72 closures over 6 days), not something to
act on yet — worth checking again after another week or two.

**New read-only command**: `reman_forecast_accuracy_history` (in
`commands.rs`, alongside `ForecastComparison`) — selects every
`RemanForecastDailySnapshot` row, deserializes `predicted_json`/
`actual_json` straight into the existing `PredictedMix`/
`OutcomeBreakdown` structs (guaranteed to round-trip — same structs the
capture job serialized from in the first place). No new writes, no
change to `try_run_forecast_snapshot`'s capture logic.

**Frontend**: `RemanForecast.tsx` gained a third collapsible section
("History", next to "Compare"/"By family") rendering `ForecastHistoryView`
— fetched once on expand (not polled like the live sections; this data
only changes once a day) with a manual refresh button. Two views on the
same data:
- An aggregate outcome-mix table (predicted % vs. actual %), computed
  only from days with at least one real closure — a shop-closed day
  contributes to neither side, so it can't silently drag the mix toward
  "nothing happened."
- A per-day table (bench size vs. units actually closed that day) —
  makes the "predicted is total current WIP, actual is one day's
  throughput" distinction the whole forecast-comparison design has
  carried since 2026-08-06 visible directly, instead of only living in a
  caveat sentence.

Live-verified (temporary test module in `commands.rs`, removed after
confirming): called the exact query+deserialize logic directly against
the real Postgres data — returned all 8 days, values matching the
in-chat analysis exactly (e.g. 2026-08-06: bench 20, predicted repaired
8.43, actual repaired 11).

## Search now matches fault description text (2026-08-14)

Asked directly to search a fault code ("5DF0") against "fault description
of all previous jobs" restricted to a `CodeArt` prefix, done first as a
one-off investigation: 28 matches (`LigCde.Observations LIKE '%5DF0%'`
AND `CodeArt LIKE '100961%'`) — the exact same field `AbsFaultHint`'s
lexical guess already reads, confirming it's the real "fault description"
text technicians enter at intake. Outcome breakdown on those 28: **25
repaired (89%), 3 still open** — a strong, clean signal this specific
fault code (a pump/motor issue, "5DF0" almost always paired with "5DF1"
in the text) is reliably repairable, not scrap-prone.

Requested directly as a real feature, not just a one-off query: "we
should have features like this in the app." `l.Observations` added to
`reman_search_interventions`'s existing free-text OR clause (alongside
`NomClient`/`CodeArt`/`LibelleArt`/`NoIntervention`) — a fault code isn't
a client name/article/reference either, so it slots into the same box
rather than a separate search mode. Applies to every queue tab
unchanged (the condition is queue-agnostic, same as the existing four);
searching from "Interventions Soldées" finds closed jobs, from
"Interventions" finds open ones — same as searching for anything else
today, no new UI. Search placeholder text updated to mention it.

Live-verified: replicated the exact new WHERE clause directly against
4D for `q = '5DF0'` — 33 closed-queue matches, 14 open-queue matches,
including the 3 open jobs from the original 100961-prefix investigation
(13804601, 16076301, 17495201).

## Accessory check moved into the close form itself (2026-08-14)

Reported directly: "it's not asking me to check and validate support
presence when i close as reparation." Investigated against the real job
(17494401, ligcde 39712) — it does have one accessory ("Support de
fixation") and `CtrlPresence` was already `True`, so the server-side gate
added earlier (`close_job_as_repaired`) correctly found nothing to block
on. Confirmed directly with the workflow owner that `True` was in fact
correct for that job — the gap wasn't the check's logic, it was where it
lived: a passive panel elsewhere on the page, easy to not notice,
"silently allow the close because the flag happens to already be true"
instead of actively surfacing the check as part of the close action every
time.

**Fix, frontend only** (the server-side gate in `reman.rs` is unchanged —
it was already correct): `AccessoiresPanel` moved from always rendering
above `AddStepForm` to rendering *inside* it, specifically when
`stepType === 'R'`, right alongside the `CausePanne`/`NiveauPanne`
selects — the same place every other close-specific input already lives.
`AddStepForm` gained `accessoires`/`onAccessoiresUpdated` props (passed
down from `InterventionDetail.accessoires`/`setDetail`, same shape as the
existing `onAdded`). The Close button is now also disabled client-side
(`hasUnconfirmedAccessoires`, mirroring the existing `requiresTestsActions`
pattern) whenever an unconfirmed accessory exists and "Close as
Réparation" is the selected step — instant feedback, not just a server
error after submitting. Confirmed accessories still show their green
"Confirmed" state inline, so picking "Close as Réparation" now always
surfaces the accessory checklist explicitly, whether there's anything
left to confirm or not.

### Correction, same day: surfacing it wasn't enough — it still trusted the stale flag

Corrected directly, immediately after the fix above shipped: "as long as
[I] don't click 'i checked the support is present' it shouldn't let me
close a job." The first version still gated on `a.confirmed` — the
stored `CtrlPresence` value — just displayed more prominently. For a job
like 17494401 where that flag was already `True` from some earlier point
unrelated to *this* close attempt, the Close button would still be
enabled immediately, with nothing to actually click — exactly the
original complaint, just relocated.

Redesigned to not trust the stored flag for gating at all.
`AddStepForm` gained its own local `accessoiresAcknowledged` state (a
`Set<string>` of accessory ids), reset to empty every time `stepType`
changes — so leaving and re-entering "Close as Réparation" demands a
fresh click again, not just once per job. `hasUnconfirmedAccessoires`
now checks `accessoiresAcknowledged`, not `a.confirmed`.
`AccessoiresPanel` shows every accessory as needing a click regardless of
its stored state; clicking still calls `reman_confirm_accessoire`
(harmless/idempotent if `CtrlPresence` was already `True` — the DB stays
an accurate "has this ever been confirmed" record) and marks it
acknowledged locally, which is what actually unblocks Close. Net effect:
the database flag is still written and still meaningful as a record, but
closing a job now always requires an explicit in-session gesture, never
a database value alone.

### Write-then-refresh resilience: don't let a dying connection turn a successful write into a reported failure (2026-08-25)

Reported live: "REMAN write failed: ODBC emitted an error calling
'SQLExecDirect': State: 08004, Native error: 1221, Message: Server
rejected the connection: Failed to execute statement." — but the change
was actually applied; closing and reopening the job showed the write had
gone through. Asked which action triggered it; the answer was "all
actions, it was working this morning, i don't know what happened,"
meaning this wasn't specific to one write path.

**Root cause.** Every write command (`reman_add_repair_step`,
`reman_mark_awaiting_cleaning`, `reman_mark_piece_cleaned`,
`reman_add_validation_step`, `reman_close_job_as_repaired`,
`reman_confirm_accessoire`, `reman_transfer_to_commercial`, plus
`reman_set_verified_fault_type`/`reman_clear_verified_fault_type`) opened
one `with_reman_connection` and reused that same connection for both the
write and the immediately-following `get_intervention_sync` refresh, all
inside one closure. If the connection dies in the gap between the write
committing and the refresh query running — 4D closing an idle/aging
connection, a transient network blip, whatever tripped SQLSTATE 08004
that morning — `get_intervention_sync` fails, the closure returns `Err`,
and the whole command reports failure to the UI even though the mutation
already committed on the server. Tried to reproduce directly (5
sequential connect + double-query attempts, all clean) — consistent with
an intermittent condition rather than a standing outage, so the fix
targets resilience to the failure mode rather than a specific trigger.

**Fix.** Split every write command into two independent steps instead of
one shared closure: the write happens in its own `with_reman_connection`
call (a fresh connection, used once, then dropped), and the refresh goes
through a new helper:

```rust
async fn refresh_intervention_with_retry(ligcde_id_num: i64) -> Result<InterventionDetail, String> {
    let mut last_err = String::new();
    for attempt in 0..3 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        }
        match async_runtime::spawn_blocking(move || with_reman_connection(|conn| get_intervention_sync(conn, ligcde_id_num))).await {
            Ok(Ok(detail)) => return Ok(detail),
            Ok(Err(e)) => last_err = e,
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(format!(
        "Your change was saved, but reloading this job's details failed after 3 attempts ({last_err}). Reopen the job to see the update."
    ))
}
```

The write itself is never retried (avoids duplicate writes if the write
succeeded but only the acknowledgment was lost); only the read-only
refresh gets up to 3 attempts with a fresh connection each time, 300ms
apart. If all 3 still fail, the error message now says explicitly that
the change was saved and the failure is only in reloading — no more
"write failed" language for a write that didn't fail. Applied identically
to all 9 commands above, including the two verified-fault-type commands
(their "write" is a Postgres `INSERT`/`DELETE`, but the trailing 4D read
had the exact same single-attempt fragility).

**Verified**: `cargo check --bin braxon` compiles clean; a temporary
`#[tokio::test]` called `refresh_intervention_with_retry` directly against
a live job (ligcde 39522) and got back a correct `InterventionDetail`
(4 steps, 0 accessoires — matches what's expected for that job), then was
removed. Frontend needs no changes — `AddStepForm`'s `catch (err:
unknown)` blocks already just stringify whatever `Result<_, String>`
error comes back, so nothing about the error-surfacing contract changed,
only which failures get retried before one is ever shown.

### Repair Knowledge Base (2026-08-26)

Requested directly, with a worked example: "i want a repair section...
where i give the fault code or description but codify so it's easier to
search from, like i just repair an ABS, ECU Ref 10.0925-0851.3 ATE
CONTROLLER, LAND ROVER FREELANDER I from 08/2002. fault was 5DF5, so ECU
fault usually caused by the pump being stuck not always, so it's great to
change the motor brushes as well, but fault in ECU so i replaced the
motor driver, Freescale 9369.1D it worked." Grepping `Observations`/
`Commentaire` free text (the pre-existing way to "search" for this) can't
do fault-code-exact-match or part-number search reliably — this is a
proper structured record instead.

**Storage**: a new `RemanKnowledgeEntry` table in BRAXON's own Postgres,
not 4D (see `ensure_reman_cache_tables`'s doc comment) — proprietary
tribal knowledge REMAN's schema has no home for. Fields: `ecu_ref`/
`ecu_brand`/`ecu_family`, `vehicle_make`/`vehicle_model`/`vehicle_year`,
`fault_codes`/`cause_tags`/`fix_tags` (all `TEXT[]`), `notes`,
`linked_job_ids` (`TEXT[]` of `ligcde_id`s), and the usual creator/
timestamp columns.

**Design tradeoff, presented and confirmed** ("yes exactly"): tags are
freeform with autocomplete from prior entries (`reman_list_knowledge_tag_
suggestions`) rather than a fixed controlled vocabulary. Nothing to
define or maintain up front; real-world hedging like "usually X, but not
always" doesn't fight a rigid taxonomy. Search is plain `ILIKE` across
every field plus `unnest()` over the array columns — no persisted index,
since this is expected to stay small (hundreds, not millions, of rows).
Validation deliberately doesn't require a fault *code* — MK100's real top
fault is "déséquilibre de freinage," plain text, never a DTC (see the
fault-code-mining investigation earlier in this doc) — so an entry needs
either a fault code or a filled-in notes field, not specifically a code.

**Commands** (`src-tauri/src/reman.rs`): `reman_search_knowledge_entries`,
`reman_suggest_knowledge_entries` (family + already-linked-to-this-job
match, used by the job-detail panel), `reman_create_knowledge_entry`,
`reman_update_knowledge_entry`, `reman_delete_knowledge_entry`,
`reman_link_job_to_knowledge_entry`/`reman_unlink_job_from_knowledge_
entry`, `reman_list_knowledge_tag_suggestions`. Each has a thin
`#[tauri::command]` wrapper around a plain `_impl(pg: &Client, ...)`
function so the whole CRUD surface is directly testable without a Tauri
`State` — used for live verification (create → search by fault code →
search by a fix-tag substring ("9369.1D") → suggest-for-linked-job →
link → unlink → update → delete, all against live Postgres using the
exact worked example from the request, cleaned up after).

**Linking to REMAN job listings** — the other half of the request ("link
it to reman job listings as well"): a new "Repair Knowledge" tab
(`src/components/RepairKnowledgeBase.tsx`) for direct search/browse/CRUD,
plus a collapsible "Repair Knowledge" panel added to every job's detail
view (`Reman.tsx`'s new `KnowledgeLinkPanel`, right after `StepHistory`)
that lazily fetches entries already linked to *this* job (badged "Logged
for this job") and same-family entries from other jobs as suggestions,
each linkable in one click. "Log this fix" opens the same entry form
pre-filled with the job's ECU ref (`codeArt`)/brand (`marque`)/family
(`famille`)/vehicle model, and points `linkedJobIds` at the current job
on save — so a codified record and the job that proved it out are linked
from the moment the entry exists, not as a separate manual step. Linked
job ids are shown as plain `#id` text (searchable in the existing
Interventions/Mine tabs), not a deep link — judged good enough for v1
given the wiring cost of a cross-tab navigation callback through several
nested components; worth revisiting if it turns out to matter in
practice.

**Verified**: `cargo check --bin braxon` clean; a temporary
`#[tokio::test]` round-tripped the full CRUD surface against live
Postgres using the exact worked example from the request (all assertions
passed, row cleaned up after); `npx tsc --noEmit` clean. Not verified:
the actual native Tauri window — this environment has no driver for a
Tauri desktop GUI (no project `run` skill, no Electron-style headless
driver, and a full native launch/screenshot wasn't attempted) — backend
and typing correctness are confirmed, but the UI itself wants a real
look before being called done.

#### Two corrections, next day (2026-08-27)

Reported directly, right after first real use: "let me link jobs
existing repair knowledge, because it's linked when i create it from the
job itself but i can't link one i created in the repair knowledge
section to a job in suivi d'intervention, also it should auto detect
fault and show us the potential fix for that."

1. **Linking gap.** The Knowledge tab's "link a job" control was a plain
   text box expecting a raw `ligcde_id` — an internal id that never
   appears anywhere in the UI (jobs are always shown/searched by
   reference, client, or vehicle). Practically un-usable from that side,
   which matches exactly what was reported. Fixed with a new
   `JobLinkPicker` (`RepairKnowledgeBase.tsx`) — a debounced search box
   reusing `reman_search_interventions` the same way the Interventions
   tab does, querying both the Open queue ("Suivi d'interventions") and
   Closed in parallel and merging/de-duplicating results, since a fix
   might be logged against a job still on the bench or one already
   closed. Picking a result from the dropdown calls
   `reman_link_job_to_knowledge_entry` directly — no id-typing at all.

2. **Auto-detection.** `reman_suggest_knowledge_entries` gained a third
   parameter, `symptom_text` — the frontend concatenates a job's
   `commentaireClient`/`commentaireInterne` plus every step's
   `commentaire` (all fields the detail view already fetched, no new 4D
   query needed) and sends it along. The SQL now also matches any entry
   whose `fault_codes` array contains a value found as a substring of
   that text (`length(v) >= 3` guards against a short tag matching
   almost anything), flagged `fault_code_detected` on the returned
   entry — distinct from the existing family-only match. `Knowledge
   LinkPanel` (`Reman.tsx`) now fetches as soon as it mounts instead of
   waiting for a click, and auto-expands itself the first time a
   detected match comes back, with a "Fault match found" badge on the
   header and a "Potential fix" badge on the specific matching entry —
   so a tech sees it without hunting for it, per the request. Family-only
   suggestions still show but don't force the panel open on their own.

   Verified live: a temporary `#[tokio::test]` created a 5DF5 entry, then
   called the suggest query three ways — symptom text that literally
   contains "5DF5" (flagged detected), symptom text that doesn't mention
   it (family match only, not flagged), and no symptom text at all (same,
   not flagged) — all three behaved as expected, row cleaned up after.
   `cargo check --bin braxon` and `npx tsc --noEmit` both clean.

### Shop status snapshot + closed-on-a-day outcome mix, replacing "units per day" (2026-08-27)

Requested directly: "units in per day is not very important for me and it
seems to be wrong anyway, the most interesting data is the units that are
in the shop, in hands of technicians or waiting for information or
devis, and where we have the mix of outcomes, i want to know how many
units we closed, like today, i see 19 so far in 4D, some ND some NFF,
some repairs and standard exchanges and also validation sous traitance
other days."

**Why the old number seemed wrong**: `RemanAnalytics.dailyIntake`
(feeding the removed "avg X/day" sub-label and "Units in per day" chart)
is scoped by `Commande.DateCommande` — *intake* date, not close date.
Pointing the date-range picker at "today" showed jobs that *arrived*
today, not jobs *finished* today — a different question than the one
being asked. Both the sub-label and the chart are removed; `totalIntake`
itself (the plain count, not the per-day framing) stays as the "Units
in" KPI.

**Real TypeCode meanings, checked live rather than assumed** — several of
these hadn't been catalogued anywhere in this file before building
`shop_status_core`: `AP` "Attente de Pièces" (parts), `ARC` "Attente
Renseignements" (info, documented earlier), `RRC` "Réponse Rens. Clt"
(same conversation, the client's side), `ARD` "Attente Réponse Devis" and
`DA` "Devis - Réponse Client" (both the quote/devis back-and-forth — this
is what "devis" in the request maps to), `ATN` "Attente de nettoyage"
(cleaning). `ER`/`PA`/no TypeCode at all are *not* hand-offs (confirmed
elsewhere in this file, `CATEGORIZED_TYPE_CODES`'s doc comment) — still
active technician work, bucketed as `with_technician`. `TES`/`VAL`/`ST`
fold into a catch-all `other` so `total_open` always equals the sum of
every bucket exactly.

**A real bug found investigating this**: `LigCde.DateDernInterv` is a
genuine Date-typed 4D column, not text — `LIKE '{date}%'` against it
fails outright, reported as SQLSTATE 08004 "server rejected the
connection." Confirmed live (isolated to a single fresh connection,
single condition, no other query running): `Soldée = True` alone works,
`DateDernInterv LIKE '...'` alone fails, `DateDernInterv = 'DD/MM/YYYY'`
(exact match) works, `DateDernInterv BETWEEN 'YYYY-MM-DD' AND
'YYYY-MM-DD'` (ISO literals) works. A misleading "connection rejected"
error for what's actually an invalid-comparison-type rejection — not the
same failure mode as the write-command connection-drop issue fixed
2026-08-25, just an error message that happens to look identical.
`reman_closed_on_day` uses `BETWEEN`, never `LIKE`, against this column.

**New commands**: `reman_shop_status` (live, cached under the shared
`"shop_status"` Postgres key — same multi-client load-reduction reasoning
as `bench_queue`/`actual_outcomes_today`, 30s TTL) returns `total_open`
plus the six buckets above. `reman_closed_on_day(date)` returns the
outcome mix (`OutcomeBreakdown`, reused as-is) for jobs closed on any one
day, cached per-date under a dynamically-created `"closed_on_day:
{date}"` key (bootstrapped inline since it's not one of the fixed
pre-seeded cache rows — unbounded growth in principle, trivial in
practice, at most a row or two added per day of real usage).

**Frontend**: two new cards at the very top of the Analytics tab, above
the historical date-range controls — a live "Shop status — right now"
card (auto-refreshing every 30s, matching the cache TTL) and a "Closed on
this day" card with a date picker (defaults to today, works for any past
day — "validation sous-traitance other days").

**Verified live**: a temporary `#[tokio::test]` called both new
functions directly against the real server. Shop status: `total_open =
9461`, bucket sum matched exactly (`with_technician=9437,
awaiting_parts=9, awaiting_info=3, awaiting_devis=0,
awaiting_cleaning=0, other=12`). Closed today (2026-08-27): **total = 19**
— an exact match to "i see 19 so far in 4D" — with `repaired=14,
non_repairable=1, no_fault_found=2, standard_exchange=2, sold=0,
sent_to_subcontractor=0`, consistent with "some ND some NFF, some repairs
and standard exchanges." `cargo check --bin braxon` and `npx tsc --noEmit`
both clean.

#### Correction, same day: `total_open = 9461` was nonsense, and the two new cards were redundant with existing ones

Reported back immediately: "this is complete nonsense we don't have 9000
units in the shop and the close on this day is weird you should just
have updated the component below that were already trying to do the
same, dig deeper, the full architecture and update."

**The wrong number.** `shop_status_core` only scoped `LigCde."Soldée" =
False` — it never applied `Commande.StatutDossier`'s exclusion that
`reman_analytics`'s own intake query has used since before this feature
existed (the "ATTENTE ACCORD"/"CLOTURE" `continue` a few sections above
this one in the file). Verified live before fixing
(`scripts/_scratch-attente-accord-investigation.mjs`): of 300 sampled
`ATTENTE ACCORD` open jobs, **0** had ever had a single `Intervention`
row — a quote sent, waiting on the client's initial go-ahead, before any
technician ever touches the unit. That status alone was 7055 of the
9461; `CLOTURE` (administratively voided) another 2359. Together, over
99% of the reported number was never real shop-floor presence — exactly
matching "we don't have 9000 units in the shop."

**The fix**: `ShopStatusSnapshot` gained `awaiting_customer_agreement`, a
separate field for the `ATTENTE ACCORD` count, deliberately excluded from
`total_open` and every TypeCode bucket. `CLOTURE` is dropped entirely.
`shop_status_core` now joins `Commande` for `StatutDossier`, splits the
population three ways (`CLOTURE` → dropped, `ATTENTE ACCORD` →
`awaiting_customer_agreement`, everything else → the six real buckets),
re-verified live via a second temporary test: **`total_open = 47`**
(`with_technician=31, awaiting_parts=9, awaiting_info=2, awaiting_devis=0,
awaiting_cleaning=0, other=5`), `awaiting_customer_agreement = 7055`
reported separately. 47 real units on the floor is a number a shop owner
can look at and believe.

**The redundancy.** Both new cards duplicated components already on the
page: "Shop status" duplicated "Where the open jobs are" (`open_status_
breakdown`, a `Commande.StatutDossier` bar list scoped to the historical
date range) — same question, two different answers on the same screen.
"Closed on this day" duplicated "The mix — outcome breakdown" (the
existing donut, intake-date-range-scoped). Fixed by updating each
existing component in place instead of leaving the new ones standing
next to them:

- **"Where the open jobs are"** now *is* the live shop-status view (the
  card above, at the top of the page, independent of the date-range
  controls) — the old StatutDossier bar list is gone; its backend
  counterpart (`open_status_breakdown` in `RemanAnalytics`, the
  `NamedCount` struct, the `open_status` HashMap and its population loop
  in `reman_analytics`) is deleted, not just unused — nothing else read
  it (checked via `grep` before removing).
- **"The mix — outcome breakdown"** gained a Range/Day toggle in the same
  `ChartCard`, same `<PieChart>`. Range mode is the original behavior
  unchanged; Day mode swaps in `reman_closed_on_day`'s data and a date
  picker. No new card, no new chart component — the existing donut just
  has two data sources now.

**Verified**: `cargo check --bin braxon` and `npx tsc --noEmit` both
clean after the rewrite; the corrected `shop_status_core` re-verified
live per the numbers above.

#### Second correction, next day (2026-08-28): the outcome mix was scoped by the wrong date entirely

Reported directly, with a screenshot showing the Range picker set to
"Today" (27/08→27/08) and the outcome donut completely empty (0 closed
jobs, all gray "In progress"), sitting right next to the separately-added
"This day" toggle correctly showing 19 real closed jobs for the exact
same date: "the range i selected is today, but it shows nothing, but the
today you made is showing 19 units, do you see why i'm saying there's
something wrong, the data we're using for the whole section is incorrect
otherwise, you wouldn't have to add this today section in the mix of
outcoms you get it now?"

**Root cause**: `RemanAnalytics.outcomes`/`top_families` had *always*
been built from the intake cohort (`Commande.DateCommande BETWEEN
{from}/{to}`) — "of the jobs that *arrived* in this window, what's their
outcome now" — not "what did we *close* in this window." A job that
arrived weeks before the window and closed today was invisible to that
query; a job that arrived today and (almost never) closes same-day was
all it could ever show for "Today." `daily_revenue` had been
`DateDernInterv`-scoped (close date) from the start — which is exactly
why Revenue showed a real 4791€ for "Today" while the donut right next
to it showed nothing: two numbers, two silently different date
definitions, on the same page, under the same picker.

**The tell, in the user's own words**: needing a bolt-on "closed on this
day" special case at all, one day after building it, was itself the
signal that the *main* query was wrong — not a case for keeping both.

**Fix**: `reman_analytics`'s `outcome_sql` now scopes `outcomes`/
`by_family`/`top_families` by `l."Soldée" = True AND l.DateDernInterv
BETWEEN {from}/{to}` — the exact same `BETWEEN`-on-a-real-date-column
pattern already validated for `reman_closed_on_day` the day before, now
folded into the main query instead of living beside it. `Soldée = True`
alone already excludes both `ATTENTE ACCORD` and `CLOTURE` (100%
`Soldée = False`, confirmed earlier), so no extra exclusion logic is
needed here. `total_intake`/`daily_intake` (the "Units in" KPI) are
untouched — arrivals are legitimately an intake-date concept, that part
was never wrong. Every `OutcomeBreakdown` this query produces now has
`in_progress` permanently at 0 (it only ever returns already-closed
jobs) — so the "In progress" KPI card, which would otherwise silently
show 0 forever, was removed from this section entirely rather than kept
as yet another differently-scoped number; the live "Where the open jobs
are" card above already answers "what's unresolved right now," better
than a stale cohort count ever did.

With the root query fixed, `reman_analytics` at `from == to == today`
*is* what `reman_closed_on_day` was built to provide — so that command,
`ClosedDaySnapshot`, `closed_on_day_core`, the frontend Range/Day toggle,
and all associated state were deleted outright, a day after being added.
Fixing the underlying data made the workaround unnecessary rather than
leaving it in place beside a now-correct main view.

**Verified live** (`scripts/_scratch-verify-outcome-close-date-fix.mjs`,
replicating the new SQL + Rust classification logic exactly): 27/08/2026
under the new query still gives **total = 19**
(`repaired=14, no_fault_found=2, standard_exchange=2, non_repairable=1`)
— an exact match to the number already validated the day before via the
now-deleted separate command, confirming the fix reproduces it correctly
as part of the main query. A 6-month range regression check still
returns a large, sensible total (2240, spread across every outcome
type). `cargo check --bin braxon` and `npx tsc --noEmit` both clean.

#### Third correction, next day (2026-08-29): shop status still didn't match reality — two more unbounded populations

Reported directly, with a screenshot showing "With technician 35,
Awaiting parts 9, Awaiting information 2, Other 1" and "7057 quotes
awaiting client agreement": "that is wrong, we don't have 35 units in
the shop right now, what the forecast component gets is closer to
reality in its bench mix right now i think, also 7000 units awaiting
quotes when we only had 4000 units for an entire year come on."

Both concrete, both confirmed live before fixing
(`scripts/_scratch-shop-status-staleness-investigation.mjs`):

1. **`total_open`/`with_technician` never applied the staleness filter
   `forecast_open_queue_core`'s own `units_with_tech` already uses** —
   `DateLimiteLivraison` required, not more than a month past (see its
   doc comment; that definition was cross-checked once against a real
   16-job worklist, the most rigorously validated live-count logic in
   this file). Of the 47 jobs `total_open` counted, only **13** actually
   had a fresh delivery deadline: 33 had none set at all, 1 was over a
   month overdue. Rather than defend or re-derive a second "is this job
   real" definition, `shop_status_core` now reuses the forecast panel's
   exact filter — the user's own comparison ("the forecast component...
   is closer to reality") was the right call.

2. **`awaiting_customer_agreement` had no recency bound at all** —
   every `ATTENTE ACCORD` job ever created, all the way back. Age
   distribution of the 7057: only 165 were ≤30 days old; **4948 (70%)
   were over a year old**. The shop's entire trailing-365-day closed
   volume (bench jobs) is 4114 — a live "quotes awaiting an answer"
   number larger than a full year of total throughput was never
   plausible, exactly the sanity check the user ran in their head.
   Bounded to the same 30-day cutoff (`is_more_than_a_month_past`)
   already used everywhere else in this file for "is this open job
   still realistically live" — no new threshold invented, reused the
   existing one for consistency.

**Verified live**: `total_open` now **13** (`with_technician=3,
awaiting_parts=9, awaiting_info=1, awaiting_devis=0,
awaiting_cleaning=0, other=0`), `awaiting_customer_agreement` now
**173** — both a temporary `#[tokio::test]` (bucket-sum-equals-total
assertion, plus sanity bounds) and consistent with the standalone
investigation script's numbers. `cargo check --bin braxon` clean.

Also raised in the same message, less concretely ("what is active
technician even saying? i don't know"): checked the "Active
technicians" KPI's logic (`reman_analytics`'s technician-activity
section) — it already excludes the generic Superviseur account, the
logistics coordinator (id 3389, confirmed elsewhere in this file to
never be the real credit-worthy technician), and anyone marked inactive
in the roster, each exclusion backed by its own prior live
investigation. Found no bug to fix here; flagged rather than silently
left alone, since it was raised directly — if the number still looks
wrong once seen against the fixes above, the actual value would help
narrow down what's off.

### Technician leaderboard: transformation rate per technician (2026-08-29)

Requested directly, after asking what "Units in" means: "for technician
leaderboard, add the option to see transformation rate, so from these
units they touched, how many are repaired, exchange, sold."

**What it computes**: for each technician's existing job-id set (the same
one `units` already counts — every distinct job with an `Intervention`
row in the selected date range, attributed by `NoIntTechn` with the
existing Superviseur→VAL-step reattribution), look up each job's
*current* outcome — regardless of when it closed. Re-scoping by the
selected date range a second time would silently drop a technician's own
touch that closed shortly after the window ended, which isn't what "of
these units they touched" is asking. One IN-list lookup for the union of
every touched job across all technicians (not per-technician, to avoid
N+1 queries): a `Soldée = True` WHERE-only query for which of them are
closed, then a `TypeCode`-per-latest-step query for the rest, same
`is_more_recent_step` dedup used everywhere else in this file.
`TechnicianActivity` gained an `outcomes: OutcomeBreakdown` field — here
`in_progress` is *real* (unlike the range-scoped donut above, which never
has any by construction) — a technician's still-open touches show up
there, not silently dropped.

**Frontend**: a Units/Transformation toggle on the same leaderboard, same
technician order in both views. Deliberately *not* re-sorted by rate in
transformation mode — a technician with one lucky closed job at 100%
would otherwise outrank someone with hundreds of real ones at 76%; rate
is a second lens on the existing units-touched ranking, not a reshuffle.

**Verified live** (`scripts/_scratch-verify-tech-transformation-mix.mjs`,
replicating the SQL + classification logic): top technicians over a
6-month window came back with rates spread 18%-76%, each internally
consistent (bucket sum equals units touched). `cargo check --bin braxon`
and `npx tsc --noEmit` both clean.

### Technician leaderboard: outcome-mix chart, sorting, and roster-driven Service Commercial reattribution (2026-08-30)

Requested directly, three parts in one message: "for technician leader I
love what you did but it could be great to use the same thing we used
for outcome per family, be able to tell how many repairs, exchanges,
sells and so on and also add some sorting thing... also you can check the
roster data to know who is a technician and who is a commercial, so if
you see a commercial's name as last check the step before and see who's
technician name was attached, because in case we couldn't repair, we
send it to service commercial and if the customer refuses the exchange,
it's the commercial that closes the job but it's the technician that
worked on it."

**Roster-driven reattribution (the correctness fix).** Generalizes the
existing Superviseur→VAL-step reattribution: a new `commercial_tech_ids`
helper reads `RemanTechnicianRoster.is_commercial = true` (same
permissive default as `inactive_tech_ids` and everywhere else in this
file — no roster row means "not managed yet," treated as a real
technician, not commercial; only an explicit flag triggers this). Every
job attributed to a commercial id gets its full step history (already
fetched, shared with the outcome-mix lookup below) walked for the most
recent step touched by someone who *isn't* commercial, and re-credited
to them.

Confirmed this was a real, live bug before shipping the fix, not a
hypothetical: the roster currently has 5 ids flagged `is_commercial =
true` (`71, 72, 3495, 3976, 4028`), and two of them — 71 and 3495 — had
already shown up in an earlier live check as top-8 "technicians" with
conspicuously low transformation rates (32%, 18%) — exactly the
"commercial closes a job a technician couldn't fix" pattern being
reported. Live re-verification after the fix
(`scripts/_scratch-verify-commercial-reattribution.mjs`, a faithful JS
port of the exact Rust query/algorithm) over a 6-month window: **1083
commercial-attributed touches redirected**; the 5 commercial ids dropped
from (473, 49, 171, 301, 197) units to (41, 1, 3, 49, 14) — the small
remainders are jobs with genuinely no other technician on them at all,
the documented fallback case. A real technician's count (3569) only grew
(541→544), never shrank, confirming redirected credit lands correctly
without double-counting or dropping anything. Commercial ids are also
now excluded from ever appearing directly in the leaderboard (same
treatment as Superviseur/Archimed) for that fallback case.

One honest simplification, noted in the code: the walk-back uses each
step's *raw* `NoIntTechn` (no Superviseur→VAL reattribution applied to
prior steps in the walk-back itself) — re-deriving that narrow mechanism
for arbitrary historical steps wasn't worth the complexity for what's
likely a rare overlap; same "documented gap, not chased to the last
degree" precedent already used for the comeback-tracking section
elsewhere in this file.

**Outcome-mix chart** ("use the same thing we used for outcome per
family"): the leaderboard's "Outcome mix" view is now the exact same
stacked horizontal `BarChart` as "Repairability by family" — same
colors, same structure — just keyed by technician (`TechnicianActivity`
already had `outcomes: OutcomeBreakdown` from the prior day's
transformation-rate feature; this is the same data, a different chart).
"Units touched" mode keeps the original plain bar list.

**Sorting**: a `<select>` next to the view toggle — Units touched,
Most repaired, Most exchanges, Most sold, Most NFF, Most non-repairable,
Most sent to subcontractor, Most other — reorders `sortedTechnicians`
(and therefore both chart modes) by whichever `OutcomeBreakdown` field is
picked, computed client-side from data already on hand.

**Verified**: `cargo check --bin braxon` and `npx tsc --noEmit` both
clean; the reattribution logic verified live per the numbers above.

### "Suivi d'intervention" felt slow — diagnosed before redesigning anything (2026-08-31)

Reported directly: adding a step took 10+ seconds to show up, and the
proposed fix was "assume success on all actions" plus a Postgres-based
push/pull system between clients and a notification system.

**Measured before building anything.** A live-timed pass through the
actual write-then-refresh flow (isolated, off-hours) found the 4D detail
refresh (~15 queries) at ~500ms and 4D connection setup consistently
30–230ms — nowhere near 10 seconds. One real, unambiguous waste was
found and fixed along the way: `ensure_reman_cache_tables`'s 17
sequential `CREATE`/`ALTER`/`INSERT` statements were re-running on
*every single call* (26 call sites) instead of once per app launch —
measured at ~280ms wasted per call. Now gated behind a
`CACHE_TABLES_ENSURED` `AtomicBool`, idempotent DDL only needs to run
once per process regardless of how many BRAXON instances start
concurrently.

That still didn't explain the reported delay, so rather than guess
further at backend latency, asked directly what specifically felt slow —
answer: "it's both," meaning two genuinely separate problems, confirmed
by re-reading `INTERVENTIONS_REFRESH_MS`'s own history: the queue list
only auto-refreshes every 60 seconds (deliberately not lowered earlier
because `reman_search_interventions` was never wired into the shared
Postgres cache the forecast panel/shop status use — unlike those, it
takes seven independent filter parameters, so polling it more often
directly multiplies real 4D load per client rather than absorbing it).

**Fix 1 — the query itself is now shared, so the interval could come
down.** `reman_search_interventions` split into a private
`_core` function plus a thin `#[tauri::command]` wrapper, following the
same dynamic-per-key `cached_or_refresh` pattern already used for
`reman_closed_on_day`: a cache key built from all seven parameters
(`queue|query|tech_id|family|fault_type|date_from|date_to`),
bootstrapped on first sight. Most clients are watching the same handful
of common views (the default Open queue, empty filters) at any given
moment, so they now share one real 4D scan per `LIVE_CACHE_TTL_SECONDS`
window regardless of how many are polling — a rare custom filter
combination just gets its own smaller-shared row, never worse than
before. Verified live: a cold call took 593ms (real 4D scan); an
immediately-following read of the same key took 3ms, confirmed served
from cache without the refresh future ever being invoked (it was wired
to `panic!()` if called, and didn't). `INTERVENTIONS_REFRESH_MS` halved
30s → matching `LIVE_CACHE_TTL_SECONDS`/`SHOP_STATUS_REFRESH_MS`
elsewhere in this file, safe now that polling faster no longer multiplies
real 4D load.

**Fix 2 — a job sitting stale in the wrong queue.** Closing a job already
got instant local removal from the list (requested earlier: "kick it out
of suivi d'interventions directly"), but marking a job "Attente de
nettoyage" or "Pièce nettoyée" never did — the row just sat in whatever
queue it was already showing in until the next poll. `AddStepForm`'s
`onAdded` now also passes the step's TypeCode up through
`InterventionRow` to `InterventionsTab`, which uses a new
`stepLeavesQueue(stepType, queue)` helper (mirroring
`CATEGORIZED_TYPE_CODES`/`InterventionQueue::type_codes()` from reman.rs)
to drop the row from view the instant a step means it no longer belongs
in the currently-selected queue. Deliberately one-directional — it only
ever removes a row it's sure no longer matches; it never tries to guess
that a different row should newly *appear*, which would need the same
staleness/date logic the server applies.

**On the proposed redesign itself**: "assume success on all actions"
was not built, and explained why directly to the user — it would reverse
the write-reliability work from a few days earlier (retry-the-refresh-
not-the-write, honest "saved but reloading failed" errors instead of
false negatives) and reintroduce exactly the silent-failure risk that
work existed to close. Optimistic UI (show the change immediately,
reconcile against the confirmed response, only roll back on a real
failure) was offered as the safe way to get the same felt speed without
that risk, not yet built — pending the user's call on whether the two
fixes above already resolve it. The Postgres push/pull-between-clients
and notification-system ideas are legitimate, separate features with a
real foundation already in place (`RemanLiveCache`, `LISTEN`/`NOTIFY` as
an option for true push) — deliberately not built blind in the same pass
as this diagnosis; worth scoping properly once it's clear the two fixes
above weren't already enough.

**Verified**: `cargo check --bin braxon` and `npx tsc --noEmit` both
clean; the cache wrapper verified live per the numbers above.

### Notification system: hand-off events (2026-08-31)

Requested directly, with the real operational cost spelled out: "it was
optimistic UI I was thinking about, and I think they should go together
with the notification system, because, if I mark a job attente de
nettoyage, I want to know when it is cleaned, same for service
commercial, because technicians only put units on the shelves, if they
don't go check all the time, they'll miss some stuff and it's the same
reason we have some units late." A real diagnosis, not a vague ask: a job
handed off into a queue only the *next* person is expected to notice —
with nothing telling them it arrived — is a genuine blind spot, and the
user connected it directly to a real symptom (late units).

**New `RemanNotification` table** (BRAXON's own Postgres): one row per
recipient per event (fan-out at write time, not a join at read time —
"mark this one read" only ever needs to touch exactly the row the reader
is looking at). `kind` is a free string tag ("awaiting_cleaning",
"transferred_commercial"), not a fixed enum column, so more hand-off
types can be added later without a migration.

**New roster role, `is_cleaning`** — mirrors the existing `is_commercial`
flag exactly (same permissive default: no roster row means "not on
cleaning duty," not an error). Commercial reused the flag that already
existed (and already drives the technician-leaderboard reattribution from
a day earlier); cleaning had no equivalent until now. Set in the Roster
tab, same table, same UI pattern.

**Trigger points**: `reman_mark_awaiting_cleaning` now creates one
notification per `is_cleaning`-flagged tech after a successful write;
`reman_transfer_to_commercial` does the same for `is_commercial`-flagged
techs. Both fire *after* `refresh_intervention_with_retry` succeeds — a
notification never gets created for a write that didn't actually land.

**Commands**: `reman_list_notifications(tech_id)` — unread first (newest
first), then the 20 most recent already-read ones, enough to catch up
after being away without the list growing forever.
`reman_mark_notification_read`/`reman_mark_all_notifications_read`,
both scoped to the caller's own `tech_id` (same "can only touch your own"
pattern as `reman_delete_saved_comment`).

**Delivery**: a bell icon mounted once in `Sidebar.tsx` (not buried
inside the Reman tab — visible from every page, since the whole point is
not needing to go check), polling every 30s (matches
`INTERVENTIONS_REFRESH_MS`/`SHOP_STATUS_REFRESH_MS` elsewhere in this
app). Renders nothing for a session with no claimed REMAN identity —
nothing to notify them about. On top of the in-app badge/panel, new
unread notifications also fire a **native OS toast** — Tauri v1's
built-in `notification` allowlist (`notification-all` Cargo feature,
`"notification": {"all": true}` in `tauri.conf.json`), no new external
dependency (pulled in `tauri-winrt-notification` for the Windows toast
backend). Deliberately skips toasting the whole backlog on first load —
a `seenIdsRef` guard means only notifications that arrive *after* the
panel's first poll get a toast, so opening the app doesn't replay
everything that happened while it was closed.

**Verified live**: a temporary `#[tokio::test]` round-tripped
create/list/mark-one-read/mark-all-read against real Postgres, confirming
unread-first ordering and read-state transitions, row cleaned up after.
`cargo check --bin braxon` (including the new `notification-all` feature
pulling in real Windows notification dependencies) and `npx tsc --noEmit`
both clean.

**On "optimistic UI" specifically** — scoped down from a full fake-data
render to what's actually safe and valuable now that the underlying
writes are fast (see the previous section: search caching + the
`ensure_reman_cache_tables` fix already cut real round-trips to well
under a second). Fabricating a complete synthetic `InterventionDetail`
(fake step-history entries, guessed ids) to show before the server
confirms was judged not worth the risk it introduces — a wrong guess
about server-shaped data diverging visibly from what actually lands is
its own kind of trust problem, the same category of risk "assume
success" carried. The list-level reaction (a job leaving the currently-
viewed queue) already fires the instant the real, now-fast response
arrives — not a hand-wave, a genuine architectural change from a day
earlier, not a queued poll. Full optimistic rendering of the detail card
itself wasn't built this pass; worth reconsidering only if real usage
shows the now-sub-second round trip still isn't fast enough.

### Three follow-ups after real use: notification identity, cross-client staleness, and a list-jump bug, plus a layout cleanup (2026-08-31)

Reported directly in one message, after actually using the notification
system and search caching: "not a single notification, i don't know
why... if a colleague updates something from the normal 4D client, it
can take up to a minute for us to see the change, and sometimes i have a
job opened and it will just move the page very weird," plus a separate
layout ask: "check how it was done in repair jobs section... all the
search like family or date filtering should [be] next to the big search
component."

**"Not a single notification"** — checked `RemanNotification` directly:
the backend had already created 5 real rows for a real transfer (job
17520701, recipients 71/72/3495/3976/4028 — everyone flagged
`is_commercial`), none marked read. Not a bug: notifications only ever
go to the *receiving* party, never back to whoever performed the action
— testing under a single identity that transferred a job to itself would
correctly see nothing, since the recipient is commercial, not the
sender. `is_cleaning` had no roster rows yet either, so no cleaning
notifications were possible — expected until someone's actually flagged.

**"Up to a minute" for a native-4D-client change to show up** — not a
bug either, but a real, closeable gap: `LIVE_CACHE_TTL_SECONDS` and
`INTERVENTIONS_REFRESH_MS` were both 30s, and their worst-case sum (a
change landing right after a cache refresh, then a client's own poll
landing inside that now-stale window before trying again) is exactly "up
to a minute." Both halved to 15s (`SHOP_STATUS_REFRESH_MS`/
`NOTIFICATIONS_POLL_MS` too, for consistency), closing the worst case to
~30s while still keeping the multi-client cache-sharing benefit that
made lowering these safe in the first place.

**"The page will just move the page very weird"** — a real bug, found by
re-reading the poll logic: every background refresh (`fetchItems(false)`
on the `INTERVENTIONS_REFRESH_MS` timer) called `setItems(r)`, replacing
the array wholesale with the server's freshly-sorted order. If sort order
shifted even slightly between polls (a warranty flag, a deadline, a
priority change), the DOM order changed — and with a currently-expanded
(much taller) row moving to a new position, that reads as the page
visibly jumping. Fixed by merging on background polls instead of
replacing: existing rows keep their slot and just get fresh data;
genuinely new rows append at the end; rows that really left the queue
drop out. The initial fetch and any real filter/queue change still use
the server's true sorted order — only the silent background tick is
now stability-first.

**Layout cleanup** — the eight-button queue-tab row plus a second filter
row plus the shared search bar above them (three stacked rows) was
replaced with the same pattern `Jobs.tsx` ("Repair Jobs") already uses:
search box and a queue `<select>` on one row, filters directly beneath.
This required `InterventionsTab` to stop sharing `RemanPage`'s search
bar (which only ever supports one control per tab) and own its search
input directly — `RemanPage`'s shared bar now explicitly excludes
`interventions`/`mine`, and `InterventionsTab`/`MyJobsTab` no longer take
`query` as a prop. A nice side effect of the ownership move: switching
away from and back to the tab already remounts it fresh (React unmounts
a conditionally-rendered component), so the manual `setRawQuery('')`
reset `changeTab` used to need for this tab isn't needed anymore —
local state resets on its own.

**Verified**: `cargo check --bin braxon` and `npx tsc --noEmit` both
clean. The notification/staleness findings were confirmed by reading the
real `RemanNotification` rows directly rather than assumed.

### 2026-09-01 — Stale-write guard: a job can no longer be written to twice

Raised as a direct, specific concern about the shorter polling window
above: "the problem with this delay thing is that what happens, if a
technician does something, and you're still seeing the old stuff, and you
try to let say close the job or something, it's gonna be a mess." Checked
the actual write paths rather than assuming — this was real, not
hypothetical. None of the six job-mutating write functions
(`add_repair_step`, `add_awaiting_cleaning_step`, `add_piece_cleaned_step`,
`add_validation_step`, `close_job_as_repaired`, `transfer_to_commercial_
step`) ever checked whether the job had already been closed
(`LigCde."Soldée" = True`) before writing. Two technicians (or a
technician and someone on the native 4D client) acting on the same job
within the staleness window could each successfully insert their own
closing `Intervention` row — and because every query in this file treats
the chronologically-latest step as a job's real outcome
(`is_more_recent_step`), the second write would silently become "the"
outcome everywhere downstream (revenue, leaderboards, analytics), with no
error and no trace that the first technician's actual work ever happened.

Fixed with a guard, not a faster poll — polling faster shrinks the window,
it can never close it. Added `job_is_closed(conn, ligcde_id) ->
Result<bool, String>`, a `WHERE "Soldée" = True` probe (never a direct
`SELECT` of the Boolean column, same reason as every other Boolean check
in this file) placed right after `parse_id`. Every one of the six write
functions now checks it first and returns a dedicated
`JOB_ALREADY_CLOSED_ERROR` instead of proceeding if the job is already
closed — rejecting a write here is cheap; a silently-corrupted outcome
later is not. `reman_confirm_accessoire` deliberately did *not* get this
guard: confirming a physical accessory's presence after a job closed isn't
creating a conflicting outcome record, it's a harmless (arguably useful)
retroactive correction, so it was left out of scope rather than guarded
for the sake of symmetry.

On the frontend, `AddStepForm`'s submit already showed any backend error
message — this specific one additionally now triggers an immediate
refetch of the job's real detail (`InterventionRow`'s `refreshDetail`,
extracted out of `toggle` and passed down as `onStaleClose`), so the
moment a technician hits this, the card snaps to the real current state
(the form disappears once `detail.soldee` is true) instead of leaving a
stale, still-apparently-editable card sitting under just an error banner.
Matched by exact string equality against a frontend constant
(`JOB_ALREADY_CLOSED_ERROR` in `Reman.tsx`) kept deliberately
cross-referenced with the Rust constant in both directions' doc comments —
consistent with this app's existing convention of showing backend error
strings raw, untranslated, rather than routing them through i18n.

**Scope note**: this closes the highest-severity case only — a write
landing on a job that's already closed for good. A softer staleness case
still exists and was explicitly left out of scope unless asked for: one
technician adds an intermediate step (e.g. "attente de pièces") that a
second technician's already-open view doesn't know about yet, and the
second technician then submits a different, also-plausible step. Neither
write is wrong on its own, they just silently interleave — lower severity
than a corrupted final outcome, and not fixed here.

**Verified**: a temporary `#[test]` (not `#[tokio::test]` —
`with_reman_connection` is synchronous) found one real closed job and one
real open job live, confirmed `job_is_closed` read each correctly, then
called `add_repair_step` directly against the real closed job and
confirmed it returned exactly `Err(JOB_ALREADY_CLOSED_ERROR)` rather than
writing anything — removed after passing, per the established discipline.
`cargo check --bin braxon` and `npx tsc --noEmit` both clean.

### 2026-09-01 — Cleaning notification's missing recipient, the missing return-trip notification, stale reopen, and a real edit lock

Four issues raised together after real use of the previous day's
notification/staleness work.

**1. Zero cleaning notifications, root-caused, not assumed.** Reported as
"when we put a unit en attente de nettoyage, it should send the
notification to archimed said." Checked live instead of guessing: not one
row in `RemanTechnicianRoster` had `is_cleaning = true` — including
Archimed Said's own row (tech 3389). `reman_mark_awaiting_cleaning`'s
`if !cleaning_recipients.is_empty()` guard was correctly doing nothing,
because the recipient set was always empty; the notification *code* was
never broken. Fixed directly in Postgres (`UPDATE "RemanTechnicianRoster"
SET is_cleaning = true WHERE tech_id = '3389'`) — the Roster admin page
already has a per-technician "cleaning" checkbox for this (added
2026-08-31 alongside the notification system itself), so no new UI was
needed, just the one flag nobody had set yet.

**2. The return trip was never built.** "When a unit is put to pièce
nettoyée, i should receive the notification, which didn't happen" — this
one was a real gap, not a data issue: `add_piece_cleaned_step` never
created a notification at all. Unlike `awaiting_cleaning`/
`transferred_commercial`, the right recipient here isn't a roster-role
broadcast group — it's *the one specific technician* who flagged this
*specific* job for cleaning. That's recoverable for free: confirmed live
(see 2026-08-11's investigation above `add_piece_cleaned_step`) that a
NET step never touches `TechDernInterv`, so the ATN step's own
`NoIntTechn` is still sitting in the job's own step history after the
NET write. `reman_mark_piece_cleaned` now walks the just-refreshed
`detail.steps` (sorted most-recent-first) for the first `ATN` entry and
notifies that step's technician — correct regardless of how many earlier
ATN/NET cycles the job has had, and silently skips if there's no ATN step
at all (cleaned without ever being flagged, an edge case with no one to
notify).

**3. Reopening a job silently kept showing stale data.** The real bug
behind "you should trigger the job update when I try to open it, it
should show the real status." `InterventionRow`'s `toggle` only fetched
`detail`/`hydraulicReports` the *first* time a row was expanded
(`if (next && !detail && !loading)`) — a row expanded once, collapsed,
and reopened kept showing whatever was fetched the first time, forever,
for as long as that row's component stayed mounted (which is the whole
time its parent list tab is open). This is also almost certainly what was
read as "the hydraulic badge takes this long to update" — the inline
Hydraulic Reports list is fetched in the same call as `detail`, so a
report saved from the bench dashboard while a job card had already been
opened once wouldn't show up on reopen either, same root cause. Fixed by
always refetching on every expand, not just the first.

**4. A real "someone else has this open" lock.** The concern was broader
than #3: "the problem is not just job closed... show an error message if
an other user tries to open it at the same time, it's gonna be view
only." `job_is_closed` (previous section) is the hard backstop that
rejects a stale write outright — this is the soft layer in front of it,
warning *before* a second technician even starts typing. New table
`RemanJobLock` (`ligcde_id` PK, `tech_id`, `tech_name`, `acquired_at`,
`expires_at`) — one row per currently-open job, not a history.
`reman_acquire_job_lock` claims it in a single `INSERT ... ON CONFLICT ...
WHERE tech_id = $2 OR expires_at < now()` (free, expired, or already
theirs all succeed in one round trip — no read-then-write race between two
clients opening the same job in the same instant); anyone else gets back
who holds it without touching the row. `JOB_LOCK_TTL_SECONDS = 45`,
self-expiring rather than release-only, so a closed tab or lost connection
can't wedge a job view-only forever. `reman_release_job_lock` deletes only
the caller's own row (a stale/duplicate release can never clear someone
else's lock).

On the frontend, `InterventionRow` acquires the lock reactively off
`expanded` (a `useEffect`, not folded into `toggle`) — heartbeats every
20s (well under the 45s TTL) while expanded, and releases on collapse or
unmount (the row disappearing out from under an open card, e.g. a
filter change). When locked by someone else, `AddStepForm` (and the
`AccessoiresPanel` nested inside it) doesn't render at all — replaced by
a plain warning banner naming who has it open. Deliberately scoped to
just the step-writing form: the fault-type badges and "launch hydraulic
test" controls aren't gated, since the actual conflict risk this exists
for is two technicians both submitting a step/close/transfer, not every
control on the card.

**Also**: `NOTIFICATIONS_POLL_MS` (`NotificationBell.tsx`) was 15s,
inherited from the 4D-view cadence for no real reason — its own doc
comment already said as much ("this interval is purely about how soon a
notification shows up, not about protecting 4D from load"). `RemanNotification`
is read directly, not behind the shared Postgres cache the 15s exists to
protect, so there's no reason to match it. Lowered to 5s.

**Verified**: piece-cleaned notification logic mirrors the already-proven
`create_notifications_for` path (previous section) with a pure Rust
`.find()` over already-typed `InterventionStep`s — no new live write path
to re-verify. The lock's Postgres semantics were checked with a temporary
`#[tokio::test]` against the real `RemanJobLock` table: free-lock claim,
same-tech heartbeat renewal, a second tech correctly turned away and told
who holds it, a mismatched release confirmed as a no-op, a real release
freeing it for the next claimant, and a backdated-expired lock claimable
again — all passed, removed after. `cargo check --bin braxon` and
`npx tsc --noEmit` both clean.

### 2026-09-01 — `Commande.Representant`: the "who is this job assigned to" field BRAXON never showed

Reported with a concrete real example: "17446801 is assigned to nicolas
paoli but i can't see it from braxon." Investigated live against that
exact job (ligcde 39249) rather than guessing — its `DernièreInterv` was
"Transfert Service commercial" and every `Intervention` row on it
(`NoIntTechn`) belonged to a single technician (3569), with no trace of
anyone named Paoli anywhere in the step history or in `TechDernInterv`.
So "assigned to" is a genuinely different concept from anything BRAXON
already surfaced (`TechDernInterv`/steps — both just "who did the last
actual technical work"): it's `Commande.Representant`, a field on the
*order*, not the job, that BRAXON had never queried at all. Confirmed
live: `Commande.Representant` for this job's order (38741) is `"NP"`.

`Representant` is a 2-3 letter staff-initials code, not a joinable id —
checked the full table list (over 300 tables) for a dedicated lookup
table and confirmed there isn't one; the closest candidates
(`Salarie`, `EffectifTechnicien`) are both keyed by a numeric id, never by
these codes. Only 10 distinct values exist shop-wide. Cross-checked each
against `Salarie` by hand (not by a generalized initials rule — see
below) and confirmed 5 with certainty: `NP` = Nicolas Paoli (matches the
reported job exactly), plus `HC` = Hugues Barreau Cerveau, `AG` = Abdel
Guitni, `LH` = Larissa Hostina, `TM` = Thomas Maida. The other 5 codes
(`AC`, `AEH`, `DD`, `DH`, `NL`) don't match anyone in `Salarie` at all —
likely commercial/office staff who were never entered there, which only
seems to hold bench technicians. Left unresolved rather than guessed,
same discipline as the "Technicien"/"S" columns note near the top of this
document: a wrong name shown as fact would be worse than an honest raw
code. `representant_name` in reman.rs is a plain hand-written match
statement, not a computed initials rule — `HC` only resolves because it
was individually checked against a real compound surname, not because
"first letter of Prenom + a letter of Nom" is known to generalize to the
other 5 unmapped codes.

`InterventionDetail` gained `representant_code` (always populated when
the order has one) and `representant_name` (only for the 5 resolvable
codes) — appended as a new column on `get_intervention_sync`'s existing
head query (`c.Representant`) rather than a separate query, since it's
already joining `LigCde`↔`Commande`. Frontend shows it as a new "Assigned
to" field in the job detail grid, right next to the other Famille/
Segmentation/Service fields, only rendered when a code exists.

**Scope note**: only added to the detail card, not the list-level
`InterventionSummary`/list rows — the reported gap was specifically "I
can't see it," which the detail view now fixes; extending this to list
rows would need its own join at list-scan scale and wasn't asked for.

**Verified**: a temporary `#[test]` fetched the real job by its reference
(`17446801`), ran it through `get_intervention_sync`, and asserted
`representant_code == "NP"` and `representant_name == "Nicolas Paoli"` —
passed against live data, removed after. `cargo check --bin braxon` and
`npx tsc --noEmit` both clean.

### 2026-09-01 — Notifications only ever fired for hand-offs made *through BRAXON*

Reported with a real, immediate example: "17521301 was put to pièce
nettoyé just right now and no notification for me, gabhy kiba." Checked
live rather than assuming a logic bug in the notification code itself —
that code (built the previous day) was actually working correctly; the
real gap was architectural. This job's `ATN` step (id 900000252) was
entered through BRAXON by Gabhy Kiba — notified correctly at write time.
Its `NET` step eleven minutes later (id 102339, a normal small native-4D
id, nowhere near `BRAXON_ID_RANGE_START`) was entered through the
**native 4D client** by Archimed Saïd — a real, committed `Intervention`
row, just one that never touched `reman_mark_piece_cleaned`, so no
notification code ever ran. Every one of the three hand-off notifications
(`reman_mark_awaiting_cleaning`, `reman_mark_piece_cleaned`,
`reman_transfer_to_commercial`) only ever fires when the write happens
*through BRAXON's own command* — and most of this shop still works
through native 4D for most jobs, so this was always going to miss most
real hand-offs, not just this one.

Fixed by watching 4D's `Intervention` table directly instead of only
BRAXON's own write paths — `scan_cross_client_notifications`, a new
background task (`spawn_cross_client_notification_scanner`, 30s interval,
wired into `main.rs` next to the existing ETL/forecast-snapshot
schedulers) that scans for new rows with a hand-off `TypeCode`
(`ATN`/`NET`/`TES`) below `BRAXON_ID_RANGE_START` — i.e. genuinely
native-4D-originated, since BRAXON's own writes (≥900000000) already
notified when they happened, and re-processing those here would
double-notify — and applies the exact same notification rule each write
command already applies at write time (cleaning roster for ATN,
commercial roster for TES, and for NET, the specific technician who most
recently flagged that job ATN — same `latest_matching` walk
`reman_mark_piece_cleaned` already does, since a NET step never touches
`TechDernInterv`).

New table `RemanNotificationWatermark` (single row, `last_seen_interv_id`)
tracks scan progress. Seeded to `-1` ("never initialized") inside
`ensure_reman_cache_tables` — that function is Postgres-only and has no
4D connection to compute a real starting point from. The scanner itself
bootstraps it on first run to `(current max native id) − 40` rather than
either extreme: starting at `0` would replay this shop's entire
multi-year `Intervention` history as a flood of ancient notifications;
starting at "now" would miss whatever was already sitting unprocessed —
40 was chosen from a live count (~30 hand-off-relevant native rows across
one day), deliberately generous so the very first real scan also catches
up on the day's already-pending backlog, which is exactly what surfaced
this gap. Advancing the watermark is a compare-and-swap
(`UPDATE ... WHERE last_seen_interv_id = $old`) — the same "only the
instance whose update actually matched wins" pattern `cached_or_refresh`
already uses to prevent a cache stampede, here preventing two
concurrently-running BRAXON instances from both processing (and double-
notifying on) the same batch.

**Verified against the real reported case, not a synthetic one**: a
temporary `#[tokio::test]` called `scan_cross_client_notifications` twice
(bootstrap tick, then the real scan) against live data, then asserted a
`piece_cleaned` notification for ligcde 39974 existed, addressed to
`3569` (Gabhy Kiba, who really did the ATN step), naming the real
reference `17521301` in its message — passed, and directly created the
real missing notification as a side effect (this fix's whole point is to
run for real, not just be provable in isolation), confirmed by reading
`RemanNotification` back directly afterward: 15 real backlogged hand-off
events from earlier today were caught up in one pass, each with the
correct per-job recipient (a different `piece_cleaned` job correctly
resolved to a different technician, 2958, not hardcoded to Gabhy Kiba),
watermark left at the current real max (102339) so only genuinely new
events fire from here on. Test code removed after, per the established
discipline — the notifications and watermark advance it produced are the
real fix, not a throwaway. `cargo check --bin braxon` and
`npx tsc --noEmit` (no frontend touched) both clean.

### 2026-09-01 — Notification scan tied to actual refreshes; clear/dismiss added

Two follow-ups after real use of the cross-client scanner above, same day.

**"Why is it not checking the jobs when the data refreshes?"** Real
observation: watching Suivi d'intervention, a job's new (cleaned) status
appeared on a routine list refresh, but its notification only showed up
~30 seconds later. Root cause: `scan_cross_client_notifications` only
ever ran on its own independent 30-second timer — completely uncoordinated
with the moment a client actually pulls fresh data from 4D (the list's
own poll + the shared cache's own TTL). Both were true and correct, just
on two separate clocks that happened not to line up. Fixed by
piggybacking the scan on the actual refresh moment instead of only
waiting on its timer: `reman_search_interventions` now fires it
(fire-and-forget, not awaited — a list refresh shouldn't get slower
because of this) from inside `cached_or_refresh`'s refresh closure, i.e.
only when a genuine 4D read is happening, not on every cache-hit poll.
`reman_get_intervention` (opening a job) does the same unconditionally,
since that command always reads 4D live already. Safe to trigger this
often — from multiple call sites, multiple clients — because
`scan_cross_client_notifications`'s own CAS watermark claim means a
redundant call just finds nothing new (or loses the claim race to
whichever trigger got there first) and returns quickly; nothing about
adding more triggers changes its double-notify safety.

**"Give me the option to clear them."** `reman_mark_notification_read`/
`reman_mark_all_notifications_read` only ever dimmed a notification, with
no way to actually remove one. Added `reman_delete_notification` (one, by
id, same own-tech-id-only scope as marking read) and
`reman_clear_all_notifications` (the caller's entire list, read and
unread both — a fresh start, not a bulk mark-read). Frontend: each
`NotificationBell` row is now a `<div>` (was a `<button>` — a delete
button can't nest inside one) with a hover-reveal ✕ that calls
`e.stopPropagation()` so dismissing one doesn't also mark it read; a
"Clear all" text action sits next to the existing "Mark all read" in the
panel header.

**Verified**: the delete/clear-all SQL was checked directly against
Postgres with two throwaway rows under a fake tech id — confirmed a
mismatched tech_id affects 0 rows for both single-delete and clear-all
(the same scoping `reman_mark_notification_read` already relies on), and
that the correct tech_id removes exactly the intended row(s), nothing
else's. `cargo check --bin braxon`, `npx tsc --noEmit`, and `npm run
build` all clean.

### 2026-09-02 — Implementing the Bench Report

Four parallel review agents audited the whole app (job tracking,
business-intelligence panels, hydraulic bench, and the app shell/legacy
ABS-tester tooling) and were published as an artifact ("BRAXON Bench
Report"). This entry covers implementing that report's Critical and
High-impact findings — not REMAN-specific, but recorded here as this
file's the closest thing to a running project log. Full findings text
lives in the artifact; this is what actually changed and why, grouped the
same way the report was.

**Job tracking (`Reman.tsx`)** — `AddStepForm`'s `close()` and its
step-type "back" control now both run a shared `resetDraft()` (error,
comment, cause/niveau panne, TES fault choice, tests/actions, preset
input), instead of only ever clearing the step-type picker — a failed or
abandoned attempt could otherwise leave its error banner and draft text
sitting there, looking like the *next*, not-yet-submitted attempt had
already failed. Collapsing a card whose write form is actively open
(`wantsToEdit`, see below) now asks for confirmation before discarding
the draft. `OutcomeBadges` now colors each outcome by real semantics
(success/danger/warning/accent, matching `RemanAnalytics`'s own palette)
instead of one undifferentiated blue, and no longer duplicates the row
header's own green "Sous garantie" pill in a different color — folded
into the same `success` tone instead. "Claim a technician" is no longer
a dead end: a new `ChangeTabContext` (provided once by `RemanPage`,
consumed only by `AddStepForm`) lets it link straight to My Jobs without
prop-drilling a tab-switch callback through two components that don't
otherwise care about page-level tabs. Saved comments/presets now get the
same inline confirm/cancel swap `HydraulicReportRow` already uses before
deleting, instead of a single unconfirmed click. Interventions/My Jobs no
longer lose their filters on every tab switch — each stays mounted
(hidden, not unmounted) once first visited this session, via
`visitedInterventions`/`visitedMine` in `RemanPage`. `KnowledgeLinkPanel`'s
fault-code auto-detect now also scans loaded hydraulic report text, not
just client/internal/step comments. A visible hint now explains why
Close is disabled over unconfirmed accessories, matching the existing
tests/actions hint.

The soft edit lock (`wantsToEdit`) now activates only once `AddStepForm`
itself is opened (via a new `onIntentToEdit` callback it fires), not the
moment a card merely expands — comparing several jobs side by side no
longer puts all of them in "view only" for coworkers. The lock-status
banner moved from `InterventionRow` into `AddStepForm` itself
(`lockedByOther`/`lockedByName` props), replacing the step picker/form
in place rather than externally gating whether the form mounts at all.

**Business intelligence** — `RemanFinance`'s `annualFixedCosts`/
`annualSalaries` are now scaled by `fiscalYearElapsedFraction` (~1.0 for
a completed year, less for the in-progress one) instead of always
projecting a flat 12 months, so they cover the same span as revenue's
already-date-capped window; a visible note explains the scaling once the
current year is less than ~99% elapsed. A second note appears when
viewing a *past* fiscal year, explaining that costs/salaries/tax rate
reflect today's settings, not that year — REMAN keeps no cost history, so
this couldn't be fixed at the data level, only made honest about the
mismatch instead of silent. Blank cost fields now get the same "N field(s)
still blank, counted as €0" warning salary already had.
`RemanAnalytics`'s technician leaderboard "Units touched" view now reads
its displayed bar/number from the same `TECH_SORT_VALUE` map the sort
itself uses (previously always raw `units`, so sorting by "Most
non-repairable" reordered rows while the bar/number kept showing unit
counts) — units still shown as a secondary figure when sorting by
anything else. `COLOR_REVENUE` changed from `#ffd60a` (an exact match for
`--color-warning-rgb` in dark mode — same yellow meaning both "euros" and
"no fault found" on the same page) to a distinct indigo. `KpiCard` now
shows a small info icon on any card that actually has a tooltip, instead
of an undiscoverable bare `title=`. `RemanForecast`'s by-family panel now
shows the real percentage and only uses confident "likely X" phrasing at
an outright majority (≥50%) — a weaker plurality reads as "X leads (38%)"
instead. `RemanForecast` is now also rendered inside the Analytics tab
(additively, not moved) so it's discoverable there too. New `TrendBadge`
+ a same-length prior-period `reman_analytics` fetch add a period-over-
period arrow to transformation rate, revenue, and comebacks (comebacks
uses `higherIsBetter={false}` so a rise reads as red, not green). The
leaderboard's `slice(0, 12)` now shows "+N more" when truncated.
(Deliberately deferred: click-through from shop-status/leaderboard/
comeback numbers to a filtered job list — real value, but needs its own
cross-component navigation design, out of scope for this pass.)

**Hydraulic bench** — `f2evo.rs::hydraulic::parse_report`'s pressure
cycles are now deduped exactly like valves already were
(`push_or_replace_cycle`/`cycle_dedup_key`, keyed on a cycle's numbered
prefix or its pre-colon name): a retested cycle now replaces its earlier
attempt in place instead of both appearing, one stale-failed, one fresh-
passed, indistinguishable. The top-level `faulted_channels` (what the
live gauges read) is now *derived* from the final deduped `cycles` list
after parsing, instead of accumulated independently during the scan —
previously a channel that failed once and passed on retest stayed
flagged for the rest of the session. `PressureGauge` gained `noData`
(dims the face, needle parks at rest, shows "—" — the live dashboard's
five gauges used to always show a confident "0" before real telemetry
arrived, indistinguishable from an actual zero-bar reading) and
`dangerThreshold` (defaults to 350 as before, but now passed the
resolved model's real `pressioneMax` when known, instead of one flat
number regardless of what's under test). The live gauges now also read
`error` from `parsedReport.pressure.faulted_channels` — previously only
the saved-report view showed a board-flagged fault, live gauges never
did. `HydraulicBenchDashboard`'s connection-state wipe no longer fires
immediately on `!isConnected` — a new debounced timer (3s normally, 60s
while `isReconnecting`, both threaded down from `useClientSerialConnection`
via `F2EvoHydraulic.tsx`) absorbs a brief USB blip instead of wiping
telemetry/model/program/auto-repair state identically to a real,
sustained disconnect; a warning banner now shows "Reconnecting…" instead
of silence. The Current tile now colors itself danger-red when outside
`resolvedModel.correnteMin`/`correnteMax`, mirroring the pressure gauges'
own out-of-spec treatment (lighter-touch than cloning the temperature/oil
`safetyPrompt` flow — that's a larger addition, not attempted here). A
new inline search (reusing `reman_search_interventions`, `queue: 'open'`)
lets a job be linked directly from this page instead of only from
Reman.tsx's own job card. The gauge readout now shows "Bar" outright
(confirmed unit); the secondary reading gets an honest SVG tooltip
explaining only what's actually confirmed about it (which frame fields
it comes from) rather than inventing a label this codebase hasn't earned.

**App shell & legacy** — Five files confirmed unimported anywhere
(`Navigation.tsx`, `ConnectionBar.tsx`, `SearchBar.tsx`, `TestSettings.tsx`,
`Settings.tsx`) were deleted. `Navigation.tsx`'s one real export, the
`Page` type, moved to a new `src/lib/pages.ts` first (three real call
sites — `App.tsx`, `Sidebar.tsx`, `TestSessionContext.tsx` — updated to
import from there). `BenchPower.tsx` — a permanently-fake "0.00 V / 0.000 A"
readout with no serial listener ever wired to it — was removed rather
than "finished," since correctly wiring it needs live-Pico-protocol
confirmation this pass didn't have; shipping a wrong-but-plausible
reading would be a worse trust problem on a diagnosis tool than an
honestly-missing panel. `ValveIndicator.tsx` (one per valve, inside
`ABSTester.tsx` — the single most visible design-token gap found) is now
on tokens (`bg-card`/`border-border`/`ring-accent`/`success`/`warning`/
`danger`), and its inline-`<style>` `@keyframes pulse` (re-declared every
mount, hardcoded accent-blue rgba) moved to a real `.pulse-ring` utility
in `globals.css`, theme-aware via `--color-accent-rgb`. `ABSTester.tsx`'s
Test/Stop button labels no longer force `text-white` when the button
itself has fallen back to `btn-secondary` (a light background in light
mode) — color now follows the same connected/disconnected branch the
button variant does. The same file's `primary-*` legacy Tailwind alias
(tab underline, progress bars, plus assorted raw `slate-*` colors) is
fully migrated to tokens; confirmed no other file referenced `primary-*`
before removing the alias itself from `tailwind.config.js`. `Motors.tsx`'s
header now matches its `Valves.tsx`/`Signal.tsx` siblings (left-aligned
title + subtitle + fade/slide-in, was centered with neither). `Home.tsx`'s
"Pages" orientation card now also mentions Jobs/Reman/F2-EVO, not just
the three original pages from before the REMAN integration existed.

**Verified**: `f2evo.rs`'s dedup fix got a dedicated `#[test]` (kept
permanently, unlike this file's usual throwaway live-verification tests —
pure parsing logic, no ambient live state, matching this module's own
existing `#[test]` suite style) covering a numbered-cycle retest, a
named-cycle retest, and a channel still genuinely faulted in its latest
occurrence; all 32 of `f2evo`'s tests pass. `cargo check --bin braxon`,
`npx tsc --noEmit`, and `npm run build` all clean throughout, checked
after each area rather than only once at the end.

### 2026-09-02 — Bench Report, Polish tier

Same session, continuing straight on to the report's Polish-tier findings
after Critical/High-impact above.

**Job tracking** — `InterventionRow`/`ClientRow`/`ArticleRow`'s expand
toggle (a bare `<div onClick>`, unreachable by keyboard) now also carries
`role="button"`, `tabIndex={0}`, `aria-expanded`, and an Enter/Space
`onKeyDown` handler — kept as a div, not a real `<button>`, since each
one contains further nested interactive controls a `<button>` can't
validly contain. The step-type picker menu's icons now pick up a
color tint (`iconColorClass` on `BUTTON_BY_TYPE`) matching each type's
eventual submit-button color, instead of rendering fully neutral gray —
documented honestly as a partial fix: ATN/NET and ER/VAL/TES still share
a tone within their own pair/trio, since giving all six a fully unique
color would mean inventing tokens outside the app's existing four, a
bigger call than a Polish-tier fix should make on its own; each option's
text label remains the real disambiguator regardless. `StepHistoryRow`'s
expanded comment text now caps at `max-h-52 overflow-y-auto`, matching
`HydraulicReportRow`'s own long-text handling a few hundred lines away.

**Business intelligence** — `COLOR_SOLD`/`COLOR_SUBCONTRACTOR` in
`RemanAnalytics.tsx` were flat hex with no dark-mode counterpart, unlike
every other outcome color on that page (which was itself possible to
notice specifically *because* the report's Critical-tier fix elsewhere
in this same pass just gave `COLOR_REVENUE` the same treatment). Real
tokens now: `--color-sold-rgb`/`--color-subcontractor-rgb` in
`globals.css` (Apple's own dark-mode values for the same two system
colors the light-mode hex already matched), registered in
`tailwind.config.js` as `sold`/`subcontractor` for reuse elsewhere.
`RepairKnowledgeBase.tsx`'s fault-code chips no longer reuse the real
error banner's exact classes (`bg-danger/10 text-danger border-danger/20`)
for a neutral identifier — now match the neutral cause-tag chip's own
styling a few lines below instead. `RemanFinance`'s `SummaryStat` picked
up a light `bg-elevated` slot per stat, closer to `KpiCard`'s "each stat
is its own tile" visual language — deliberately not cloned outright,
since ten stats packed into one dense grid inside a single outer card is
a genuinely different density than five headline stats each getting
their own standalone tile; forcing the heavier icon-badge treatment onto
all ten would be clutter, not consistency.

**Hydraulic bench** — six missing French keys behind
`HydraulicBenchDashboard.tsx`'s `defaultValue` fallbacks now exist in both
locales (`test_progress`, `bleeding_in_progress`, `valves_in_progress`,
`motor_in_progress`, `hydraulic_test_in_progress`, `cycles_in_progress`) —
a French session no longer sees English mid-sentence for these. The five
live gauges got a modest size/spacing bump (140px → 160px max-width, 9px
→ 10px tick labels, `gap-2` → `gap-3`) for easier glance-from-a-distance
reading — not the bigger "bench view" display mode the report proposes
separately as its own next-level feature.

**App shell & legacy** — `LegacySignalPanel.tsx`'s frequency slider was
hardcoded to the dark-mode accent hex (`accent-[#0a84ff]`) specifically,
staying dark-mode blue in light mode; now `accent-accent`, the same
theme-token pattern `AddStepForm`'s radio buttons already use.
`ThemeContext.tsx` persisted under the app's old name
(`localStorage['pic-abs-theme']`) — migrated to `braxon-theme` rather
than just renamed outright: an existing install's saved preference is
read from the old key as a one-time fallback and copied onto the new key
immediately, so nobody's theme choice silently resets to the default
just because the key changed underneath them.

**A real bug caught and fixed mid-pass, not in the original report**:
the `LegacySignalPanel.tsx` edit initially placed a `//` line comment
directly between JSX attributes on an `<input>` — invalid outside a `{}`
expression context in JSX/TSX. `npx tsc --noEmit`, run immediately after
every single edit in this pass (not batched), caught it before moving on;
fixed by moving the explanation into a proper `{/* ... */}` block above
the tag instead.

**Verified**: `npx tsc --noEmit` after every individual edit (not just
at the end of each area, this time — Polish-tier changes are numerous
and small, and batching the check would have made isolating exactly
which edit introduced a problem harder), plus a final `cargo check
--bin braxon` and `npm run build`, all clean.

## Open questions still open for the Rust implementation

1. Whether `LigCde` needs to be queried at all for the browse UI, or
   whether `Intervention` search results can skip client resolution and
   only resolve it lazily when a row is expanded (cheaper — avoids a
   4-table join on every search keystroke). Currently resolved lazily
   already (only on `reman_get_intervention`, not on search).
2. `Client` and `ArticleMeteor` column lists above are abbreviated to what
   looked relevant; re-run `scripts/explore-4d.mjs` and check the full
   `_USER_COLUMNS` output if a query needs a field not listed here.
