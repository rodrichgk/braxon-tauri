//! Import path for the SC F2-EVO hydraulic bench's reference database
//! (`HydraulicData.accdb`) into Postgres.
//!
//! Correction to an earlier assumption in this file: picking an ABS model
//! *does* trigger a real wire-protocol upload, not just local DB lookups.
//! `FormHydraulicData`'s constructor (`FormHydraulicBench.cs`'s
//! `btnHydraulicLoad_Click`, the non-dialog `else` branch reached when a POD
//! detection resolves a model rather than a manual "Load" button click)
//! calls `LoadABS()` then immediately `Invia_Click(null, new EventArgs())`
//! — headlessly, no dialog ever shown. That serializes 5 kinds of objects
//! (`Parametri`, the 16-valve default array, 8×`ParametriTest`, N×
//! `ParametriCiclo`, per-channel `DataCanale`, then a `Salva` marker) with
//! .NET's `JavaScriptSerializer` and pushes each onto the *same* command
//! queue (`BufferTX = form.Comand`) regular commands use — the board echoes
//! back every field it parsed for cross-validation, finishing with a
//! literal `ABS caricato.` line. See `build_abs_upload` below for the
//! payload construction (mirroring `FillParametri`/`Invia_Click`) and
//! `f2evo.rs`'s `hydraulic::Command::RawJsonPayload` / `F2EvoEvent::AbsCaricato`
//! for the wire side.
//!
//! This module still ports the reference relational structure into
//! Postgres first (see `run_import` below) — `build_abs_upload` queries it
//! the same way `LoadABS`/`FillParametri` query the Access tables directly.
//!
//! Rather than query the .accdb directly from Rust — this codebase already
//! hit a real, documented wall doing that against a different quirky ODBC
//! driver (`reman.rs`'s 4D connection panics on Boolean-column metadata via
//! `odbc-api`'s `TextRowSet`) — the tables are exported to JSON up front
//! (via a one-off PowerShell/OleDb script, since Windows' own ACE OLEDB
//! provider reads Access natively without issue) and imported from there,
//! mirroring the exact pattern `commands::import_ecu_dtcs` already uses for
//! JSON-file imports.
//!
//! Column names are kept faithful to the source Access schema (Italian,
//! camelCased) rather than translated to invented English — several fields
//! (`cp`, `tipoTest3`, `t1`-`t4`, `e1`-`e4`, `c`, `s`) don't have a fully
//! confirmed meaning from the decompiled source alone, and a wrong
//! translation would be worse than an unfamiliar-but-accurate name.

use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ============================================================
// JSON row shapes — field names match the exported Access columns
// exactly (see reference-data/hydraulic-cycles/*.json).
// ============================================================

#[derive(Debug, Deserialize)]
struct AbsRow {
    #[serde(rename = "ID")]
    id: i32,
    #[serde(rename = "Nome")]
    nome: String,
    #[serde(rename = "CorrenteMax")]
    corrente_max: Option<f32>,
    #[serde(rename = "CorrenteMin")]
    corrente_min: Option<f32>,
    #[serde(rename = "AllarmeSup")]
    allarme_sup: Option<f32>,
    #[serde(rename = "AllarmeInf")]
    allarme_inf: Option<f32>,
    #[serde(rename = "PressioneMax")]
    pressione_max: Option<i16>,
    #[serde(rename = "PressioneMin")]
    pressione_min: Option<i16>,
    #[serde(rename = "PressioneLavoro")]
    pressione_lavoro: Option<i16>,
    #[serde(rename = "PressioneInizializzazione")]
    pressione_inizializzazione: Option<i16>,
    #[serde(rename = "PressioneBassa")]
    pressione_bassa: Option<i16>,
    #[serde(rename = "PressioneRitorno")]
    pressione_ritorno: Option<i16>,
    #[serde(rename = "Pulse4")]
    pulse4: Option<i16>,
    #[serde(rename = "Pulse5")]
    pulse5: Option<i16>,
    #[serde(rename = "CodiceABS")]
    codice_abs: i16,
    #[serde(rename = "SubCode")]
    sub_code: i16,
    #[serde(rename = "TipoTest3")]
    tipo_test3: Option<i16>,
    #[serde(rename = "Temperatura")]
    temperatura: Option<i16>,
    #[serde(rename = "Resistenza")]
    resistenza: Option<i16>,
}

#[derive(Debug, Deserialize)]
struct CanaleRow {
    #[serde(rename = "ID")]
    id: i32,
    #[serde(rename = "Canale")]
    canale: Option<i16>,
    #[serde(rename = "Ciclo")]
    ciclo: Option<i16>,
    #[serde(rename = "OnOff")]
    on_off: Option<bool>,
    #[serde(rename = "Pressione")]
    pressione: Option<i16>,
    #[serde(rename = "Impulso")]
    impulso: Option<i16>,
    #[serde(rename = "Impulsi")]
    impulsi: Option<i32>,
    #[serde(rename = "Pompa")]
    pompa: Option<bool>,
    #[serde(rename = "Motore")]
    motore: Option<bool>,
    #[serde(rename = "Test")]
    test: Option<i16>,
}

#[derive(Debug, Deserialize)]
struct CicloRow {
    #[serde(rename = "ID")]
    id: i32,
    #[serde(rename = "ID_ABS")]
    id_abs: i32,
    #[serde(rename = "Ciclo")]
    ciclo: Option<i16>,
    #[serde(rename = "CP")]
    cp: Option<bool>,
    #[serde(rename = "Pressione")]
    pressione: Option<i16>,
    #[serde(rename = "Impulso")]
    impulso: Option<i16>,
    #[serde(rename = "Impulsi")]
    impulsi: Option<i32>,
    #[serde(rename = "Pompa")]
    pompa: Option<bool>,
    #[serde(rename = "Motore")]
    motore: Option<bool>,
    #[serde(rename = "Test")]
    test: Option<i16>,
    #[serde(rename = "Canale")]
    canale: Option<i16>,
}

#[derive(Debug, Deserialize)]
struct OrdineTestRow {
    #[serde(rename = "ID")]
    id: i32,
    #[serde(rename = "ID_ABS")]
    id_abs: i32,
    #[serde(rename = "Pos1")]
    pos1: Option<i16>,
    #[serde(rename = "Pos2")]
    pos2: Option<i16>,
    #[serde(rename = "Pos3")]
    pos3: Option<i16>,
    #[serde(rename = "Pos4")]
    pos4: Option<i16>,
    #[serde(rename = "Pos5")]
    pos5: Option<i16>,
    #[serde(rename = "Pos6")]
    pos6: Option<i16>,
    #[serde(rename = "Pos7")]
    pos7: Option<i16>,
    #[serde(rename = "Pos8")]
    pos8: Option<i16>,
}

#[derive(Debug, Deserialize)]
struct RipetizioneRow {
    #[serde(rename = "ID")]
    id: i32,
    #[serde(rename = "ID_ABS")]
    id_abs: i32,
    #[serde(rename = "Test")]
    test: Option<i16>,
    #[serde(rename = "Canale")]
    canale: Option<i16>,
    #[serde(rename = "Ripetizione")]
    ripetizione: Option<i16>,
    #[serde(rename = "Direzione")]
    direzione: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TestRow {
    #[serde(rename = "ID")]
    id: i32,
    #[serde(rename = "ID_ABS")]
    id_abs: i32,
    // Nullable in the source data — not every Test row has a description
    // filled in (confirmed against the real DB: import fails its NOT NULL
    // constraint otherwise).
    #[serde(rename = "Descrizione")]
    descrizione: Option<String>,
    #[serde(rename = "Test")]
    test: Option<i16>,
    #[serde(rename = "T1")]
    t1: Option<i16>,
    #[serde(rename = "T2")]
    t2: Option<i16>,
    #[serde(rename = "T3")]
    t3: Option<i16>,
    #[serde(rename = "T4")]
    t4: Option<i16>,
    #[serde(rename = "E1")]
    e1: Option<bool>,
    #[serde(rename = "E2")]
    e2: Option<bool>,
    #[serde(rename = "E3")]
    e3: Option<bool>,
    #[serde(rename = "E4")]
    e4: Option<bool>,
    #[serde(rename = "C")]
    c: Option<bool>,
    #[serde(rename = "S")]
    s: Option<bool>,
}

/// Shared shape for the three V1-V16 valve-membership tables
/// (`TestValvole` keyed by `ID_ABS`, `ValvoleCicli` by `ID_Cicli`,
/// `ValvoleTest` by `ID_Test`) — only the matching FK field is populated
/// per file, the others are `None`.
#[derive(Debug, Deserialize)]
struct ValveRow {
    #[serde(rename = "ID")]
    id: i32,
    #[serde(rename = "ID_ABS")]
    id_abs: Option<i32>,
    #[serde(rename = "ID_Cicli")]
    id_cicli: Option<i32>,
    #[serde(rename = "ID_Test")]
    id_test: Option<i32>,
    #[serde(rename = "V1")]
    v1: Option<i16>,
    #[serde(rename = "V2")]
    v2: Option<i16>,
    #[serde(rename = "V3")]
    v3: Option<i16>,
    #[serde(rename = "V4")]
    v4: Option<i16>,
    #[serde(rename = "V5")]
    v5: Option<i16>,
    #[serde(rename = "V6")]
    v6: Option<i16>,
    #[serde(rename = "V7")]
    v7: Option<i16>,
    #[serde(rename = "V8")]
    v8: Option<i16>,
    #[serde(rename = "V9")]
    v9: Option<i16>,
    #[serde(rename = "V10")]
    v10: Option<i16>,
    #[serde(rename = "V11")]
    v11: Option<i16>,
    #[serde(rename = "V12")]
    v12: Option<i16>,
    #[serde(rename = "V13")]
    v13: Option<i16>,
    #[serde(rename = "V14")]
    v14: Option<i16>,
    #[serde(rename = "V15")]
    v15: Option<i16>,
    #[serde(rename = "V16")]
    v16: Option<i16>,
}

// ============================================================
// Schema
// ============================================================

async fn ensure_tables(client: &tokio_postgres::Client) -> Result<(), String> {
    let statements = [
        r#"CREATE TABLE IF NOT EXISTS "HydraulicAbsModel" (
            id INTEGER PRIMARY KEY,
            nome TEXT NOT NULL,
            "correnteMax" REAL,
            "correnteMin" REAL,
            "allarmeSup" REAL,
            "allarmeInf" REAL,
            "pressioneMax" SMALLINT,
            "pressioneMin" SMALLINT,
            "pressioneLavoro" SMALLINT,
            "pressioneInizializzazione" SMALLINT,
            "pressioneBassa" SMALLINT,
            "pressioneRitorno" SMALLINT,
            pulse4 SMALLINT,
            pulse5 SMALLINT,
            "codiceAbs" SMALLINT NOT NULL,
            "subCode" SMALLINT NOT NULL,
            "tipoTest3" SMALLINT,
            temperatura SMALLINT,
            resistenza SMALLINT
        )"#,
        r#"CREATE INDEX IF NOT EXISTS idx_hydraulic_abs_codice ON "HydraulicAbsModel" ("codiceAbs")"#,
        r#"CREATE TABLE IF NOT EXISTS "HydraulicCanale" (
            id INTEGER PRIMARY KEY,
            canale SMALLINT,
            ciclo SMALLINT,
            "onOff" BOOLEAN,
            pressione SMALLINT,
            impulso SMALLINT,
            impulsi INTEGER,
            pompa BOOLEAN,
            motore BOOLEAN,
            test SMALLINT
        )"#,
        r#"CREATE TABLE IF NOT EXISTS "HydraulicCiclo" (
            id INTEGER PRIMARY KEY,
            "idAbs" INTEGER NOT NULL REFERENCES "HydraulicAbsModel"(id) ON DELETE CASCADE,
            ciclo SMALLINT,
            cp BOOLEAN,
            pressione SMALLINT,
            impulso SMALLINT,
            impulsi INTEGER,
            pompa BOOLEAN,
            motore BOOLEAN,
            test SMALLINT,
            canale SMALLINT
        )"#,
        r#"CREATE INDEX IF NOT EXISTS idx_hydraulic_ciclo_abs ON "HydraulicCiclo" ("idAbs")"#,
        r#"CREATE TABLE IF NOT EXISTS "HydraulicOrdineTest" (
            id INTEGER PRIMARY KEY,
            "idAbs" INTEGER NOT NULL REFERENCES "HydraulicAbsModel"(id) ON DELETE CASCADE,
            pos1 SMALLINT, pos2 SMALLINT, pos3 SMALLINT, pos4 SMALLINT,
            pos5 SMALLINT, pos6 SMALLINT, pos7 SMALLINT, pos8 SMALLINT
        )"#,
        r#"CREATE TABLE IF NOT EXISTS "HydraulicRipetizione" (
            id INTEGER PRIMARY KEY,
            "idAbs" INTEGER NOT NULL REFERENCES "HydraulicAbsModel"(id) ON DELETE CASCADE,
            test SMALLINT,
            canale SMALLINT,
            ripetizione SMALLINT,
            direzione TEXT
        )"#,
        r#"CREATE TABLE IF NOT EXISTS "HydraulicTest" (
            id INTEGER PRIMARY KEY,
            "idAbs" INTEGER NOT NULL REFERENCES "HydraulicAbsModel"(id) ON DELETE CASCADE,
            descrizione TEXT,
            test SMALLINT,
            t1 SMALLINT, t2 SMALLINT, t3 SMALLINT, t4 SMALLINT,
            e1 BOOLEAN, e2 BOOLEAN, e3 BOOLEAN, e4 BOOLEAN,
            c BOOLEAN, s BOOLEAN
        )"#,
        r#"CREATE INDEX IF NOT EXISTS idx_hydraulic_test_abs ON "HydraulicTest" ("idAbs")"#,
        r#"CREATE TABLE IF NOT EXISTS "HydraulicTestValvole" (
            id INTEGER PRIMARY KEY,
            "idAbs" INTEGER NOT NULL REFERENCES "HydraulicAbsModel"(id) ON DELETE CASCADE,
            v1 SMALLINT, v2 SMALLINT, v3 SMALLINT, v4 SMALLINT,
            v5 SMALLINT, v6 SMALLINT, v7 SMALLINT, v8 SMALLINT,
            v9 SMALLINT, v10 SMALLINT, v11 SMALLINT, v12 SMALLINT,
            v13 SMALLINT, v14 SMALLINT, v15 SMALLINT, v16 SMALLINT
        )"#,
        r#"CREATE TABLE IF NOT EXISTS "HydraulicValvoleCiclo" (
            id INTEGER PRIMARY KEY,
            "idCicli" INTEGER NOT NULL REFERENCES "HydraulicCiclo"(id) ON DELETE CASCADE,
            v1 SMALLINT, v2 SMALLINT, v3 SMALLINT, v4 SMALLINT,
            v5 SMALLINT, v6 SMALLINT, v7 SMALLINT, v8 SMALLINT,
            v9 SMALLINT, v10 SMALLINT, v11 SMALLINT, v12 SMALLINT,
            v13 SMALLINT, v14 SMALLINT, v15 SMALLINT, v16 SMALLINT
        )"#,
        r#"CREATE INDEX IF NOT EXISTS idx_hydraulic_valvoleciclo_cicli ON "HydraulicValvoleCiclo" ("idCicli")"#,
        r#"CREATE TABLE IF NOT EXISTS "HydraulicValvoleTest" (
            id INTEGER PRIMARY KEY,
            "idTest" INTEGER NOT NULL REFERENCES "HydraulicTest"(id) ON DELETE CASCADE,
            v1 SMALLINT, v2 SMALLINT, v3 SMALLINT, v4 SMALLINT,
            v5 SMALLINT, v6 SMALLINT, v7 SMALLINT, v8 SMALLINT,
            v9 SMALLINT, v10 SMALLINT, v11 SMALLINT, v12 SMALLINT,
            v13 SMALLINT, v14 SMALLINT, v15 SMALLINT, v16 SMALLINT
        )"#,
    ];
    for stmt in statements {
        client.execute(stmt, &[]).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ============================================================
// Import
// ============================================================

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HydraulicImportStats {
    pub abs_models: usize,
    pub canali: usize,
    pub cicli: usize,
    pub ordine_test: usize,
    pub ripetizioni: usize,
    pub test: usize,
    pub test_valvole: usize,
    pub valvole_cicli: usize,
    pub valvole_test: usize,
}

fn read_json_rows<T: for<'de> Deserialize<'de>>(folder: &str, filename: &str) -> Result<Vec<T>, String> {
    let path = std::path::Path::new(folder).join(filename);
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Cannot read {}: {}", path.display(), e))?;
    // PowerShell's Set-Content -Encoding utf8 writes a BOM; strip it so
    // serde_json doesn't choke on the leading byte.
    let trimmed = raw.trim_start_matches('\u{feff}');
    serde_json::from_str(trimmed).map_err(|e| format!("Cannot parse {}: {}", filename, e))
}

/// Imports the JSON export of `HydraulicData.accdb` (see module docs) into
/// Postgres. Idempotent — safe to re-run after a fresh export, existing
/// rows are updated in place by their original Access ID.
///
/// Pure of any Tauri types so it's callable both from the app (the
/// `import_hydraulic_cycles` command below) and from the standalone
/// `import_hydraulic_cycles` binary (`src/bin/import_hydraulic_cycles.rs`)
/// for running it directly against a machine's real DB credentials without
/// going through the GUI.
pub async fn run_import(
    client: &tokio_postgres::Client,
    folder_path: &str,
) -> Result<HydraulicImportStats, String> {
    ensure_tables(client).await?;

    let mut stats = HydraulicImportStats::default();

    // Parents first — everything else FKs into HydraulicAbsModel or HydraulicCiclo/HydraulicTest.
    for row in read_json_rows::<AbsRow>(folder_path, "ABS.json")? {
        client.execute(
            r#"INSERT INTO "HydraulicAbsModel"
               (id, nome, "correnteMax", "correnteMin", "allarmeSup", "allarmeInf",
                "pressioneMax", "pressioneMin", "pressioneLavoro", "pressioneInizializzazione",
                "pressioneBassa", "pressioneRitorno", pulse4, pulse5, "codiceAbs", "subCode",
                "tipoTest3", temperatura, resistenza)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
               ON CONFLICT (id) DO UPDATE SET
                 nome = EXCLUDED.nome, "correnteMax" = EXCLUDED."correnteMax",
                 "correnteMin" = EXCLUDED."correnteMin", "allarmeSup" = EXCLUDED."allarmeSup",
                 "allarmeInf" = EXCLUDED."allarmeInf", "pressioneMax" = EXCLUDED."pressioneMax",
                 "pressioneMin" = EXCLUDED."pressioneMin", "pressioneLavoro" = EXCLUDED."pressioneLavoro",
                 "pressioneInizializzazione" = EXCLUDED."pressioneInizializzazione",
                 "pressioneBassa" = EXCLUDED."pressioneBassa", "pressioneRitorno" = EXCLUDED."pressioneRitorno",
                 pulse4 = EXCLUDED.pulse4, pulse5 = EXCLUDED.pulse5, "codiceAbs" = EXCLUDED."codiceAbs",
                 "subCode" = EXCLUDED."subCode", "tipoTest3" = EXCLUDED."tipoTest3",
                 temperatura = EXCLUDED.temperatura, resistenza = EXCLUDED.resistenza"#,
            &[&row.id, &row.nome, &row.corrente_max, &row.corrente_min, &row.allarme_sup, &row.allarme_inf,
              &row.pressione_max, &row.pressione_min, &row.pressione_lavoro, &row.pressione_inizializzazione,
              &row.pressione_bassa, &row.pressione_ritorno, &row.pulse4, &row.pulse5, &row.codice_abs,
              &row.sub_code, &row.tipo_test3, &row.temperatura, &row.resistenza],
        ).await.map_err(|e| e.to_string())?;
        stats.abs_models += 1;
    }

    for row in read_json_rows::<CanaleRow>(folder_path, "Canali.json")? {
        client.execute(
            r#"INSERT INTO "HydraulicCanale" (id, canale, ciclo, "onOff", pressione, impulso, impulsi, pompa, motore, test)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               ON CONFLICT (id) DO UPDATE SET
                 canale = EXCLUDED.canale, ciclo = EXCLUDED.ciclo, "onOff" = EXCLUDED."onOff",
                 pressione = EXCLUDED.pressione, impulso = EXCLUDED.impulso, impulsi = EXCLUDED.impulsi,
                 pompa = EXCLUDED.pompa, motore = EXCLUDED.motore, test = EXCLUDED.test"#,
            &[&row.id, &row.canale, &row.ciclo, &row.on_off, &row.pressione, &row.impulso,
              &row.impulsi, &row.pompa, &row.motore, &row.test],
        ).await.map_err(|e| e.to_string())?;
        stats.canali += 1;
    }

    for row in read_json_rows::<CicloRow>(folder_path, "Cicli.json")? {
        client.execute(
            r#"INSERT INTO "HydraulicCiclo" (id, "idAbs", ciclo, cp, pressione, impulso, impulsi, pompa, motore, test, canale)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               ON CONFLICT (id) DO UPDATE SET
                 "idAbs" = EXCLUDED."idAbs", ciclo = EXCLUDED.ciclo, cp = EXCLUDED.cp,
                 pressione = EXCLUDED.pressione, impulso = EXCLUDED.impulso, impulsi = EXCLUDED.impulsi,
                 pompa = EXCLUDED.pompa, motore = EXCLUDED.motore, test = EXCLUDED.test, canale = EXCLUDED.canale"#,
            &[&row.id, &row.id_abs, &row.ciclo, &row.cp, &row.pressione, &row.impulso,
              &row.impulsi, &row.pompa, &row.motore, &row.test, &row.canale],
        ).await.map_err(|e| e.to_string())?;
        stats.cicli += 1;
    }

    for row in read_json_rows::<OrdineTestRow>(folder_path, "OrdineTest.json")? {
        client.execute(
            r#"INSERT INTO "HydraulicOrdineTest" (id, "idAbs", pos1, pos2, pos3, pos4, pos5, pos6, pos7, pos8)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               ON CONFLICT (id) DO UPDATE SET
                 "idAbs" = EXCLUDED."idAbs", pos1 = EXCLUDED.pos1, pos2 = EXCLUDED.pos2, pos3 = EXCLUDED.pos3,
                 pos4 = EXCLUDED.pos4, pos5 = EXCLUDED.pos5, pos6 = EXCLUDED.pos6, pos7 = EXCLUDED.pos7, pos8 = EXCLUDED.pos8"#,
            &[&row.id, &row.id_abs, &row.pos1, &row.pos2, &row.pos3, &row.pos4, &row.pos5, &row.pos6, &row.pos7, &row.pos8],
        ).await.map_err(|e| e.to_string())?;
        stats.ordine_test += 1;
    }

    for row in read_json_rows::<RipetizioneRow>(folder_path, "Ripetizioni.json")? {
        client.execute(
            r#"INSERT INTO "HydraulicRipetizione" (id, "idAbs", test, canale, ripetizione, direzione)
               VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (id) DO UPDATE SET
                 "idAbs" = EXCLUDED."idAbs", test = EXCLUDED.test, canale = EXCLUDED.canale,
                 ripetizione = EXCLUDED.ripetizione, direzione = EXCLUDED.direzione"#,
            &[&row.id, &row.id_abs, &row.test, &row.canale, &row.ripetizione, &row.direzione],
        ).await.map_err(|e| e.to_string())?;
        stats.ripetizioni += 1;
    }

    for row in read_json_rows::<TestRow>(folder_path, "Test.json")? {
        client.execute(
            r#"INSERT INTO "HydraulicTest" (id, "idAbs", descrizione, test, t1, t2, t3, t4, e1, e2, e3, e4, c, s)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
               ON CONFLICT (id) DO UPDATE SET
                 "idAbs" = EXCLUDED."idAbs", descrizione = EXCLUDED.descrizione, test = EXCLUDED.test,
                 t1 = EXCLUDED.t1, t2 = EXCLUDED.t2, t3 = EXCLUDED.t3, t4 = EXCLUDED.t4,
                 e1 = EXCLUDED.e1, e2 = EXCLUDED.e2, e3 = EXCLUDED.e3, e4 = EXCLUDED.e4,
                 c = EXCLUDED.c, s = EXCLUDED.s"#,
            &[&row.id, &row.id_abs, &row.descrizione, &row.test, &row.t1, &row.t2, &row.t3, &row.t4,
              &row.e1, &row.e2, &row.e3, &row.e4, &row.c, &row.s],
        ).await.map_err(|e| e.to_string())?;
        stats.test += 1;
    }

    // Children last — depend on HydraulicAbsModel/HydraulicCiclo/HydraulicTest rows existing above.
    for row in read_json_rows::<ValveRow>(folder_path, "TestValvole.json")? {
        let id_abs = row.id_abs.ok_or("TestValvole.json row missing ID_ABS")?;
        client.execute(
            r#"INSERT INTO "HydraulicTestValvole" (id, "idAbs", v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
               ON CONFLICT (id) DO UPDATE SET
                 "idAbs" = EXCLUDED."idAbs", v1=EXCLUDED.v1, v2=EXCLUDED.v2, v3=EXCLUDED.v3, v4=EXCLUDED.v4,
                 v5=EXCLUDED.v5, v6=EXCLUDED.v6, v7=EXCLUDED.v7, v8=EXCLUDED.v8, v9=EXCLUDED.v9, v10=EXCLUDED.v10,
                 v11=EXCLUDED.v11, v12=EXCLUDED.v12, v13=EXCLUDED.v13, v14=EXCLUDED.v14, v15=EXCLUDED.v15, v16=EXCLUDED.v16"#,
            &[&row.id, &id_abs, &row.v1, &row.v2, &row.v3, &row.v4, &row.v5, &row.v6, &row.v7, &row.v8,
              &row.v9, &row.v10, &row.v11, &row.v12, &row.v13, &row.v14, &row.v15, &row.v16],
        ).await.map_err(|e| e.to_string())?;
        stats.test_valvole += 1;
    }

    for row in read_json_rows::<ValveRow>(folder_path, "ValvoleCicli.json")? {
        let id_cicli = row.id_cicli.ok_or("ValvoleCicli.json row missing ID_Cicli")?;
        client.execute(
            r#"INSERT INTO "HydraulicValvoleCiclo" (id, "idCicli", v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
               ON CONFLICT (id) DO UPDATE SET
                 "idCicli" = EXCLUDED."idCicli", v1=EXCLUDED.v1, v2=EXCLUDED.v2, v3=EXCLUDED.v3, v4=EXCLUDED.v4,
                 v5=EXCLUDED.v5, v6=EXCLUDED.v6, v7=EXCLUDED.v7, v8=EXCLUDED.v8, v9=EXCLUDED.v9, v10=EXCLUDED.v10,
                 v11=EXCLUDED.v11, v12=EXCLUDED.v12, v13=EXCLUDED.v13, v14=EXCLUDED.v14, v15=EXCLUDED.v15, v16=EXCLUDED.v16"#,
            &[&row.id, &id_cicli, &row.v1, &row.v2, &row.v3, &row.v4, &row.v5, &row.v6, &row.v7, &row.v8,
              &row.v9, &row.v10, &row.v11, &row.v12, &row.v13, &row.v14, &row.v15, &row.v16],
        ).await.map_err(|e| e.to_string())?;
        stats.valvole_cicli += 1;
    }

    for row in read_json_rows::<ValveRow>(folder_path, "ValvoleTest.json")? {
        let id_test = row.id_test.ok_or("ValvoleTest.json row missing ID_Test")?;
        client.execute(
            r#"INSERT INTO "HydraulicValvoleTest" (id, "idTest", v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
               ON CONFLICT (id) DO UPDATE SET
                 "idTest" = EXCLUDED."idTest", v1=EXCLUDED.v1, v2=EXCLUDED.v2, v3=EXCLUDED.v3, v4=EXCLUDED.v4,
                 v5=EXCLUDED.v5, v6=EXCLUDED.v6, v7=EXCLUDED.v7, v8=EXCLUDED.v8, v9=EXCLUDED.v9, v10=EXCLUDED.v10,
                 v11=EXCLUDED.v11, v12=EXCLUDED.v12, v13=EXCLUDED.v13, v14=EXCLUDED.v14, v15=EXCLUDED.v15, v16=EXCLUDED.v16"#,
            &[&row.id, &id_test, &row.v1, &row.v2, &row.v3, &row.v4, &row.v5, &row.v6, &row.v7, &row.v8,
              &row.v9, &row.v10, &row.v11, &row.v12, &row.v13, &row.v14, &row.v15, &row.v16],
        ).await.map_err(|e| e.to_string())?;
        stats.valvole_test += 1;
    }

    Ok(stats)
}

/// Tauri-facing wrapper — connects using the app's saved DB config and
/// delegates to [`run_import`].
#[tauri::command]
pub async fn import_hydraulic_cycles(
    folder_path: String,
    state: State<'_, AppState>,
) -> Result<HydraulicImportStats, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = crate::database::connect(&config).await?;
    run_import(&client, &folder_path).await
}

// ============================================================
// Model lookup — resolves the numeric CodiceABS the board reports
// (`Model:Load program;<code>`) against the imported reference data.
// Mirrors SelectABSForm.cs: multiple rows sharing a CodiceABS means the
// board can identify the base unit but not which variant is mounted, so
// the caller needs to prompt (see SelectABSForm's radio-button picker).
// ============================================================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbsModelOption {
    pub id: i32,
    pub nome: String,
    pub sub_code: i16,
    pub corrente_max: Option<f32>,
    pub corrente_min: Option<f32>,
    pub pressione_max: Option<i16>,
    pub pressione_min: Option<i16>,
    pub pressione_lavoro: Option<i16>,
    pub temperatura: Option<i16>,
    pub resistenza: Option<i16>,
}

// ============================================================
// Program load — mirrors `FormHydraulicData`'s `IsABSExist`/`IsCycleExist`
// constructor checks (the local-DB half of loading a program; the actual
// board transfer is `build_abs_upload` further down). Returns the step
// descriptions needed to label the "IN PROGRESS" banner from telemetry's
// `test_step_index`.
// ============================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestStep {
    /// `HydraulicTest.test` — matches `abs(telemetry.test_step_index)`.
    pub test: i16,
    pub descrizione: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbsProgram {
    pub cicli_count: i64,
    pub steps: Vec<TestStep>,
}

#[tauri::command]
pub async fn hydraulic_load_abs_program(
    id_abs: i32,
    // Which Test/Canale slice to validate — `None` (or omitted from the
    // frontend call) means the default full-program load (Test=0,
    // Canale=0), the same as before this parameter existed. A specific
    // value is what the "Programs Cycle" test/channel picker passes when
    // loading just one slice of the ABS's program (`SelectTestForm` /
    // `Program_Click` in the original — see `hydraulic_list_test_channels`).
    test: Option<i16>,
    canale: Option<i16>,
    state: State<'_, AppState>,
) -> Result<AbsProgram, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = crate::database::connect(&config).await?;
    let test = test.unwrap_or(0);
    let canale = canale.unwrap_or(0);

    // Matches FormHydraulicData.cs's IsCycleExist exactly: scoped to the
    // specific Test/Canale being loaded, not "any cycles at all for this
    // ABS" — a model can have cycles for one Test/Canale combination and
    // none for another.
    let cicli_count: i64 = client
        .query_one(
            r#"SELECT COUNT(*) FROM "HydraulicCiclo" WHERE "idAbs" = $1 AND test = $2 AND canale = $3"#,
            &[&id_abs, &test, &canale],
        )
        .await
        .map_err(|e| e.to_string())?
        .get(0);

    // Original wording, kept verbatim (typo included) — it's what the
    // operator already recognizes from the legacy app.
    if cicli_count == 0 {
        return Err("Cicle not found!!!".to_string());
    }

    // `descrizione` is nullable in the source data (see `TestRow`'s doc
    // comment) — excluded here rather than made `Option<String>` on
    // `TestStep`, since a step with no name can't label anything in the
    // "IN PROGRESS" banner anyway.
    let rows = client
        .query(
            r#"SELECT test, descrizione FROM "HydraulicTest"
               WHERE "idAbs" = $1 AND test IS NOT NULL AND descrizione IS NOT NULL ORDER BY test"#,
            &[&id_abs],
        )
        .await
        .map_err(|e| e.to_string())?;
    let steps: Vec<TestStep> = rows
        .iter()
        .map(|r| TestStep { test: r.get(0), descrizione: r.get(1) })
        .collect();

    if steps.is_empty() {
        return Err("Cicle not found!!!".to_string());
    }

    Ok(AbsProgram { cicli_count, steps })
}

#[tauri::command]
pub async fn hydraulic_lookup_abs_model(
    codice_abs: i16,
    state: State<'_, AppState>,
) -> Result<Vec<AbsModelOption>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = crate::database::connect(&config).await?;
    let rows = client
        .query(
            r#"SELECT id, nome, "subCode", "correnteMax", "correnteMin", "pressioneMax",
                      "pressioneMin", "pressioneLavoro", temperatura, resistenza
               FROM "HydraulicAbsModel" WHERE "codiceAbs" = $1 ORDER BY nome"#,
            &[&codice_abs],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .map(|r| AbsModelOption {
            id: r.get(0),
            nome: r.get(1),
            sub_code: r.get(2),
            corrente_max: r.get(3),
            corrente_min: r.get(4),
            pressione_max: r.get(5),
            pressione_min: r.get(6),
            pressione_lavoro: r.get(7),
            temperatura: r.get(8),
            resistenza: r.get(9),
        })
        .collect())
}

// ============================================================
// Board upload — the wire-protocol side of "loading a program", built from
// the same Postgres tables `run_import` populated. Field names below are
// exact matches for the original's `Parametri`/`ParametriTest`/
// `ParametriCiclo`/`DataCanale`/`Salva` classes (see the module doc comment)
// — .NET's `JavaScriptSerializer` emits properties by their literal
// (PascalCase) name, and the board firmware parses those names, so renaming
// any of them here would silently break the upload.
// ============================================================

#[derive(Debug, Serialize)]
struct ParametriPayload {
    #[serde(rename = "Model")]
    model: String,
    #[serde(rename = "C_Max")]
    c_max: f32,
    #[serde(rename = "C_Min")]
    c_min: f32,
    #[serde(rename = "W_Sup")]
    w_sup: f32,
    #[serde(rename = "W_Inf")]
    w_inf: f32,
    #[serde(rename = "P_Max")]
    p_max: i16,
    #[serde(rename = "P_Min")]
    p_min: i16,
    #[serde(rename = "P_Work")]
    p_work: i16,
    #[serde(rename = "P_Ini")]
    p_ini: i16,
    #[serde(rename = "P_Low")]
    p_low: i16,
    #[serde(rename = "P_Rtn")]
    p_rtn: i16,
    #[serde(rename = "Pulse4")]
    pulse4: i16,
    #[serde(rename = "Pulse5")]
    pulse5: i16,
    #[serde(rename = "CodiceABS")]
    codice_abs: i16,
    #[serde(rename = "Nrpt")]
    nrpt: i16,
    #[serde(rename = "TypeTest3")]
    type_test3: u8,
    #[serde(rename = "Temperature")]
    temperature: u8,
    #[serde(rename = "Resistor")]
    resistor: i16,
    #[serde(rename = "Order")]
    order: [i8; 8],
}

#[derive(Debug, Serialize)]
struct ParametriTestPayload {
    #[serde(rename = "NTest")]
    n_test: u8,
    #[serde(rename = "E")]
    e: [bool; 4],
    #[serde(rename = "T")]
    t: [u8; 4],
    #[serde(rename = "C")]
    c: bool,
    #[serde(rename = "S")]
    s: bool,
    #[serde(rename = "V")]
    v: Vec<i8>,
}

#[derive(Debug, Serialize)]
struct ParametriCicloPayload {
    #[serde(rename = "NCiclo")]
    n_ciclo: u8,
    #[serde(rename = "C")]
    c: bool,
    #[serde(rename = "P")]
    p: i16,
    // Lowercase `m` matches the original's own field name (`ParametriCiclo.m`,
    // sourced from the Access `Impulso` column aliased `AS Pausa` in
    // `FormHydraulicData.cs`'s LoadABS query) — not a typo.
    #[serde(rename = "m")]
    m: i16,
    #[serde(rename = "NPulses")]
    n_pulses: u32,
    #[serde(rename = "Pompa")]
    pompa: bool,
    #[serde(rename = "Motore")]
    motore: bool,
    #[serde(rename = "V")]
    v: Vec<i8>,
}

#[derive(Debug, Serialize)]
struct DataCanalePayload {
    #[serde(rename = "Channel")]
    channel: u8,
    #[serde(rename = "NData")]
    n_data: u8,
    #[serde(rename = "OnOff")]
    on_off: bool,
    #[serde(rename = "Pressione")]
    pressione: i16,
    #[serde(rename = "Impulso")]
    impulso: i16,
    #[serde(rename = "Impulsi")]
    impulsi: u32,
    #[serde(rename = "Pompa")]
    pompa: bool,
    #[serde(rename = "Motore")]
    motore: bool,
}

#[derive(Debug, Serialize)]
struct SalvaPayload {
    #[serde(rename = "Save")]
    save: bool,
}

/// Mirrors two equivalent original code paths that both boil down to the
/// same rule: `IIf(ValvoleCicli.Vn<128, ValvoleCicli.Vn, -1)` (the SQL used
/// for cycle valves) and `(sbyte)(byte)value` (the raw cast used for
/// TestValvole/ValvoleTest — 255 reinterpreted as a signed byte is -1).
/// Raw 255 is the Access "valve not set" sentinel; every real valve index
/// is well under 128.
fn clamp_valve(raw: Option<i16>) -> i8 {
    match raw {
        Some(v) if (0..128).contains(&v) => v as i8,
        _ => -1,
    }
}

fn valve_row_to_vec(row: Option<tokio_postgres::Row>) -> Vec<i8> {
    match row {
        Some(r) => (0..16usize).map(|i| clamp_valve(r.get(i))).collect(),
        None => vec![-1; 16],
    }
}

/// Several of the reference tables turned out to have more than one row for
/// what looked like a unique key — e.g. `HydraulicTest` can have several
/// rows sharing the same `(idAbs, test)`, confirmed against the real
/// imported data. The original's own `LoadABS` never guarded against this
/// either: it does `Adapter.Fill(dataTable)` then unconditionally reads
/// `dataTable.Rows[0]`, silently taking the first row and ignoring any
/// extras. This matches that tolerant behavior instead of tokio-postgres's
/// stricter `query_opt`, which errors ("unexpected number of rows") the
/// moment a query returns more than one.
async fn first_row(
    client: &tokio_postgres::Client,
    query: &str,
    params: &[&(dyn tokio_postgres::types::ToSql + Sync)],
) -> Result<Option<tokio_postgres::Row>, String> {
    let rows = client.query(query, params).await.map_err(|e| e.to_string())?;
    Ok(rows.into_iter().next())
}

const VALVE_COLUMNS: &str =
    "v1,v2,v3,v4,v5,v6,v7,v8,v9,v10,v11,v12,v13,v14,v15,v16";

/// Builds the ordered list of JSON payload lines `Invia_Click` sends for a
/// given ABS model — Parametri, the 16-valve default array, 8 ParametriTest
/// (one per test), every Cicli row for the given Test/Canale (Test=0,
/// Canale=0 for a normal full-program load — what `TestFault`/`CanaleFault`
/// both default to — or a specific slice when loading via the "Programs
/// Cycle" test/channel picker, see `hydraulic_list_test_channels`), the
/// generic per-channel Canali data, then a trailing Salva marker. Caller
/// pushes each string onto the board's command queue in this exact order,
/// one `RawJsonPayload` per line — matching `BufferTX.Enqueue(text)`.
pub async fn build_abs_upload(
    client: &tokio_postgres::Client,
    id_abs: i32,
    test: i16,
    canale: i16,
) -> Result<Vec<String>, String> {
    fn push<T: Serialize>(payloads: &mut Vec<String>, v: &T) -> Result<(), String> {
        payloads.push(serde_json::to_string(v).map_err(|e| e.to_string())?);
        Ok(())
    }

    let mut payloads: Vec<String> = Vec::new();

    // --- Parametri (ABS.Values) ---
    let abs_row = client
        .query_opt(
            r#"SELECT nome, "correnteMax", "correnteMin", "allarmeSup", "allarmeInf",
                      "pressioneMax", "pressioneMin", "pressioneLavoro", "pressioneInizializzazione",
                      "pressioneBassa", "pressioneRitorno", pulse4, pulse5, "codiceAbs",
                      "tipoTest3", temperatura, resistenza
               FROM "HydraulicAbsModel" WHERE id = $1"#,
            &[&id_abs],
        )
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "ABS not found!!!".to_string())?;

    let nrpt: i16 = first_row(
        client,
        r#"SELECT ripetizione FROM "HydraulicRipetizione"
           WHERE "idAbs" = $1 AND test = $2 AND canale = $3"#,
        &[&id_abs, &test, &canale],
    )
    .await?
    .and_then(|r| r.get::<_, Option<i16>>(0))
    // FormHydraulicData.cs's LoadABS falls back to 7 when no Ripetizioni
    // row matches this ABS/Test/Canale combination.
    .unwrap_or(7);

    let order_row = first_row(
        client,
        r#"SELECT pos1,pos2,pos3,pos4,pos5,pos6,pos7,pos8
           FROM "HydraulicOrdineTest" WHERE "idAbs" = $1"#,
        &[&id_abs],
    )
    .await?;
    let order: [i8; 8] = match order_row {
        Some(r) => {
            let mut o = [0i8; 8];
            for (i, slot) in o.iter_mut().enumerate() {
                *slot = r.get::<_, Option<i16>>(i).unwrap_or(i as i16) as i8;
            }
            o
        }
        None => [0, 1, 2, 3, 4, 5, 6, 7],
    };

    push(
        &mut payloads,
        &ParametriPayload {
            model: abs_row.get(0),
            c_max: abs_row.get::<_, Option<f32>>(1).unwrap_or(0.0),
            c_min: abs_row.get::<_, Option<f32>>(2).unwrap_or(0.0),
            w_sup: abs_row.get::<_, Option<f32>>(3).unwrap_or(0.0),
            w_inf: abs_row.get::<_, Option<f32>>(4).unwrap_or(0.0),
            p_max: abs_row.get::<_, Option<i16>>(5).unwrap_or(0),
            p_min: abs_row.get::<_, Option<i16>>(6).unwrap_or(0),
            p_work: abs_row.get::<_, Option<i16>>(7).unwrap_or(0),
            p_ini: abs_row.get::<_, Option<i16>>(8).unwrap_or(0),
            p_low: abs_row.get::<_, Option<i16>>(9).unwrap_or(0),
            p_rtn: abs_row.get::<_, Option<i16>>(10).unwrap_or(0),
            pulse4: abs_row.get::<_, Option<i16>>(11).unwrap_or(0),
            pulse5: abs_row.get::<_, Option<i16>>(12).unwrap_or(0),
            codice_abs: abs_row.get(13),
            nrpt,
            type_test3: abs_row.get::<_, Option<i16>>(14).unwrap_or(0) as u8,
            temperature: abs_row.get::<_, Option<i16>>(15).unwrap_or(0) as u8,
            resistor: abs_row.get::<_, Option<i16>>(16).unwrap_or(0),
            order,
        },
    )?;

    // --- ABS.Valves — 16-valve default array (raw JSON array, not wrapped) ---
    let valves_row = first_row(
        client,
        &format!(r#"SELECT {VALVE_COLUMNS} FROM "HydraulicTestValvole" WHERE "idAbs" = $1"#),
        &[&id_abs],
    )
    .await?;
    push(&mut payloads, &valve_row_to_vec(valves_row))?;

    // --- ABS.Test — 8 fixed test slots, always emitted even if a model has
    // no row for a given test number (matches the original's WinForms
    // controls simply keeping their initialized defaults in that case).
    for n in 1..=8i16 {
        let test_row = first_row(
            client,
            r#"SELECT id, t1, t2, t3, t4, e1, e2, e3, e4, c, s
               FROM "HydraulicTest" WHERE "idAbs" = $1 AND test = $2"#,
            &[&id_abs, &n],
        )
        .await?;

        let (test_id, t, e, c_from_db, s) = match &test_row {
            Some(r) => (
                Some(r.get::<_, i32>(0)),
                [
                    r.get::<_, Option<i16>>(1).unwrap_or(0) as u8,
                    r.get::<_, Option<i16>>(2).unwrap_or(0) as u8,
                    r.get::<_, Option<i16>>(3).unwrap_or(0) as u8,
                    r.get::<_, Option<i16>>(4).unwrap_or(0) as u8,
                ],
                [
                    r.get::<_, Option<bool>>(5).unwrap_or(false),
                    r.get::<_, Option<bool>>(6).unwrap_or(false),
                    r.get::<_, Option<bool>>(7).unwrap_or(false),
                    r.get::<_, Option<bool>>(8).unwrap_or(false),
                ],
                r.get::<_, Option<bool>>(9).unwrap_or(false),
                r.get::<_, Option<bool>>(10).unwrap_or(false),
            ),
            None => (None, [0; 4], [false; 4], false, false),
        };
        // FillParametri hardcodes C=false for tests 1-3 unconditionally —
        // those test screens have no "ControlloPressioni" checkbox at all.
        let c = if n <= 3 { false } else { c_from_db };

        let v = match test_id {
            Some(tid) => {
                let row = first_row(
                    client,
                    &format!(r#"SELECT {VALVE_COLUMNS} FROM "HydraulicValvoleTest" WHERE "idTest" = $1"#),
                    &[&tid],
                )
                .await?;
                valve_row_to_vec(row)
            }
            None => vec![-1; 16],
        };

        push(
            &mut payloads,
            &ParametriTestPayload { n_test: n as u8, e, t, c, s, v },
        )?;
    }

    // --- ABS.Cicles — scoped to the requested Test/Canale, matching
    // whatever LoadABS's grid query resolves to (TestFault/CanaleFault set
    // either by their index-0 default or by the test/channel picker).
    let cicli_rows = client
        .query(
            &format!(
                r#"SELECT hc.ciclo, hc.pressione, hc.impulso, hc.cp, hc.impulsi, hc.pompa, hc.motore, {cols}
                   FROM "HydraulicCiclo" hc
                   JOIN "HydraulicValvoleCiclo" vc ON vc."idCicli" = hc.id
                   WHERE hc."idAbs" = $1 AND hc.test = $2 AND hc.canale = $3
                   ORDER BY hc.ciclo"#,
                cols = VALVE_COLUMNS
                    .split(',')
                    .map(|c| format!("vc.{c}"))
                    .collect::<Vec<_>>()
                    .join(",")
            ),
            &[&id_abs, &test, &canale],
        )
        .await
        .map_err(|e| e.to_string())?;
    for row in &cicli_rows {
        // FillParametri turns a "not applicable" valve slot (-1) into -2
        // specifically when this is a scoped test (`TestFail > 0` in the
        // original — `test != 0` here), not for a full/default load. Same
        // reasoning as the Canali gate above: sending the wrong sentinel
        // for the load's actual scope is a mismatch from what the board
        // expects, not just a cosmetic difference.
        let v: Vec<i8> = (7..23usize)
            .map(|i| clamp_valve(row.get(i)))
            .map(|b| if b == -1 && test != 0 { -2 } else { b })
            .collect();
        push(
            &mut payloads,
            &ParametriCicloPayload {
                n_ciclo: row.get::<_, Option<i16>>(0).unwrap_or(0) as u8,
                c: row.get::<_, Option<bool>>(3).unwrap_or(false),
                p: row.get::<_, Option<i16>>(1).unwrap_or(0),
                m: row.get::<_, Option<i16>>(2).unwrap_or(0),
                n_pulses: row.get::<_, Option<i32>>(4).unwrap_or(0) as u32,
                pompa: row.get::<_, Option<bool>>(5).unwrap_or(false),
                motore: row.get::<_, Option<bool>>(6).unwrap_or(false),
                v,
            },
        )?;
    }

    // --- Canali — generic (not per-ABS) per-channel data; a channel with no
    // rows contributes nothing at all, matching `if (dataTable.Rows.Count >
    // 0) { Canali.Add(...) }`. Only sent for the full/default load (Test=0)
    // — FillParametri's own code clears Canali then hard-returns before
    // populating it at all when `TestFault.SelectedIndex != 0` (i.e. any
    // scoped "Programs Cycle" load), so a scoped upload must never include
    // any DataCanale lines. An earlier version of this function sent them
    // unconditionally regardless of scope — extra payload lines the board
    // never expects for a scoped upload, and a very plausible cause of the
    // board misbehaving (observed: crashing/disconnecting, later just
    // silently doing nothing) on a targeted repair.
    if test == 0 {
        for ch in 1..=4i16 {
            let rows = client
                .query(
                    r#"SELECT ciclo, "onOff", pressione, impulso, impulsi, pompa, motore
                       FROM "HydraulicCanale" WHERE canale = $1 ORDER BY ciclo"#,
                    &[&ch],
                )
                .await
                .map_err(|e| e.to_string())?;
            for row in &rows {
                push(
                    &mut payloads,
                    &DataCanalePayload {
                        channel: ch as u8,
                        n_data: row.get::<_, Option<i16>>(0).unwrap_or(0) as u8,
                        on_off: row.get::<_, Option<bool>>(1).unwrap_or(false),
                        pressione: row.get::<_, Option<i16>>(2).unwrap_or(0),
                        impulso: row.get::<_, Option<i16>>(3).unwrap_or(0),
                        impulsi: row.get::<_, Option<i32>>(4).unwrap_or(0) as u32,
                        pompa: row.get::<_, Option<bool>>(5).unwrap_or(false),
                        motore: row.get::<_, Option<bool>>(6).unwrap_or(false),
                    },
                )?;
            }
        }
    }

    // --- Save marker, always last ---
    push(&mut payloads, &SalvaPayload { save: true })?;

    Ok(payloads)
}

#[tauri::command]
pub async fn hydraulic_build_abs_upload(
    id_abs: i32,
    test: Option<i16>,
    canale: Option<i16>,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = crate::database::connect(&config).await?;
    build_abs_upload(&client, id_abs, test.unwrap_or(0), canale.unwrap_or(0)).await
}

/// One Test's set of Canale values with actual Cicli data for a given ABS
/// model — mirrors `SelectTestForm`'s constructor query exactly
/// (`SELECT DISTINCT Test FROM Cicli WHERE ID_ABS = ... AND Test > 0`, then
/// per-test `SELECT DISTINCT Canale FROM Cicli WHERE ... AND Test = ...`).
/// Backs the "Programs Cycle" test/channel picker (`Program_Click` in the
/// original) — letting the operator load just one slice of the ABS's
/// program instead of the default full Test=0/Canale=0 set.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestChannelGroup {
    pub test: i16,
    pub channels: Vec<i16>,
}

#[tauri::command]
pub async fn hydraulic_list_test_channels(
    id_abs: i32,
    state: State<'_, AppState>,
) -> Result<Vec<TestChannelGroup>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = crate::database::connect(&config).await?;

    let test_rows = client
        .query(
            r#"SELECT DISTINCT test FROM "HydraulicCiclo" WHERE "idAbs" = $1 AND test > 0 ORDER BY test"#,
            &[&id_abs],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut groups = Vec::with_capacity(test_rows.len());
    for row in &test_rows {
        let test: i16 = row.get(0);
        let channel_rows = client
            .query(
                r#"SELECT DISTINCT canale FROM "HydraulicCiclo" WHERE "idAbs" = $1 AND test = $2 ORDER BY canale"#,
                &[&id_abs, &test],
            )
            .await
            .map_err(|e| e.to_string())?;
        let channels = channel_rows.iter().map(|r| r.get::<_, i16>(0)).collect();
        groups.push(TestChannelGroup { test, channels });
    }
    Ok(groups)
}
