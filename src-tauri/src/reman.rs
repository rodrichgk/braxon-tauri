// Read-only bridge to REMAN's 4D database. See ../../docs/reman-schema.md for
// the table/column reference and the confirmed SQL-dialect quirks this file
// relies on (LIMIT not TOP, uppercase result columns, no `?` parameter
// binding — every value is escaped and interpolated instead).

use crate::database;
use crate::AppState;
use chrono::{Datelike, Duration, Local, NaiveDate, Timelike};
use odbc_api::{buffers::TextRowSet, Connection, ConnectionOptions, Cursor, Environment};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{async_runtime, State};
use tokio::io::copy_bidirectional;
use tokio::net::{TcpListener, TcpStream};

const PROXY_LISTEN: &str = "127.0.0.1:19812";
const REMAN_SERVER: &str = "192.168.77.10:19822";
const DSN: &str = "REMAN_4D";
const REMAN_UID: &str = "Technique";
const REMAN_PWD: &str = "";
const BATCH_SIZE: usize = 200;
const MAX_STR_LEN: usize = 4096;

/// Vendor driver path — matches scripts/setup-reman-dsn.ps1's $driverPath
/// exactly. Single source of truth so that script and the auto-registration
/// below never drift apart.
#[cfg(windows)]
const REMAN_DRIVER_PATH: &str = r"C:\Program Files\4D ODBC Driver\v18\4DODBC.dll";

/// Registers the REMAN_4D ODBC DSN under the current user's registry hive
/// if it isn't already there — the exact same registry writes
/// scripts/setup-reman-dsn.ps1 does by hand. Called on every app startup
/// (see main.rs), before anything tries to open a REMAN connection, so a
/// wiped or missing DSN (a profile reset, a Group Policy refresh, a fresh
/// machine that's never run BRAXON before) self-heals silently instead of
/// surfacing as a cryptic "IM002: Source de données introuvable" the next
/// time someone opens the Interventions tab — confirmed live 2026-08-24:
/// a technician's DSN registry entry disappeared between one Friday and the
/// following Monday with no user-initiated change, and diagnosing it required
/// walking through the same registry check this function now does itself,
/// every launch, for free.
///
/// Idempotent and always safe to call — re-writing identical values is a
/// no-op in effect. Deliberately does *not* touch anything if the 4D ODBC
/// driver DLL itself isn't present: a DSN pointing at a missing driver just
/// trades one confusing error for a different one (driver-not-loadable
/// instead of DSN-not-found), and that absence is a vendor-install problem
/// this function can't fix — see `reman_dsn_status` for surfacing that case
/// to the user instead of silently doing nothing.
#[cfg(windows)]
pub fn ensure_reman_dsn_registered() {
    use std::path::Path;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    if !Path::new(REMAN_DRIVER_PATH).exists() {
        eprintln!(
            "[reman] 4D ODBC driver not found at {REMAN_DRIVER_PATH} — skipping DSN registration until it's installed"
        );
        return;
    }

    let write = || -> std::io::Result<()> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (dsn_key, _) = hkcu.create_subkey(r"Software\ODBC\ODBC.INI\REMAN_4D")?;
        dsn_key.set_value("Driver", &REMAN_DRIVER_PATH)?;
        dsn_key.set_value("SERVER", &"127.0.0.1")?;
        dsn_key.set_value("PORT_NUMBER", &"19812")?;

        let (sources_key, _) = hkcu.create_subkey(r"Software\ODBC\ODBC.INI\ODBC Data Sources")?;
        sources_key.set_value(DSN, &"4D v18 ODBC Driver 64-bit")?;
        Ok(())
    };

    match write() {
        Ok(()) => println!("[reman] REMAN_4D DSN registered/confirmed under HKCU"),
        Err(e) => eprintln!("[reman] failed to register REMAN_4D DSN: {e}"),
    }
}

#[cfg(not(windows))]
pub fn ensure_reman_dsn_registered() {}

/// Distinguishes *why* REMAN might be unreachable before anything actually
/// tries to connect — lets the UI show "install the 4D driver" vs. "check
/// the network" instead of always showing the same raw ODBC error text
/// regardless of cause.
#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum RemanDsnStatus {
    /// Driver present, DSN registered — a connection failure from here on
    /// is a real network/server issue, not a local setup problem.
    Ready,
    /// The vendor driver DLL isn't installed at REMAN_DRIVER_PATH at all —
    /// `ensure_reman_dsn_registered` refuses to register a DSN pointing at
    /// nothing, so this is the actionable root cause, not the DSN itself.
    DriverMissing { expected_path: String },
}

#[cfg(windows)]
#[tauri::command]
pub fn reman_dsn_status() -> RemanDsnStatus {
    if std::path::Path::new(REMAN_DRIVER_PATH).exists() {
        RemanDsnStatus::Ready
    } else {
        RemanDsnStatus::DriverMissing { expected_path: REMAN_DRIVER_PATH.to_string() }
    }
}

#[cfg(not(windows))]
#[tauri::command]
pub fn reman_dsn_status() -> RemanDsnStatus {
    RemanDsnStatus::Ready
}

/// 4D's ODBC driver hardcodes port 19812 regardless of the DSN's
/// PORT_NUMBER setting; the real SQL port is 19822. This forwards one to
/// the other so the app doesn't depend on a separately-run proxy script.
pub fn spawn_local_proxy() {
    async_runtime::spawn(async {
        let listener = match TcpListener::bind(PROXY_LISTEN).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!(
                    "[reman] proxy not started on {PROXY_LISTEN} (already in use, likely by another instance): {e}"
                );
                return;
            }
        };
        println!("[reman] proxy listening on {PROXY_LISTEN} -> {REMAN_SERVER}");
        loop {
            let (mut client, _) = match listener.accept().await {
                Ok(pair) => pair,
                Err(e) => {
                    eprintln!("[reman] proxy accept error: {e}");
                    continue;
                }
            };
            async_runtime::spawn(async move {
                match TcpStream::connect(REMAN_SERVER).await {
                    Ok(mut remote) => {
                        let _ = copy_bidirectional(&mut client, &mut remote).await;
                    }
                    Err(e) => eprintln!("[reman] could not reach {REMAN_SERVER}: {e}"),
                }
            });
        }
    });
}

fn environment() -> Result<&'static Environment, String> {
    static ENV: OnceLock<Result<Environment, String>> = OnceLock::new();
    ENV.get_or_init(|| Environment::new().map_err(|e| format!("failed to init ODBC environment: {e}")))
        .as_ref()
        .map_err(|e| e.clone())
}

/// Single quotes are the only thing that matters here — confirmed live
/// against the server that `?` parameter placeholders silently fail to
/// execute, so every query is built by string interpolation. Doubling `'`
/// is standard SQL literal escaping and was verified to neutralize an
/// injection payload rather than execute it.
fn escape_sql_literal(input: &str) -> String {
    input.replace('\'', "''")
}

/// Runs a query and returns rows as `Option<String>` per column, in SELECT
/// order (`None` for SQL NULL). Blocking — call from `spawn_blocking`.
///
/// **Never SELECT a Boolean-typed 4D column here** (e.g. `Neuf`, `Blocage`,
/// any of the `(1)`-typed columns in docs/reman-schema.md). Confirmed live:
/// the 4D ODBC driver reports type metadata for Boolean columns that
/// overflows the i16 odbc-api expects, and it hard-panics inside
/// `TextRowSet::for_cursor` rather than returning an `Err`. The panic is
/// contained by `spawn_blocking` (surfaces as a normal `Result::Err` to the
/// caller, doesn't crash the app) but the query still can't be run.
///
/// **Also never `SELECT COUNT(*)` (or any other aggregate)** — confirmed
/// live 2026-08-03, same panic, same error message, first triggered by
/// `probe_boolean`'s original `SELECT COUNT(*) AS N FROM LigCde WHERE ...`.
/// Pinpointed via a step-by-step trace through `reman_get_intervention`
/// (every plain-column SELECT tested fine in isolation; only the `COUNT(*)`
/// shape panicked, reproducibly, every time). Whatever type metadata the 4D
/// driver reports for an aggregate result column apparently hits the same
/// `TextRowSet` overflow as a Boolean column. Fixed by never aggregating —
/// `probe_boolean` selects the row's own PK and checks non-emptiness
/// instead, same shape as every other Boolean-avoidance query in this file.
fn run_query(conn: &Connection<'static>, sql: &str) -> Result<Vec<Vec<Option<String>>>, String> {
    let mut cursor = conn
        .execute(sql, (), None)
        .map_err(|e| format!("REMAN query failed: {e}"))?
        .ok_or_else(|| "REMAN query returned no result set".to_string())?;
    let mut buffers = TextRowSet::for_cursor(BATCH_SIZE, &mut cursor, Some(MAX_STR_LEN))
        .map_err(|e| e.to_string())?;
    let mut row_set_cursor = cursor.bind_buffer(&mut buffers).map_err(|e| e.to_string())?;

    let mut rows = Vec::new();
    while let Some(batch) = row_set_cursor.fetch().map_err(|e| e.to_string())? {
        for row_index in 0..batch.num_rows() {
            let row = (0..batch.num_cols())
                .map(|col_index| {
                    batch
                        .at(col_index, row_index)
                        .map(|bytes| String::from_utf8_lossy(bytes).trim().to_string())
                        .filter(|s| !s.is_empty())
                })
                .collect();
            rows.push(row);
        }
    }
    Ok(rows)
}

/// For `INSERT`/`UPDATE`/`DELETE` only — never `SELECT` (use `run_query`).
/// A write statement normally returns no result set at all (`conn.execute`
/// gives `Ok(None)`), which is success here — unlike `run_query`, which
/// treats `None` as an error because it always expects rows back. Success
/// is just "the driver didn't reject the statement".
fn run_write(conn: &Connection<'static>, sql: &str) -> Result<(), String> {
    conn.execute(sql, (), None).map_err(|e| format!("REMAN write failed: {e}"))?;
    Ok(())
}

/// The single choke point for all 4D access from this process. Confirmed
/// live 2026-08-03: every `run_query`/`run_write` call used to open its own
/// fresh connection, so one "close a job" click could chain ~19 separate
/// connections (the write, then a full `reman_get_intervention` refresh) —
/// with up to 15 concurrent BRAXON instances, this was always going to hit
/// whatever connection cap 4D enforces, and it did ("Access denied. No more
/// connections possible."). This acquires a process-wide lock (so only one
/// logical operation talks to 4D at a time, however many concurrent
/// commands are in flight from this instance), opens exactly one
/// connection, and hands it to `f` — every query `f` needs should reuse
/// this same connection rather than opening its own.
///
/// A plain `std::sync::Mutex`, not `tokio::sync::Mutex`, is correct: every
/// call site is already fully synchronous, running inside one outer
/// `spawn_blocking` with no `.await` inside the critical section — blocking
/// briefly on a std mutex from a dedicated blocking-pool thread is exactly
/// what `spawn_blocking` is for.
///
/// Poison-tolerant: the guarded state is just `()`, there's no real
/// invariant a panic could leave inconsistent, so a poisoned lock (from a
/// prior panic — e.g. the documented Boolean-column `TextRowSet` panic) is
/// recovered from rather than permanently wedging all future 4D access.
fn with_reman_connection<T>(f: impl FnOnce(&Connection<'static>) -> Result<T, String>) -> Result<T, String> {
    static LOCK: OnceLock<std::sync::Mutex<()>> = OnceLock::new();
    let _guard = LOCK
        .get_or_init(|| std::sync::Mutex::new(()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let env = environment()?;
    let conn = env
        .connect(DSN, REMAN_UID, REMAN_PWD, ConnectionOptions::default())
        .map_err(|e| format!("REMAN connection failed: {e}"))?;
    f(&conn)
}

fn parse_id(id: &str, label: &str) -> Result<i64, String> {
    id.trim().parse().map_err(|_| format!("Invalid {label} id"))
}

/// Guard against exactly the race a shorter poll interval can shrink but
/// never close: a technician loads a job, someone else (a different
/// BRAXON client, or the native 4D client directly) closes it in the
/// meantime, and the first technician submits an action on what they
/// still believe is an open job. Reported directly: "if a technician
/// does something, and you're still seeing the old stuff, and you try to
/// let say close the job or something, it's gonna be a mess" — confirmed
/// live before this existed that it genuinely was one: none of the write
/// paths checked `Soldée` first, so a second close would silently insert
/// a *second*, conflicting closing `Intervention` row — and since every
/// query in this file treats the chronologically-latest step as a job's
/// real outcome (`is_more_recent_step`), that second write would quietly
/// become "the" outcome everywhere downstream (revenue, leaderboards,
/// analytics), with the first closer's real work never actually reflected
/// anywhere again, not even an error to say so.
///
/// A plain `WHERE "Soldée" = True` probe, never a direct `SELECT` of the
/// Boolean column itself — same reason as every other Boolean-column
/// check in this file (see `run_query`'s doc comment on why a direct
/// `SELECT` panics the ODBC driver). Called at the top of every write
/// path that assumes the job is still open, before any `INSERT`/`UPDATE`
/// — a rejected write here is cheap; a silently-corrupted outcome later
/// is not.
fn job_is_closed(conn: &Connection<'static>, ligcde_id: i64) -> Result<bool, String> {
    let rows = run_query(
        conn,
        &format!(r#"SELECT NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde = {ligcde_id} AND "Soldée" = True"#),
    )?;
    Ok(!rows.is_empty())
}

// Mirrored exactly by JOB_ALREADY_CLOSED_ERROR in src/pages/Reman.tsx —
// the frontend matches on this literal string (not just displays it) to
// trigger an immediate detail refetch when a write is rejected for this
// specific reason. Keep both sides in sync if this text ever changes.
const JOB_ALREADY_CLOSED_ERROR: &str =
    "This job was already closed by someone else since you last loaded it. Reopen the job to see the current state.";

/// `Commande.Immat_TypeVéhicule` holds "PLATE MODEL..." as one
/// space-separated field — confirmed live, e.g.
/// `"FF593XY AUDI A6 V AVANT (F2) PHASE 1"`. Split on the first space;
/// with no space the whole value is treated as the plate.
fn split_vehicle(raw: Option<String>) -> (Option<String>, Option<String>) {
    match raw {
        Some(s) => match s.split_once(' ') {
            Some((plate, model)) => {
                let model = model.trim();
                (Some(plate.to_string()), (!model.is_empty()).then(|| model.to_string()))
            }
            None => (Some(s), None),
        },
        None => (None, None),
    }
}

/// 4D dates come back as `"DD/MM/YYYY HH:MM"`. Rewritten to
/// `"YYYY-MM-DD HH:MM"` so plain string comparison sorts chronologically.
fn delivery_sort_key(raw: &Option<String>) -> Option<String> {
    let s = raw.as_ref()?;
    let (date_part, rest) = s.split_once(' ').unwrap_or((s.as_str(), ""));
    let mut parts = date_part.split('/');
    let d = parts.next()?;
    let m = parts.next()?;
    let y = parts.next()?;
    Some(format!("{y}-{m}-{d} {rest}"))
}

/// True if `raw` (a `"DD/MM/YYYY..."` date) is more than a month before
/// today. `None` (no date set) is never stale — that's a job that hasn't
/// been scheduled yet, not one that's overdue and abandoned.
fn is_more_than_a_month_past(raw: &Option<String>) -> bool {
    let Some(s) = raw else { return false };
    let date_part = s.split_once(' ').map_or(s.as_str(), |(d, _)| d);
    let Ok(date) = NaiveDate::parse_from_str(date_part, "%d/%m/%Y") else { return false };
    date < Local::now().date_naive() - Duration::days(30)
}

// ---- Interventions ----

/// Mirrors the old 4D client's menu (Saisie Interventions, Suivi service
/// commercial, ...). See docs/reman-schema.md "Intervention status /
/// workflow queues" for how each variant maps to TypeCode / Soldée,
/// confirmed live against the server.
/// `LigCde.Type_Service` is the real "which desk owns this line" field —
/// confirmed live (2026-07-30) by cross-referencing a known-good 16-job
/// worklist (15 of 16 landed on 101/102/103; the 16th was 114) and, for
/// Commercial, by matching the real screen's exact count. The full known
/// value set is {100,101,102,103,104,114,305}. Large-sample correlation
/// against `LibelleArt` per code (hundreds of rows each, see docs) reads
/// as: 100/101 = ABS + power steering benches, 102 = dashboards/
/// multimedia, 103 = body electronics/airbag, 104/114 = engine ECUs — but
/// per the workflow owner, 114 specifically means "sent to a
/// subcontractor", not a second in-house bench as the pure name-matching
/// first suggested. 305 = commercial (confirmed exact). See
/// docs/reman-schema.md "Intervention queue — the real mechanism".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum InterventionQueue {
    /// Soldée = False AND Type_Service IN ('100','101','102','103') — the
    /// technician benches' combined worklist. Default landing queue.
    Open,
    /// Soldée = True — "Interventions Soldées".
    Closed,
    /// LigCde.Type_Service = '305' — "Suivi service commercial".
    Commercial,
    /// LigCde.Type_Service = '114' — sent to a subcontractor.
    Subcontractor,
    /// Same Open scoping (Soldée=False, Type_Service IN bench codes) plus
    /// TypeCode = 'AP' — "Suivi des attentes de pieces". These four
    /// TypeCode queues are sub-statuses of the bench worklist, not separate
    /// desks — without the Open-style scoping they matched every
    /// Intervention row ever stamped with that TypeCode, including closed
    /// and years-old jobs.
    AwaitingParts,
    /// Same as AwaitingParts, TypeCode = 'ARC' — "Suivi attentes
    /// renseignements".
    AwaitingInfo,
    /// Same as AwaitingParts, TypeCode = 'ATN' — "Interventions en attente
    /// de nettoyage".
    AwaitingCleaning,
    /// Same as AwaitingParts, TypeCode = 'ER' — "Etapes de réparation en
    /// cours".
    RepairInProgress,
}

impl InterventionQueue {
    fn parse(s: &str) -> Result<Self, String> {
        match s {
            "open" => Ok(Self::Open),
            "closed" => Ok(Self::Closed),
            "commercial" => Ok(Self::Commercial),
            "subcontractor" => Ok(Self::Subcontractor),
            "awaiting_parts" => Ok(Self::AwaitingParts),
            "awaiting_info" => Ok(Self::AwaitingInfo),
            "awaiting_cleaning" => Ok(Self::AwaitingCleaning),
            "repair_in_progress" => Ok(Self::RepairInProgress),
            other => Err(format!("Unknown intervention queue: {other}")),
        }
    }

    fn type_codes(self) -> &'static [&'static str] {
        match self {
            Self::AwaitingParts => &["AP"],
            Self::AwaitingInfo => &["ARC"],
            Self::AwaitingCleaning => &["ATN"],
            Self::RepairInProgress => &["ER"],
            Self::Open | Self::Closed | Self::Commercial | Self::Subcontractor => &[],
        }
    }
}

// ---- ABS intake fault hint: hydraulic vs ECU, from the client-reported symptom (2026-08-05) ----
//
// Requested directly, then backed by real data before building: mined
// `LigCde.Observations` (the client-reported symptom at intake) against
// `Zebra_LigCdeTest`'s explicit "X défectueux" confirmations across every
// closed Type_Service=101 (ABS) job with symptom text (13,680 jobs; 1,773
// of them — 13% — ever got one of these two specific defect-confirmation
// codes logged, so this is a hint from real outcomes, not a guarantee).
// Word-frequency comparison between the 1,456 hydraulic-confirmed and 266
// ECU-confirmed jobs turned up a clean, mostly non-overlapping vocabulary
// on each side — see docs/reman-schema.md for the full methodology and
// numbers. Scoped to Type_Service=101 only, same reasoning as Tests &
// Actions: it's the only service this has been verified against.
//
// Deliberately lexical (substring match on normalized text), not a model —
// the two word lists are disjoint enough in the real data that a simple
// "which side has more hits" call is both transparent (a technician can
// see exactly why a badge fired) and cheap to run on every card in a
// list, not just an expanded detail view.

/// Hydraulic-side symptom vocabulary — strongly overrepresented in
/// hydraulic-defect-confirmed jobs' `Observations` vs ECU-confirmed ones.
/// `C1380` is a literal DTC code (115 hydraulic-confirmed jobs vs 1
/// ECU-confirmed) kept as-is rather than normalized away.
const ABS_HYDRAULIC_TERMS: &[&str] = &[
    "DESEQUILIBRE", "FREINAGE", "BLOQUENT", "BLOQUEES", "BLOQUEE", "BLOQUE",
    "PEDALE MOLLE", "PEDALE A FOND", "FREINE TOUTE SEULE", "FREINENT", "FREINE",
    "FUITE", "PURGE", "PURGER", "C1380",
];

/// ECU/calculateur-side symptom vocabulary — strongly overrepresented in
/// ECU-defect-confirmed jobs' `Observations` vs hydraulic-confirmed ones.
const ABS_ECU_TERMS: &[&str] = &[
    "PAS DE COMMS", "NO COMMS", "COMMUNICATION", "VOYANT ALLUME", "VOYANTS ALLUMES",
    "SIGNAL IMPLAUSIBLE", "CALCULATEUR", "CAPTEUR DE VITESSE", "ESP",
];

/// Strips the French accented characters that actually show up in
/// `Observations` text and uppercases — same normalization used (in JS) to
/// mine these term lists in the first place, so matching stays consistent
/// with how they were derived. Hand-rolled rather than pulling in a
/// unicode-normalization crate for one field's worth of accents.
fn normalize_for_match(text: &str) -> String {
    text.chars()
        .map(|c| match c {
            'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'e',
            'à' | 'â' | 'ä' | 'À' | 'Â' | 'Ä' => 'a',
            'î' | 'ï' | 'Î' | 'Ï' => 'i',
            'ô' | 'ö' | 'Ô' | 'Ö' => 'o',
            'ù' | 'û' | 'ü' | 'Ù' | 'Û' | 'Ü' => 'u',
            'ç' | 'Ç' => 'c',
            other => other,
        })
        .collect::<String>()
        .to_uppercase()
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AbsFaultHint {
    Hydraulic,
    Ecu,
}

/// A technician's own confirmed read on a unit — separate from
/// `AbsFaultHint` (the lexical guess from intake symptom text). Requested
/// directly: "i can verify the badges and set them as well, like if i
/// read or test a unit i can just set if it's hydraulic or ecu fault or
/// both." `Both` only ever comes from here — the lexical hint is designed
/// to stay silent (`None`) rather than guess when a job's text matches
/// both sides, so it can never itself resolve to `Both`. Entirely
/// BRAXON's own Postgres (`"RemanVerifiedFaultType"`) — 4D has no concept
/// of this at all, same boundary as the technician roster and saved
/// comments/presets.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VerifiedFaultType {
    Hydraulic,
    Ecu,
    Both,
}

impl VerifiedFaultType {
    fn parse(s: &str) -> Result<Self, String> {
        match s {
            "hydraulic" => Ok(Self::Hydraulic),
            "ecu" => Ok(Self::Ecu),
            "both" => Ok(Self::Both),
            other => Err(format!("Unknown fault type: {other}")),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Hydraulic => "hydraulic",
            Self::Ecu => "ecu",
            Self::Both => "both",
        }
    }
}

/// Whether a job matches a `fault_type` search filter ("hydraulic" /
/// "ecu" / "both") — a verified value always wins over the lexical hint
/// where both exist (same precedence as everywhere this pair is shown).
/// `Both` (verified-only, see `VerifiedFaultType`'s doc comment) matches
/// both the "hydraulic" and "ecu" filters — a unit confirmed to have both
/// faults genuinely does have a hydraulic fault, and genuinely does have
/// an ECU fault — but only the "both" filter itself requires `Both`
/// specifically.
fn fault_type_matches(hint: Option<AbsFaultHint>, verified: Option<VerifiedFaultType>, filter: &str) -> bool {
    let hydraulic = matches!(verified, Some(VerifiedFaultType::Hydraulic) | Some(VerifiedFaultType::Both))
        || (verified.is_none() && hint == Some(AbsFaultHint::Hydraulic));
    let ecu = matches!(verified, Some(VerifiedFaultType::Ecu) | Some(VerifiedFaultType::Both))
        || (verified.is_none() && hint == Some(AbsFaultHint::Ecu));
    match filter {
        "hydraulic" => hydraulic,
        "ecu" => ecu,
        "both" => verified == Some(VerifiedFaultType::Both),
        _ => true,
    }
}

/// `None` covers both "not an ABS job" and "no strong lexical signal
/// either way" — a job's own `Observations` may simply not use any of
/// this vocabulary, which is the common case (most closed jobs' symptom
/// text doesn't lexically match either side; see the module doc comment).
fn classify_abs_fault_hint(type_service: Option<&str>, observations: Option<&str>) -> Option<AbsFaultHint> {
    if type_service != Some("101") {
        return None;
    }
    let text = normalize_for_match(observations?);
    let hyd_hit = ABS_HYDRAULIC_TERMS.iter().any(|t| text.contains(t));
    let ecu_hit = ABS_ECU_TERMS.iter().any(|t| text.contains(t));
    match (hyd_hit, ecu_hit) {
        (true, false) => Some(AbsFaultHint::Hydraulic),
        (false, true) => Some(AbsFaultHint::Ecu),
        _ => None, // neither, or both (ambiguous either way) — no badge
    }
}

// Driven by LigCde (the job ticket a technician actually works from), not
// Intervention (a per-visit log entry — its NomMachine/Possesseur fields
// turned out to be 4D session metadata, not business data: verified live
// against a technician's real screenshot, see docs/reman-schema.md
// "Intervention queue — corrected field mapping").

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InterventionSummary {
    pub id: String,
    pub reference: Option<String>,
    pub client_name: Option<String>,
    pub code_art: Option<String>,
    pub libelle_art: Option<String>,
    /// `ArticleMeteor.Designation` via `derive_family` — same "family"
    /// `reman_analytics`'s `top_families`/`comebacks_by_family` already
    /// use. Added alongside the family filter, for display.
    pub family: Option<String>,
    pub vehicle_plate: Option<String>,
    pub vehicle_model: Option<String>,
    pub lim_livraison: Option<String>,
    pub date_dern_interv: Option<String>,
    pub statut: Option<String>,
    /// `LigCde.Garantie` ("SG" in the real 4D grid) — confirmed live
    /// 2026-08-02 by probing every warranty-ish Boolean candidate against a
    /// real screenshot's job (NoInt_Ligcde 39516): `Garantie` was the only
    /// one that came back `True`, matching "SG checked, everything else
    /// unchecked" exactly. Only ever populated for `InterventionQueue::Open`
    /// (see the warranty_ids lookup in reman_search_interventions) — always
    /// `false` for every other queue, by request ("just the default Open
    /// queue"), not a real signal there.
    pub under_warranty: bool,
    /// Lexical hint from the client-reported symptom (`LigCde.Observations`)
    /// — hydraulic vs ECU/calculateur — for Type_Service=101 (ABS) jobs
    /// only. See `classify_abs_fault_hint`'s doc comment for methodology.
    /// `None` for every other service, and for ABS jobs whose symptom text
    /// doesn't lexically match either side.
    pub abs_fault_hint: Option<AbsFaultHint>,
    /// Whether `LigCde.SuiviGar_AncNoInterv` is set — cheap to compute at
    /// list level (no extra query, just one more selected column), unlike
    /// resolving the full `PreviousJobLink`, which is detail-view only.
    pub has_previous_job: bool,
    /// A technician's own confirmed hydraulic/ECU read, if set — takes
    /// precedence over `abs_fault_hint` wherever both exist. See
    /// `VerifiedFaultType`'s doc comment.
    pub verified_fault_type: Option<VerifiedFaultTypeRecord>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InterventionLine {
    pub id: String,
    pub code_art: Option<String>,
    pub lib_art: Option<String>,
    pub prix_ht: Option<String>,
    pub prix_net: Option<String>,
}

/// One row of the job's full step history (`Intervention` table — a
/// per-visit log, several rows per `LigCde`). Confirmed live 2026-08-03
/// against a real 4D screenshot: the step grid's "intervention" column is
/// `TypeLibelle`, and each step's own comment (only shown for one of the
/// two steps in the sample screen, since the other's `Commentaire` was
/// empty) is `Intervention.Commentaire` — exact text match confirmed.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InterventionStep {
    pub id: String,
    pub date: Option<String>,
    pub heure: Option<String>,
    pub tech_id: Option<String>,
    pub tech_name: Option<String>,
    pub type_code: Option<String>,
    pub type_libelle: Option<String>,
    pub commentaire: Option<String>,
}

/// The "OFFRE RETENUE" checkboxes (`Réparation`/`Vente`/`EchgeS`/`AvanceES`)
/// plus `Garantie`/`ND`/`RAS` — all `LigCde` Booleans, confirmed live
/// 2026-08-03 by probing each one individually against a real job
/// (`NoInt_Ligcde = 39500`, only `Réparation` came back `True`, matching
/// its checked box). See `probe_boolean`.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct JobOutcomeFlags {
    pub under_warranty: bool,
    pub non_repairable: bool,
    pub no_fault_found: bool,
    pub reparation: bool,
    pub vente: bool,
    pub echange_standard: bool,
    pub avance: bool,
}

/// `LigCde.PrixHT`/`Remise` (the line's own price) plus
/// `Commande.MtHT_Lignes`/`MtHT_Port`/`MtHT_Total`/`TotalTVA`/`TotalTTC`
/// (the order-level valorisation totals) — confirmed live 2026-08-03
/// against the real job's "Valorisation du dossier" box (395/0/0/395/79/474
/// — Lignes+Port=HT, HT×1.20=TTC, checks out).
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct JobAmounts {
    pub prix_ht: Option<String>,
    pub remise: Option<String>,
    pub mt_lignes: Option<String>,
    pub mt_port: Option<String>,
    pub mt_ht_total: Option<String>,
    pub mt_tva: Option<String>,
    pub mt_ttc: Option<String>,
}

/// A prior job this one is linked to via `LigCde.SuiviGar_AncNoInterv`
/// ("Suivi Garantie - Ancien N° Intervention") — 4D's own warranty-
/// comeback tracking field, confirmed live 2026-08-05 against job
/// 17481001 (linked to 17423601, whose order comment read "Connecteur
/// cassé sur précédent dossier NFF..." — an explicit staff note about the
/// comeback). Populated on 3,261 of 38,551 LigCde rows (8.5%); of a
/// 200-job sample, 86.5% resolved to a real `LigCde` row (the rest likely
/// predate current retention or use an older reference format) — `None`
/// covers both "no link set" and "link set but didn't resolve."
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PreviousJobLink {
    pub id: String,
    pub reference: Option<String>,
    pub date_dern_interv: Option<String>,
    /// `LigCde.NomDernierTech` — only ever set by a job's *closing* step
    /// (confirmed earlier, see the ER/ATN write-feature docs), so this is
    /// reliably "who closed the prior job," not just whoever last touched
    /// it.
    pub tech_name: Option<String>,
    pub statut: Option<String>,
    pub outcome: JobOutcomeFlags,
    /// `SGRAS` (tested a warranty unit, found nothing wrong), or
    /// `SGRefuseePanneDiff`/`SGRefuseeAutreMotif` (warranty claim refused —
    /// a different/unrelated fault, or another stated reason) — confirmed
    /// live 2026-08-06, directly from the workflow owner: none of these
    /// three mean the *original* repair failed, unlike a real comeback
    /// after a completed repair. See `WARRANTY_REFUSAL_FIELDS`'s doc
    /// comment for the full reasoning and the live sample that confirmed
    /// it (`SGRefuseePanneDiff`/`SGRefuseeAutreMotif` jobs mostly still
    /// show `Réparation = true` — billed and fixed, just not free under
    /// warranty, not evidence of a failed repair).
    pub warranty_refused: bool,
}

/// `RAS` (the job's own outcome flag) plus the three warranty-refusal
/// fields — together, "this job's outcome doesn't reflect an unresolved
/// defect the shop is responsible for." Used both to build
/// `PreviousJobLink.warranty_refused` (a single job) and, in
/// `reman_analytics`, batched across every comeback in the selected
/// window to exclude warranty-refused comebacks from the technician/
/// family blame breakdown.
const WARRANTY_REFUSAL_FIELDS: &[&str] = &["RAS", "SGRAS", "SGRefuseePanneDiff", "SGRefuseeAutreMotif"];

/// Resolves `SuiviGar_AncNoInterv` (the prior job's `NoIntervention`
/// reference, stored as text) to a real `LigCde` row and its outcome.
/// `Ok(None)` if the reference doesn't resolve — not an error, since the
/// live sample confirmed ~13% of references don't (see `PreviousJobLink`'s
/// doc comment).
fn resolve_previous_job(conn: &Connection<'static>, prev_reference: &str) -> Result<Option<PreviousJobLink>, String> {
    let escaped = escape_sql_literal(prev_reference);
    let row = run_query(
        conn,
        &format!(
            r#"SELECT NoInt_Ligcde, DateDernInterv, NomDernierTech, "DernièreInterv"
               FROM LigCde WHERE NoIntervention = '{escaped}'"#
        ),
    )?
    .into_iter()
    .next();
    let Some(r) = row else { return Ok(None) };
    let Some(prev_id) = r[0].clone().and_then(|s| s.parse::<i64>().ok()) else {
        return Ok(None);
    };

    let outcome = JobOutcomeFlags {
        under_warranty: probe_boolean(conn, prev_id, "Garantie")?,
        non_repairable: probe_boolean(conn, prev_id, "ND")?,
        no_fault_found: probe_boolean(conn, prev_id, "RAS")?,
        reparation: probe_boolean(conn, prev_id, "Réparation")?,
        vente: probe_boolean(conn, prev_id, "Vente")?,
        echange_standard: probe_boolean(conn, prev_id, "EchgeS")?,
        avance: probe_boolean(conn, prev_id, "AvanceES")?,
    };
    let mut warranty_refused = outcome.no_fault_found;
    if !warranty_refused {
        for field in &WARRANTY_REFUSAL_FIELDS[1..] {
            // RAS is already covered by `outcome.no_fault_found` above; only
            // probe the three SG-specific fields here.
            if probe_boolean(conn, prev_id, field)? {
                warranty_refused = true;
                break;
            }
        }
    }

    Ok(Some(PreviousJobLink {
        id: prev_id.to_string(),
        reference: Some(prev_reference.to_string()),
        date_dern_interv: r[1].clone(),
        tech_name: r[2].clone(),
        statut: r[3].clone(),
        outcome,
        warranty_refused,
    }))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InterventionDetail {
    pub id: String,
    pub reference: Option<String>,
    pub client_id: Option<String>,
    pub client_name: Option<String>,
    pub client_ville: Option<String>,
    pub client_cp: Option<String>,
    pub client_contact: Option<String>,
    pub client_tel: Option<String>,
    pub client_email: Option<String>,
    /// The client's primary delivery address (first `Clt_adrLivr` row) —
    /// reuses `ClientAddress`, same struct `reman_get_client` already
    /// returns a list of, just narrowed to one here since the job form
    /// only ever shows a single address.
    pub address: Option<ClientAddress>,
    pub ref_client: Option<String>,
    pub code_art: Option<String>,
    pub libelle_art: Option<String>,
    pub marque: Option<String>,
    pub famille: Option<String>,
    pub segmentation: Option<String>,
    pub service: Option<String>,
    pub delai_ligne: Option<String>,
    pub vehicle_plate: Option<String>,
    pub vehicle_model: Option<String>,
    pub lim_livraison: Option<String>,
    pub date_dern_interv: Option<String>,
    pub statut: Option<String>,
    /// Latest step's comment — kept for backward compatibility, now just
    /// `steps.first()`'s `commentaire` rather than its own query.
    pub commentaire: Option<String>,
    pub commentaire_client: Option<String>,
    pub commentaire_interne: Option<String>,
    pub outcome: JobOutcomeFlags,
    pub amounts: JobAmounts,
    /// Sum of every step's `Intervention.TempsPasse`, formatted `HH:MM:SS`.
    pub temps_passe: Option<String>,
    /// Full history, most recent first (`steps[0]` == the old "latest").
    pub steps: Vec<InterventionStep>,
    pub lines: Vec<InterventionLine>,
    /// `LigCde.Soldée` — whether this job is closed. Lets the frontend
    /// hide/guard write actions (add a step, close as repaired) once a job
    /// is already closed; those shouldn't be offered on a closed job.
    pub soldee: bool,
    /// Every `NoInt_ParamTest` already recorded in `Zebra_LigCdeTest` for
    /// this job so far, from any step — lets the Tests & Actions checklist
    /// (available on ER/ATN/close, not just close) show items already
    /// checked on an earlier step as already selected instead of resetting.
    pub tests_actions_selected: Vec<i64>,
    /// Same lexical hydraulic/ECU hint as `InterventionSummary.abs_fault_hint`
    /// — see `classify_abs_fault_hint`.
    pub abs_fault_hint: Option<AbsFaultHint>,
    /// The prior job this one is a warranty comeback from, if
    /// `LigCde.SuiviGar_AncNoInterv` is set and resolves — see
    /// `PreviousJobLink`'s doc comment.
    pub previous_job: Option<PreviousJobLink>,
    /// Set by `get_intervention_sync`'s callers, not by `get_intervention_sync`
    /// itself — it only has a 4D connection, and this lives in Postgres.
    /// See `VerifiedFaultType`'s doc comment.
    pub verified_fault_type: Option<VerifiedFaultTypeRecord>,
    /// See `accessoires_for`'s doc comment — accessories attached to this
    /// job (e.g. "Support de fixation") and whether each one's physical
    /// presence has been confirmed. Empty for jobs with no accessories.
    pub accessoires: Vec<AccessoireRecord>,
    /// `Commande.Representant` — a 2-3 letter initials code identifying
    /// who this job is assigned to on the commercial/dispatch side.
    /// Reported directly as a real gap: a job visibly "assigned to Nicolas
    /// Paoli" in the native 4D client showed nothing at all in BRAXON.
    /// Confirmed live this is a genuinely separate concept from
    /// `TechDernInterv` (who did the *last actual step*) — a real example
    /// job had `Representant = "NP"` while every one of its `Intervention`
    /// rows was logged under a completely different technician id, because
    /// the job had since been transferred to Service Commercial. See
    /// `representant_name`'s doc comment for why only some codes resolve
    /// to a full name.
    pub representant_code: Option<String>,
    pub representant_name: Option<String>,
}

/// `Commande.Representant`'s ~10 distinct shop-wide values are 2-3 letter
/// staff initials, not a joinable id — confirmed live (2026-09-01) there's
/// no dedicated lookup table for them anywhere in the schema (checked
/// every table name; `Salarie`/`EffectifTechnicien` are both keyed by a
/// numeric id, never by these codes). Only mapped here where a code was
/// individually cross-checked against a real `Salarie` name (first letter
/// of `Prenom` + a letter of `Nom`) and confirmed unambiguous — the
/// unmapped codes are shown as their raw initials rather than guessed at,
/// same discipline as the "Technicien"/"S" columns note elsewhere in this
/// file: a wrong name would be worse than an honest unresolved code.
/// Extend this by hand as more codes get confirmed, never by pattern-
/// matching initials automatically — "HC" only resolves because it was
/// checked against a real compound surname (Barreau Cerveau), not because
/// the two-letter rule is known to generalize.
fn representant_name(code: &str) -> Option<&'static str> {
    match code {
        "NP" => Some("Nicolas Paoli"),
        "HC" => Some("Hugues Barreau Cerveau"),
        "AG" => Some("Abdel Guitni"),
        "LH" => Some("Larissa Hostina"),
        "TM" => Some("Thomas Maida"),
        _ => None,
    }
}

/// TypeCodes that mean the job has been handed off somewhere else — its
/// own dedicated queue, a subcontractor, or a customer waiting to respond
/// — and so is excluded from the Open queue. This governs the Open-queue
/// exclusion only; it's independent of how Commercial's own filter works
/// (Commercial is `LigCde.Type_Service`-based, not TypeCode-based — see
/// `InterventionQueue::Commercial`). TES/ARD showing up here too just
/// means a job in that state isn't the technician's daily work either,
/// whether or not it also happens to be on the Type_Service=305 desk.
///
/// Confirmed with the person who built this workflow: `ER` ("Etape de
/// réparation") and `PA` ("Pièces arrivées" — parts have arrived, back in
/// the technician's hands) are *not* hand-offs, they're still active work,
/// and stay in Open. So does an untouched job (no TypeCode at all yet).
const CATEGORIZED_TYPE_CODES: [&str; 6] = ["TES", "AP", "ARC", "ATN", "ARD", "ST"];

// ---- Search caching (2026-08-31) ----
//
// Reported directly: a queue tab's own 60-second auto-refresh felt slow
// ("60 seconds is a lot"), and a job that changes queue membership
// (marked awaiting cleaning, cleaned, etc.) sits stale in the wrong list
// until that poll catches up. Simply shortening the interval was
// considered and rejected — this query was never routed through the
// shared Postgres cache the forecast panel/shop status use specifically
// *because* it takes seven independent filter parameters (unlike those,
// which have none), so up to 15 clients polling it directly, more often,
// would multiply real 4D load rather than absorb it (see this function's
// original doc comment on `INTERVENTIONS_REFRESH_MS` in Reman.tsx).
//
// Fixed by giving it the same dynamic-per-key cache treatment as
// `reman_closed_on_day` — a cache key built from all seven parameters
// (queue/tech_id/family/fault_type/date_from/date_to/query), bootstrapped
// on first sight, served via the shared `cached_or_refresh` claim. Most
// clients are watching the same handful of common views (the default
// Open queue, no filters) at any given moment, so they share one cache
// row and one real 4D query per `LIVE_CACHE_TTL_SECONDS` window,
// regardless of how many clients are polling. A custom/rare filter
// combination just gets its own smaller-shared row — still far better
// than zero sharing, never worse than before. The poll interval on the
// frontend was halved to match (30s, same as `SHOP_STATUS_REFRESH_MS`
// matching this same TTL constant elsewhere in this file).
async fn reman_search_interventions_core(
    query: String,
    queue: String,
    tech_id: Option<String>,
    family: Option<String>,
    fault_type: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    pg: &tokio_postgres::Client,
) -> Result<Vec<InterventionSummary>, String> {
    let queue = InterventionQueue::parse(&queue)?;
    let q = escape_sql_literal(query.trim());

    let mut conditions: Vec<String> = Vec::new();
    if !q.is_empty() {
        // NoIntervention (the reference shown to the user, e.g.
        // "17456001") was missing from this OR list — search silently
        // never matched a reference despite the placeholder text
        // ("Search by client, article, or reference...") promising it.
        //
        // `l.Observations` (the intake fault-description text, same field
        // `AbsFaultHint`'s lexical guess reads) added 2026-08-14 —
        // requested directly ("search this fault code in fault
        // description of all previous jobs"), confirmed live it finds
        // real matches (28 jobs for "5DF0", 25 of them repaired). Folded
        // into the same free-text box rather than a separate mode — a
        // fault code like "5DF0" isn't a client name/article/reference
        // either, so it slots into the existing OR list the same way.
        conditions.push(format!(
            "(l.NomClient LIKE '%{q}%' OR l.CodeArt LIKE '%{q}%' OR l.LibelleArt LIKE '%{q}%' OR l.NoIntervention LIKE '%{q}%' OR l.Observations LIKE '%{q}%')"
        ));
    }
    // "My Jobs" — restricts any queue to just the units this technician
    // was last to touch. `TechDernInterv` is numeric, not text — confirmed
    // live a quoted comparison (`= '3569'`) fails to execute, an unquoted
    // one (`= 3569`) works, combined with other conditions or alone. Not
    // Boolean either way, so this AND combines safely with the rest (the
    // documented dialect bug is specifically about a Boolean column
    // combined with a second condition — see run_query's doc comment).
    // Parsed as i64 first (like `parse_id` elsewhere in this file) so an
    // unquoted numeric literal can be interpolated without an injection
    // risk — this is the one condition in this function that isn't
    // string-escaped, precisely because it's never treated as a string.
    if let Some(tech_id) = &tech_id {
        let tech_id: i64 = tech_id.trim().parse().map_err(|_| "Invalid technician id".to_string())?;
        conditions.push(format!("l.TechDernInterv = {tech_id}"));
    }
    // Family — same "family" `reman_analytics`'s `top_families`/
    // `comebacks_by_family` already use (`ArticleMeteor.Designation`, via
    // `derive_family` — currently an identity function, so this is a
    // direct substring match on that same text), not `LigCde.Famille`
    // (a per-order copy that isn't guaranteed to stay in sync, per the
    // analytics intake_sql comment) or `Segmentation` (a coarser,
    // 17-value categorical field — considered for this filter, but
    // "family" already has an established, different meaning elsewhere
    // in this file, so matching that beats introducing a second one).
    if let Some(family) = &family {
        let family = family.trim();
        if !family.is_empty() {
            conditions.push(format!("am.Designation LIKE '%{}%'", escape_sql_literal(family)));
        }
    }
    // Date filter field depends on the queue: for Closed, "when did this
    // happen" means when it was closed (LigCde.DateDernInterv), not when
    // the unit originally arrived — reported directly ("interventions
    // soldées for today... it should filter first by the last visit
    // time"), and confirmed live: filtering "today" by DateCommande
    // returned 0 rows for a job actually closed today, while
    // DateDernInterv correctly found it. Same field the Closed queue's
    // own sort already uses (see reman_search_interventions's Closed sort
    // branch, "when I go into Interventions soldées, it should show the
    // latest jobs first" — same reasoning, deadline/intake fields don't
    // mean much once a job is closed). Confirmed live never NULL (5000-row
    // sample, 0 NULLs), so no fallback needed. Every other queue keeps
    // Commande.DateCommande (intake date) — meaningful there for triage
    // ("units that arrived today"), same field the "Today" button in
    // Analytics filters by.
    let date_field = if queue == InterventionQueue::Closed { "l.DateDernInterv" } else { "c.DateCommande" };
    if let Some(date_from) = &date_from {
        let date_from = validate_iso_date(date_from, "date_from")?;
        conditions.push(format!("{date_field} >= '{date_from}'"));
    }
    if let Some(date_to) = &date_to {
        let date_to = validate_iso_date(date_to, "date_to")?;
        conditions.push(format!("{date_field} <= '{date_to}'"));
    }
    // Equality/IN conditions combine safely with l."Soldée" — it's
    // specifically IS NULL/IS NOT NULL combined with a Boolean column that
    // breaks (see docs/reman-schema.md), not equality or IN.
    match queue {
        InterventionQueue::Closed => {
            conditions.push(r#"l."Soldée" = True"#.to_string());
        }
        InterventionQueue::Open => {
            conditions.push(r#"l."Soldée" = False"#.to_string());
            conditions.push("l.Type_Service IN ('100', '101', '102', '103')".to_string());
        }
        InterventionQueue::Commercial => {
            conditions.push(r#"l."Soldée" = False"#.to_string());
            conditions.push("l.Type_Service = '305'".to_string());
        }
        InterventionQueue::Subcontractor => {
            conditions.push(r#"l."Soldée" = False"#.to_string());
            conditions.push("l.Type_Service = '114'".to_string());
        }
        InterventionQueue::AwaitingParts
        | InterventionQueue::AwaitingInfo
        | InterventionQueue::AwaitingCleaning
        | InterventionQueue::RepairInProgress => {
            // Sub-statuses of the same bench worklist as Open, not a
            // separate desk — same Soldée + Type_Service scoping. NOT
            // filtering by TypeCode here: a LigCde has many Intervention
            // rows over its life, and a WHERE on the joined table only
            // returns rows that ever matched, not the job's *current*
            // status. Confirmed live: 3 of 8 "AwaitingParts" jobs matched
            // this way had actually moved on (two to PA/parts arrived, one
            // all the way to ER/repair in progress) but stayed stuck in
            // this queue because an old AP row from earlier in their
            // history satisfied the WHERE. The TypeCode check instead
            // happens in Rust below, against the single most-recent
            // Intervention row per job the existing dedup already isolates.
            conditions.push(r#"l."Soldée" = False"#.to_string());
            conditions.push("l.Type_Service IN ('100', '101', '102', '103')".to_string());
        }
    }
    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    // Which of these jobs are under warranty ("SG" in the real 4D grid —
    // LigCde.Garantie, confirmed live 2026-08-02, see InterventionSummary's
    // doc comment). Garantie is a Boolean column, so — same rule as every
    // other Boolean column in this file — it can never be SELECTed
    // directly (the odbc-api panic documented on run_query); the id set
    // comes from a separate query that only filters on it, same pattern
    // already used for Soldée elsewhere (e.g. reman_analytics's closed_sql
    // intersected against intake_sql). Scoped to the Open queue only, by
    // request — running it on every queue tab would be an extra 4D query
    // for no benefit outside the technician's daily worklist. Verified live
    // that combining Garantie=True with the Open queue's other conditions
    // (Soldée, Type_Service — both equality/IN, never IS NULL/IS NOT NULL)
    // doesn't trip the documented "Boolean combined with a second condition
    // silently zeroes rows" bug: a manual per-row probe across 60 sampled
    // open-bench jobs found exactly 1 with Garantie=True, and that same id
    // was the only one present in this combined query's result set.
    let warranty_sql = (queue == InterventionQueue::Open).then(|| {
        format!(
            r#"SELECT l.NoInt_Ligcde
               FROM LigCde l
               LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
               LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
               LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
               {where_clause} AND l.Garantie = True
               LIMIT 5000"#
        )
    });

    // LEFT JOINs so a job missing a linked Intervention (not yet worked on
    // by any technician) or Commande row still shows up rather than
    // silently vanishing. Ordered by the job's own id first (NOT by the
    // joined Intervention's id — confirmed live that doing so pushes every
    // untouched job, which has no Intervention row at all, out of the
    // result window entirely). A LigCde can have several Intervention rows
    // over its life; de-duplicating by NoInt_Ligcde below keeps only the
    // most recent one (first in this order) per job.
    //
    // The Open/Closed queue's category exclusion, and the sort by delivery
    // deadline, both happen in Rust below rather than in this SQL —
    // confirmed live that this dialect breaks in ways that don't show up
    // as query errors:
    //   - combining a WHERE condition on the driving table's Boolean
    //     column (l."Soldée") with a NULL-check on the LEFT-JOINed table
    //     (i.TypeCode) in the same WHERE silently zeroes out matching rows
    //   - the same happens combining l."Soldée" with a second condition on
    //     the SAME table (l.DateLimiteLivraison IS NOT NULL) — no join
    //     involved at all
    //   - ORDER BY DateLimiteLivraison ASC sorts NULLs first, burying
    //     dated (often urgent) jobs under brand-new undated ones
    // See docs/reman-schema.md. The fetch below is deliberately a single
    // simple WHERE + a single ORDER BY (both individually proven reliable)
    // pulling a generous window (this shop has thousands of technically
    // "open" rows), with everything else — dedup, category exclusion,
    // deadline sort with nulls-last — done in Rust.
    // i."Date"/i.HeureInterv/i.NoInt_interv (indices 10-12) are only for
    // picking the chronologically-latest row per job below — not shown to
    // the user, `r[6]` (LigCde.DateDernInterv) remains what's displayed.
    let sql = format!(
        r#"SELECT l.NoInt_Ligcde, l.NoIntervention, l.NomClient, l.CodeArt, l.LibelleArt,
                  l.DateLimiteLivraison, l.DateDernInterv, i.TypeLibelle, c."Immat_TypeVéhicule", i.TypeCode,
                  i."Date", i.HeureInterv, i.NoInt_interv, l.Type_Service, l.Observations, l.SuiviGar_AncNoInterv,
                  am.Designation
           FROM LigCde l
           LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
           LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
           LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
           {where_clause}
           ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
           LIMIT 5000"#
    );
    let (warranty_ids, rows): (std::collections::HashSet<String>, _) = async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| {
            let warranty_ids = match &warranty_sql {
                Some(warranty_sql) => {
                    run_query(conn, warranty_sql)?.into_iter().filter_map(|r| r[0].clone()).collect()
                }
                None => std::collections::HashSet::new(),
            };
            let rows = run_query(conn, &sql)?;
            Ok((warranty_ids, rows))
        })
    })
    .await
    .map_err(|e| e.to_string())??;

    // Keep only the chronologically-latest Intervention row per job — not
    // simply "first seen in NoInt_interv-DESC order", which stopped being
    // reliable once a job could have both a BRAXON-range id (900,000,000+)
    // and an ordinary 4D one; see is_more_recent_step's doc comment.
    let mut latest: std::collections::HashMap<String, Vec<Option<String>>> = std::collections::HashMap::new();
    for r in rows {
        let id = r[0].clone().unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let replace = match latest.get(&id) {
            None => true,
            Some(existing) => is_more_recent_step(
                &r[10], &r[11], r[12].as_deref().unwrap_or(""),
                &existing[10], &existing[11], existing[12].as_deref().unwrap_or(""),
            ),
        };
        if replace {
            latest.insert(id, r);
        }
    }

    // Batched, one query for every job in this page — not one per row.
    let ids: Vec<String> = latest.keys().cloned().collect();
    let verified_by_id = verified_fault_types_for(pg, &ids).await?;

    let mut out = Vec::new();
    for (id, r) in latest {
        // r[9] is this job's most recent TypeCode (or None if untouched) —
        // the dedup above already guarantees this is the chronologically
        // latest row for this job, so it's safe to use for the
        // exclusion/match decision below. This must be checked against the
        // *latest* row, not just any row that ever had a matching TypeCode
        // — see the comment on AwaitingParts/AwaitingInfo/
        // AwaitingCleaning/RepairInProgress in the WHERE-building match
        // above for why (a job can cycle through AP -> PA -> ER, and only
        // the last one is its current status).
        if queue == InterventionQueue::Open {
            let categorized = r[9].as_deref().is_some_and(|c| CATEGORIZED_TYPE_CODES.contains(&c));
            if categorized {
                continue;
            }
        }
        let target_codes = queue.type_codes();
        if !target_codes.is_empty() && !r[9].as_deref().is_some_and(|c| target_codes.contains(&c)) {
            continue;
        }
        // Every queue except Closed needs a delivery date to be meaningful
        // — a Type_Service/TypeCode match alone catches a lot of lines
        // with no date at all (stock/inventory rows, not live jobs).
        // Confirmed live for Commercial: 429 total, only 6 with a date,
        // matching the real screen's exact count (2026-07-30).
        if queue != InterventionQueue::Closed && r[5].is_none() {
            continue;
        }
        // Staleness cutoff: everything except Closed, Commercial, and
        // AwaitingInfo. Open, confirmed live against a real 16-job
        // worklist (2026-07-30). AwaitingParts/AwaitingCleaning/
        // RepairInProgress are sub-statuses of that same bench worklist —
        // reported as showing full history including years-old jobs before
        // this filter, same shape of problem as the other bench queues, so
        // the same 1-month cutoff applies (confirmed exact for
        // AwaitingParts: 5/5 matching the real screen). Commercial is
        // confirmed NOT to want this — its real 6-job count includes a job
        // over two months overdue, chasing an old unanswered quote being
        // the point of that desk. AwaitingInfo is the same shape of
        // exception: confirmed live (2026-07-30) that job 17085301 (35771)
        // sits at `DateLimiteLivraison = 02/03/2026` — five months past —
        // but has been actively cycling through statuses since (ER → ARC →
        // RRC → ER → ... → ARC again, last touched 22/06/2026) and was
        // wrongly hidden by this filter. Waiting on the *client* to answer
        // is this desk's entire job, same as Commercial waiting on a quote
        // response — the original delivery estimate going stale doesn't
        // mean the job did. Subcontractor has no such confirmation either
        // way, but its un-filtered deadline-ascending list is dominated by
        // jobs from 2024 (sent out and apparently never chased down)
        // burying anything current — same shape of problem Commercial had
        // before its filter was corrected. Applying the same rule as Open
        // here as the safer default; revisit if that turns out to hide
        // something the subcontractor desk actually needs to see.
        if !matches!(
            queue,
            InterventionQueue::Closed | InterventionQueue::Commercial | InterventionQueue::AwaitingInfo
        ) && is_more_than_a_month_past(&r[5])
        {
            continue;
        }
        let (vehicle_plate, vehicle_model) = split_vehicle(r[8].clone());
        let abs_fault_hint = classify_abs_fault_hint(r[13].as_deref(), r[14].as_deref());
        let verified_fault_type = verified_by_id.get(&id).cloned();
        if let Some(filter) = fault_type.as_deref() {
            if !fault_type_matches(abs_fault_hint, verified_fault_type.as_ref().map(|v| v.fault_type), filter) {
                continue;
            }
        }
        out.push(InterventionSummary {
            id: id.clone(),
            reference: r[1].clone(),
            client_name: r[2].clone(),
            code_art: r[3].clone(),
            libelle_art: r[4].clone(),
            family: r[16].as_deref().and_then(derive_family),
            vehicle_plate,
            vehicle_model,
            lim_livraison: r[5].clone(),
            date_dern_interv: r[6].clone(),
            statut: r[7].clone(),
            under_warranty: warranty_ids.contains(&id),
            abs_fault_hint,
            has_previous_job: r[15].as_deref().map(str::trim).is_some_and(|s| !s.is_empty() && s != "0"),
            verified_fault_type,
        });
    }

    // Warranty units first (as a group), then soonest deadline first within
    // each group; undated jobs sorted after, in their existing (recency)
    // order — `sort_by` is stable, so ties keep that order. `warranty_ids`
    // is only ever populated for the Open queue, so this is a no-op for
    // every other queue (all rows share `under_warranty = false`, so the
    // deadline sort alone determines order, exactly as before).
    //
    // Closed is the one exception — requested directly: "when I go into
    // Interventions soldées, it should show the latest jobs first."
    // "Soonest deadline" means nothing once a job is already closed, and
    // sorting by it before `.truncate(50)` below was silently showing
    // whichever 50 closed jobs happened to have the earliest/oldest
    // deadlines on file, not the ones actually closed most recently.
    // Sorts by `LigCde.DateDernInterv` descending instead — day-level
    // precision only (no time component on this field), but that's the
    // same field already trusted elsewhere in this file for "when did
    // this job last move."
    if queue == InterventionQueue::Closed {
        out.sort_by(|a, b| {
            match (delivery_sort_key(&a.date_dern_interv), delivery_sort_key(&b.date_dern_interv)) {
                (Some(x), Some(y)) => y.cmp(&x),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => std::cmp::Ordering::Equal,
            }
        });
    } else {
        out.sort_by(|a, b| {
            b.under_warranty.cmp(&a.under_warranty).then_with(|| {
                match (delivery_sort_key(&a.lim_livraison), delivery_sort_key(&b.lim_livraison)) {
                    (Some(x), Some(y)) => x.cmp(&y),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => std::cmp::Ordering::Equal,
                }
            })
        });
    }
    out.truncate(50);
    Ok(out)
}

#[tauri::command]
pub async fn reman_search_interventions(
    query: String,
    queue: String,
    tech_id: Option<String>,
    family: Option<String>,
    fault_type: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<InterventionSummary>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;

    // Dynamic per-combination cache key, not one of the fixed pre-seeded
    // rows — same bootstrap pattern as reman_closed_on_day's per-date
    // keys. `|`-separated rather than interpolated into a sentence — a
    // search string containing `|` could in principle collide with a
    // different combination's key, but the cost of that (one poll cycle
    // shows another view's data before self-correcting on the next
    // refresh) is negligible, so no escaping was worth adding here.
    let cache_key = format!(
        "search_interventions:{queue}|{}|{}|{}|{}|{}|{}",
        query.trim(),
        tech_id.as_deref().unwrap_or(""),
        family.as_deref().unwrap_or(""),
        fault_type.as_deref().unwrap_or(""),
        date_from.as_deref().unwrap_or(""),
        date_to.as_deref().unwrap_or(""),
    );
    pg.execute(
        r#"INSERT INTO "RemanLiveCache" (cache_key) VALUES ($1) ON CONFLICT DO NOTHING"#,
        &[&cache_key],
    )
    .await
    .map_err(|e| e.to_string())?;

    let json = cached_or_refresh(&pg, &cache_key, async {
        let result = reman_search_interventions_core(
            query, queue, tech_id, family, fault_type, date_from, date_to, &pg,
        )
        .await?;
        serde_json::to_string(&result).map_err(|e| e.to_string())
    })
    .await?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

/// A Boolean column's value for one specific row — never `SELECT`ed
/// directly (see `run_query`'s doc comment: the 4D ODBC driver's type
/// metadata for Boolean columns panics `odbc-api`'s `TextRowSet`), so this
/// filters on it instead of selecting it. **Not** `SELECT COUNT(*)` — tried
/// that first, and it panicked with the exact same "SQLLEN could not be
/// converted to a 16 Bit integer" error, live-confirmed via a step-by-step
/// trace (2026-08-03): the aggregate result column apparently hits the
/// same odbc-api metadata-overflow path as a Boolean column, a previously
/// undiscovered trigger since nothing in this file had used `COUNT(*)`
/// before. Selects the row's own PK instead (same non-aggregate shape as
/// the already-proven-safe `warranty_ids` lookup in
/// `reman_search_interventions`) and just checks the result isn't empty.
/// Equality combined with a Boolean column is otherwise confirmed safe
/// (the documented "Boolean combined with a second condition" dialect bug
/// is specifically about `IS NULL`/`IS NOT NULL`). Fine for an on-demand
/// single-row detail fetch (7 calls, one per flag); not meant for a hot
/// list path.
fn probe_boolean(conn: &Connection<'static>, id_num: i64, column: &str) -> Result<bool, String> {
    let sql = format!(r#"SELECT NoInt_Ligcde FROM LigCde WHERE NoInt_Ligcde = {id_num} AND "{column}" = True"#);
    Ok(!run_query(conn, &sql)?.is_empty())
}

fn parse_hms_to_seconds(s: &str) -> Option<i64> {
    let mut parts = s.split(':');
    let h: i64 = parts.next()?.parse().ok()?;
    let m: i64 = parts.next()?.parse().ok()?;
    let sec: i64 = parts.next()?.parse().ok()?;
    Some(h * 3600 + m * 60 + sec)
}

fn format_seconds_to_hms(total: i64) -> String {
    format!("{:02}:{:02}:{:02}", total / 3600, (total % 3600) / 60, total % 60)
}

// ---- Accessoires (2026-08-12) ----
//
// Requested directly: "check also accessoires field with support de
// fixation, this one hadd it so before closing you have to check that
// you put the mounting back onto the abs" (job 17490801). Not a field on
// `LigCde` — an earlier pass (2026-08-03) looked there and correctly
// found nothing. It's a separate table, `Accessoires`, one row per
// accessory attached to a job (`NoInt_ligCde` FK), with `CtrlPresence`
// (Boolean) — exactly "has this been physically confirmed present" —
// confirmed live against job 17490801 (`NoIntParam = 2200`,
// `CtrlPresence = True`, already checked for that job). Confirmed at
// scale this is a real, non-trivial gap: 4628 total `Accessoires` rows,
// 730 (13.6%) with `CtrlPresence = False`, including real jobs that were
// already closed (`Soldée = True`) with the check never confirmed.
//
// `NoIntParam`'s human-readable name isn't stored in any queryable 4D
// table — checked live against `Article`/`ArticleMeteor`/
// `Zebra_Accessoire` (itself empty) and found nothing; the accessory
// catalog appears to live only in 4D's own form/method layer, outside
// SQL's reach. `accessoire_label` is a manually-maintained map, filled in
// only as each id is confirmed directly rather than guessed — unmapped
// ids fall back to a generic "Accessoire #<id>" rather than a wrong name.
fn accessoire_label(no_int_param: &str) -> String {
    match no_int_param {
        "2200" => "Support de fixation".to_string(),
        other => format!("Accessoire #{other}"),
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AccessoireRecord {
    pub id: String,
    pub label: String,
    pub confirmed: bool,
}

fn accessoires_for(conn: &Connection<'static>, ligcde_id: i64) -> Result<Vec<AccessoireRecord>, String> {
    let rows = run_query(
        conn,
        &format!(r#"SELECT NoInt_access, NoIntParam FROM Accessoires WHERE NoInt_ligCde = {ligcde_id}"#),
    )?;
    let mut out = Vec::with_capacity(rows.len());
    for r in rows {
        let Some(id) = r[0].clone().filter(|s| !s.is_empty()) else { continue };
        let param = r[1].clone().unwrap_or_default();
        // Boolean columns can never be SELECTed directly — see run_query's
        // doc comment — so probed via WHERE-only, same pattern as
        // probe_boolean (which is hardcoded to LigCde, not reused here).
        let confirmed = !run_query(
            conn,
            &format!(r#"SELECT NoInt_access FROM Accessoires WHERE NoInt_access = {id} AND CtrlPresence = True"#),
        )?
        .is_empty();
        out.push(AccessoireRecord { label: accessoire_label(&param), id, confirmed });
    }
    Ok(out)
}

/// The synchronous core of `reman_get_intervention`, extracted so write
/// commands can reuse it on their own already-open connection (one
/// connection for the whole "write, then refresh" operation) instead of
/// opening a second one just to build the return value — see
/// `with_reman_connection`'s doc comment for why this matters.
fn get_intervention_sync(conn: &Connection<'static>, id_num: i64) -> Result<InterventionDetail, String> {
    let head = run_query(
        conn,
        &format!(
            r#"SELECT l.NoInt_Ligcde, l.NoIntervention, l.NomClient, l.CodeArt, l.LibelleArt,
                      l.DateLimiteLivraison, l.DateDernInterv, c."Immat_TypeVéhicule", c.NoInt_Client,
                      l.Famille, l.Segmentation, l.Type_Service, l.DelaiLigneCde, l.Observations,
                      l.CommentaireInterne, l.PrixHT, l.Remise, c.Ref_Client, c.MtHT_Lignes,
                      c.MtHT_Port, c.MtHT_Total, c.TotalTVA, c.TotalTTC, l.SuiviGar_AncNoInterv,
                      c.Representant
               FROM LigCde l
               LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
               WHERE l.NoInt_Ligcde = {id_num}"#
        ),
    )?
    .into_iter()
    .next()
    .ok_or_else(|| "Intervention not found".to_string())?;

    // Full step history, most recent first (steps[0] == the old
    // "latest"-only query this replaces) — confirmed live 2026-08-03
    // against a real 4D screenshot, see InterventionStep's doc comment.
    // The SQL's own `ORDER BY NoInt_interv DESC` is no longer trusted for
    // this — re-sorted below by actual chronological time instead (see
    // is_more_recent_step's doc comment for why: it stopped being reliable
    // the moment BRAXON_ID_RANGE_START gave BRAXON's own writes ids far
    // outside 4D's normal range).
    let step_rows = run_query(
        conn,
        &format!(
            r#"SELECT NoInt_interv, "Date", HeureInterv, NoIntTechn, TypeCode, TypeLibelle, Commentaire, TempsPasse
               FROM Intervention WHERE NoIntLigcde = {id_num}
               ORDER BY NoInt_interv DESC"#
        ),
    )?;
    let tech_names = technician_name_map(conn).unwrap_or_default();
    let mut temps_passe_total = 0i64;
    let mut steps: Vec<InterventionStep> = step_rows
        .into_iter()
        .map(|r| {
            if let Some(secs) = r[7].as_deref().and_then(parse_hms_to_seconds) {
                temps_passe_total += secs;
            }
            let tech_id = r[3].clone();
            let tech_name = tech_id.as_ref().and_then(|id| tech_names.get(id).cloned());
            InterventionStep {
                id: r[0].clone().unwrap_or_default(),
                date: r[1].clone(),
                heure: r[2].clone(),
                tech_id,
                tech_name,
                type_code: r[4].clone(),
                type_libelle: r[5].clone(),
                commentaire: r[6].clone(),
            }
        })
        .collect();
    steps.sort_by(|a, b| {
        if is_more_recent_step(&a.date, &a.heure, &a.id, &b.date, &b.heure, &b.id) {
            std::cmp::Ordering::Less
        } else if is_more_recent_step(&b.date, &b.heure, &b.id, &a.date, &a.heure, &a.id) {
            std::cmp::Ordering::Greater
        } else {
            std::cmp::Ordering::Equal
        }
    });

    let (client_tel, client_email, client_ville, client_cp, client_contact, address) =
        match head[8].clone().and_then(|s| s.parse::<i64>().ok()) {
            Some(client_id) => {
                let row = run_query(
                    conn,
                    &format!(r#"SELECT Tel, e_mail, Ville, CP, NomContact FROM Client WHERE NoIntClt = {client_id}"#),
                )?
                .into_iter()
                .next();
                // Just the primary/first address — the job form only
                // ever shows one, unlike reman_get_client's full list.
                let addr = run_query(
                    conn,
                    &format!(
                        r#"SELECT NoInt_adLivr, Adr1, Adr2, CP, Ville, NomContact
                           FROM Clt_adrLivr WHERE NoInt_clt = {client_id} LIMIT 1"#
                    ),
                )?
                .into_iter()
                .next()
                .map(|r| ClientAddress {
                    id: r[0].clone().unwrap_or_default(),
                    adr1: r[1].clone(),
                    adr2: r[2].clone(),
                    cp: r[3].clone(),
                    ville: r[4].clone(),
                    nom_contact: r[5].clone(),
                });
                (
                    row.as_ref().and_then(|r| r[0].clone()),
                    row.as_ref().and_then(|r| r[1].clone()),
                    row.as_ref().and_then(|r| r[2].clone()),
                    row.as_ref().and_then(|r| r[3].clone()),
                    row.as_ref().and_then(|r| r[4].clone()),
                    addr,
                )
            }
            None => (None, None, None, None, None, None),
        };

    // Marque — ArticleMeteor.Gamme, not Constructeur (empty on this
    // article); confirmed live 2026-08-03 the real screenshot's
    // "Marque: ATE" matches Gamme exactly, consistent with the earlier
    // finding (docs/reman-schema.md) that Gamme is the manufacturer/
    // supplier axis.
    let marque = {
        let code = escape_sql_literal(head[3].clone().unwrap_or_default().trim());
        if code.is_empty() {
            None
        } else {
            run_query(conn, &format!(r#"SELECT Gamme FROM ArticleMeteor WHERE CodeArt = '{code}'"#))?
                .into_iter()
                .next()
                .and_then(|r| r[0].clone())
        }
    };

    let outcome = JobOutcomeFlags {
        under_warranty: probe_boolean(conn, id_num, "Garantie")?,
        non_repairable: probe_boolean(conn, id_num, "ND")?,
        no_fault_found: probe_boolean(conn, id_num, "RAS")?,
        reparation: probe_boolean(conn, id_num, "Réparation")?,
        vente: probe_boolean(conn, id_num, "Vente")?,
        echange_standard: probe_boolean(conn, id_num, "EchgeS")?,
        avance: probe_boolean(conn, id_num, "AvanceES")?,
    };
    let soldee = probe_boolean(conn, id_num, "Soldée")?;

    let amounts = JobAmounts {
        prix_ht: head[15].clone(),
        remise: head[16].clone(),
        mt_lignes: head[18].clone(),
        mt_port: head[19].clone(),
        mt_ht_total: head[20].clone(),
        mt_tva: head[21].clone(),
        mt_ttc: head[22].clone(),
    };

    let lines = match steps.first().map(|s| s.id.clone()).filter(|id| !id.is_empty()) {
        Some(no_int_interv) => run_query(
            conn,
            &format!(
                r#"SELECT NoIntDetail, CodeArt, LibArt, PrixHT, PrixNet
                   FROM DetailInterv WHERE NoIntIntervAppel = {no_int_interv}"#
            ),
        )?
        .into_iter()
        .map(|r| InterventionLine {
            id: r[0].clone().unwrap_or_default(),
            code_art: r[1].clone(),
            lib_art: r[2].clone(),
            prix_ht: r[3].clone(),
            prix_net: r[4].clone(),
        })
        .collect(),
        None => Vec::new(),
    };

    let (vehicle_plate, vehicle_model) = split_vehicle(head[7].clone());
    let tests_actions_selected = selected_test_action_ids(conn, id_num)?;
    let abs_fault_hint = classify_abs_fault_hint(head[11].as_deref(), head[13].as_deref());
    let previous_job = match head[23].as_deref().map(str::trim) {
        Some(r) if !r.is_empty() && r != "0" => resolve_previous_job(conn, r)?,
        _ => None,
    };
    let accessoires = accessoires_for(conn, id_num)?;
    let representant_code = head[24].clone().filter(|s| !s.trim().is_empty());
    let representant_name = representant_code.as_deref().and_then(representant_name).map(str::to_string);

    Ok(InterventionDetail {
        id: head[0].clone().unwrap_or_default(),
        reference: head[1].clone(),
        client_id: head[8].clone(),
        client_name: head[2].clone(),
        client_ville,
        client_cp,
        client_contact,
        client_tel,
        client_email,
        address,
        ref_client: head[17].clone(),
        code_art: head[3].clone(),
        libelle_art: head[4].clone(),
        marque,
        famille: head[9].clone(),
        segmentation: head[10].clone(),
        service: head[11].clone(),
        delai_ligne: head[12].clone(),
        vehicle_plate,
        vehicle_model,
        lim_livraison: head[5].clone(),
        date_dern_interv: head[6].clone(),
        statut: steps.first().and_then(|s| s.type_libelle.clone()),
        commentaire: steps.first().and_then(|s| s.commentaire.clone()),
        commentaire_client: head[13].clone(),
        commentaire_interne: head[14].clone(),
        outcome,
        amounts,
        temps_passe: Some(format_seconds_to_hms(temps_passe_total)),
        steps,
        lines,
        soldee,
        tests_actions_selected,
        abs_fault_hint,
        previous_job,
        // Postgres data — merged in by the caller (get_intervention_sync
        // only has a 4D connection). See VerifiedFaultTypeRecord's doc
        // comment on why this can't be filled in here.
        verified_fault_type: None,
        accessoires,
        representant_code,
        representant_name,
    })
}

/// Reported directly: "REMAN write failed... but when i close the page,
/// the action is actually executed" — every write command does its write
/// and its post-write refresh on one connection (`with_reman_connection`,
/// opened once per call), so a connection that drops *between* those two
/// steps makes an already-successful write look like a total failure: the
/// refresh's `SQLExecDirect` fails with "Server rejected the connection",
/// and the whole command returns `Err`, even though the data change was
/// already committed. Couldn't reproduce it live (5/5 clean connection
/// attempts when checked), consistent with a transient hiccup rather than
/// a standing outage — but the failure mode itself is real and worth being
/// resilient to regardless of cause.
///
/// Every write command now calls the write and this refresh as two
/// *separate* `with_reman_connection` calls (each opens its own fresh
/// connection) instead of one shared one — the write's own connection
/// dying right after doesn't take the refresh down with it anymore. This
/// retries the refresh specifically (never the write itself — retrying a
/// write that actually succeeded could double it, e.g. a second
/// `Intervention` row) up to 3 times before giving up, with a short
/// backoff between attempts since a connection-level rejection is more
/// likely to clear given a moment than to clear instantly.
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

#[tauri::command]
pub async fn reman_get_intervention(id: String, state: State<'_, AppState>) -> Result<InterventionDetail, String> {
    let id_num = parse_id(&id, "intervention")?;
    let detail = async_runtime::spawn_blocking(move || with_reman_connection(|conn| get_intervention_sync(conn, id_num)))
        .await
        .map_err(|e| e.to_string())??;
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    with_verified_fault_type(&pg, detail).await
}

// ---- Writes: add an "Etape de réparation" step (2026-08-03) ----
//
// The first write path into REMAN's 4D — everything below is grounded in a
// live investigation (see docs/reman-schema.md), not guessed: manual adds
// through the real 4D client (cross-checked with before/after snapshots)
// plus two raw-SQL tests run directly against 4D to see what the database
// itself enforces versus what's purely 4D client-side business logic.
// Confirmed:
// - Adding a step through 4D creates one Intervention row and mirrors it
//   onto LigCde.DernièreInterv/DateDernInterv/TechDernInterv, plus bumps
//   heureModif. For a NET -> ER transition, LigCde.Nettoyage also flipped
//   true -> false; a second ER -> ER add left it false -> false — both
//   consistent with "adding an ER step always sets Nettoyage = False",
//   which is what this applies unconditionally.
// - NoInt_interv (the Intervention PK) is NOT database-auto-assigned — a
//   raw INSERT omitting it defaulted to 0, not a real value. Manual adds
//   through the client proved it's a single global counter shared across
//   every job and every technician (an ER add on a different job, as a
//   different technician, continued the exact same sequence). Real gaps
//   happen (other live 4D activity can consume an id) — this is a live,
//   contested, multi-writer counter, never assume it's ours alone.
// - NoInt_interv genuinely has an enforced uniqueness constraint at the
//   database level — confirmed live via a direct duplicate-id test: a
//   second INSERT reusing an id already used by an unrelated row failed
//   outright, no silent overwrite, no duplicate. This is what makes
//   "read max, write max+1, retry on conflict" safe: a collision produces
//   a catchable error, never silent corruption.
// - None of the LigCde side effects happen automatically via SQL — a raw
//   INSERT left LigCde completely untouched. Everything under "keep
//   consistent" below is us replicating that by hand, in a second
//   statement, because 4D's engine won't do it for us.

const MAX_ID_RETRY_ATTEMPTS: u32 = 5;

/// A completely separate id range for every `NoInt_interv` BRAXON ever
/// writes, chosen far above anything 4D's own client will ever naturally
/// reach (it was at ~101,420 as of 2026-08-03; even at a wildly generous
/// 1000 real interventions/day this shop would take millennia to reach
/// this). Confirmed live 2026-08-03: reading "current max across the whole
/// table, then +1" is not safe on its own — 4D's client reserves an id
/// *before* the technician actually finishes and saves (a slow, human-paced
/// window), so a BRAXON write committing in that window can "steal" the id
/// 4D had already earmarked, and 4D has no retry — it just fails the real
/// technician's save with a hard "clé d'index existe déjà" error. Uniqueness
/// being enforced (see the earlier duplicate-id test) meant this never
/// corrupted data, but it did block real work — reported directly, a
/// technician couldn't transfer a job to Service Commercial because of it.
/// Operating in a disjoint range makes this whole class of collision
/// structurally impossible rather than just less likely, regardless of
/// timing — BRAXON and 4D's own client are never competing for the same
/// next number at all.
const BRAXON_ID_RANGE_START: i64 = 900_000_000;

/// Safe "current max id within BRAXON's own range" lookup — deliberately
/// not `MAX(NoInt_interv)`. `COUNT(*)` was proven live to panic exactly
/// like a Boolean column (see `run_query`'s doc comment); `MAX()` is an
/// aggregate too and untrusted until proven otherwise, so this uses the
/// same `ORDER BY ... DESC LIMIT 1` shape already proven safe throughout
/// this file for "latest row" lookups.
fn next_intervention_id(conn: &Connection<'static>) -> Result<i64, String> {
    let rows = run_query(
        conn,
        &format!("SELECT NoInt_interv FROM Intervention WHERE NoInt_interv >= {BRAXON_ID_RANGE_START} ORDER BY NoInt_interv DESC LIMIT 1"),
    )?;
    let current_max = rows
        .into_iter()
        .next()
        .and_then(|r| r[0].clone())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(BRAXON_ID_RANGE_START - 1);
    Ok(current_max + 1)
}

/// A completely separate id range for `Zebra_LigCdeTest.NoInt_LigCdeTest`
/// — same reasoning and same disjoint-range fix as `BRAXON_ID_RANGE_START`
/// above, applied to a different table's own PK (no collision risk reusing
/// the same numeric value across tables — each 4D table has its own id
/// space). A bare INSERT omitting the PK defaults to 0, not auto-assigned
/// (confirmed for `Intervention`; not independently re-confirmed for this
/// table specifically, but there's no reason to expect it behaves
/// differently, and getting this wrong risks the exact same class of
/// incident already lived through once for `Intervention.NoInt_interv`).
const ZEBRA_TEST_ID_RANGE_START: i64 = 900_000_000;

fn next_zebra_test_id(conn: &Connection<'static>) -> Result<i64, String> {
    let rows = run_query(
        conn,
        &format!("SELECT NoInt_LigCdeTest FROM Zebra_LigCdeTest WHERE NoInt_LigCdeTest >= {ZEBRA_TEST_ID_RANGE_START} ORDER BY NoInt_LigCdeTest DESC LIMIT 1"),
    )?;
    let current_max = rows
        .into_iter()
        .next()
        .and_then(|r| r[0].clone())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(ZEBRA_TEST_ID_RANGE_START - 1);
    Ok(current_max + 1)
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TestActionSelection {
    pub no_int_param_test: i64,
    pub label: String,
}

/// Writes one `Zebra_LigCdeTest` row per selection — the "Tests & Actions
/// Systématiques" checklist REMAN's native 4D client requires before
/// closing certain jobs. Confirmed live 2026-08-05 against job 17479901;
/// see `src/lib/testsActionsSystematiques.ts` for the reference list and
/// how its ids were verified — there is no backing SQL table for the list
/// itself (it's a 4D UI resource, not queryable data), only this per-job
/// junction table.
fn write_tests_actions(conn: &Connection<'static>, ligcde_id: i64, selections: &[TestActionSelection]) -> Result<(), String> {
    // Selections can now be made progressively across ER/ATN/close steps on
    // the same job (requested directly — no reason to force a technician to
    // wait until closing to log what they've already checked), so the same
    // item can arrive here more than once across separate calls. Skip
    // whatever's already recorded rather than insert a duplicate row —
    // the frontend already filters to "newly checked since last load," but
    // this is the real boundary and shouldn't trust that alone.
    let already: std::collections::HashSet<i64> = run_query(
        conn,
        &format!("SELECT NoInt_ParamTest FROM Zebra_LigCdeTest WHERE NoInt_LigCde = {ligcde_id}"),
    )?
    .into_iter()
    .filter_map(|r| r[0].clone())
    .filter_map(|s| s.parse::<i64>().ok())
    .collect();

    for sel in selections {
        if already.contains(&sel.no_int_param_test) {
            continue;
        }
        let label = escape_sql_literal(&sel.label);
        let mut inserted = false;
        for _ in 0..MAX_ID_RETRY_ATTEMPTS {
            let candidate_id = next_zebra_test_id(conn)?;
            let insert_sql = format!(
                r#"INSERT INTO Zebra_LigCdeTest (NoInt_LigCdeTest, NoInt_LigCde, NoInt_ParamTest, LibParamTest)
                   VALUES ({candidate_id}, {ligcde_id}, {}, '{label}')"#,
                sel.no_int_param_test
            );
            if run_write(conn, &insert_sql).is_ok() {
                inserted = true;
                break;
            }
        }
        if !inserted {
            return Err(format!("Could not allocate a free id for test/action \"{}\"", sel.label));
        }
    }
    Ok(())
}

/// Every `NoInt_ParamTest` already recorded against this job, across every
/// step so far — used to seed the checklist UI so previously-checked items
/// show as already selected instead of resetting on every new step.
fn selected_test_action_ids(conn: &Connection<'static>, ligcde_id: i64) -> Result<Vec<i64>, String> {
    Ok(run_query(
        conn,
        &format!("SELECT NoInt_ParamTest FROM Zebra_LigCdeTest WHERE NoInt_LigCde = {ligcde_id}"),
    )?
    .into_iter()
    .filter_map(|r| r[0].clone())
    .filter_map(|s| s.parse::<i64>().ok())
    .collect())
}

/// Inserts one "Etape de réparation" `Intervention` row for `ligcde_id`,
/// attributed to `tech_id`, then replicates the `LigCde` side effects 4D's
/// own client would have applied (see the section doc comment above).
/// Retries id allocation on conflict — safe because a collision is
/// confirmed to error, not corrupt (see above).
fn add_repair_step(
    conn: &Connection<'static>,
    ligcde_id: i64,
    tech_id: i64,
    comment: &str,
    tests_actions: &[TestActionSelection],
) -> Result<(), String> {
    if job_is_closed(conn, ligcde_id)? {
        return Err(JOB_ALREADY_CLOSED_ERROR.to_string());
    }
    let comment = escape_sql_literal(comment.trim());
    let today = Local::now().format("%Y-%m-%d").to_string();
    let now_time = Local::now().format("%H:%M:%S").to_string();

    if !tests_actions.is_empty() {
        write_tests_actions(conn, ligcde_id, tests_actions)?;
    }

    for _ in 0..MAX_ID_RETRY_ATTEMPTS {
        let candidate_id = next_intervention_id(conn)?;
        let insert_sql = format!(
            r#"INSERT INTO Intervention (NoInt_interv, NoIntLigcde, NoIntTechn, "Date", TypeCode, TypeLibelle, Commentaire, HeureInterv)
               VALUES ({candidate_id}, {ligcde_id}, {tech_id}, '{today}', 'ER', 'Etape de réparation', '{comment}', '{now_time}')"#
        );
        if run_write(conn, &insert_sql).is_ok() {
            let update_sql = format!(
                r#"UPDATE LigCde SET "DernièreInterv" = 'Etape de réparation', DateDernInterv = '{today}',
                     TechDernInterv = {tech_id}, Nettoyage = False, heureModif = '{now_time}'
                   WHERE NoInt_Ligcde = {ligcde_id}"#
            );
            return run_write(conn, &update_sql);
        }
        // Insert failed — most likely a NoInt_interv collision with
        // concurrent live 4D activity. Loop and re-read a fresh max. A
        // non-collision failure also retries up to the cap, then surfaces
        // as a normal error either way.
    }
    Err("Could not allocate a free intervention id after several attempts".to_string())
}

#[tauri::command]
pub async fn reman_add_repair_step(
    ligcde_id: String,
    tech_id: String,
    comment: String,
    tests_actions: Vec<TestActionSelection>,
    state: State<'_, AppState>,
) -> Result<InterventionDetail, String> {
    let ligcde_id_num = parse_id(&ligcde_id, "job")?;
    let tech_id_num = tech_id.trim().parse::<i64>().map_err(|_| "Invalid technician id".to_string())?;
    async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| add_repair_step(conn, ligcde_id_num, tech_id_num, &comment, &tests_actions))
    })
    .await
    .map_err(|e| e.to_string())??;
    let detail = refresh_intervention_with_retry(ligcde_id_num).await?;
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    with_verified_fault_type(&pg, detail).await
}

// ---- Writes: mark a job "Attente Nettoyage" (2026-08-04) ----
//
// Same shape as add_repair_step (no mandatory extra fields, just an
// optional comment) — requested directly after live-tracking a real job
// (17478501) through this exact transition via the native 4D client to
// confirm the LigCde side effects: DernièreInterv/DateDernInterv/
// TechDernInterv update to mirror the new step, NomDernierTech stays
// untouched (confirmed again — only a job's *closing* step sets that,
// same finding as ER).
//
// `Nettoyage = False` here is inferred, not directly observed via a live
// ATN transition — searched 300 recent ATN steps for a job that had
// already been through NET (cleaned) and then got a fresh ATN as its
// latest step, to see whether Nettoyage got reset; found zero such cases,
// so that specific reversal doesn't seem to happen in real workflow usage.
// Set to False anyway on the strength of two things that *are* confirmed:
// ER (an earlier, less specific "not cleaned yet" step) is confirmed to
// force it False, and the field's own stated purpose (tracking whether
// cleaning is actually done, so direction can catch technicians skipping
// it) — leaving a stale `True` on a job now explicitly awaiting cleaning
// would work against exactly that. Revisit if a real NET->ATN case is
// ever observed to behave differently.
fn add_awaiting_cleaning_step(
    conn: &Connection<'static>,
    ligcde_id: i64,
    tech_id: i64,
    comment: &str,
    tests_actions: &[TestActionSelection],
) -> Result<(), String> {
    if job_is_closed(conn, ligcde_id)? {
        return Err(JOB_ALREADY_CLOSED_ERROR.to_string());
    }
    let comment = escape_sql_literal(comment.trim());
    let today = Local::now().format("%Y-%m-%d").to_string();
    let now_time = Local::now().format("%H:%M:%S").to_string();

    if !tests_actions.is_empty() {
        write_tests_actions(conn, ligcde_id, tests_actions)?;
    }

    for _ in 0..MAX_ID_RETRY_ATTEMPTS {
        let candidate_id = next_intervention_id(conn)?;
        let insert_sql = format!(
            r#"INSERT INTO Intervention (NoInt_interv, NoIntLigcde, NoIntTechn, "Date", TypeCode, TypeLibelle, Commentaire, HeureInterv)
               VALUES ({candidate_id}, {ligcde_id}, {tech_id}, '{today}', 'ATN', 'Attente Nettoyage', '{comment}', '{now_time}')"#
        );
        if run_write(conn, &insert_sql).is_ok() {
            let update_sql = format!(
                r#"UPDATE LigCde SET "DernièreInterv" = 'Attente Nettoyage', DateDernInterv = '{today}',
                     TechDernInterv = {tech_id}, Nettoyage = False, heureModif = '{now_time}'
                   WHERE NoInt_Ligcde = {ligcde_id}"#
            );
            return run_write(conn, &update_sql);
        }
        // Same collision-retry reasoning as add_repair_step.
    }
    Err("Could not allocate a free intervention id after several attempts".to_string())
}

#[tauri::command]
pub async fn reman_mark_awaiting_cleaning(
    ligcde_id: String,
    tech_id: String,
    comment: String,
    tests_actions: Vec<TestActionSelection>,
    state: State<'_, AppState>,
) -> Result<InterventionDetail, String> {
    let ligcde_id_num = parse_id(&ligcde_id, "job")?;
    let tech_id_num = tech_id.trim().parse::<i64>().map_err(|_| "Invalid technician id".to_string())?;
    async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| add_awaiting_cleaning_step(conn, ligcde_id_num, tech_id_num, &comment, &tests_actions))
    })
    .await
    .map_err(|e| e.to_string())??;
    let detail = refresh_intervention_with_retry(ligcde_id_num).await?;
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;

    // Notify whoever's on cleaning duty — see "Notifications: hand-off
    // events" doc comment above create_notifications_for.
    let cleaning_recipients = cleaning_tech_ids(&pg).await?;
    if !cleaning_recipients.is_empty() {
        let message = format!(
            "Job {} is ready for cleaning",
            detail.reference.as_deref().unwrap_or(ligcde_id.as_str())
        );
        create_notifications_for(&pg, &cleaning_recipients, "awaiting_cleaning", &ligcde_id, detail.reference.as_deref(), &message).await?;
    }

    with_verified_fault_type(&pg, detail).await
}

// ---- Writes: mark a job "Pièce Nettoyée" (2026-08-11) ----
//
// Same live-tracking discipline as every other write path: watched a real
// job (17489601, ligcde 39665, already sitting at ATN from an earlier
// step) go ATN -> NET through the native 4D client, snapshot before/after,
// diffed. The technician who did the cleaning was Archimed Saïd (id
// 3389, the logistics/cleaning person already excluded from every
// technician leaderboard elsewhere in this file — confirmed directly:
// "it's archimed said who cleaned it").
//
// Confirmed via the diff:
//   - `TypeCode = 'NET'`, `TypeLibelle = 'Pièce Nettoyée'`.
//   - `DernièreInterv` updates to mirror the new step, same as every
//     other write in this file.
//   - `Nettoyage` is **not** touched — stayed `False` across the diff
//     (consistent with the existing inference in `add_awaiting_cleaning_
//     step`'s doc comment: this field tracks "has cleaning actually
//     happened," and native 4D apparently doesn't flip it just because a
//     NET step got logged — only a job's *closing* step was ever
//     confirmed to move it, and only in the repaired direction).
//   - **`TechDernInterv` is not touched** — genuinely different from
//     every other write path confirmed so far (ER/ATN/VAL/TES/R all
//     unconditionally set it to the step's own technician). Stayed `3569`
//     (the technician who'd done the ER/ATN steps earlier) even though
//     the NET step itself is logged under `3389`. Reads as consistent
//     with the rest of this file's treatment of Archimed/cleaning work as
//     not "technical" credit — `NomDernierTech` already only updates on a
//     closing step, and this is a second, distinct field behaving the
//     same way for the same underlying reason. Implemented by simply
//     never writing `TechDernInterv` here, not by writing it back to its
//     old value — the two are equivalent for `LigCde`'s state but only
//     one matches what native 4D itself actually does.
fn add_piece_cleaned_step(
    conn: &Connection<'static>,
    ligcde_id: i64,
    tech_id: i64,
    comment: &str,
    tests_actions: &[TestActionSelection],
) -> Result<(), String> {
    if job_is_closed(conn, ligcde_id)? {
        return Err(JOB_ALREADY_CLOSED_ERROR.to_string());
    }
    let comment = escape_sql_literal(comment.trim());
    let today = Local::now().format("%Y-%m-%d").to_string();
    let now_time = Local::now().format("%H:%M:%S").to_string();

    if !tests_actions.is_empty() {
        write_tests_actions(conn, ligcde_id, tests_actions)?;
    }

    for _ in 0..MAX_ID_RETRY_ATTEMPTS {
        let candidate_id = next_intervention_id(conn)?;
        let insert_sql = format!(
            r#"INSERT INTO Intervention (NoInt_interv, NoIntLigcde, NoIntTechn, "Date", TypeCode, TypeLibelle, Commentaire, HeureInterv)
               VALUES ({candidate_id}, {ligcde_id}, {tech_id}, '{today}', 'NET', 'Pièce Nettoyée', '{comment}', '{now_time}')"#
        );
        if run_write(conn, &insert_sql).is_ok() {
            let update_sql = format!(
                r#"UPDATE LigCde SET "DernièreInterv" = 'Pièce Nettoyée', DateDernInterv = '{today}', heureModif = '{now_time}'
                   WHERE NoInt_Ligcde = {ligcde_id}"#
            );
            return run_write(conn, &update_sql);
        }
        // Same collision-retry reasoning as add_repair_step.
    }
    Err("Could not allocate a free intervention id after several attempts".to_string())
}

#[tauri::command]
pub async fn reman_mark_piece_cleaned(
    ligcde_id: String,
    tech_id: String,
    comment: String,
    tests_actions: Vec<TestActionSelection>,
    state: State<'_, AppState>,
) -> Result<InterventionDetail, String> {
    let ligcde_id_num = parse_id(&ligcde_id, "job")?;
    let tech_id_num = tech_id.trim().parse::<i64>().map_err(|_| "Invalid technician id".to_string())?;
    async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| add_piece_cleaned_step(conn, ligcde_id_num, tech_id_num, &comment, &tests_actions))
    })
    .await
    .map_err(|e| e.to_string())??;
    let detail = refresh_intervention_with_retry(ligcde_id_num).await?;
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;

    // Notify whoever originally flagged this job for cleaning — reported
    // directly as the missing half of the loop: "when a unit is put to
    // pièce nettoyée, i should receive the notification, which didn't
    // happen." Unlike awaiting_cleaning/transferred_commercial, this isn't
    // a roster-role broadcast (there's no fixed "who cares about cleaned
    // parts" group) — the one real recipient is *the specific technician*
    // who put this specific job into ATN. That's recoverable without a
    // new column: add_piece_cleaned_step never touches TechDernInterv
    // (confirmed live, see its doc comment above), so the ATN step's own
    // NoIntTechn is still sitting right there in the just-refreshed step
    // history. `detail.steps` is sorted most-recent-first, so the first
    // ATN entry found walking from the top is the most recent one
    // regardless of how many earlier ATN/NET cycles this job has been
    // through. No ATN step at all (cleaned without ever being flagged,
    // an edge case) just means nobody to notify — skip silently.
    if let Some(recipient) = detail.steps.iter()
        .find(|s| s.type_code.as_deref() == Some("ATN"))
        .and_then(|s| s.tech_id.clone())
    {
        let recipients = std::collections::HashSet::from([recipient]);
        let message = format!(
            "Job {} was cleaned and is ready",
            detail.reference.as_deref().unwrap_or(ligcde_id.as_str())
        );
        create_notifications_for(&pg, &recipients, "piece_cleaned", &ligcde_id, detail.reference.as_deref(), &message).await?;
    }

    with_verified_fault_type(&pg, detail).await
}

// ---- Writes: mark a job "En attente de validation" (2026-08-06) ----
//
// Same live-tracking discipline as ER/ATN: watched a real job (17482801)
// go from ER straight to VAL through the native 4D client, snapshot
// before/after, diffed. Confirmed:
//   - `TypeCode = 'VAL'`, `TypeLibelle = 'En attente de validation'`.
//   - `Type_Service` is left **untouched** — unlike TES (transfer to
//     Commercial), VAL doesn't move the job to a different desk, it's a
//     sub-status of the same bench work.
//   - `Nettoyage` is **not** touched — unlike ER/ATN, which both force it
//     `False`. Confirmed via a clean before/after boolean diff: the only
//     change was `ND`, which the technician set manually and independently
//     (available on a standard ER step in 4D, not something VAL itself
//     sets — see the doc comment above `add_repair_step` for a case for
//     eventually exposing that choice here too).
//   - `NomDernierTech` stays untouched, same as every other non-closing
//     step (ER/ATN) — only a job's *closing* step sets that.
//   - No mandatory extra fields (no CausePanne/NiveauPanne — those are
//     specific to closing as repaired, and per the workflow owner, also
//     to TES/Commercial transfer, neither of which is this).
fn add_validation_step(
    conn: &Connection<'static>,
    ligcde_id: i64,
    tech_id: i64,
    comment: &str,
    tests_actions: &[TestActionSelection],
) -> Result<(), String> {
    if job_is_closed(conn, ligcde_id)? {
        return Err(JOB_ALREADY_CLOSED_ERROR.to_string());
    }
    let comment = escape_sql_literal(comment.trim());
    let today = Local::now().format("%Y-%m-%d").to_string();
    let now_time = Local::now().format("%H:%M:%S").to_string();

    if !tests_actions.is_empty() {
        write_tests_actions(conn, ligcde_id, tests_actions)?;
    }

    for _ in 0..MAX_ID_RETRY_ATTEMPTS {
        let candidate_id = next_intervention_id(conn)?;
        let insert_sql = format!(
            r#"INSERT INTO Intervention (NoInt_interv, NoIntLigcde, NoIntTechn, "Date", TypeCode, TypeLibelle, Commentaire, HeureInterv)
               VALUES ({candidate_id}, {ligcde_id}, {tech_id}, '{today}', 'VAL', 'En attente de validation', '{comment}', '{now_time}')"#
        );
        if run_write(conn, &insert_sql).is_ok() {
            let update_sql = format!(
                r#"UPDATE LigCde SET "DernièreInterv" = 'En attente de validation', DateDernInterv = '{today}',
                     TechDernInterv = {tech_id}, heureModif = '{now_time}'
                   WHERE NoInt_Ligcde = {ligcde_id}"#
            );
            return run_write(conn, &update_sql);
        }
        // Same collision-retry reasoning as add_repair_step.
    }
    Err("Could not allocate a free intervention id after several attempts".to_string())
}

#[tauri::command]
pub async fn reman_add_validation_step(
    ligcde_id: String,
    tech_id: String,
    comment: String,
    tests_actions: Vec<TestActionSelection>,
    state: State<'_, AppState>,
) -> Result<InterventionDetail, String> {
    let ligcde_id_num = parse_id(&ligcde_id, "job")?;
    let tech_id_num = tech_id.trim().parse::<i64>().map_err(|_| "Invalid technician id".to_string())?;
    async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| add_validation_step(conn, ligcde_id_num, tech_id_num, &comment, &tests_actions))
    })
    .await
    .map_err(|e| e.to_string())??;
    let detail = refresh_intervention_with_retry(ligcde_id_num).await?;
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    with_verified_fault_type(&pg, detail).await
}

// ---- Writes: close a job as "Réparation" (2026-08-03) ----
//
// The second write path, following the same live-investigation discipline
// as add_repair_step above: this time by watching the user close a real
// job (17473101) via the 4D client, before/after diffing it, then
// confirming the two mandatory fields (Cause panne, Niveau panne) directly.
// A bigger, harder-to-reverse action than adding a step — it flips
// Soldée = True for good and computes a real warranty date — so scope is
// again deliberately narrow: only TypeCode = 'R' ("Réparation"), not the
// other closing outcomes (Vente, Echange Standard, ND, RAS, ...), which
// almost certainly have their own side effects. Confirmed live that
// outcomes aren't interchangeable: closing as Réparation flips
// LigCde.Nettoyage to True, the *opposite* direction from add_repair_step's
// confirmed False — reproduce only the direction confirmed for each
// specific transition, never assume it generalizes.
//
// LigCde side effects beyond the ones add_repair_step already replicates:
// - NomDernierTech is set to the technician's real *name* (confirmed live
//   this only updates on the step that closes a job, not on every step —
//   resolves the id-3389/"Archimed Said" resolution gap documented
//   earlier in this file). Every other write in this file only ever
//   needed a technician *id*; this is the first that needs the name too.
// - CausePanne (1-5, confirmed positional against a real produced value —
//   1=Usure normale, 2=Casse, 3=Surtension, 4=Chute de liquide,
//   5=Oxydation anormale; 0 is "unset", never write it; a 6th historical
//   value exists but isn't reachable from the normal technician dropdown)
//   and NiveauPanne (1-3, "how difficult the fault was" — an arbitrary
//   technician judgment call, not a further enum) are both confirmed
//   mandatory in the real 4D form.
// - SemaineGarantie: a warranty-expiry code, confirmed live against a real
//   "Fin de Garantie: 2028/31" screenshot alongside a 2-year warranty
//   policy confirmed directly by the user. Today's ISO week with the year
//   advanced by 2 — not date-arithmetic (adding 730 days then re-deriving
//   the ISO week), which can drift a week at ISO year boundaries.
// - DerInterv_technique/DateDerInterv_technique/HeureDerInterv_technique —
//   a second "last technical intervention" mirror, only populated on
//   close (was empty/null before in the live diff). ServiceTechnique
//   mirrors the job's Type_Service, read fresh, not assumed.

fn close_job_as_repaired(
    conn: &Connection<'static>,
    ligcde_id: i64,
    tech_id: i64,
    tech_name: &str,
    cause_panne: i64,
    niveau_panne: i64,
    comment: &str,
    tests_actions: &[TestActionSelection],
) -> Result<(), String> {
    if job_is_closed(conn, ligcde_id)? {
        return Err(JOB_ALREADY_CLOSED_ERROR.to_string());
    }
    let comment = escape_sql_literal(comment.trim());
    let tech_name = escape_sql_literal(tech_name.trim());
    let today = Local::now().format("%Y-%m-%d").to_string();
    let now_time = Local::now().format("%H:%M:%S").to_string();
    let iso = Local::now().date_naive().iso_week();
    let warranty_code = (iso.year() + 2) * 100 + iso.week() as i32;

    let type_service = run_query(conn, &format!("SELECT Type_Service FROM LigCde WHERE NoInt_Ligcde = {ligcde_id}"))?
        .into_iter()
        .next()
        .and_then(|r| r[0].clone())
        .unwrap_or_default();

    // Tests & Actions Systématiques is confirmed mandatory in the native
    // 4D client before closing — but its reference list only has real,
    // live-verified `NoInt_ParamTest` ids for Type_Service 101 (ABS/
    // Direction Assistée/Transmission) and 102 (Compteur/Multimedia) so
    // far (see src/lib/testsActionsSystematiques.ts). Enforced here too,
    // not just in the frontend, since a client-side check alone isn't a
    // real boundary — but only for the services this can currently be
    // enforced correctly for. 103 is deliberately excluded, not just
    // unverified: every open 103 job checked live in the native 4D
    // client returned "Cet article n'est pas paramétré pour les tests" —
    // 4D itself doesn't gate closing on this checklist for those jobs, so
    // BRAXON matches that by not enforcing it either. 100 stays
    // unenforced because it's genuinely unverified (no open 100 job
    // checked live yet).
    //
    // Checked against everything recorded on the job so far, not just
    // what's newly submitted with this close call — selections can now be
    // made progressively on earlier ER/ATN steps, and a job that already
    // has items checked from an earlier step shouldn't be blocked just
    // because this particular submission has nothing new to add.
    if type_service == "101" || type_service == "102" {
        let already_selected = selected_test_action_ids(conn, ligcde_id)?;
        if already_selected.is_empty() && tests_actions.is_empty() {
            return Err("Tests & Actions Systématiques is required before closing this job".to_string());
        }
    }

    // Accessories (e.g. "Support de fixation") must have their physical
    // presence confirmed before closing — requested directly after a real
    // gap was found and measured (13.6% of all Accessoires rows across
    // this shop's history have CtrlPresence = False, including jobs that
    // were already closed with it never confirmed). See accessoires_for's
    // doc comment. A job with no accessories attached has nothing to
    // block on here.
    if accessoires_for(conn, ligcde_id)?.iter().any(|a| !a.confirmed) {
        return Err("All accessories must be confirmed present before closing this job".to_string());
    }

    let type_service = escape_sql_literal(&type_service);

    if !tests_actions.is_empty() {
        write_tests_actions(conn, ligcde_id, tests_actions)?;
    }

    for _ in 0..MAX_ID_RETRY_ATTEMPTS {
        let candidate_id = next_intervention_id(conn)?;
        let insert_sql = format!(
            r#"INSERT INTO Intervention (NoInt_interv, NoIntLigcde, NoIntTechn, "Date", TypeCode, TypeLibelle, Commentaire, HeureInterv, NiveauPanne)
               VALUES ({candidate_id}, {ligcde_id}, {tech_id}, '{today}', 'R', 'Réparation', '{comment}', '{now_time}', {niveau_panne})"#
        );
        if run_write(conn, &insert_sql).is_ok() {
            let update_sql = format!(
                r#"UPDATE LigCde SET "Soldée" = True, "DernièreInterv" = 'Réparation', DateDernInterv = '{today}',
                     TechDernInterv = {tech_id}, NomDernierTech = '{tech_name}', Nettoyage = True,
                     CausePanne = {cause_panne}, SemaineGarantie = {warranty_code}, "HeureLigSoldée" = '{now_time}',
                     DerInterv_technique = 'Réparation', DateDerInterv_technique = '{today}', HeureDerInterv_technique = '{now_time}',
                     ServiceTechnique = '{type_service}', heureModif = '{now_time}'
                   WHERE NoInt_Ligcde = {ligcde_id}"#
            );
            return run_write(conn, &update_sql);
        }
        // Same collision-retry reasoning as add_repair_step.
    }
    Err("Could not allocate a free intervention id after several attempts".to_string())
}

#[tauri::command]
pub async fn reman_close_job_as_repaired(
    ligcde_id: String,
    tech_id: String,
    tech_name: String,
    cause_panne: i64,
    niveau_panne: i64,
    comment: String,
    tests_actions: Vec<TestActionSelection>,
    state: State<'_, AppState>,
) -> Result<InterventionDetail, String> {
    if !(1..=5).contains(&cause_panne) {
        return Err("Invalid cause panne".to_string());
    }
    if !(1..=3).contains(&niveau_panne) {
        return Err("Invalid niveau panne".to_string());
    }
    let ligcde_id_num = parse_id(&ligcde_id, "job")?;
    let tech_id_num = tech_id.trim().parse::<i64>().map_err(|_| "Invalid technician id".to_string())?;
    async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| {
            close_job_as_repaired(conn, ligcde_id_num, tech_id_num, &tech_name, cause_panne, niveau_panne, &comment, &tests_actions)
        })
    })
    .await
    .map_err(|e| e.to_string())??;
    let detail = refresh_intervention_with_retry(ligcde_id_num).await?;
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    with_verified_fault_type(&pg, detail).await
}

// ---- Writes: confirm an accessory's presence (2026-08-12) ----
//
// Companion to `accessoires_for`/the close-gate above — a technician
// needs a way to actually check the box from BRAXON, not just see it,
// since closing is now blocked on it. Unlike every other write path in
// this file, this doesn't need a native-4D before/after diff first: it's
// a single plain Boolean column with no other side effects to reverse-
// engineer (no `Intervention` audit row, no cascading `LigCde` fields),
// so a live write/read/restore round trip is enough verification.
#[tauri::command]
pub async fn reman_confirm_accessoire(
    ligcde_id: String,
    accessoire_id: String,
    state: State<'_, AppState>,
) -> Result<InterventionDetail, String> {
    let ligcde_id_num = parse_id(&ligcde_id, "job")?;
    let accessoire_id_num = parse_id(&accessoire_id, "accessoire")?;
    async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| {
            run_write(
                conn,
                &format!(r#"UPDATE Accessoires SET CtrlPresence = True WHERE NoInt_access = {accessoire_id_num}"#),
            )
        })
    })
    .await
    .map_err(|e| e.to_string())??;
    let detail = refresh_intervention_with_retry(ligcde_id_num).await?;
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    with_verified_fault_type(&pg, detail).await
}

// ---- Writes: transfer to Service Commercial (TES) (2026-08-07) ----
//
// Fifth write path, same live-tracking discipline as the other four:
// watched a real job (17475301, ligcde 39522) go from the ABS bench
// straight to Commercial through the native 4D client, snapshot
// before/after, diffed (`scripts/_scratch-snapshot-17475301-{before,after}.mjs`).
// Confirmed:
//   - `TypeCode = 'TES'`, `TypeLibelle = 'Transfert Service commercial'`.
//   - `Type_Service` moves to `'305'` — this is what actually relocates the
//     job into `InterventionQueue::Commercial`, not a TypeCode filter; a
//     job left here forever would just look like a stalled Commercial job,
//     same as any other.
//   - `CausePanne` (1-5, same enum as closing-as-repaired) and
//     `NiveauPanne` (1-3, stored on the `Intervention` row like closing
//     too) are both set and confirmed mandatory directly by the workflow
//     owner ahead of time — "the one that's mandatory is cause de panne
//     et niveau de panne, just like when we close a job for repair
//     reasons" — and the real diff shows both actually written (CausePanne
//     0 -> 1) even though the technician also chose NFF that time, so
//     they're required unconditionally, not just on the ND path.
//   - `RAS` (No Fault Found) is optionally settable — confirmed by the
//     real diff (`false -> true`, the technician's actual choice on the
//     tracked job). `ND` (non-repairable) is the other option on the same
//     choice, per the workflow owner ("you have NFF or ND, not
//     mandatory") — never confirmed live simultaneously with RAS since
//     only one can genuinely apply, so treated as mutually exclusive and
//     enforced as such below.
//   - `Soldée` is **not** touched — confirmed unchanged in the diff. TES
//     relocates the job to a different desk, it doesn't close it; a
//     Commercial-side outcome (quote accepted/declined, exchanged, etc.)
//     presumably closes it later through its own path, not yet built.
//   - `Nettoyage`, `NomDernierTech`, `SemaineGarantie`, `ServiceTechnique`,
//     `DerInterv_technique`/`DateDerInterv_technique`/
//     `HeureDerInterv_technique` are all **untouched** — confirmed
//     unchanged in the diff, same reasoning as VAL: those are specific to
//     the step that actually closes a job, and this isn't one.
//   - `DernièreInterv`/`DateDernInterv`/`TechDernInterv`/`heureModif` all
//     update the same way every other write in this file already
//     replicates.
fn transfer_to_commercial_step(
    conn: &Connection<'static>,
    ligcde_id: i64,
    tech_id: i64,
    cause_panne: i64,
    niveau_panne: i64,
    no_fault_found: bool,
    non_repairable: bool,
    comment: &str,
    tests_actions: &[TestActionSelection],
) -> Result<(), String> {
    if job_is_closed(conn, ligcde_id)? {
        return Err(JOB_ALREADY_CLOSED_ERROR.to_string());
    }
    let comment = escape_sql_literal(comment.trim());
    let today = Local::now().format("%Y-%m-%d").to_string();
    let now_time = Local::now().format("%H:%M:%S").to_string();

    if !tests_actions.is_empty() {
        write_tests_actions(conn, ligcde_id, tests_actions)?;
    }

    let mut fault_flags = String::new();
    if no_fault_found {
        fault_flags.push_str(", RAS = True");
    }
    if non_repairable {
        fault_flags.push_str(", ND = True");
    }

    for _ in 0..MAX_ID_RETRY_ATTEMPTS {
        let candidate_id = next_intervention_id(conn)?;
        let insert_sql = format!(
            r#"INSERT INTO Intervention (NoInt_interv, NoIntLigcde, NoIntTechn, "Date", TypeCode, TypeLibelle, Commentaire, HeureInterv, NiveauPanne)
               VALUES ({candidate_id}, {ligcde_id}, {tech_id}, '{today}', 'TES', 'Transfert Service commercial', '{comment}', '{now_time}', {niveau_panne})"#
        );
        if run_write(conn, &insert_sql).is_ok() {
            let update_sql = format!(
                r#"UPDATE LigCde SET "DernièreInterv" = 'Transfert Service commercial', DateDernInterv = '{today}',
                     TechDernInterv = {tech_id}, Type_Service = '305', CausePanne = {cause_panne},
                     heureModif = '{now_time}'{fault_flags}
                   WHERE NoInt_Ligcde = {ligcde_id}"#
            );
            return run_write(conn, &update_sql);
        }
        // Same collision-retry reasoning as add_repair_step.
    }
    Err("Could not allocate a free intervention id after several attempts".to_string())
}

#[tauri::command]
pub async fn reman_transfer_to_commercial(
    ligcde_id: String,
    tech_id: String,
    cause_panne: i64,
    niveau_panne: i64,
    no_fault_found: bool,
    non_repairable: bool,
    comment: String,
    tests_actions: Vec<TestActionSelection>,
    state: State<'_, AppState>,
) -> Result<InterventionDetail, String> {
    if !(1..=5).contains(&cause_panne) {
        return Err("Invalid cause panne".to_string());
    }
    if !(1..=3).contains(&niveau_panne) {
        return Err("Invalid niveau panne".to_string());
    }
    if no_fault_found && non_repairable {
        return Err("Cannot select both No Fault Found and Non-Repairable".to_string());
    }
    let ligcde_id_num = parse_id(&ligcde_id, "job")?;
    let tech_id_num = tech_id.trim().parse::<i64>().map_err(|_| "Invalid technician id".to_string())?;
    async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| {
            transfer_to_commercial_step(conn, ligcde_id_num, tech_id_num, cause_panne, niveau_panne, no_fault_found, non_repairable, &comment, &tests_actions)
        })
    })
    .await
    .map_err(|e| e.to_string())??;
    let detail = refresh_intervention_with_retry(ligcde_id_num).await?;
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;

    // Notify whoever's on the commercial desk — see "Notifications:
    // hand-off events" doc comment above create_notifications_for.
    let commercial_recipients = commercial_tech_ids(&pg).await?;
    if !commercial_recipients.is_empty() {
        let message = format!(
            "Job {} was transferred to Service Commercial",
            detail.reference.as_deref().unwrap_or(ligcde_id.as_str())
        );
        create_notifications_for(&pg, &commercial_recipients, "transferred_commercial", &ligcde_id, detail.reference.as_deref(), &message).await?;
    }

    with_verified_fault_type(&pg, detail).await
}

// ---- Clients ----

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClientSummary {
    pub id: String,
    pub nom: Option<String>,
    pub ville: Option<String>,
    pub tel: Option<String>,
    pub cp: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClientAddress {
    pub id: String,
    pub adr1: Option<String>,
    pub adr2: Option<String>,
    pub cp: Option<String>,
    pub ville: Option<String>,
    pub nom_contact: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClientDetail {
    pub id: String,
    pub nom: Option<String>,
    pub intitule: Option<String>,
    pub ville: Option<String>,
    pub cp: Option<String>,
    pub tel: Option<String>,
    pub fax: Option<String>,
    pub email: Option<String>,
    pub commentaire: Option<String>,
    pub addresses: Vec<ClientAddress>,
}

#[tauri::command]
pub async fn reman_search_clients(query: String) -> Result<Vec<ClientSummary>, String> {
    let q = escape_sql_literal(query.trim());
    if q.is_empty() {
        return Ok(vec![]);
    }
    let sql = format!(
        r#"SELECT NoIntClt, Nom, Ville, Tel, CP
           FROM Client
           WHERE Nom LIKE '%{q}%' OR Ville LIKE '%{q}%'
           LIMIT 50"#
    );
    let rows = async_runtime::spawn_blocking(move || with_reman_connection(|conn| run_query(conn, &sql)))
        .await
        .map_err(|e| e.to_string())??;
    Ok(rows
        .into_iter()
        .map(|r| ClientSummary {
            id: r[0].clone().unwrap_or_default(),
            nom: r[1].clone(),
            ville: r[2].clone(),
            tel: r[3].clone(),
            cp: r[4].clone(),
        })
        .collect())
}

#[tauri::command]
pub async fn reman_get_client(id: String) -> Result<ClientDetail, String> {
    let id_num = parse_id(&id, "client")?;
    async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| -> Result<ClientDetail, String> {
            let head = run_query(
                conn,
                &format!(
                    r#"SELECT NoIntClt, Nom, Intitule, Ville, CP, Tel, Fax, e_mail, Commentaire
                       FROM Client WHERE NoIntClt = {id_num}"#
                ),
            )?
            .into_iter()
            .next()
            .ok_or_else(|| "Client not found".to_string())?;

            // Clt_adrLivr also holds MotPasse/MD5 (a plaintext password + hash
            // for the client's own portal login) — deliberately not selected.
            let addresses = run_query(
                conn,
                &format!(
                    r#"SELECT NoInt_adLivr, Adr1, Adr2, CP, Ville, NomContact
                       FROM Clt_adrLivr WHERE NoInt_clt = {id_num}"#
                ),
            )?
            .into_iter()
            .map(|r| ClientAddress {
                id: r[0].clone().unwrap_or_default(),
                adr1: r[1].clone(),
                adr2: r[2].clone(),
                cp: r[3].clone(),
                ville: r[4].clone(),
                nom_contact: r[5].clone(),
            })
            .collect();

            Ok(ClientDetail {
                id: head[0].clone().unwrap_or_default(),
                nom: head[1].clone(),
                intitule: head[2].clone(),
                ville: head[3].clone(),
                cp: head[4].clone(),
                tel: head[5].clone(),
                fax: head[6].clone(),
                email: head[7].clone(),
                commentaire: head[8].clone(),
                addresses,
            })
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---- Stock ----

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ArticleSummary {
    pub code_art: String,
    pub designation: Option<String>,
    pub constructeur: Option<String>,
    pub famille: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StockUnit {
    pub id: String,
    pub no_identif: Option<String>,
    pub localisation: Option<String>,
    pub date_sortie: Option<String>,
}

/// Internal core/stock-unit processing, distinct from a customer job —
/// requested directly: "Réparation = SWAP, Non Dépannable = Défect,
/// R.A.S. = SWAP are all for stock units i think you can verify that."
/// Confirmed live, 100% clean across 824 sampled rows (136+500+188): every
/// `LigCde` whose latest step carries one of these three `TypeLibelle`
/// values has `NomClient = ''` (no customer), versus 100% populated for
/// their normal-outcome siblings (`Réparation`/`NFF`/`ND(final)`,
/// 1497 sampled) — this shop reuses the same `LigCde`/`Intervention`
/// machinery to triage returned core units (repair it and put it back in
/// stock for a future swap, confirm it's fine as-is, or scrap it) as it
/// does for real customer repairs, distinguished only by whether a
/// customer is attached. `outcome` mirrors the exact `TypeLibelle` text
/// rather than re-deriving a category, since the three variants carry
/// real distinct meaning (repaired-for-stock vs. confirmed-fine vs.
/// scrapped) that collapsing them would lose.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StockProcessingRecord {
    pub ligcde_id: String,
    pub date: Option<String>,
    pub type_code: Option<String>,
    pub outcome: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ArticleStockDetail {
    pub code_art: String,
    pub designation: Option<String>,
    pub constructeur: Option<String>,
    pub stock: Vec<StockUnit>,
    pub swap_qty: Option<String>,
    pub processing_history: Vec<StockProcessingRecord>,
}

#[tauri::command]
pub async fn reman_search_stock(query: String) -> Result<Vec<ArticleSummary>, String> {
    let q = escape_sql_literal(query.trim());
    if q.is_empty() {
        return Ok(vec![]);
    }
    let sql = format!(
        r#"SELECT CodeArt, Designation, Constructeur, Famille
           FROM ArticleMeteor
           WHERE Designation LIKE '%{q}%' OR CodeArt LIKE '%{q}%'
           LIMIT 50"#
    );
    let rows = async_runtime::spawn_blocking(move || with_reman_connection(|conn| run_query(conn, &sql)))
        .await
        .map_err(|e| e.to_string())??;
    Ok(rows
        .into_iter()
        .map(|r| ArticleSummary {
            code_art: r[0].clone().unwrap_or_default(),
            designation: r[1].clone(),
            constructeur: r[2].clone(),
            famille: r[3].clone(),
        })
        .collect())
}

/// One article's most recent core-processing event (see
/// `StockProcessingRecord`'s doc comment) — feeds the Stock tab's default
/// view so it isn't empty until someone types a search term. Requested
/// directly: "stock page is empty" (reported against the search-first
/// behavior every other browse tab already has, then confirmed as a real
/// gap once it was pointed out this tab specifically should show
/// something without typing first).
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecentStockActivity {
    pub code_art: String,
    pub designation: Option<String>,
    pub constructeur: Option<String>,
    pub famille: Option<String>,
    pub last_processed_date: Option<String>,
    pub last_outcome: Option<String>,
    pub last_type_code: Option<String>,
}

#[tauri::command]
pub async fn reman_recent_stock_processing() -> Result<Vec<RecentStockActivity>, String> {
    async_runtime::spawn_blocking(|| {
        with_reman_connection(|conn| -> Result<Vec<RecentStockActivity>, String> {
            // NoInt_Ligcde DESC means the most recently *created* jobs
            // come first, which in practice means the most recently
            // *processed* core units come first too (these internal jobs
            // are opened and closed close together, not sitting open for
            // weeks) — good enough to find "recent activity" within the
            // 5000-row cap without needing a full historical scan.
            let rows = run_query(
                conn,
                r#"SELECT l.NoInt_Ligcde, l.CodeArt, am.Designation, am.Constructeur, am.Famille,
                          i.TypeCode, i.TypeLibelle, i."Date", i.HeureInterv, i.NoInt_interv
                   FROM LigCde l
                   LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
                   LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
                   WHERE l.NomClient = ''
                   ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
                   LIMIT 5000"#,
            )?;

            // Reduce to the latest step per job first (same pattern as
            // everywhere else in this file)...
            let mut latest_by_ligcde: std::collections::HashMap<String, Vec<Option<String>>> = std::collections::HashMap::new();
            for r in rows {
                let id = r[0].clone().unwrap_or_default();
                if id.is_empty() {
                    continue;
                }
                let replace = match latest_by_ligcde.get(&id) {
                    None => true,
                    Some(existing) => is_more_recent_step(
                        &r[7], &r[8], r[9].as_deref().unwrap_or(""),
                        &existing[7], &existing[8], existing[9].as_deref().unwrap_or(""),
                    ),
                };
                if replace {
                    latest_by_ligcde.insert(id, r);
                }
            }

            // ...then reduce again to the single most recent job per
            // article, since this view is "one row per article," not
            // "one row per job."
            let mut latest_by_article: std::collections::HashMap<String, Vec<Option<String>>> = std::collections::HashMap::new();
            for r in latest_by_ligcde.into_values() {
                let code_art = r[1].clone().unwrap_or_default();
                if code_art.is_empty() {
                    continue;
                }
                let replace = match latest_by_article.get(&code_art) {
                    None => true,
                    Some(existing) => is_more_recent_step(
                        &r[7], &r[8], r[0].as_deref().unwrap_or(""),
                        &existing[7], &existing[8], existing[0].as_deref().unwrap_or(""),
                    ),
                };
                if replace {
                    latest_by_article.insert(code_art, r);
                }
            }

            let mut out: Vec<RecentStockActivity> = latest_by_article
                .into_iter()
                .map(|(code_art, r)| RecentStockActivity {
                    code_art,
                    designation: r[2].clone(),
                    constructeur: r[3].clone(),
                    famille: r[4].clone(),
                    last_type_code: r[5].clone(),
                    last_outcome: r[6].clone(),
                    last_processed_date: r[7].clone(),
                })
                .collect();
            out.sort_by(|a, b| {
                let key_a = (to_ymd(&a.last_processed_date).unwrap_or_default(), a.code_art.clone());
                let key_b = (to_ymd(&b.last_processed_date).unwrap_or_default(), b.code_art.clone());
                key_b.cmp(&key_a)
            });
            out.truncate(30);
            Ok(out)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn reman_get_article_stock(code_art: String) -> Result<ArticleStockDetail, String> {
    let code = escape_sql_literal(code_art.trim());
    if code.is_empty() {
        return Err("Invalid article code".to_string());
    }
    async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| -> Result<ArticleStockDetail, String> {
            let head = run_query(
                conn,
                &format!(r#"SELECT CodeArt, Designation, Constructeur FROM ArticleMeteor WHERE CodeArt = '{code}'"#),
            )?
            .into_iter()
            .next()
            .ok_or_else(|| "Article not found".to_string())?;

            // Neuf is a Boolean column — never select those, see run_query's doc
            // comment. NoInt_Stock, NoIdentif, Localisation, DateSortie are safe.
            let stock = run_query(
                conn,
                &format!(
                    r#"SELECT NoInt_Stock, NoIdentif, Localisation, DateSortie
                       FROM Stock WHERE CodeArt = '{code}'"#
                ),
            )?
            .into_iter()
            .map(|r| StockUnit {
                id: r[0].clone().unwrap_or_default(),
                no_identif: r[1].clone(),
                localisation: r[2].clone(),
                date_sortie: r[3].clone(),
            })
            .collect();

            let swap_qty = run_query(conn, &format!(r#"SELECT "QtéSWAP" FROM StockSWAP WHERE CodeArticle = '{code}'"#))?
                .into_iter()
                .next()
                .and_then(|r| r[0].clone());

            // Internal core-processing history for this article — LigCde
            // rows with no customer attached (see StockProcessingRecord's
            // doc comment). Same "keep only the chronologically latest
            // step per job" reduction used throughout this file.
            let history_rows = run_query(
                conn,
                &format!(
                    r#"SELECT l.NoInt_Ligcde, i.TypeCode, i.TypeLibelle, i."Date", i.HeureInterv, i.NoInt_interv
                       FROM LigCde l
                       LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
                       WHERE l.CodeArt = '{code}' AND l.NomClient = ''
                       ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
                       LIMIT 2000"#
                ),
            )?;
            let mut latest_by_ligcde: std::collections::HashMap<String, Vec<Option<String>>> = std::collections::HashMap::new();
            for r in history_rows {
                let id = r[0].clone().unwrap_or_default();
                if id.is_empty() {
                    continue;
                }
                let replace = match latest_by_ligcde.get(&id) {
                    None => true,
                    Some(existing) => is_more_recent_step(
                        &r[3], &r[4], r[5].as_deref().unwrap_or(""),
                        &existing[3], &existing[4], existing[5].as_deref().unwrap_or(""),
                    ),
                };
                if replace {
                    latest_by_ligcde.insert(id, r);
                }
            }
            let mut processing_history: Vec<StockProcessingRecord> = latest_by_ligcde
                .into_iter()
                .map(|(ligcde_id, r)| StockProcessingRecord {
                    ligcde_id,
                    date: r[3].clone(),
                    type_code: r[1].clone(),
                    outcome: r[2].clone(),
                })
                .collect();
            // Simple recency sort for display — the per-job reduction
            // above already did the precise heure/id tie-breaking that
            // matters (which step is "latest" for a given job); this just
            // orders the resulting one-row-per-job list newest first.
            processing_history.sort_by(|a, b| {
                let key_a = (to_ymd(&a.date).unwrap_or_default(), a.ligcde_id.clone());
                let key_b = (to_ymd(&b.date).unwrap_or_default(), b.ligcde_id.clone());
                key_b.cmp(&key_a)
            });
            processing_history.truncate(100);

            Ok(ArticleStockDetail {
                code_art: head[0].clone().unwrap_or_default(),
                designation: head[1].clone(),
                constructeur: head[2].clone(),
                stock,
                swap_qty,
                processing_history,
            })
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---- Achat (purchase requests) ----
//
// Lives in DemandeHA, not Intervention — Interv_DemandeHA links a request
// back to a job but its NoIntervention field doesn't match
// Intervention.NoInt_interv (different numbering scheme, unresolved — see
// docs/reman-schema.md). Standalone list for now, not cross-linked.

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AchatRequestSummary {
    pub id: String,
    pub no_demande: Option<String>,
    pub date_demande: Option<String>,
    pub code_article: Option<String>,
    pub descriptif: Option<String>,
    pub qte: Option<String>,
    pub qte_recue: Option<String>,
    pub etape: Option<String>,
    pub nom_tech: Option<String>,
}

#[tauri::command]
pub async fn reman_search_achat(query: String) -> Result<Vec<AchatRequestSummary>, String> {
    let q = escape_sql_literal(query.trim());

    let mut conditions: Vec<String> = Vec::new();
    if !q.is_empty() {
        conditions.push(format!(
            "(CodeArticle LIKE '%{q}%' OR Descriptif LIKE '%{q}%' OR NomTech LIKE '%{q}%')"
        ));
    } else {
        // Default worklist: pending requests only. Etape has exactly 6
        // live values (see docs/reman-schema.md) — these three are open,
        // the rest (receptionnée/clôturée/Abandonnée) are terminal.
        conditions.push("Etape IN ('en demande', 'en commande', 'localisée')".to_string());
    }
    let where_clause = format!("WHERE {}", conditions.join(" AND "));

    let sql = format!(
        r#"SELECT NoInt_DemandeHA, NoDemande, DateDemande, CodeArticle, Descriptif, "Qté", "QteReçue", Etape, NomTech
           FROM DemandeHA
           {where_clause}
           ORDER BY NoInt_DemandeHA DESC
           LIMIT 50"#
    );
    let rows = async_runtime::spawn_blocking(move || with_reman_connection(|conn| run_query(conn, &sql)))
        .await
        .map_err(|e| e.to_string())??;
    Ok(rows
        .into_iter()
        .map(|r| AchatRequestSummary {
            id: r[0].clone().unwrap_or_default(),
            no_demande: r[1].clone(),
            date_demande: r[2].clone(),
            code_article: r[3].clone(),
            descriptif: r[4].clone(),
            qte: r[5].clone(),
            qte_recue: r[6].clone(),
            etape: r[7].clone(),
            nom_tech: r[8].clone(),
        })
        .collect())
}

// ---- Analytics ----
//
// Two independent live sources feed this, both discovered/verified
// 2026-07-31:
//
// - Intake + repairability: driven by `Commande.DateCommande` (the order
//   date — the closest thing to "when this unit came in" available; there
//   is no creation-date field directly on `LigCde` itself, confirmed by
//   probing ~15 candidate column names live, all of which don't exist).
//   Outcome is read off each job's most recent `Intervention.TypeCode`,
//   not `LigCde.Soldée` — deliberately, so this doesn't depend on
//   combining a WHERE condition with the Boolean `Soldée` column (the
//   dialect bug documented elsewhere in this file), and because the
//   TypeCode itself already distinguishes a *closed* job's outcome
//   (repaired/ND/NFF/exchange/returned-as-is) from one still mid-workflow.
// - Technician activity: driven by `Intervention.NoIntTechn` +
//   `Intervention."Date"` (quoted — bare `Date` fails to parse, same
//   reserved-word quirk as the `ts` alias issue elsewhere). This is a
//   per-visit log, not per-job, so it's a better activity signal than
//   `LigCde.TechDernInterv` (which only ever holds the *last* technician,
//   losing all earlier hand-offs).
//
// **Technician names**, resolved live from `LigCde.NomDernierTech`
// (2026-07-31) — plain text holding the technician's name directly,
// confirmed against a real screen's "technicien (serv tech)" column
// (exact match on 5 real jobs). `LigCde.TechDernInterv` on the same row
// is the id used everywhere else (`Intervention.NoIntTechn`), so a live
// id->name map is built from `(TechDernInterv, NomDernierTech)` pairs,
// most-recent-wins per id (rows ordered `NoInt_Ligcde DESC`, first
// sighting kept) — confirmed live this matters: id `72` has both "Larissa
// Hostina" and "Maida Thomas" in its history, presumably a reassigned id;
// most-recent-wins picked whichever is actually current. Replaced an
// earlier version that used `StatMensuelTech.NointTech/NomTech`, which
// turned out to be dead (frozen at February 2022, alongside other
// abandoned 4D reporting tables found the same way — `A_StockAtester`,
// `EtapeEncours`, both confirmed empty) and only resolved 4 of 13
// technician ids seen on recently-touched jobs. The new source resolves
// 14 of 16 for a 7-month range — the 2 remaining are ids that were never
// the *last* technician to touch a job within the sampled window (visible
// per-visit via `Intervention`, but `NomDernierTech` only reflects a
// job's final touch), not missing data so much as a real gap in what this
// field can see. Still falls back to "Tech #<id>" in the UI for those.

/// Whether a job has an outcome yet is read off `LigCde.Soldée` directly
/// — **not** inferred from `Intervention.TypeCode`, which was the first
/// version's mistake. Confirmed live (2026-07-31) against a real
/// "Interventions Soldées" screenshot: `VST` ("Validation Sous-Traitance")
/// shows up as a *closed* job's terminal status there, but the first
/// version's TypeCode-based heuristic treated `VST` as still-in-progress
/// (it isn't in the small set of codes recognized as terminal), silently
/// inflating the in-progress count. `Soldée` is the actual ground truth
/// for open/closed; TypeCode is only used to pick which *kind* of closed
/// outcome a job landed on, and only for jobs already confirmed closed.
///
/// Once gated on `Soldée = True`, the outcome bucket comes from the job's
/// most recent `TypeCode` (full live distribution confirmed 2026-07-30,
/// see docs/reman-schema.md): `R` ("Réparation") = repaired; `NDL`/`ND`/
/// `RSTND` = non-repairable variants; `RAS`/`RSTNF` = No Fault Found,
/// plus `REE` ("Retour en l'état") folded into NFF too (small count,
/// and the workflow owner's own best guess for what it means); `ES`
/// = standard exchange (the unit itself wasn't fixed, a replacement was
/// swapped in); `V` ("Vente") = sold as a separate replacement unit —
/// split out from `ES` on request, since "repaired vs. exchanged vs.
/// sold" is the actual business question (the "transformation rate"
/// below), not one blended bucket; `VST`/`RST` = sent to and closed via
/// a subcontractor. Anything else closed lands in `Other` rather than
/// being silently miscounted — a closed job with an unexpected or
/// missing TypeCode should be visible as "unclassified", not folded into
/// a real outcome bucket.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Outcome {
    Repaired,
    NonRepairable,
    NoFaultFound,
    StandardExchange,
    Sold,
    SentToSubcontractor,
    Other,
    InProgress,
}

fn classify_outcome(is_closed: bool, type_code: Option<&str>) -> Outcome {
    if !is_closed {
        return Outcome::InProgress;
    }
    match type_code {
        Some("R") => Outcome::Repaired,
        Some("NDL") | Some("ND") | Some("RSTND") => Outcome::NonRepairable,
        Some("RAS") | Some("RSTNF") | Some("REE") => Outcome::NoFaultFound,
        Some("ES") => Outcome::StandardExchange,
        Some("V") => Outcome::Sold,
        Some("VST") | Some("RST") => Outcome::SentToSubcontractor,
        _ => Outcome::Other,
    }
}

impl Outcome {
    /// Stable string key for persisting an outcome to Postgres
    /// (`"RemanClosedJobHistory".outcome`) — mirrors `OutcomeBreakdown`'s
    /// field names so `add_outcome_count` can map it straight back.
    fn as_str(self) -> &'static str {
        match self {
            Outcome::Repaired => "repaired",
            Outcome::NonRepairable => "non_repairable",
            Outcome::NoFaultFound => "no_fault_found",
            Outcome::StandardExchange => "standard_exchange",
            Outcome::Sold => "sold",
            Outcome::SentToSubcontractor => "sent_to_subcontractor",
            Outcome::Other => "other",
            Outcome::InProgress => "in_progress",
        }
    }
}

/// Reverse of `Outcome::as_str` — adds `count` closed jobs to the matching
/// `OutcomeBreakdown` bucket. `RemanClosedJobHistory` only ever stores
/// closed jobs, so `"in_progress"` should never appear here; folded into
/// `other` defensively rather than panicking if it somehow did.
fn add_outcome_count(breakdown: &mut OutcomeBreakdown, outcome: &str, count: u32) {
    match outcome {
        "repaired" => breakdown.repaired += count,
        "non_repairable" => breakdown.non_repairable += count,
        "no_fault_found" => breakdown.no_fault_found += count,
        "standard_exchange" => breakdown.standard_exchange += count,
        "sold" => breakdown.sold += count,
        "sent_to_subcontractor" => breakdown.sent_to_subcontractor += count,
        _ => breakdown.other += count,
    }
}

/// Family = the full `ArticleMeteor.Designation` text, untouched. Went
/// through two wrong intermediate designs before landing here, both
/// corrected directly the same day (2026-07-31): first stripped the
/// component-type phrase and kept the remainder (manufacturer + model,
/// e.g. "Calculateur ABS ATE MK100" -> "ATE MK100") — wrong axis, not
/// asked for. Then flipped to keep only the component-type phrase and drop
/// everything after it (-> "Calculateur ABS") after "what is just renault
/// or fiat or jeep telling me about the type of unit we had? nothing... i
/// don't care about the brand, but knowing it was a compteur so dashboard
/// is usefull to me" — but that over-corrected: "Calculateur ABS ATE
/// MK100", "Calculateur ABS Bosch 8.0", and "Calculateur ABS TRW" collapsed
/// into one bucket, losing the manufacturer/model distinction that *is*
/// meaningful for that part type ("why are you stripping the libellé, i
/// never asked you that... those are the families i want not just ABS").
/// Asked directly whether car-brand-suffixed parts (Compteur/Multimedia/
/// etc.) should still collapse to their bare type while Calculateur ABS/
/// Moteur kept full detail — user chose "keep everything, never strip" for
/// all of it. So this is now the identity function (trim + empty check)
/// rather than a parser; kept as a named function since callers still
/// treat "no meaningful text" (empty/NULL) as unforecastable/unspecified.
fn derive_family(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// `"DD/MM/YYYY[ HH:MM]"` -> `"YYYY-MM-DD"`, dropping any time part — for
/// grouping by calendar day and sorting chronologically as plain strings.
fn to_ymd(raw: &Option<String>) -> Option<String> {
    let s = raw.as_ref()?;
    let date_part = s.split_once(' ').map_or(s.as_str(), |(d, _)| d);
    let mut parts = date_part.split('/');
    let d = parts.next()?;
    let m = parts.next()?;
    let y = parts.next()?;
    Some(format!("{y}-{m}-{d}"))
}

/// True if Intervention row `(date_a, heure_a, id_a)` happened strictly
/// after `(date_b, heure_b, id_b)` — compares actual chronological time
/// (`"Date"` normalized via `to_ymd`, then `HeureInterv`, both of which
/// sort correctly as plain strings), *not* `NoInt_interv`.
///
/// Confirmed live 2026-08-04 (job `17478501`): plain `NoInt_interv`
/// ordering is wrong wherever `BRAXON_ID_RANGE_START` is in play. A
/// BRAXON-written row's id (900,000,000+) is always numerically bigger
/// than any native-4D id (~101,xxx), so `ORDER BY NoInt_interv DESC`
/// always ranks a BRAXON write as "the latest step" even when a real
/// native step happened afterward with a much smaller id — the exact bug
/// that showed a job's status as "Etape de réparation" when the tech had
/// already moved it to "Attente Nettoyage" from the native 4D client
/// minutes later. `NoInt_interv` is still the correct tiebreaker for two
/// rows with an identical timestamp (e.g. two BRAXON writes seconds
/// apart, same `HeureInterv`).
///
/// This affects every place in this file that picks "a job's current/
/// latest step" — not just display, but outcome classification
/// (analytics, the ETL, revenue's REE exclusion) too, since all of it
/// used to trust `ORDER BY ... NoInt_interv DESC` + first-occurrence-wins.
fn is_more_recent_step(
    date_a: &Option<String>, heure_a: &Option<String>, id_a: &str,
    date_b: &Option<String>, heure_b: &Option<String>, id_b: &str,
) -> bool {
    let key_a = (to_ymd(date_a).unwrap_or_default(), heure_a.clone().unwrap_or_default());
    let key_b = (to_ymd(date_b).unwrap_or_default(), heure_b.clone().unwrap_or_default());
    if key_a != key_b {
        return key_a > key_b;
    }
    let num_a: i64 = id_a.parse().unwrap_or(0);
    let num_b: i64 = id_b.parse().unwrap_or(0);
    num_a > num_b
}

/// The chronologically-latest row in `steps` matching `predicate`, using
/// `is_more_recent_step` on the fixed `[.., .., .., date, heure,
/// noint_interv]` shape (indices 3/4/5) every `Intervention`-row Vec in
/// this file that includes those three trailing fields shares. Used both
/// for "what's this job's real final outcome" (predicate always true) and
/// for reattribution walk-backs like "the most recent step some*one*
/// other than a Service Commercial closer touched" (predicate excludes
/// them) — same underlying "which row actually happened last" question,
/// just filtered differently first.
fn latest_matching<'a>(
    steps: &'a [Vec<Option<String>>],
    predicate: impl Fn(&Vec<Option<String>>) -> bool,
) -> Option<&'a Vec<Option<String>>> {
    let mut best: Option<&Vec<Option<String>>> = None;
    for r in steps {
        if !predicate(r) {
            continue;
        }
        let replace = match best {
            None => true,
            Some(existing) => is_more_recent_step(
                &r[3], &r[4], r[5].as_deref().unwrap_or(""),
                &existing[3], &existing[4], existing[5].as_deref().unwrap_or(""),
            ),
        };
        if replace {
            best = Some(r);
        }
    }
    best
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DayCount {
    pub date: String,
    pub count: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DayAmount {
    pub date: String,
    pub total_ttc: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct OutcomeBreakdown {
    pub repaired: u32,
    pub non_repairable: u32,
    pub no_fault_found: u32,
    pub standard_exchange: u32,
    pub sold: u32,
    pub sent_to_subcontractor: u32,
    pub other: u32,
    pub in_progress: u32,
}

impl OutcomeBreakdown {
    fn add(&mut self, outcome: Outcome) {
        match outcome {
            Outcome::Repaired => self.repaired += 1,
            Outcome::NonRepairable => self.non_repairable += 1,
            Outcome::NoFaultFound => self.no_fault_found += 1,
            Outcome::StandardExchange => self.standard_exchange += 1,
            Outcome::Sold => self.sold += 1,
            Outcome::SentToSubcontractor => self.sent_to_subcontractor += 1,
            Outcome::Other => self.other += 1,
            Outcome::InProgress => self.in_progress += 1,
        }
    }

    fn total(&self) -> u32 {
        self.repaired
            + self.non_repairable
            + self.no_fault_found
            + self.standard_exchange
            + self.sold
            + self.sent_to_subcontractor
            + self.other
            + self.in_progress
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FamilyOutcome {
    pub family: String,
    pub outcomes: OutcomeBreakdown,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TechnicianActivity {
    pub tech_id: String,
    pub tech_name: Option<String>,
    pub units: u32,
    /// Current outcome mix of the exact same job set `units` counts —
    /// requested directly: "from these units they touched, how many are
    /// repaired, exchange, sold." Looked up per job regardless of when it
    /// closed (a job touched near the end of the selected window often
    /// closes after it) rather than re-scoping by date again — see the
    /// "Per-technician transformation mix" doc comment in reman_analytics.
    /// `in_progress` here is real (unlike the range-scoped donut above,
    /// this includes jobs still open) — a technician's still-open touches
    /// show up there, not silently dropped.
    pub outcomes: OutcomeBreakdown,
}

/// One entry in the warranty-comeback breakdown (see the "Warranty
/// comebacks" section in `reman_analytics` for the full methodology) —
/// `label` is either a technician's resolved name or a family name
/// depending on which breakdown it's in. Deliberately a raw count, not a
/// rate: the previous job (the comeback's denominator, in a sense) can
/// fall outside the selected date range entirely, so dividing by this
/// window's own per-technician/family volume would mix two different
/// time periods into one misleading percentage.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ComebackStat {
    pub label: String,
    pub comebacks: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RemanAnalytics {
    pub from_date: String,
    pub to_date: String,
    pub total_intake: u32,
    pub daily_intake: Vec<DayCount>,
    pub outcomes: OutcomeBreakdown,
    pub top_families: Vec<FamilyOutcome>,
    pub daily_technician_activity: Vec<DayCount>,
    pub technicians: Vec<TechnicianActivity>,
    /// Rough/approximate revenue — see the "Revenue (rough first pass)"
    /// comment on its computation below for the known limitations before
    /// treating this as an exact figure.
    pub daily_revenue: Vec<DayAmount>,
    pub total_revenue: f64,
    /// Jobs in this window linked to a prior job via
    /// `LigCde.SuiviGar_AncNoInterv` — see `ComebackStat`'s doc comment.
    pub comeback_count: u32,
    /// Of `comeback_count`, how many had a previous job whose outcome
    /// doesn't reflect an unresolved defect — see `WARRANTY_REFUSAL_FIELDS`
    /// (`RAS`/`SGRAS`/`SGRefuseePanneDiff`/`SGRefuseeAutreMotif`). Included
    /// in `comeback_count` but excluded from the two breakdowns below,
    /// which are scoped to genuine repair-quality signals.
    pub comeback_excluded_count: u32,
    pub comebacks_by_technician: Vec<ComebackStat>,
    pub comebacks_by_family: Vec<ComebackStat>,
}

fn validate_iso_date(s: &str, label: &str) -> Result<String, String> {
    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d")
        .map(|d| d.format("%Y-%m-%d").to_string())
        .map_err(|_| format!("Invalid {label} (expected YYYY-MM-DD)"))
}

/// `LigCde.NomDernierTech` — confirmed live 2026-07-31: holds the
/// technician's name as plain text, matching a real screen's "technicien
/// (serv tech)" column exactly. `TechDernInterv` on the same row is the id
/// used elsewhere (`Intervention.NoIntTechn`), so this builds a live,
/// current id->name map. Rows are ordered by recency (`NoInt_Ligcde DESC`)
/// and `or_insert` only writes on the first (i.e. most recent) sighting of
/// an id — confirmed live this matters: id `72` resolved to "Larissa
/// Hostina" in an older sample but to "Maida Thomas" more recently,
/// presumably a reassigned id. Only ever reflects a job's *final* touch, so
/// an id that's consistently an *earlier* hand-off on jobs someone else
/// finishes never resolves — a real gap (documented since 2026-07-31), not
/// a bug; callers fall back to "Tech #<id>" for those. Shared by
/// `reman_analytics`, `reman_list_technicians`, and `reman_get_intervention`.
fn technician_name_map(conn: &Connection<'static>) -> Result<std::collections::HashMap<String, String>, String> {
    let rows = run_query(
        conn,
        r#"SELECT TechDernInterv, NomDernierTech FROM LigCde
           WHERE NomDernierTech IS NOT NULL
           ORDER BY NoInt_Ligcde DESC LIMIT 5000"#,
    )?;
    let mut map = std::collections::HashMap::new();
    for r in rows {
        let (Some(id), Some(name)) = (r[0].clone(), r[1].clone()) else { continue };
        map.entry(id).or_insert(name);
    }
    // Tech id 3389 never resolves through NomDernierTech — confirmed
    // directly, 2026-08-04: it's Archimed Saïd, the logistics coordinator
    // who ships/receives units to/from subcontractors. He hands units off
    // to a subcontractor's own closing technician rather than ever being
    // the "last touch" on a job himself, so LigCde.NomDernierTech never
    // names him — a real gap in the data, not something 4D will ever fill
    // in. `or_insert` so any real resolution that does someday show up
    // takes priority over this manual fallback.
    map.entry("3389".to_string()).or_insert_with(|| "Archimed Saïd".to_string());
    Ok(map)
}

#[tauri::command]
pub async fn reman_analytics(from_date: String, to_date: String, state: State<'_, AppState>) -> Result<RemanAnalytics, String> {
    let from = validate_iso_date(&from_date, "from date")?;
    let to = validate_iso_date(&to_date, "to date")?;

    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    let inactive = inactive_tech_ids(&pg).await?;
    let commercial = commercial_tech_ids(&pg).await?;

    async_runtime::spawn_blocking({
        let (from, to) = (from.clone(), to.clone());
        move || with_reman_connection(|conn| -> Result<RemanAnalytics, String> {
            // ---- Intake + outcomes, by Commande.DateCommande ----
            //
            // Two separate queries, not one combined WHERE — `l."Soldée"`
            // is safe to combine with a second *equality* condition
            // (confirmed live elsewhere in this file) and, confirmed live
            // 2026-07-31, also safe combined with a BETWEEN range on a
            // LEFT-JOINed table's column. It's kept as a separate query
            // anyway: `run_query` can never SELECT `Soldée` (the Boolean-
            // column crash documented on `run_query`), so the only way to
            // know which ids are closed is to filter by it in a query that
            // doesn't select it, then intersect the id sets in Rust.
            // Famille comes from ArticleMeteor (joined on CodeArt), not
            // LigCde.Famille directly — requested directly, 2026-07-31:
            // ArticleMeteor is the canonical "fiche article" a technician's
            // reference lookup fills in from (confirmed live against a real
            // screen: typing a known CodeArt auto-resolves its family from
            // this record), whereas LigCde.Famille is a per-order copy that
            // isn't guaranteed to stay in sync. LigCde.Famille only exists
            // in reman.rs now to detect a job's identifying CodeArt, not to
            // read a family value off of.
            //
            // The family value itself comes from ArticleMeteor.Designation,
            // parsed via derive_family(), not ArticleMeteor.Famille —
            // corrected again, same date: the raw Famille field mixes car
            // brands, ABS module lines, and hundreds of one-off engine ECU
            // codes at inconsistent granularity (surveyed live: 544 distinct
            // values over a 5000-article sample). Designation is the same
            // "fiche" text, just parsed instead of read as a flat field.
            // i."Date"/i.HeureInterv/i.NoInt_interv (indices 5-7) are only
            // for picking the chronologically-latest row per job below —
            // TypeCode (r[3]) must come from that specific row, not just
            // whichever one the SQL's own NoInt_interv-DESC order happened
            // to put first (unreliable now that BRAXON's own writes carry
            // ids far outside 4D's normal range — see is_more_recent_step).
            // `l.NomClient <> ''` excludes internal core-processing jobs
            // (see StockProcessingRecord's doc comment) — confirmed live
            // 2026-08-11 these are indistinguishable from real customer
            // jobs by `Type_Service`/`Soldée` alone (~4.8% of closed bench
            // jobs in a trailing-365-day sample), so without this filter
            // they'd misleadingly count as real repair/NFF/ND outcomes
            // here, in `top_families`, and in the open-status breakdown.
            let intake_sql = format!(
                r#"SELECT l.NoInt_Ligcde, am.Designation, c.DateCommande, i.TypeCode, c.StatutDossier,
                          i."Date", i.HeureInterv, i.NoInt_interv, l.SuiviGar_AncNoInterv
                   FROM LigCde l
                   LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
                   LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
                   LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
                   WHERE c.DateCommande BETWEEN '{from}' AND '{to}' AND l.NomClient <> ''
                   ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
                   LIMIT 20000"#
            );
            let intake_rows = run_query(conn, &intake_sql)?;

            let closed_sql = format!(
                r#"SELECT l.NoInt_Ligcde FROM LigCde l
                   LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
                   WHERE l."Soldée" = True AND c.DateCommande BETWEEN '{from}' AND '{to}' AND l.NomClient <> ''
                   LIMIT 20000"#
            );
            let closed_ids: std::collections::HashSet<String> =
                run_query(conn, &closed_sql)?.into_iter().filter_map(|r| r[0].clone()).collect();

            // Same "chronologically-latest row per job" dedup as
            // reman_search_interventions — plain first-seen-in-SQL-order no
            // longer reliably picks the real latest row (see
            // is_more_recent_step's doc comment).
            let mut latest_intake: std::collections::HashMap<String, Vec<Option<String>>> = std::collections::HashMap::new();
            for r in intake_rows {
                let id = r[0].clone().unwrap_or_default();
                if id.is_empty() {
                    continue;
                }
                let replace = match latest_intake.get(&id) {
                    None => true,
                    Some(existing) => is_more_recent_step(
                        &r[5], &r[6], r[7].as_deref().unwrap_or(""),
                        &existing[5], &existing[6], existing[7].as_deref().unwrap_or(""),
                    ),
                };
                if replace {
                    latest_intake.insert(id, r);
                }
            }

            let mut daily_intake: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
            let mut total_intake = 0u32;

            // ---- Warranty comebacks (LigCde.SuiviGar_AncNoInterv, 2026-08-05) ----
            //
            // 4D's own comeback-tracking field, confirmed live against job
            // 17481001 (linked to prior job 17423601, whose order comment
            // read "Connecteur cassé sur précédent dossier NFF..." — an
            // explicit staff note about the comeback). Populated on 8.5% of
            // all LigCde rows; ~86% of a 200-job sample resolved to a real
            // LigCde row. Batch-resolved here (one query for every distinct
            // previous-job reference in this window) rather than per-row,
            // to avoid N+1 queries against 4D.
            //
            // Known simplification: attribution is to whoever's
            // `TechDernInterv` is on the *previous* job — no Superviseur→VAL
            // reattribution here (unlike the technician-activity section
            // below), since that lookup is itself scoped to jobs touched
            // within *this* window and the previous job may be much older.
            // A previous job still attributed to the generic Superviseur
            // account is simply excluded from the technician breakdown
            // (nothing real to credit/blame), same as elsewhere in this
            // file when an id can't be resolved to an individual.
            //
            // Same treatment for id 3389 (Archimed Saïd, the logistics
            // coordinator — see `technician_name_map`'s doc comment).
            // Reported directly, then confirmed live: every one of his
            // attributed comebacks in a 6-month sample traced back to a
            // previous job that was `Type_Service = '114'` (sent to a
            // subcontractor) or a small handful of other non-repair
            // families — `TechDernInterv` lands on him because he
            // processes the paperwork when a subcontracted/externally-
            // handled unit comes back, not because he repaired anything
            // himself. Excluding a *service code* (114) felt like the
            // more "principled" fix at first, but excluding the specific
            // known-non-repairing id matches what's already established
            // about him elsewhere in this file, and is simpler to reason
            // about than inferring intent from Type_Service.
            const ARCHIMED_LOGISTICS_TECH_ID: &str = "3389";
            let comeback_prev_refs: std::collections::HashSet<String> = latest_intake
                .values()
                .filter_map(|r| r[8].as_deref())
                .map(str::trim)
                .filter(|s| !s.is_empty() && *s != "0")
                .map(|s| s.to_string())
                .collect();

            let mut prev_tech_by_ref: std::collections::HashMap<String, String> = std::collections::HashMap::new();
            let mut prev_family_by_ref: std::collections::HashMap<String, String> = std::collections::HashMap::new();
            // Refs whose *previous* job's outcome doesn't reflect an
            // unresolved defect the shop is responsible for — see
            // `WARRANTY_REFUSAL_FIELDS`'s doc comment. Confirmed live
            // 2026-08-05/06: job 17477701, linked to prior job 17456901
            // (closed `RAS = True`, "ABS déjà contrôlé en NFF... le client
            // final insiste"), then confirmed directly by the workflow
            // owner that `SGRAS`/`SGRefuseePanneDiff`/`SGRefuseeAutreMotif`
            // are the same shape of case — none of the four mean the
            // *original* repair failed. Crediting/blaming a technician for
            // any of these would be exactly backwards. One extra WHERE-only
            // query (Boolean columns can never be SELECTed, see
            // `run_query`'s doc comment) against the same ref list, not
            // per-row.
            let mut excluded_prev_refs: std::collections::HashSet<String> = std::collections::HashSet::new();
            if !comeback_prev_refs.is_empty() {
                let in_list = comeback_prev_refs
                    .iter()
                    .map(|r| format!("'{}'", escape_sql_literal(r)))
                    .collect::<Vec<_>>()
                    .join(",");
                let prev_sql = format!(
                    r#"SELECT l.NoIntervention, l.TechDernInterv, am.Designation
                       FROM LigCde l
                       LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
                       WHERE l.NoIntervention IN ({in_list})"#
                );
                for r in run_query(conn, &prev_sql)? {
                    let Some(prev_ref) = r[0].clone() else { continue };
                    if let Some(tech) = r[1].clone() {
                        if tech != "0" && tech != SUPERVISEUR_TECH_ID && tech != ARCHIMED_LOGISTICS_TECH_ID {
                            prev_tech_by_ref.insert(prev_ref.clone(), tech);
                        }
                    }
                    if let Some(family) = r[2].as_deref().and_then(derive_family) {
                        prev_family_by_ref.insert(prev_ref, family);
                    }
                }
                let refusal_conditions = WARRANTY_REFUSAL_FIELDS
                    .iter()
                    .map(|f| format!(r#""{f}" = True"#))
                    .collect::<Vec<_>>()
                    .join(" OR ");
                let excluded_sql = format!(
                    r#"SELECT NoIntervention FROM LigCde WHERE NoIntervention IN ({in_list}) AND ({refusal_conditions})"#
                );
                excluded_prev_refs = run_query(conn, &excluded_sql)?.into_iter().filter_map(|r| r[0].clone()).collect();
            }

            let mut comeback_by_tech: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
            let mut comeback_by_family: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
            let mut comeback_count = 0u32;
            let mut comeback_excluded_count = 0u32;

            for (id, r) in latest_intake {
                let is_closed = closed_ids.contains(&id);
                // Commande.StatutDossier — the field the real 4D order-
                // list screen shows in a "statut" column (confirmed live
                // 2026-07-31 against a real screenshot). Empty string (no
                // StatutDossier at all) is a sentinel the frontend maps to
                // a translated "no status" label.
                let status = r[4].clone().unwrap_or_default();
                // "ATTENTE ACCORD" jobs are excluded from the analytics
                // entirely, not just relabeled — requested directly: they
                // dominated every chart (81% of "in progress" for a
                // 7-month range) and some sit there indefinitely if the
                // client never responds, so counting them as "intake"
                // measures how many quotes went out, not how many units
                // the shop is actually processing. Confirmed live these
                // are 100% Soldée = False, so this only ever excludes
                // still-open jobs — one that eventually gets the client's
                // go-ahead moves to a different StatutDossier and starts
                // counting normally from then on; this doesn't touch
                // history for jobs that already passed through this stage.
                //
                // "CLOTURE" is excluded the same way — requested directly:
                // "clôturé" means closed, it shouldn't show as an open job
                // regardless of what `Soldée` says. Confirmed live this
                // reads as a real distinct category, not noise: every
                // sampled `CLOTURE` job (10/10) had neither a
                // `DateDernInterv` nor a `DateLimiteLivraison` at all — no
                // technical activity ever happened on them, consistent
                // with an administratively-voided/cancelled order rather
                // than a job that was worked and closed a different way.
                if !is_closed && (status == "ATTENTE ACCORD" || status == "CLOTURE") {
                    continue;
                }
                total_intake += 1;
                if let Some(day) = to_ymd(&r[2]) {
                    *daily_intake.entry(day).or_default() += 1;
                }
                if let Some(prev_ref) = r[8].as_deref().map(str::trim).filter(|s| !s.is_empty() && *s != "0") {
                    comeback_count += 1;
                    if excluded_prev_refs.contains(prev_ref) {
                        // Not a repair-failure comeback — the previous job's
                        // outcome doesn't reflect an unresolved defect (see
                        // WARRANTY_REFUSAL_FIELDS). Counted in the total
                        // above, but excluded from the technician/family
                        // breakdowns, which exist specifically to surface
                        // repair-quality issues.
                        comeback_excluded_count += 1;
                    } else {
                        if let Some(tech) = prev_tech_by_ref.get(prev_ref) {
                            *comeback_by_tech.entry(tech.clone()).or_default() += 1;
                        }
                        if let Some(fam) = prev_family_by_ref.get(prev_ref) {
                            *comeback_by_family.entry(fam.clone()).or_default() += 1;
                        }
                    }
                }
            }

            let mut comebacks_by_family: Vec<ComebackStat> = comeback_by_family
                .into_iter()
                .map(|(label, comebacks)| ComebackStat { label, comebacks })
                .collect();
            comebacks_by_family.sort_by(|a, b| b.comebacks.cmp(&a.comebacks));
            comebacks_by_family.truncate(10);

            let mut daily_intake: Vec<DayCount> =
                daily_intake.into_iter().map(|(date, count)| DayCount { date, count }).collect();
            daily_intake.sort_by(|a, b| a.date.cmp(&b.date));

            // ---- Outcome mix, by close date (LigCde.DateDernInterv) — not
            // by intake date (correction, 2026-08-28) ----
            //
            // Reported directly: picking "Today" as the range showed an
            // empty outcome donut (0 closed jobs) while a separately-added
            // "closed on this day" card showed the real 19 closed jobs for
            // the exact same date — "the data we're using for the whole
            // section is incorrect otherwise you wouldn't have to add this
            // today section... you get it now?" Confirmed: `outcomes`/
            // `by_family` had always been built from the *intake* cohort
            // above (`Commande.DateCommande BETWEEN`) — "of the jobs that
            // arrived in this window, what's their outcome now" — a
            // different question from "what did we close in this window,"
            // which is what picking a date range for an *outcome*
            // breakdown actually means to someone reading it. A job that
            // arrived weeks before the window and closed today was
            // invisible to the old query; a job that arrived today and
            // (almost never) closes same-day was all it could ever show
            // for "Today." `daily_revenue` below already got this right
            // (DateDernInterv-scoped since before this section existed) —
            // this brings outcomes/families in line with it, and makes a
            // separate "closed on this day" view unnecessary: this query
            // already *is* that view when `from == to`.
            //
            // `Soldée = True` alone rules out both `ATTENTE ACCORD` and
            // `CLOTURE` automatically — both are 100% `Soldée = False`
            // (confirmed live, see the intake exclusion's doc comment
            // above) — no separate StatutDossier exclusion needed here.
            // Every `OutcomeBreakdown` this produces has `in_progress =
            // 0` always — this query only ever returns already-closed
            // jobs by construction. "In progress" as a KPI was dropped
            // from this page's historical section entirely rather than
            // kept as a differently-scoped (intake-cohort) number sitting
            // next to a now-correctly-close-date-scoped donut — exactly
            // the kind of two-numbers-two-definitions mismatch that
            // caused this bug in the first place. The live "Where the
            // open jobs are" shop-status card above answers "what's
            // unresolved right now" better than a stale cohort count ever
            // did anyway.
            let outcome_sql = format!(
                r#"SELECT l.NoInt_Ligcde, am.Designation, i.TypeCode, i."Date", i.HeureInterv, i.NoInt_interv
                   FROM LigCde l
                   LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
                   LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
                   WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '{from}' AND '{to}' AND l.NomClient <> ''
                   ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
                   LIMIT 20000"#
            );
            let outcome_rows = run_query(conn, &outcome_sql)?;
            let mut latest_outcome: std::collections::HashMap<String, Vec<Option<String>>> = std::collections::HashMap::new();
            for r in outcome_rows {
                let id = r[0].clone().unwrap_or_default();
                if id.is_empty() {
                    continue;
                }
                let replace = match latest_outcome.get(&id) {
                    None => true,
                    Some(existing) => is_more_recent_step(
                        &r[3], &r[4], r[5].as_deref().unwrap_or(""),
                        &existing[3], &existing[4], existing[5].as_deref().unwrap_or(""),
                    ),
                };
                if replace {
                    latest_outcome.insert(id, r);
                }
            }
            let mut outcomes = OutcomeBreakdown::default();
            let mut by_family: std::collections::HashMap<String, OutcomeBreakdown> = std::collections::HashMap::new();
            for r in latest_outcome.values() {
                let outcome = classify_outcome(true, r[2].as_deref());
                outcomes.add(outcome);
                let family = r[1].as_deref().and_then(derive_family).unwrap_or_else(|| "(unspecified)".to_string());
                by_family.entry(family).or_default().add(outcome);
            }

            let mut top_families: Vec<FamilyOutcome> = by_family
                .into_iter()
                .map(|(family, outcomes)| FamilyOutcome { family, outcomes })
                .collect();
            top_families.sort_by(|a, b| b.outcomes.total().cmp(&a.outcomes.total()));
            top_families.truncate(10);

            // ---- Technician activity, by Intervention."Date" ----
            //
            // Some steps get logged under the generic "Superviseur" account
            // (id 2403) rather than a real individual — confirmed directly,
            // 2026-08-04: this happens when the responsable technique closes
            // a job on someone else's behalf, not their own work. Reattribute
            // those specific rows to whoever actually did that job's "En
            // attente de validation" (VAL) step instead, so credit lands on
            // the real technician who did the work rather than the generic
            // account. A job with no VAL step anywhere in its history stays
            // attributed to Superviseur — nothing to substitute with.
            const SUPERVISEUR_TECH_ID: &str = "2403";

            // `l.NomClient <> ''` excludes internal core-processing steps
            // (see StockProcessingRecord's doc comment) — those aren't
            // real customer-facing work, and their `TypeCode`s (R/RAS/ND)
            // would otherwise misleadingly look like real repair/NFF/ND
            // activity on this leaderboard, same reasoning as the earlier
            // Archimed/Superviseur exclusions just above.
            let tech_sql = format!(
                r#"SELECT i.NoIntLigcde, i.NoIntTechn, i."Date"
                   FROM Intervention i
                   JOIN LigCde l ON i.NoIntLigcde = l.NoInt_Ligcde
                   WHERE i."Date" BETWEEN '{from}' AND '{to}' AND l.NomClient <> ''
                   LIMIT 20000"#
            );
            let tech_rows = run_query(conn, &tech_sql)?;

            let superviseur_job_ids: Vec<String> = tech_rows
                .iter()
                .filter(|r| r[1].as_deref() == Some(SUPERVISEUR_TECH_ID))
                .filter_map(|r| r[0].clone())
                .collect();
            let mut val_step_tech: std::collections::HashMap<String, String> = std::collections::HashMap::new();
            if !superviseur_job_ids.is_empty() {
                let id_list = superviseur_job_ids.join(",");
                let val_sql = format!(
                    r#"SELECT NoIntLigcde, NoIntTechn FROM Intervention
                       WHERE NoIntLigcde IN ({id_list}) AND TypeCode = 'VAL'
                       ORDER BY NoInt_interv DESC"#
                );
                for r in run_query(conn, &val_sql)? {
                    let (Some(job_id), Some(tech_id)) = (r[0].clone(), r[1].clone()) else { continue };
                    // Most recent VAL step wins if a job somehow went
                    // through validation more than once (rows already DESC).
                    val_step_tech.entry(job_id).or_insert(tech_id);
                }
            }

            let mut daily_seen = std::collections::HashSet::new();
            let mut daily_technician_activity: std::collections::HashMap<String, u32> =
                std::collections::HashMap::new();
            let mut tech_units: std::collections::HashMap<String, std::collections::HashSet<String>> =
                std::collections::HashMap::new();

            for r in tech_rows {
                let job_id = r[0].clone().unwrap_or_default();
                let mut tech_id = r[1].clone().unwrap_or_else(|| "0".to_string());
                if job_id.is_empty() {
                    continue;
                }
                if tech_id == SUPERVISEUR_TECH_ID {
                    if let Some(real_tech) = val_step_tech.get(&job_id) {
                        tech_id = real_tech.clone();
                    }
                }
                if let Some(day) = to_ymd(&r[2]) {
                    if daily_seen.insert((day.clone(), job_id.clone())) {
                        *daily_technician_activity.entry(day).or_default() += 1;
                    }
                }
                tech_units.entry(tech_id).or_default().insert(job_id);
            }

            let mut daily_technician_activity: Vec<DayCount> = daily_technician_activity
                .into_iter()
                .map(|(date, count)| DayCount { date, count })
                .collect();
            daily_technician_activity.sort_by(|a, b| a.date.cmp(&b.date));

            // ---- Full per-job step history, shared by the two passes
            // below (2026-08-29/30) ----
            //
            // One IN-list lookup for the union of every touched job across
            // all technicians, not per-technician or per-consumer, to
            // avoid N+1 (or 2x) queries. Unscoped by date deliberately —
            // both consumers below need a job's *whole* history, not just
            // the slice inside the selected window: a technician's real
            // diagnostic step, or a job's actual close, can fall outside
            // it (e.g. touched near the end of the window, closed after).
            let all_touched_ids: std::collections::HashSet<String> =
                tech_units.values().flatten().cloned().collect();
            let mut job_steps: std::collections::HashMap<String, Vec<Vec<Option<String>>>> =
                std::collections::HashMap::new();
            if !all_touched_ids.is_empty() {
                let id_list = all_touched_ids.iter().cloned().collect::<Vec<_>>().join(",");
                let step_rows = run_query(
                    conn,
                    &format!(
                        r#"SELECT NoIntLigcde, NoIntTechn, TypeCode, "Date", HeureInterv, NoInt_interv
                           FROM Intervention WHERE NoIntLigcde IN ({id_list})"#
                    ),
                )?;
                for r in step_rows {
                    let job_id = r[0].clone().unwrap_or_default();
                    if job_id.is_empty() {
                        continue;
                    }
                    job_steps.entry(job_id).or_default().push(r);
                }
            }

            // ---- Roster-driven reattribution: a Service Commercial
            // closer isn't who did the work (2026-08-30) ----
            //
            // Requested directly: "if you see a commercial's name as last
            // check the step before and see who's technician name was
            // attached, because in case we couldn't repair, we send it to
            // service commercial and if the customer refuses the
            // exchange, it's the commercial that closes the job but it's
            // the technician that worked on it." Same idea as the
            // Superviseur→VAL reattribution above, generalized: driven by
            // `commercial` (the roster's `is_commercial` flag, fetched by
            // the caller — permissive default, a technician never added
            // to the roster is treated as real, not commercial) instead
            // of a single hardcoded id. For every job attributed to a
            // commercial id, walks that job's full step history
            // (`job_steps`, built above) for the most recent step
            // attributed to someone who *isn't* commercial and re-credits
            // it to them instead. Falls back to the commercial id itself
            // if a job genuinely has no other technician on it (rare) —
            // that job then simply doesn't appear on anyone's leaderboard
            // row, same as any other id the final filter below excludes.
            if !commercial.is_empty() {
                let mut reattributed: std::collections::HashMap<String, std::collections::HashSet<String>> =
                    std::collections::HashMap::new();
                for (tech_id, jobs) in tech_units {
                    for job_id in jobs {
                        let effective = if commercial.contains(&tech_id) {
                            job_steps
                                .get(&job_id)
                                .and_then(|steps| {
                                    latest_matching(steps, |r| {
                                        let t = r[1].as_deref().unwrap_or("0");
                                        t != "0" && !commercial.contains(t)
                                    })
                                })
                                .and_then(|r| r[1].clone())
                                .unwrap_or_else(|| tech_id.clone())
                        } else {
                            tech_id.clone()
                        };
                        reattributed.entry(effective).or_default().insert(job_id);
                    }
                }
                tech_units = reattributed;
            }

            // ---- Per-technician transformation mix (2026-08-29) ----
            //
            // Requested directly: "add the option to see transformation
            // rate, so from these units they touched, how many are
            // repaired, exchange, sold." Reuses the exact (now
            // reattribution-corrected) job-id set `tech_units` per
            // technician, but looks up each job's *current* outcome
            // regardless of when it closed — re-scoping by the selected
            // date range a second time would silently exclude a
            // technician's own touches that closed shortly after the
            // window ended, which isn't what "of these units they
            // touched" asks for.
            let closed_touched: std::collections::HashSet<String> = if all_touched_ids.is_empty() {
                std::collections::HashSet::new()
            } else {
                let id_list = all_touched_ids.iter().cloned().collect::<Vec<_>>().join(",");
                run_query(
                    conn,
                    &format!(r#"SELECT NoInt_Ligcde FROM LigCde WHERE "Soldée" = True AND NoInt_Ligcde IN ({id_list})"#),
                )?
                .into_iter()
                .filter_map(|r| r[0].clone())
                .collect()
            };
            let mut outcome_by_job: std::collections::HashMap<String, Outcome> = std::collections::HashMap::new();
            for id in &all_touched_ids {
                let type_code = job_steps.get(id).and_then(|steps| latest_matching(steps, |_| true)).and_then(|r| r[2].as_deref());
                let is_closed = closed_touched.contains(id);
                outcome_by_job.insert(id.clone(), classify_outcome(is_closed, type_code));
            }

            // Id->name resolution now shared with reman_list_technicians
            // and reman_get_intervention — see technician_name_map's doc
            // comment for the "old StatMensuelTech was frozen at Feb 2022"
            // background and the recency-wins/final-touch-only caveats.
            let name_map = technician_name_map(conn).unwrap_or_default();

            // Excludes id 3389 (Archimed Saïd) outright — reported directly
            // ("he shouldn't be in any tech leaderboard"), then confirmed
            // live: in a 30-day sample he had 146 distinct "units," every
            // one logged under logistics/subcontractor TypeCodes (NET,
            // RST, VST, RSTNF, RAS, ST, TES, T114) — never a real repair
            // code (ER/R). Unlike Superviseur, there's no VAL-step
            // reattribution to fall back on for him — he's simply never
            // the credit-worthy technician, so he's excluded unconditionally
            // rather than reattributed. `SUPERVISEUR_TECH_ID` is also
            // excluded here now — the VAL-step reattribution above only
            // catches jobs that *have* a VAL step; a job with none stays
            // attributed to the generic account and would otherwise still
            // leak into this leaderboard the same way Archimed did. Same
            // reasoning for `commercial` ids — the reattribution pass
            // above already redirects their credit-worthy jobs to a real
            // technician; this only ever catches the rare fallback case
            // (a job with no other technician on it at all).
            let mut technicians: Vec<TechnicianActivity> = tech_units
                .into_iter()
                .filter(|(id, _)| {
                    id != "0" && !inactive.contains(id) && id != SUPERVISEUR_TECH_ID
                        && id != ARCHIMED_LOGISTICS_TECH_ID && !commercial.contains(id)
                })
                .map(|(tech_id, jobs)| {
                    let mut outcomes = OutcomeBreakdown::default();
                    for job_id in &jobs {
                        outcomes.add(outcome_by_job.get(job_id).copied().unwrap_or(Outcome::InProgress));
                    }
                    TechnicianActivity {
                        tech_name: name_map.get(&tech_id).cloned(),
                        units: jobs.len() as u32,
                        outcomes,
                        tech_id,
                    }
                })
                .collect();
            technicians.sort_by(|a, b| b.units.cmp(&a.units));

            let mut comebacks_by_technician: Vec<ComebackStat> = comeback_by_tech
                .into_iter()
                .map(|(tech_id, comebacks)| ComebackStat {
                    label: name_map.get(&tech_id).cloned().unwrap_or_else(|| format!("Tech #{tech_id}")),
                    comebacks,
                })
                .collect();
            comebacks_by_technician.sort_by(|a, b| b.comebacks.cmp(&a.comebacks));
            comebacks_by_technician.truncate(10);

            // ---- Revenue (rough first pass, requested directly: "how much
            // money we're making per day", "only count them when a job is
            // closed") ----
            //
            // Attributed to LigCde.DateDernInterv, not Commande.DateCommande
            // (intake) — a job's amount isn't final/meaningful until it
            // closes, and DateDernInterv is the same "closest available
            // proxy" already used elsewhere in this file for "when did this
            // job last move" (no dedicated closed-date field exists on
            // either table, confirmed by scanning every date-ish column on
            // both). Combining `Soldée = True` with a same-table `BETWEEN`
            // on `DateDernInterv` was untested before this — confirmed live
            // 2026-08-04 that it returns the exact same result set as the
            // safe split-query-and-intersect-in-Rust pattern used elsewhere
            // in this file for Boolean columns, so used directly here rather
            // than the more expensive two-query form.
            //
            // Subcontractor-outsourced outcomes (VST/RST/RSTNF/RSTND) are
            // counted the same as any other closed outcome — confirmed live
            // the same day these jobs carry real non-zero amounts, i.e. the
            // shop still bills the client even when the repair itself was
            // outsourced. Confirmed against the real July 2026 report: its
            // "ST : autre" / "ST : Calculateur" family rows (12 + 38 = 50)
            // match this file's `Type_Service = '114'` count for July (50)
            // exactly — subcontractor jobs get their own family rows in the
            // report, they aren't excluded.
            //
            // Uses `Commande.MtHT_Lignes` (excl. VAT and port), not
            // `TotalTTC` — corrected 2026-08-04 after diffing against the
            // real July report (101 486,5 €, 394 jobs): the raw `TotalTTC`
            // sum was 126 679,8 € against the same rows, and
            // `105 566,5 (HT) × 1.20 = 126 679,8` exactly — the report's own
            // legend confirms this independently ("PMP: ne tient pas compte
            // des frais de transport"), i.e. it's reporting pre-tax,
            // transport-excluded amounts, not TTC.
            //
            // Excludes `TypeCode = 'REE'` ("Retour en l'état") jobs
            // entirely — confirmed live: exactly 11 jobs closed in July had
            // REE as their latest step, matching the report's own footnote
            // ("Les retours en l'état ne sont pas comptés, Nb : 11") exactly.
            // Requires joining `Intervention` and keeping each job's latest
            // row (same pattern as `intake_sql` above) to know its outcome
            // before deciding whether to count it.
            //
            // Also requires `Commande.StatutDossier = 'EXPEDIE'` — found by
            // diffing 5 months (Mar-Jul 2026) against the shop's own real
            // reports: `Soldée = True` alone consistently overcounted (e.g.
            // March: 535 jobs vs. the report's 473, a 13% gap far bigger
            // than any other month, which is what made this worth chasing).
            // A job can be internally marked repaired without having
            // actually shipped back to the client yet (`Soldée = True` but
            // `StatutDossier` still NULL/other) — this is a *production*
            // report, counting what shipped, not what's internally closed.
            // Confirmed live: scoping March to `StatutDossier = 'EXPEDIE'`
            // brought 535 down to 469, versus the report's 473 — closing
            // the gap from 62 jobs to 4. Also confirmed live that combining
            // `Soldée = True` with a same-table `DateDernInterv BETWEEN` AND
            // a joined-table `StatutDossier =` equality, all in one query,
            // returns the exact same result as the safe split-and-intersect
            // pattern used elsewhere in this file for Boolean columns.
            //
            // Known rough edges, acceptable for a first pass:
            // - `Commande.MtHT_Lignes` is per-order, not per-job; ~2% of
            //   orders in a live sample had more than one `LigCde` line.
            //   Deduped by `NoInt_cde` (first occurrence wins) so a
            //   multi-line order's total isn't counted once per line — but
            //   if that order's lines close on different days, the whole
            //   total lands on whichever line is encountered first, not
            //   split across days.
            // - Still a small residual gap after all three fixes above (4
            //   jobs for March) not chased further — good enough for "rough"
            //   given it's now within ~1%, but worth another pass with
            //   whoever produces that report if exactness ever matters.
            // i."Date"/i.HeureInterv/i.NoInt_interv (indices 5-7) are only
            // for picking the chronologically-latest row per job below —
            // TypeCode (r[4], the REE check) must come from that specific
            // row, not just whichever one NoInt_interv-DESC happened to put
            // first (see is_more_recent_step's doc comment — this is
            // exactly the bug that would let a REE job slip through revenue
            // if its REE step landed on the native-4D side after a BRAXON
            // write with a numerically bigger id).
            let revenue_sql = format!(
                r#"SELECT l.NoInt_Ligcde, l.NoInt_cde, l.DateDernInterv, c.MtHT_Lignes, i.TypeCode,
                          i."Date", i.HeureInterv, i.NoInt_interv
                   FROM LigCde l
                   LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
                   LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
                   WHERE l."Soldée" = True AND l.DateDernInterv BETWEEN '{from}' AND '{to}'
                     AND c.StatutDossier = 'EXPEDIE'
                   ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
                   LIMIT 20000"#
            );
            let revenue_rows = run_query(conn, &revenue_sql)?;

            let mut latest_revenue: std::collections::HashMap<String, Vec<Option<String>>> = std::collections::HashMap::new();
            for r in revenue_rows {
                let ligcde_id = r[0].clone().unwrap_or_default();
                if ligcde_id.is_empty() {
                    continue;
                }
                let replace = match latest_revenue.get(&ligcde_id) {
                    None => true,
                    Some(existing) => is_more_recent_step(
                        &r[5], &r[6], r[7].as_deref().unwrap_or(""),
                        &existing[5], &existing[6], existing[7].as_deref().unwrap_or(""),
                    ),
                };
                if replace {
                    latest_revenue.insert(ligcde_id, r);
                }
            }

            let mut counted_commandes = std::collections::HashSet::new();
            let mut daily_revenue: std::collections::HashMap<String, f64> = std::collections::HashMap::new();
            let mut total_revenue = 0.0;
            for (_ligcde_id, r) in latest_revenue {
                if r[4].as_deref() == Some("REE") {
                    continue;
                }
                let cde_id = r[1].clone().unwrap_or_default();
                if !cde_id.is_empty() && !counted_commandes.insert(cde_id) {
                    continue;
                }
                let Some(date) = to_ymd(&r[2]) else { continue };
                let Some(amount) = r[3].as_deref().and_then(|s| s.parse::<f64>().ok()) else { continue };
                *daily_revenue.entry(date).or_insert(0.0) += amount;
                total_revenue += amount;
            }
            let mut daily_revenue: Vec<DayAmount> = daily_revenue
                .into_iter()
                .map(|(date, total_ttc)| DayAmount { date, total_ttc })
                .collect();
            daily_revenue.sort_by(|a, b| a.date.cmp(&b.date));

            Ok(RemanAnalytics {
                from_date: from,
                to_date: to,
                total_intake,
                daily_intake,
                outcomes,
                top_families,
                daily_technician_activity,
                technicians,
                daily_revenue,
                total_revenue,
                comeback_count,
                comeback_excluded_count,
                comebacks_by_technician,
                comebacks_by_family,
            })
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---- Shared Postgres cache (multi-client 4D load reduction, 2026-07-31) ----
//
// With up to 15 BRAXON instances open at once, each independently polling
// 4D every 60s (RemanForecast.tsx's AUTO_REFRESH_MS / Reman.tsx's
// INTERVENTIONS_REFRESH_MS), the 180-day historical scan in what's now
// `predicted_mix_from_family_counts` below was the worst offender — a full
// `LIMIT 20000` scan on every single client's every refresh. Requested
// directly: back the historical rates up into BRAXON's own Postgres once a
// day instead of scanning 4D live for them, and for whatever *does* still
// need a live 4D read, have one client refresh per interval while the rest
// read a shared Postgres row instead of all hitting 4D independently.
//
// Two new tables, both in BRAXON's own Postgres (not 4D — REMAN's database
// stays untouched, read-only, exactly as before):
// - `"RemanClosedJobHistory"` — one row per closed LigCde job seen in the
//   last FORECAST_LOOKBACK_DAYS, refreshed nightly by `run_closed_job_history_etl`.
//   Replaces the live `hist_sql`/`closed_sql` scan entirely.
// - `"RemanLiveCache"` — one row per live-query cache key (`bench_queue`,
//   `actual_outcomes_today`), refreshed by whichever client's `cached_or_refresh`
//   call wins the claim.
// Both use the same "claim via one atomic conditional UPDATE" pattern —
// classic cache-stampede prevention, no external locking needed, and it
// composes cleanly since Postgres itself is the always-on coordination
// point regardless of which (if any) BRAXON client happens to be open.

// Skips the 17 sequential CREATE/ALTER/INSERT statements below once
// they've already run in this process — measured live 2026-08-31 while
// digging into "add a step takes 10+ seconds": ~280ms wasted on every
// single call to this function, and nearly every reman_* command (26
// call sites) calls it. All-idempotent DDL, safe to run more than once
// across separate BRAXON instances (that's the whole point of `IF NOT
// EXISTS`/`ON CONFLICT DO NOTHING`) — this just stops one already-running
// instance from re-verifying schema that hasn't changed since the last
// time it checked, moments ago in the same process.
static CACHE_TABLES_ENSURED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub async fn ensure_reman_cache_tables(client: &tokio_postgres::Client) -> Result<(), String> {
    if CACHE_TABLES_ENSURED.load(std::sync::atomic::Ordering::Relaxed) {
        return Ok(());
    }
    client
        .execute(
            r#"CREATE TABLE IF NOT EXISTS "RemanClosedJobHistory" (
                ligcde_id TEXT PRIMARY KEY,
                family TEXT,
                type_code TEXT,
                date_commande TEXT,
                date_closed TEXT,
                outcome TEXT NOT NULL,
                captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            r#"CREATE TABLE IF NOT EXISTS "RemanEtlState" (
                etl_key TEXT PRIMARY KEY,
                last_run_date TEXT,
                claimed_at TIMESTAMPTZ
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            r#"INSERT INTO "RemanEtlState" (etl_key, last_run_date, claimed_at)
               VALUES ('closed_job_history', NULL, NULL) ON CONFLICT DO NOTHING"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // '-infinity' default means a freshly-bootstrapped row always
            // looks stale to cached_or_refresh's claim query below — no
            // NULL special-casing needed there.
            r#"CREATE TABLE IF NOT EXISTS "RemanLiveCache" (
                cache_key TEXT PRIMARY KEY,
                payload_json TEXT,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT '-infinity'
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            r#"INSERT INTO "RemanLiveCache" (cache_key)
               VALUES ('bench_queue'), ('actual_outcomes_today'), ('shop_status') ON CONFLICT DO NOTHING"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // No row here means "not managed yet" — treated as active with
            // no roles assigned, matching pre-roster-feature behavior (see
            // "Technician roster" section below), so this table only ever
            // needs a row for someone the admin has actually touched.
            r#"CREATE TABLE IF NOT EXISTS "RemanTechnicianRoster" (
                tech_id TEXT PRIMARY KEY,
                is_technicien BOOLEAN NOT NULL DEFAULT false,
                is_commercial BOOLEAN NOT NULL DEFAULT false,
                is_responsable_technique BOOLEAN NOT NULL DEFAULT false,
                is_responsable_de_site BOOLEAN NOT NULL DEFAULT false,
                is_active BOOLEAN NOT NULL DEFAULT true,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // Added 2026-08-11 for the annual profit estimate — per-
            // technician monthly salary, same admin-only table as roles/
            // active-status since it's just as sensitive. A plain
            // `ALTER ... ADD COLUMN IF NOT EXISTS` rather than folding
            // into the `CREATE TABLE IF NOT EXISTS` above since that only
            // runs for a table that doesn't exist yet — this table
            // already does, on every BRAXON install predating this
            // change.
            r#"ALTER TABLE "RemanTechnicianRoster" ADD COLUMN IF NOT EXISTS salary_monthly DOUBLE PRECISION"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // Who's on cleaning duty — same shape as is_commercial, added
            // for the notification system below: requested directly
            // ("i want to know when it is cleaned... same for service
            // commercial"). No new role concept needed for commercial
            // (is_commercial already existed and already drives the
            // technician-leaderboard reattribution); cleaning had no
            // equivalent flag until now.
            r#"ALTER TABLE "RemanTechnicianRoster" ADD COLUMN IF NOT EXISTS is_cleaning BOOLEAN NOT NULL DEFAULT false"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // Shop-wide fixed costs for the same annual profit estimate —
            // one singleton row (id = 1), editable from the new admin-only
            // Finance tab. Revenue itself isn't stored here — it's already
            // computed precisely by `reman_analytics`'s `total_revenue`
            // (HT, validated within 0.4%-3.5% of the shop's own production
            // reports — see the "Revenue accuracy" investigation above);
            // the Finance tab just calls that with a trailing-365-day
            // window instead of duplicating the query. `stock_value` is a
            // plain editable number, not computed from `Stock.PA` —
            // checked live 2026-08-11 and every one of 779 `Stock` rows
            // already has a `DateSortie` set (some back to 2022), so
            // there's no reliable "still on the shelf right now" signal
            // to sum against; a wrong auto-number would be worse than an
            // honest manual one until that's sorted out with whoever
            // maintains inventory. `debt_balance` (outstanding, a balance-
            // sheet figure) and `debt_monthly_payment` (a real cash
            // outflow, folded into the profit estimate as an expense) are
            // kept separate on purpose — conflating them would either
            // hide the debt entirely or double-subtract it.
            r#"CREATE TABLE IF NOT EXISTS "RemanFinanceSettings" (
                id INTEGER PRIMARY KEY,
                rent_monthly DOUBLE PRECISION,
                electricity_monthly DOUBLE PRECISION,
                reimbursements_monthly DOUBLE PRECISION,
                insurance_monthly DOUBLE PRECISION,
                supplies_monthly DOUBLE PRECISION,
                subscriptions_monthly DOUBLE PRECISION,
                misc_monthly DOUBLE PRECISION,
                debt_balance DOUBLE PRECISION,
                debt_monthly_payment DOUBLE PRECISION,
                stock_value DOUBLE PRECISION,
                tax_rate_percent DOUBLE PRECISION,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // Added right after the table itself, same day — first real
            // use of the Finance tab against a real filed P&L showed the
            // naive salary-only labor cost was far too low. Employer
            // charges (charges patronales) as a % on top of salaries.
            r#"ALTER TABLE "RemanFinanceSettings" ADD COLUMN IF NOT EXISTS employer_charges_percent DOUBLE PRECISION"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // Personal (per-`tech_id`) saved comment snippets — requested
            // directly: frequently-typed comments (ER/ATN/close) should be
            // pickable instead of retyped every job. See "Saved notes &
            // Tests/Actions presets" below.
            r#"CREATE TABLE IF NOT EXISTS "RemanSavedComment" (
                id SERIAL PRIMARY KEY,
                tech_id TEXT NOT NULL,
                text TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // Personal saved Tests & Actions selections, scoped to a
            // `service` (Type_Service) since the selectable item set is
            // different per service — a preset saved on a 101 job is
            // meaningless applied to a 102 job. `param_ids_json` is a
            // JSON array of `NoInt_ParamTest` ints (same pattern as
            // `RemanLiveCache.payload_json`).
            r#"CREATE TABLE IF NOT EXISTS "RemanSavedTestActionPreset" (
                id SERIAL PRIMARY KEY,
                tech_id TEXT NOT NULL,
                service TEXT NOT NULL,
                name TEXT NOT NULL,
                param_ids_json TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // A daily, end-of-day freeze frame of the forecast — requested
            // directly ("take a snapshot but at 5:25pm... doesn't need to
            // be displayed") specifically so forecast accuracy can be
            // checked later against real numbers, since the live
            // comparison panel (see commands::ForecastComparison's doc
            // comment) deliberately keeps no history of its own. Not shown
            // anywhere in the UI — a data source for later analysis only.
            // `predicted_json`/`by_family_json` mirror `PredictedMix`/
            // `Vec<FamilyForecast>`, `actual_json` mirrors
            // `OutcomeBreakdown` — same "JSON as TEXT" pattern as
            // `RemanLiveCache.payload_json`. One row per calendar day
            // (`ON CONFLICT (snapshot_date) DO UPDATE`, not DO NOTHING —
            // safe to re-run mid-window if the first attempt raced with a
            // 4D hiccup).
            r#"CREATE TABLE IF NOT EXISTS "RemanForecastDailySnapshot" (
                id SERIAL PRIMARY KEY,
                snapshot_date TEXT NOT NULL UNIQUE,
                captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                units_with_tech INTEGER NOT NULL,
                predicted_json TEXT NOT NULL,
                by_family_json TEXT NOT NULL,
                actual_json TEXT NOT NULL,
                bench_units_json TEXT NOT NULL DEFAULT '[]'
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // bench_units_json was added after this table's first live
            // deploy (same day) — CREATE TABLE IF NOT EXISTS above won't
            // retrofit a column onto an already-existing table, so this
            // covers that case explicitly rather than requiring a manual
            // migration step. No-op once the column exists.
            r#"ALTER TABLE "RemanForecastDailySnapshot" ADD COLUMN IF NOT EXISTS bench_units_json TEXT NOT NULL DEFAULT '[]'"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            r#"INSERT INTO "RemanEtlState" (etl_key, last_run_date, claimed_at)
               VALUES ('forecast_snapshot', NULL, NULL) ON CONFLICT DO NOTHING"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // A technician's own confirmed read on a unit, keyed by
            // ligcde_id — see VerifiedFaultType's doc comment. One row per
            // job (ON CONFLICT DO UPDATE, not a history log — the latest
            // verification wins, same as any other "current state" field
            // in this file).
            r#"CREATE TABLE IF NOT EXISTS "RemanVerifiedFaultType" (
                ligcde_id TEXT PRIMARY KEY,
                fault_type TEXT NOT NULL,
                verified_by_tech_id TEXT NOT NULL,
                verified_by_tech_name TEXT,
                verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            r#"CREATE TABLE IF NOT EXISTS "RemanHydraulicReport" (
                id SERIAL PRIMARY KEY,
                ligcde_id TEXT NOT NULL,
                report_type TEXT NOT NULL,
                report_text TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // Repair Knowledge Base — requested directly: "i want a repair
            // section, that's gonna be better to search in that just
            // comments, where i give the fault code or description but
            // codify so it's easier to search from," with a worked
            // example (ECU ref, fault code 5DF5, likely-but-not-certain
            // cause, and the actual fix that worked). Lives here in
            // BRAXON's own Postgres, not 4D — this is proprietary tribal
            // knowledge REMAN's schema has no home for.
            // `fault_codes`/`cause_tags`/`fix_tags` are freeform TEXT[]
            // with autocomplete from prior entries (see
            // reman_list_knowledge_tag_suggestions) rather than a fixed
            // taxonomy — presented as the main design tradeoff and
            // confirmed directly ("yes exactly"): nothing to define or
            // maintain up front, tighten into a controlled vocabulary
            // later only if real usage shows it's needed.
            r#"CREATE TABLE IF NOT EXISTS "RemanKnowledgeEntry" (
                id SERIAL PRIMARY KEY,
                ecu_ref TEXT,
                ecu_brand TEXT,
                ecu_family TEXT,
                vehicle_make TEXT,
                vehicle_model TEXT,
                vehicle_year TEXT,
                fault_codes TEXT[] NOT NULL DEFAULT '{}',
                cause_tags TEXT[] NOT NULL DEFAULT '{}',
                fix_tags TEXT[] NOT NULL DEFAULT '{}',
                notes TEXT,
                linked_job_ids TEXT[] NOT NULL DEFAULT '{}',
                created_by_tech_id TEXT,
                created_by_tech_name TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // Requested directly, and explained with a real operational
            // cost: "if I mark a job attente de nettoyage, I want to know
            // when it is cleaned, same for service commercial, because
            // technicians only put units on the shelves, if they don't go
            // check all the time, they'll miss some stuff and it's the
            // same reason we have some units late." One row per recipient
            // per event (not one row fanned out at read time) — simplest
            // "mark this one read" semantics, and the volume here is
            // trivially small (a handful of hand-off events a day, times
            // a handful of recipients each). `kind` is a plain string tag
            // ("awaiting_cleaning", "transferred_commercial", ...) rather
            // than an enum column — new hand-off types can be added
            // without a migration, same reasoning as `Outcome::as_str`'s
            // stable-string-key choice elsewhere in this file.
            r#"CREATE TABLE IF NOT EXISTS "RemanNotification" (
                id SERIAL PRIMARY KEY,
                recipient_tech_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                ligcde_id TEXT NOT NULL,
                reference TEXT,
                message TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                read_at TIMESTAMPTZ
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            r#"CREATE INDEX IF NOT EXISTS reman_notification_recipient_idx
               ON "RemanNotification" (recipient_tech_id, read_at, created_at DESC)"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            // A soft "who's editing this right now" lock — requested
            // directly, as the other half of the stale-write problem: the
            // `job_is_closed` guard (see its doc comment) stops a stale
            // write from silently corrupting the outcome, but it does that
            // by *rejecting* the write after the fact. This table lets the
            // UI warn *before* that, the moment a second technician opens
            // a job someone else already has open: "show an error message
            // if an other user tries to open it at the same time, it's
            // gonna be view only." One row per currently-open job, not a
            // history — `ligcde_id` is the primary key, a fresh acquire
            // just overwrites it (see reman_acquire_job_lock). `expires_at`
            // rather than a hard release-only model: a technician closing
            // the app/losing connection without cleanly releasing must not
            // wedge a job view-only forever, so every lock self-expires
            // (see JOB_LOCK_TTL_SECONDS) and the frontend heartbeats it
            // while the job stays open.
            r#"CREATE TABLE IF NOT EXISTS "RemanJobLock" (
                ligcde_id TEXT PRIMARY KEY,
                tech_id TEXT NOT NULL,
                tech_name TEXT,
                acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                expires_at TIMESTAMPTZ NOT NULL
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    CACHE_TABLES_ENSURED.store(true, std::sync::atomic::Ordering::Relaxed);
    Ok(())
}

// Matches AUTO_REFRESH_MS (RemanForecast.tsx) / INTERVENTIONS_REFRESH_MS
// (Reman.tsx) — in steady state this means at most one client per interval
// actually reaches 4D per cache key, no matter how many are polling.
//
// Was 30s — reported directly (2026-08-31): a change made from the native
// 4D client (not BRAXON — so nothing in this app's own write-then-refresh
// path applies) could take "up to a minute" to show up for someone else
// watching the same queue in BRAXON. That's exactly this constant's worst
// case, not a bug: a change landing right after a cache refresh sits
// stale for up to LIVE_CACHE_TTL_SECONDS, and if a client's own poll
// happens to land inside that stale window it won't try again for up to
// INTERVENTIONS_REFRESH_MS more — 30s + 30s. Halved to close that gap
// (worst case now ~30s) — still a large reduction in real 4D load per
// client compared to no caching at all (every client hitting 4D on its
// own timer), just a tighter window.
const LIVE_CACHE_TTL_SECONDS: f64 = 15.0;

/// One atomic conditional UPDATE as the mutex: if it returns a row, this
/// caller won the claim (the cache was stale or never populated) and must
/// run `refresh` and write the result back. If it returns no rows, someone
/// else refreshed within the last `LIVE_CACHE_TTL_SECONDS` (or is
/// mid-refresh right now) — just read whatever's there.
///
/// `refresh` is an already-constructed `Future` (an `async {}` block), not
/// a closure — it's only actually polled here, either when this caller wins
/// the claim or (the narrow cold-start case right after table creation,
/// before anyone has ever completed a refresh) when the cached row's
/// `payload_json` is still NULL.
async fn cached_or_refresh(
    client: &tokio_postgres::Client,
    cache_key: &str,
    refresh: impl std::future::Future<Output = Result<String, String>>,
) -> Result<String, String> {
    let claim = client
        .query_opt(
            r#"UPDATE "RemanLiveCache" SET updated_at = now()
               WHERE cache_key = $1 AND updated_at < now() - make_interval(secs => $2)
               RETURNING payload_json"#,
            &[&cache_key, &LIVE_CACHE_TTL_SECONDS],
        )
        .await
        .map_err(|e| e.to_string())?;

    if claim.is_some() {
        let payload = refresh.await?;
        client
            .execute(
                r#"UPDATE "RemanLiveCache" SET payload_json = $2, updated_at = now() WHERE cache_key = $1"#,
                &[&cache_key, &payload],
            )
            .await
            .map_err(|e| e.to_string())?;
        return Ok(payload);
    }

    let row = client
        .query_one(r#"SELECT payload_json FROM "RemanLiveCache" WHERE cache_key = $1"#, &[&cache_key])
        .await
        .map_err(|e| e.to_string())?;
    match row.get::<_, Option<String>>(0) {
        Some(json) => Ok(json),
        None => refresh.await,
    }
}

/// Nightly ETL: re-scans the same `FORECAST_LOOKBACK_DAYS` window
/// `predicted_mix_from_family_counts` used to query 4D for directly, and
/// upserts every closed job into `"RemanClosedJobHistory"`. Idempotent and
/// safe to re-run any time (`ON CONFLICT ... DO UPDATE`), not just once a
/// day — `try_run_daily_etl` is what actually limits it to once a day.
async fn run_closed_job_history_etl(client: &tokio_postgres::Client) -> Result<usize, String> {
    let from = (Local::now().date_naive() - Duration::days(FORECAST_LOOKBACK_DAYS)).format("%Y-%m-%d").to_string();
    let to = Local::now().date_naive().format("%Y-%m-%d").to_string();

    let (hist_rows, closed_ids) = async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| -> Result<_, String> {
            // Same shape as the old live hist_sql, extended with DateCommande/
            // DateDernInterv so they can be persisted alongside the outcome.
            // i."Date"/i.HeureInterv/i.NoInt_interv (indices 5-7) are only
            // for picking the chronologically-latest row per job below —
            // TypeCode (r[2], what determines the persisted outcome) must
            // come from that specific row, not just whichever one
            // NoInt_interv-DESC happened to put first (see
            // is_more_recent_step's doc comment) — this feeds
            // "RemanClosedJobHistory", which the forecast panel's predicted
            // mix is trained on, so a wrong outcome here quietly skews
            // forecasts, not just a display label.
            // `l.NomClient <> ''` excludes internal core-processing jobs
            // (see StockProcessingRecord's doc comment) — this table trains
            // the forecast's predicted outcome mix, so letting stock-unit
            // triage (R/RAS/ND, no customer) leak in as if it were real
            // repair/NFF/ND customer outcomes would quietly skew every
            // prediction the forecast panel makes, not just a display
            // number.
            let hist_sql = format!(
                r#"SELECT l.NoInt_Ligcde, am.Designation, i.TypeCode, c.DateCommande, l.DateDernInterv,
                          i."Date", i.HeureInterv, i.NoInt_interv
                   FROM LigCde l
                   LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
                   LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
                   LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
                   WHERE c.DateCommande BETWEEN '{from}' AND '{to}' AND l.NomClient <> ''
                   ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
                   LIMIT 20000"#
            );
            let hist_rows = run_query(conn, &hist_sql)?;

            let closed_sql = format!(
                r#"SELECT l.NoInt_Ligcde FROM LigCde l
                   LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
                   WHERE l."Soldée" = True AND c.DateCommande BETWEEN '{from}' AND '{to}' AND l.NomClient <> ''
                   LIMIT 20000"#
            );
            let closed_ids: std::collections::HashSet<String> =
                run_query(conn, &closed_sql)?.into_iter().filter_map(|r| r[0].clone()).collect();

            Ok((hist_rows, closed_ids))
        })
    })
    .await
    .map_err(|e| e.to_string())??;

    // Same "chronologically-latest row per job" dedup as elsewhere in this
    // file — plain first-seen-in-SQL-order no longer reliably picks the
    // real latest row (see is_more_recent_step's doc comment).
    let mut latest_hist: std::collections::HashMap<String, Vec<Option<String>>> = std::collections::HashMap::new();
    for r in hist_rows {
        let id = r[0].clone().unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let replace = match latest_hist.get(&id) {
            None => true,
            Some(existing) => is_more_recent_step(
                &r[5], &r[6], r[7].as_deref().unwrap_or(""),
                &existing[5], &existing[6], existing[7].as_deref().unwrap_or(""),
            ),
        };
        if replace {
            latest_hist.insert(id, r);
        }
    }

    let mut ligcde_ids: Vec<String> = Vec::new();
    let mut families: Vec<String> = Vec::new();
    let mut type_codes: Vec<Option<String>> = Vec::new();
    let mut date_commandes: Vec<Option<String>> = Vec::new();
    let mut date_closeds: Vec<Option<String>> = Vec::new();
    let mut outcomes: Vec<String> = Vec::new();

    for (id, r) in latest_hist {
        if !closed_ids.contains(&id) {
            continue;
        }
        // Same "(unspecified)" fallback used everywhere else in this file
        // (reman_analytics, the live forecast) — keeps family keys
        // consistent between what queue_by_family looks up and what this
        // table stores, rather than storing NULL and never matching.
        let family = r[1].as_deref().and_then(derive_family).unwrap_or_else(|| "(unspecified)".to_string());
        let type_code = r[2].clone();
        let outcome = classify_outcome(true, type_code.as_deref());
        ligcde_ids.push(id);
        families.push(family);
        type_codes.push(type_code);
        date_commandes.push(r[3].clone());
        date_closeds.push(r[4].clone());
        outcomes.push(outcome.as_str().to_string());
    }

    let count = ligcde_ids.len();
    // std::time::SystemTime, not chrono::DateTime — tokio-postgres's chrono
    // integration needs an extra Cargo feature this project doesn't enable;
    // SystemTime <-> TIMESTAMPTZ works out of the box.
    let run_started_at = std::time::SystemTime::now();

    client
        .execute(
            r#"INSERT INTO "RemanClosedJobHistory"
                 (ligcde_id, family, type_code, date_commande, date_closed, outcome, captured_at)
               SELECT ligcde_id, family, type_code, date_commande, date_closed, outcome, $7
               FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
                 AS t(ligcde_id, family, type_code, date_commande, date_closed, outcome)
               ON CONFLICT (ligcde_id) DO UPDATE SET
                 family = EXCLUDED.family, type_code = EXCLUDED.type_code,
                 date_commande = EXCLUDED.date_commande, date_closed = EXCLUDED.date_closed,
                 outcome = EXCLUDED.outcome, captured_at = EXCLUDED.captured_at"#,
            &[&ligcde_ids, &families, &type_codes, &date_commandes, &date_closeds, &outcomes, &run_started_at],
        )
        .await
        .map_err(|e| e.to_string())?;

    // Mark-and-sweep: anything not touched by this run either fell out of
    // the rolling 180-day window or is otherwise stale. Safe to re-run —
    // every closed job currently in the window gets a fresh captured_at
    // every time this runs.
    client
        .execute(r#"DELETE FROM "RemanClosedJobHistory" WHERE captured_at < $1"#, &[&run_started_at])
        .await
        .map_err(|e| e.to_string())?;

    Ok(count)
}

/// Runs the ETL at most once per calendar day, however many BRAXON
/// instances happen to check. Claim window is 30 minutes (not tied to
/// LIVE_CACHE_TTL_SECONDS — this guards a long-running 4D scan, not a
/// cheap live query) so a crashed/killed instance mid-ETL doesn't wedge the
/// day's run forever; another tick (this instance or another) retries once
/// the claim goes stale. `last_run_date` is only written after success, so
/// a failed run leaves it eligible for a retry rather than silently
/// skipping the rest of the day.
async fn try_run_daily_etl(client: &tokio_postgres::Client) -> Result<bool, String> {
    let today = Local::now().format("%Y-%m-%d").to_string();
    let claimed = client
        .query_opt(
            r#"UPDATE "RemanEtlState" SET claimed_at = now()
               WHERE etl_key = 'closed_job_history'
                 AND last_run_date IS DISTINCT FROM $1
                 AND (claimed_at IS NULL OR claimed_at < now() - interval '30 minutes')
               RETURNING etl_key"#,
            &[&today],
        )
        .await
        .map_err(|e| e.to_string())?;

    if claimed.is_none() {
        return Ok(false);
    }

    run_closed_job_history_etl(client).await?;

    client
        .execute(
            r#"UPDATE "RemanEtlState" SET last_run_date = $1 WHERE etl_key = 'closed_job_history'"#,
            &[&today],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(true)
}

/// Background task, started once from `main.rs` next to
/// `spawn_local_proxy()`. No always-on dedicated server for BRAXON itself
/// (it's a desktop app) — Postgres is the always-on coordination point
/// instead, so "run once a day" is enforced by `try_run_daily_etl`'s claim
/// regardless of which client instance happens to be open when 3am rolls
/// around. Checks immediately on startup (not after the first sleep), so a
/// fresh launch at, say, 3:05am still catches that day's run.
pub fn spawn_etl_scheduler(db_config: Arc<Mutex<database::DbConfig>>) {
    async_runtime::spawn(async move {
        loop {
            if Local::now().hour() >= 3 {
                let config = db_config.lock().map(|c| c.clone()).ok();
                if let Some(config) = config {
                    match database::connect(&config).await {
                        Ok(client) => {
                            if let Err(e) = ensure_reman_cache_tables(&client).await {
                                eprintln!("[reman] ETL: failed to ensure cache tables: {e}");
                            } else if let Err(e) = try_run_daily_etl(&client).await {
                                eprintln!("[reman] ETL: daily run failed, will retry: {e}");
                            }
                        }
                        Err(e) => eprintln!("[reman] ETL: could not connect to Postgres: {e}"),
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(30 * 60)).await;
        }
    });
}

// ---- Daily forecast snapshot, 17:25 local (2026-08-06) ----
//
// Requested directly: "you can take a snapshot but at 5:25pm so we can see
// if what we're doing is accurate or not, but it doesn't need to be
// displayed." The live forecast-vs-actual panel (see
// `commands::ForecastComparison`'s doc comment) deliberately keeps no
// history — three earlier persisted-snapshot designs were tried and
// dropped the same day specifically because showing a frozen prediction
// *next to* the live one on screen was confusing. This isn't that: it's
// captured near end-of-day, written to Postgres only, never rendered
// anywhere — a record to query later (`"RemanForecastDailySnapshot"`), not a
// second number competing with the live one.
//
// Same claim-based "run once a day" pattern as `try_run_daily_etl`,
// reusing `"RemanEtlState"` with its own `etl_key` rather than a second
// coordination table.
//
// Per-unit dwell time (`bench_units_json` below) was added the same day,
// requested directly, specifically to answer two questions once several
// weeks of snapshots exist: whether units sitting on the bench are a
// biased (non-random) sample of arrivals — an "age-distribution decay
// curve" — and whether outcome mix actually shifts by how long a unit has
// been open (repaired-within-48h vs. still-open-after-7-days). Neither
// question is answerable from aggregate counts alone; both need each
// unit's individual dwell time recorded on every snapshot, so it's
// captured from day one rather than only added once the aggregate data
// turns out to be insufficient. `DateCommande` (the order date) is the
// same "intake" date `reman_analytics` already uses elsewhere in this
// file — not a new proxy.

#[derive(Serialize, Deserialize, Clone, Debug)]
struct BenchUnitSnapshot {
    id: String,
    family: String,
    days_on_bench: i64,
}

/// A separate, lighter-weight query from `forecast_open_queue_core`'s
/// cached "bench_queue" — this one only runs once a day (from the
/// snapshot capture), so there's no need to route it through the shared
/// 30-second cache the live-refreshing forecast panel depends on, and no
/// reason to burden that cache's payload with a per-unit list nobody
/// viewing the live panel needs.
fn bench_units_with_dwell(conn: &Connection<'static>) -> Result<Vec<BenchUnitSnapshot>, String> {
    // `l.NomClient <> ''` excludes internal core-processing jobs — see
    // StockProcessingRecord's doc comment.
    let rows = run_query(
        conn,
        r#"SELECT l.NoInt_Ligcde, am.Designation, l.DateLimiteLivraison, c.DateCommande
           FROM LigCde l
           LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
           LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
           WHERE l."Soldée" = False AND l.Type_Service IN ('100', '101', '102', '103')
             AND l.NomClient <> ''
           ORDER BY l.NoInt_Ligcde DESC
           LIMIT 5000"#,
    )?;

    let today = Local::now().date_naive();
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for r in rows {
        let id = r[0].clone().unwrap_or_default();
        if id.is_empty() || !seen.insert(id.clone()) {
            continue;
        }
        // Same dated + not-more-than-a-month-stale filter as
        // forecast_open_queue_core, so this list matches the same
        // population the live `units_with_tech` count represents.
        if r[2].is_none() || is_more_than_a_month_past(&r[2]) {
            continue;
        }
        let family = r[1].as_deref().and_then(derive_family).unwrap_or_else(|| "(unspecified)".to_string());
        let days_on_bench = to_ymd(&r[3])
            .and_then(|ymd| NaiveDate::parse_from_str(&ymd, "%Y-%m-%d").ok())
            .map(|intake| (today - intake).num_days())
            .unwrap_or(-1); // -1 = no DateCommande to compute from, flagged not hidden
        out.push(BenchUnitSnapshot { id, family, days_on_bench });
    }
    Ok(out)
}

async fn try_run_forecast_snapshot(client: &tokio_postgres::Client) -> Result<bool, String> {
    let today = Local::now().format("%Y-%m-%d").to_string();
    let claimed = client
        .query_opt(
            r#"UPDATE "RemanEtlState" SET claimed_at = now()
               WHERE etl_key = 'forecast_snapshot'
                 AND last_run_date IS DISTINCT FROM $1
                 AND (claimed_at IS NULL OR claimed_at < now() - interval '30 minutes')
               RETURNING etl_key"#,
            &[&today],
        )
        .await
        .map_err(|e| e.to_string())?;

    if claimed.is_none() {
        return Ok(false);
    }

    // Captures exactly what a user looking at the live panel would have
    // seen at this moment — same two functions, not a re-derived copy.
    let forecast = forecast_open_queue_core(client).await?;
    let actual = reman_actual_outcomes_today(client).await?;
    let bench_units = async_runtime::spawn_blocking(|| with_reman_connection(bench_units_with_dwell))
        .await
        .map_err(|e| e.to_string())??;

    let predicted_json = serde_json::to_string(&forecast.predicted).map_err(|e| e.to_string())?;
    let by_family_json = serde_json::to_string(&forecast.by_family).map_err(|e| e.to_string())?;
    let actual_json = serde_json::to_string(&actual).map_err(|e| e.to_string())?;
    let bench_units_json = serde_json::to_string(&bench_units).map_err(|e| e.to_string())?;
    let units_with_tech = forecast.units_with_tech as i32;

    client
        .execute(
            r#"INSERT INTO "RemanForecastDailySnapshot"
                 (snapshot_date, units_with_tech, predicted_json, by_family_json, actual_json, bench_units_json)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (snapshot_date) DO UPDATE SET
                 captured_at = now(), units_with_tech = $2, predicted_json = $3,
                 by_family_json = $4, actual_json = $5, bench_units_json = $6"#,
            &[&today, &units_with_tech, &predicted_json, &by_family_json, &actual_json, &bench_units_json],
        )
        .await
        .map_err(|e| e.to_string())?;

    client
        .execute(
            r#"UPDATE "RemanEtlState" SET last_run_date = $1 WHERE etl_key = 'forecast_snapshot'"#,
            &[&today],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(true)
}

/// Background task, started once from `main.rs` next to
/// `spawn_etl_scheduler`. Polls every 10 minutes (tighter than the ETL's 30
/// — the target time is specific, 17:25, not "sometime after 3am") and
/// fires once the clock has passed 17:25 local; the per-day claim in
/// `try_run_forecast_snapshot` makes it safe for multiple BRAXON instances
/// to all reach this check without double-capturing.
pub fn spawn_forecast_snapshot_scheduler(db_config: Arc<Mutex<database::DbConfig>>) {
    async_runtime::spawn(async move {
        loop {
            let now = Local::now();
            if now.hour() > 17 || (now.hour() == 17 && now.minute() >= 25) {
                let config = db_config.lock().map(|c| c.clone()).ok();
                if let Some(config) = config {
                    match database::connect(&config).await {
                        Ok(client) => {
                            if let Err(e) = ensure_reman_cache_tables(&client).await {
                                eprintln!("[reman] forecast snapshot: failed to ensure cache tables: {e}");
                            } else if let Err(e) = try_run_forecast_snapshot(&client).await {
                                eprintln!("[reman] forecast snapshot: capture failed, will retry: {e}");
                            }
                        }
                        Err(e) => eprintln!("[reman] forecast snapshot: could not connect to Postgres: {e}"),
                    }
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(10 * 60)).await;
        }
    });
}

// ---- Today's forecast for the technician bench (Suivi d'interventions) ----
//
// Requested directly: "how many units are with tech at this time and
// estimate how much repair exchange, nd, nff we are going to do... based
// on family." Not a real prediction model — a weighted average of each
// family's historical outcome mix (last `FORECAST_LOOKBACK_DAYS`, closed
// jobs only), applied to the units currently sitting in the Open queue.
// Small-sample families (a handful of historical jobs) will be noisy;
// that's surfaced via `historical_sample` per family rather than hidden.
// As of 2026-07-31 the historical half reads from Postgres
// ("RemanClosedJobHistory", backed nightly — see the section above), not
// 4D live; only the current bench population is still a live 4D read (and
// that one goes through the shared "bench_queue" cache).

const FORECAST_LOOKBACK_DAYS: i64 = 180;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PredictedMix {
    pub repaired: f64,
    pub non_repairable: f64,
    pub no_fault_found: f64,
    pub standard_exchange: f64,
    pub sold: f64,
    pub sent_to_subcontractor: f64,
    pub other: f64,
}

impl PredictedMix {
    /// Scales a family's historical `OutcomeBreakdown` (closed jobs only)
    /// into a per-unit probability distribution, then multiplies by how
    /// many units of that family are currently on the bench — e.g. 3 MK60
    /// units against a history of 24 repaired / 70 closed contributes
    /// `3 * 24/70 ≈ 1.03` expected repairs.
    fn from_family_rate(units: u32, historical: &OutcomeBreakdown) -> Self {
        let decided = (historical.repaired
            + historical.non_repairable
            + historical.no_fault_found
            + historical.standard_exchange
            + historical.sold
            + historical.sent_to_subcontractor
            + historical.other) as f64;
        if decided == 0.0 {
            return Self::default();
        }
        let units = units as f64;
        Self {
            repaired: units * historical.repaired as f64 / decided,
            non_repairable: units * historical.non_repairable as f64 / decided,
            no_fault_found: units * historical.no_fault_found as f64 / decided,
            standard_exchange: units * historical.standard_exchange as f64 / decided,
            sold: units * historical.sold as f64 / decided,
            sent_to_subcontractor: units * historical.sent_to_subcontractor as f64 / decided,
            other: units * historical.other as f64 / decided,
        }
    }

    fn add(&mut self, other: &PredictedMix) {
        self.repaired += other.repaired;
        self.non_repairable += other.non_repairable;
        self.no_fault_found += other.no_fault_found;
        self.standard_exchange += other.standard_exchange;
        self.sold += other.sold;
        self.sent_to_subcontractor += other.sent_to_subcontractor;
        self.other += other.other;
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FamilyForecast {
    pub family: String,
    pub units_with_tech: u32,
    pub historical_sample: u32,
    pub predicted: PredictedMix,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OpenQueueForecast {
    pub units_with_tech: u32,
    pub unforecastable: u32,
    pub predicted: PredictedMix,
    pub by_family: Vec<FamilyForecast>,
    pub lookback_days: i64,
}

/// Given how many units currently on the bench fall into each family,
/// looks up each family's closed-job outcome mix over the last
/// `FORECAST_LOOKBACK_DAYS` days and returns the aggregate predicted mix,
/// the count with no historical data at all, and per-family detail.
///
/// As of 2026-07-31 this reads from Postgres `"RemanClosedJobHistory"`
/// (kept current by the nightly `run_closed_job_history_etl`) instead of
/// running the 180-day `hist_sql`/`closed_sql` scan against 4D live — this
/// was the single heaviest recurring 4D query, run by every client on every
/// forecast refresh. See the "Shared Postgres cache" section above.
async fn predicted_mix_from_family_counts(
    client: &tokio_postgres::Client,
    family_counts: &std::collections::HashMap<String, u32>,
) -> Result<(PredictedMix, u32, Vec<FamilyForecast>), String> {
    // Only families that matter to the caller need outcome stats built —
    // no need to compute a rate for every family REMAN has ever seen.
    let families: Vec<&str> = family_counts.keys().map(|s| s.as_str()).collect();
    let rows = client
        .query(
            r#"SELECT family, outcome, COUNT(*) FROM "RemanClosedJobHistory"
               WHERE family = ANY($1) GROUP BY family, outcome"#,
            &[&families],
        )
        .await
        .map_err(|e| e.to_string())?;

    let mut hist_by_family: std::collections::HashMap<String, OutcomeBreakdown> = std::collections::HashMap::new();
    for row in rows {
        let family: String = row.get(0);
        let outcome: String = row.get(1);
        let count: i64 = row.get(2);
        add_outcome_count(hist_by_family.entry(family).or_default(), &outcome, count as u32);
    }

    let mut predicted = PredictedMix::default();
    let mut unforecastable = 0u32;
    let mut by_family: Vec<FamilyForecast> = Vec::new();
    for (family, &units) in family_counts {
        let historical = hist_by_family.get(family).cloned().unwrap_or_default();
        let sample = historical.repaired
            + historical.non_repairable
            + historical.no_fault_found
            + historical.standard_exchange
            + historical.sold
            + historical.sent_to_subcontractor
            + historical.other;
        if sample == 0 {
            unforecastable += units;
        }
        let family_predicted = PredictedMix::from_family_rate(units, &historical);
        predicted.add(&family_predicted);
        by_family.push(FamilyForecast {
            family: family.clone(),
            units_with_tech: units,
            historical_sample: sample,
            predicted: family_predicted,
        });
    }
    by_family.sort_by(|a, b| b.units_with_tech.cmp(&a.units_with_tech));

    Ok((predicted, unforecastable, by_family))
}

/// Bench-population half of `reman_forecast_open_queue`'s payload — cached
/// under the `"bench_queue"` key so only one client per
/// `LIVE_CACHE_TTL_SECONDS` window actually queries 4D for it.
#[derive(Serialize, Deserialize)]
struct CachedBenchQueue {
    units_with_tech: u32,
    family_counts: std::collections::HashMap<String, u32>,
}

#[tauri::command]
pub async fn reman_forecast_open_queue(state: State<'_, AppState>) -> Result<OpenQueueForecast, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_reman_cache_tables(&client).await?;
    forecast_open_queue_core(&client).await
}

/// The actual work behind `reman_forecast_open_queue`, taking a plain
/// `&tokio_postgres::Client` instead of Tauri's `State` — factored out so
/// the daily snapshot scheduler (`spawn_forecast_snapshot_scheduler`,
/// which runs as a background task with no `State` to construct) can call
/// the exact same logic a user would see live, not a re-derived copy of it.
async fn forecast_open_queue_core(client: &tokio_postgres::Client) -> Result<OpenQueueForecast, String> {
    let json = cached_or_refresh(client, "bench_queue", async {
        async_runtime::spawn_blocking(|| with_reman_connection(|conn| -> Result<String, String> {
            // Current bench population — same WHERE and Rust-side filtering
            // as InterventionQueue::Open in reman_search_interventions
            // (category exclusion, date required, staleness cutoff), plus
            // Designation from ArticleMeteor, parsed via derive_family()
            // (see the intake_sql comment in reman_analytics — same
            // reasoning, same parsing).
            // `l.NomClient <> ''` excludes internal core-processing jobs
            // (see StockProcessingRecord's doc comment) — otherwise a
            // stock unit mid-triage would count toward "units on the
            // bench," inflating the live count with work that isn't a
            // customer's unit.
            let queue_sql = r#"SELECT l.NoInt_Ligcde, am.Designation, l.DateLimiteLivraison, i.TypeCode
                                FROM LigCde l
                                LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
                                LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
                                WHERE l."Soldée" = False AND l.Type_Service IN ('100', '101', '102', '103')
                                  AND l.NomClient <> ''
                                ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
                                LIMIT 5000"#;
            let queue_rows = run_query(conn, queue_sql)?;

            let mut seen = std::collections::HashSet::new();
            let mut queue_by_family: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
            let mut units_with_tech = 0u32;
            for r in queue_rows {
                let id = r[0].clone().unwrap_or_default();
                if id.is_empty() || !seen.insert(id.clone()) {
                    continue;
                }
                // Unlike reman_search_interventions's Open queue, this does
                // NOT exclude "categorized" sub-statuses (AP/ARC/ATN/etc.) —
                // that exclusion exists there only to avoid double-showing a
                // job across UI sub-tabs (Suivi d'interventions vs. Attente de
                // Pièces vs. ...), which doesn't apply to a single aggregate
                // forecast number. Excluding it here made the count swing on
                // pure status changes rather than real arrivals/departures:
                // reported directly, "i just saw the forecast go from 7 to 6
                // ... i actually moved to cleaning and it changed which
                // shouldn't be the case" — a unit moving into "Attente de
                // Nettoyage" is still on the bench, not gone. Now this only
                // changes when a unit actually joins (a fresh, dated,
                // non-stale open job) or leaves (Soldée flips to True).
                if r[2].is_none() || is_more_than_a_month_past(&r[2]) {
                    continue;
                }
                units_with_tech += 1;
                let family = r[1]
                    .as_deref()
                    .and_then(derive_family)
                    .unwrap_or_else(|| "(unspecified)".to_string());
                *queue_by_family.entry(family).or_default() += 1;
            }

            serde_json::to_string(&CachedBenchQueue { units_with_tech, family_counts: queue_by_family })
                .map_err(|e| e.to_string())
        }))
        .await
        .map_err(|e| e.to_string())?
    })
    .await?;
    let cached: CachedBenchQueue = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    // Historical outcome mix per family, closed jobs only — now a Postgres
    // read (see predicted_mix_from_family_counts's doc comment).
    let (predicted, unforecastable, by_family) =
        predicted_mix_from_family_counts(client, &cached.family_counts).await?;

    Ok(OpenQueueForecast {
        units_with_tech: cached.units_with_tech,
        unforecastable,
        predicted,
        by_family,
        lookback_days: FORECAST_LOOKBACK_DAYS,
    })
}

/// Every bench job (`Type_Service` in the same 100/101/102/103 set the
/// forecast itself covers) that's `Soldée = True` with `DateDernInterv`
/// matching today, classified by outcome — shop-wide. A job doesn't need
/// to have ever been polled open by this app to count here, only that it
/// closed today. This is the "actual" side of the forecast-vs-actual
/// comparison; see `commands::reman_compare_forecast_to_actual` for the
/// full history of design attempts this replaced. Not a `#[tauri::
/// command]` — called from `commands::reman_compare_forecast_to_actual`.
/// Cached under the `"actual_outcomes_today"` key (see the "Shared
/// Postgres cache" section above) — the underlying query is lighter than
/// the historical scan Part A removed, but still one every 15 clients
/// would otherwise run independently every `LIVE_CACHE_TTL_SECONDS`.
pub async fn reman_actual_outcomes_today(client: &tokio_postgres::Client) -> Result<OutcomeBreakdown, String> {
    ensure_reman_cache_tables(client).await?;
    let json = cached_or_refresh(client, "actual_outcomes_today", async {
        let today = Local::now().format("%d/%m/%Y").to_string();
        async_runtime::spawn_blocking(move || with_reman_connection(|conn| -> Result<String, String> {
            // i."Date"/i.HeureInterv/i.NoInt_interv (indices 3-5) are only
            // for picking the chronologically-latest row per job below —
            // TypeCode (r[2]) must come from that specific row, not just
            // whichever one NoInt_interv-DESC happened to put first (see
            // is_more_recent_step's doc comment).
            // `l.NomClient <> ''` excludes internal core-processing jobs —
            // see StockProcessingRecord's doc comment.
            let sql = r#"SELECT l.NoInt_Ligcde, l.DateDernInterv, i.TypeCode,
                                i."Date", i.HeureInterv, i.NoInt_interv
                          FROM LigCde l
                          LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
                          WHERE l."Soldée" = True AND l.Type_Service IN ('100', '101', '102', '103')
                            AND l.NomClient <> ''
                          ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
                          LIMIT 5000"#;
            let rows = run_query(conn, sql)?;

            let mut latest: std::collections::HashMap<String, Vec<Option<String>>> = std::collections::HashMap::new();
            for r in rows {
                let id = r[0].clone().unwrap_or_default();
                if id.is_empty() {
                    continue;
                }
                let replace = match latest.get(&id) {
                    None => true,
                    Some(existing) => is_more_recent_step(
                        &r[3], &r[4], r[5].as_deref().unwrap_or(""),
                        &existing[3], &existing[4], existing[5].as_deref().unwrap_or(""),
                    ),
                };
                if replace {
                    latest.insert(id, r);
                }
            }

            let mut outcomes = OutcomeBreakdown::default();
            for r in latest.values() {
                // DateDernInterv comes back as "DD/MM/YYYY" with no time
                // component (confirmed live) — safe to compare as a plain
                // string against today's date in the same format.
                if r[1].as_deref() != Some(today.as_str()) {
                    continue;
                }
                outcomes.add(classify_outcome(true, r[2].as_deref()));
            }
            serde_json::to_string(&outcomes).map_err(|e| e.to_string())
        }))
        .await
        .map_err(|e| e.to_string())?
    })
    .await?;

    serde_json::from_str(&json).map_err(|e| e.to_string())
}

// ---- Shop status snapshot + closed-on-a-day outcome mix (2026-08-27) ----
//
// Requested directly: "units in per day is not very important for me and
// it seems to be wrong anyway, the most interesting data is the units
// that are in the shop, in hands of technicians or waiting for
// information or devis, and where we have the mix of outcomes, i want to
// know how many units we closed, like today, i see 19 so far in 4D, some
// ND some NFF, some repairs and standard exchanges and also validation
// sous traitance other days." Two new live views, replacing
// `RemanAnalytics.dailyIntake`'s per-day average as the frontend's
// headline number (that average was scoped to intake date, not close
// date — a different question than "how many did we actually finish").
//
// **Correction, same day**: first version counted `total_open = 9461` —
// reported back immediately as "complete nonsense, we don't have 9000
// units in the shop," with a direct instruction to dig into why rather
// than accept it. Root cause: the query only scoped `LigCde."Soldée" =
// False` and never applied `Commande.StatutDossier`'s existing, already-
// proven-necessary exclusion — the same `ATTENTE ACCORD`/`CLOTURE`
// filter `reman_analytics`'s own intake query has used since before this
// feature existed (see its doc comment above), just not carried over
// here. Verified live before fixing (`scripts/_scratch-attente-accord-
// investigation.mjs`): of 300 sampled `ATTENTE ACCORD` open jobs, **0**
// had ever had a single `Intervention` row — a quote sent, waiting on
// the client's initial go-ahead, before any technician ever touches the
// unit. That status alone accounted for 7055 of the 9461; `CLOTURE`
// (administratively voided, not a real job in any sense — see the
// existing doc comment above) accounted for another 2359. Together,
// 99%+ of the original number was never real shop-floor presence.
//
// Fixed by joining `Commande` too and splitting the population three
// ways: `CLOTURE` is dropped entirely (dead, not shown anywhere).
// `ATTENTE ACCORD` is kept but reported as its own explicit
// `awaiting_customer_agreement` figure, deliberately *not* folded into
// `total_open` or any bucket below — it's a commercial backlog of
// pending quotes (some sit unanswered indefinitely, per the existing
// exclusion's own doc comment), not units a technician is doing anything
// with. Everything else becomes `total_open`, bucketed by TypeCode as
// before: `AP` "Attente de Pièces" (parts), `ARC` "Attente
// Renseignements" / `RRC` "Réponse Rens. Clt" (info, same conversation
// both sides), `ARD` "Attente Réponse Devis" / `DA` "Devis - Réponse
// Client" (a technician mid-repair needing a *revised* quote approved —
// a real, active-shop scenario, distinct from `ATTENTE ACCORD`'s
// never-started backlog even though both are "waiting on the client for
// money"), `ATN` "Attente de nettoyage" (cleaning), `ER`/`PA`/no
// TypeCode (not hand-offs, still active technician work — see
// `CATEGORIZED_TYPE_CODES`'s doc comment), `TES`/`VAL`/`ST` folded into
// `other`. `total_open` always equals the sum of the six buckets below
// exactly.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ShopStatusSnapshot {
    pub total_open: u32,
    pub with_technician: u32,
    pub awaiting_parts: u32,
    pub awaiting_info: u32,
    pub awaiting_devis: u32,
    pub awaiting_cleaning: u32,
    pub other: u32,
    pub awaiting_customer_agreement: u32,
}

// **Second correction, next day (2026-08-29)**: reported directly again,
// with a screenshot — "that is wrong, we don't have 35 units in the shop
// right now, what the forecast component gets is closer to reality in
// its bench mix right now i think, also 7000 units awaiting quotes when
// we only had 4000 units for an entire year come on."
//
// Two more real bugs, both confirmed live before fixing
// (`scripts/_scratch-shop-status-staleness-investigation.mjs`):
//
// 1. `total_open` never applied the staleness filter
//    `forecast_open_queue_core`'s own `units_with_tech` count already
//    uses (`DateLimiteLivraison` required, not more than a month past —
//    see its doc comment, cross-checked once against a real 16-job
//    worklist). Of the 47 jobs the first fix left in `total_open`, only
//    **13** actually had a fresh delivery deadline; 33 had none set at
//    all, 1 was over a month overdue. A job with no delivery deadline at
//    all isn't necessarily "in the shop" in any live sense — the
//    forecast panel already reached that conclusion and was right to,
//    per the user. Reusing its exact filter here (rather than a second,
//    independently-invented "is this job real" definition) instead of
//    re-litigating it.
//
// 2. `awaiting_customer_agreement` had no recency bound at all — every
//    `ATTENTE ACCORD` job ever created, forever. Checked the age
//    distribution: of 7057, only 165 were ≤30 days old; **4948 (70%)
//    were over a year old**. The shop's entire trailing-365-day closed
//    volume (bench jobs) is 4114 — so a live "quotes awaiting an answer"
//    figure bigger than a full year of total throughput was never
//    plausible, exactly the sanity check the user ran. Bounded to the
//    same 30-day cutoff as everything else in this file
//    (`is_more_than_a_month_past`) rather than inventing a new threshold
//    — a quote nobody's answered in over a month isn't "pending" in any
//    actionable sense, it's abandoned.
fn shop_status_core(conn: &Connection<'static>) -> Result<ShopStatusSnapshot, String> {
    let rows = run_query(
        conn,
        r#"SELECT l.NoInt_Ligcde, c.StatutDossier, c.DateCommande, l.DateLimiteLivraison,
                  i.TypeCode, i."Date", i.HeureInterv, i.NoInt_interv
           FROM LigCde l
           LEFT JOIN Commande c ON l.NoInt_cde = c.NoInt_Cde
           LEFT JOIN Intervention i ON l.NoInt_Ligcde = i.NoIntLigcde
           WHERE l."Soldée" = False AND l.Type_Service IN ('100', '101', '102', '103') AND l.NomClient <> ''
           ORDER BY l.NoInt_Ligcde DESC, i.NoInt_interv DESC
           LIMIT 20000"#,
    )?;

    // (StatutDossier, DateCommande, DateLimiteLivraison) — all per-job
    // (one Commande/LigCde row per job, no fan-out), so "first value
    // seen" is enough; no latest-step comparison needed for these three.
    let mut job_fields: std::collections::HashMap<String, (Option<String>, Option<String>, Option<String>)> =
        std::collections::HashMap::new();
    let mut latest_step: std::collections::HashMap<String, Vec<Option<String>>> = std::collections::HashMap::new();
    for r in rows {
        let id = r[0].clone().unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        job_fields.entry(id.clone()).or_insert_with(|| (r[1].clone(), r[2].clone(), r[3].clone()));
        let replace = match latest_step.get(&id) {
            None => true,
            Some(existing) => is_more_recent_step(
                &r[5], &r[6], r[7].as_deref().unwrap_or(""),
                &existing[5], &existing[6], existing[7].as_deref().unwrap_or(""),
            ),
        };
        if replace {
            latest_step.insert(id, r);
        }
    }

    let mut snap = ShopStatusSnapshot::default();
    for (id, (status, date_commande, date_limite)) in &job_fields {
        match status.as_deref().unwrap_or("") {
            "CLOTURE" => continue,
            "ATTENTE ACCORD" => {
                if !is_more_than_a_month_past(date_commande) {
                    snap.awaiting_customer_agreement += 1;
                }
                continue;
            }
            _ => {}
        }
        // Same "has a real, current delivery deadline" requirement as
        // forecast_open_queue_core's units_with_tech — see the doc
        // comment above.
        if date_limite.is_none() || is_more_than_a_month_past(date_limite) {
            continue;
        }
        snap.total_open += 1;
        let type_code = latest_step.get(id).and_then(|r| r[4].as_deref());
        match type_code {
            Some("AP") => snap.awaiting_parts += 1,
            Some("ARC") | Some("RRC") => snap.awaiting_info += 1,
            Some("ARD") | Some("DA") => snap.awaiting_devis += 1,
            Some("ATN") => snap.awaiting_cleaning += 1,
            None | Some("ER") | Some("PA") => snap.with_technician += 1,
            Some(_) => snap.other += 1,
        }
    }
    Ok(snap)
}

/// Cached under `"shop_status"` — same shared-cache reasoning as
/// `bench_queue`/`actual_outcomes_today` above (up to 15 clients would
/// otherwise all hit 4D independently every refresh).
async fn reman_shop_status_snapshot(client: &tokio_postgres::Client) -> Result<ShopStatusSnapshot, String> {
    ensure_reman_cache_tables(client).await?;
    let json = cached_or_refresh(client, "shop_status", async {
        let snap = async_runtime::spawn_blocking(|| with_reman_connection(shop_status_core))
            .await
            .map_err(|e| e.to_string())??;
        serde_json::to_string(&snap).map_err(|e| e.to_string())
    })
    .await?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reman_shop_status(state: State<'_, AppState>) -> Result<ShopStatusSnapshot, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    reman_shop_status_snapshot(&pg).await
}

// `reman_closed_on_day` (a per-day version of the outcome mix,
// "ClosedDaySnapshot") lived here — removed 2026-08-28, the same day it
// was added. It existed to work around `reman_analytics`'s outcome mix
// being wrong for short/recent ranges (intake-date-scoped instead of
// close-date-scoped — see the "Outcome mix, by close date" doc comment
// above `reman_analytics`'s `outcome_sql`). Once that root cause was
// fixed, `reman_analytics` with `fromDate == toDate` already *is* this
// view — a special case wasn't needed, it was a symptom.

// ---- Predicted-for-today, cumulative (2026-08-06) ----
//
// Reported directly against the live comparison panel: "it was 12 all day
// now it just dropped suddenly to 8... the only thing that should make it
// change its prediction is new units coming in, and they can't possibly
// decrease the repair numbers right?" The panel's `predicted` had always
// been `reman_forecast_open_queue`'s live number — a rate applied to
// *whatever's currently on the bench*, which moves both ways (grows on
// arrival, shrinks on close). Confirmed live the mechanism was real (today
// had 25 new arrivals and 18 closures — genuinely high churn, the live
// count swings a lot), but the user's actual ask is a different metric: a
// running total for the day that only ever grows.
//
// This is, on paper, the second of the three designs `commands::
// ForecastComparison` already tried and dropped ("growing that same
// snapshot's id list... recomputing its predicted mix as new units
// landed") — abandoned then because it showed a second, differently-
// scoped number next to the live one and confused which was which.
// Explicitly re-requested this time, with the display problem to be
// solved separately (see RemanForecast.tsx) rather than by reverting the
// underlying idea. The earlier version's OTHER flaw — "missed real
// same-day repairs whenever a job wasn't polled while still open" — was
// specific to *client-side polling* building the tracked id list; this
// version has no client-side tracking at all, just a stateless server-
// side query re-run on every call, so that failure mode doesn't apply.
//
// "Today's population" = every bench job (`Type_Service` in 100-103)
// that's either currently open (same criteria as `forecast_open_queue_core`)
// or was closed today. A unit that closes today stops matching the first
// branch but starts matching the second, so the union never actually
// loses a member during the day — it only grows, exactly the "new units
// coming in" framing. Two separate simple queries + a Rust-side union,
// not one query OR-ing `"Soldée" = True`/`False` together — combining a
// Boolean column with a second condition in ways that haven't been
// proven live is exactly the shape of dialect bug documented on
// `run_query`, so this stays with the same two-queries-unioned-in-Rust
// pattern already used everywhere else in this file for Boolean columns.
fn todays_bench_population(conn: &Connection<'static>) -> Result<std::collections::HashMap<String, u32>, String> {
    let mut ids_seen = std::collections::HashSet::new();
    let mut family_counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();

    // `l.NomClient <> ''` excludes internal core-processing jobs (both
    // branches below) — see StockProcessingRecord's doc comment.
    let open_rows = run_query(
        conn,
        r#"SELECT l.NoInt_Ligcde, am.Designation, l.DateLimiteLivraison
           FROM LigCde l
           LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
           WHERE l."Soldée" = False AND l.Type_Service IN ('100', '101', '102', '103')
             AND l.NomClient <> ''
           ORDER BY l.NoInt_Ligcde DESC
           LIMIT 5000"#,
    )?;
    for r in open_rows {
        let id = r[0].clone().unwrap_or_default();
        if id.is_empty() || !ids_seen.insert(id) {
            continue;
        }
        if r[2].is_none() || is_more_than_a_month_past(&r[2]) {
            continue;
        }
        let family = r[1].as_deref().and_then(derive_family).unwrap_or_else(|| "(unspecified)".to_string());
        *family_counts.entry(family).or_default() += 1;
    }

    let today = Local::now().format("%d/%m/%Y").to_string();
    let closed_rows = run_query(
        conn,
        r#"SELECT l.NoInt_Ligcde, am.Designation, l.DateDernInterv
           FROM LigCde l
           LEFT JOIN ArticleMeteor am ON l.CodeArt = am.CodeArt
           WHERE l."Soldée" = True AND l.Type_Service IN ('100', '101', '102', '103')
             AND l.NomClient <> ''
           ORDER BY l.NoInt_Ligcde DESC
           LIMIT 5000"#,
    )?;
    for r in closed_rows {
        let id = r[0].clone().unwrap_or_default();
        if id.is_empty() || !ids_seen.insert(id) {
            continue;
        }
        // Same "DD/MM/YYYY, no time component" string compare as
        // reman_actual_outcomes_today.
        if r[2].as_deref() != Some(today.as_str()) {
            continue;
        }
        let family = r[1].as_deref().and_then(derive_family).unwrap_or_else(|| "(unspecified)".to_string());
        *family_counts.entry(family).or_default() += 1;
    }

    Ok(family_counts)
}

/// Applies the same per-family historical rate `forecast_open_queue_core`
/// uses, but to `todays_bench_population`'s union instead of the live
/// open-bench count — see the module doc comment above for why. Not a
/// `#[tauri::command]` — called from `commands::reman_compare_forecast_to_actual`,
/// same pattern as `reman_actual_outcomes_today`.
pub async fn forecast_today_cumulative(client: &tokio_postgres::Client) -> Result<(u32, PredictedMix), String> {
    let family_counts = async_runtime::spawn_blocking(|| with_reman_connection(todays_bench_population))
        .await
        .map_err(|e| e.to_string())??;
    let units_today: u32 = family_counts.values().sum();
    let (predicted, _unforecastable, _by_family) = predicted_mix_from_family_counts(client, &family_counts).await?;
    Ok((units_today, predicted))
}

// ---- Technician roster (roles + active/inactive), 2026-08-04 ----
//
// Requested directly: an admin-only page to assign roles (technicien,
// commercial, responsable technique, responsable de site — someone can
// hold more than one, e.g. responsable technique *and* technicien) to each
// real technician id, and to mark people who've left so they stop showing
// up in current-facing views (the My Jobs picker, the analytics
// leaderboard) without touching their historical closed jobs at all.
//
// 4D has no concept of any of this (no role field, no active flag on
// `Salarie`/whatever backs `NomDernierTech`) and isn't the right place for
// it anyway — this is BRAXON's own read on the roster, layered on top of
// 4D's real technician ids via `technician_name_map`, entirely in
// BRAXON's own Postgres (`"RemanTechnicianRoster"`).

/// The only identity allowed to read/write the roster — Gabhy Kiba, who
/// requested this feature explicitly as "hidden for everyone else but
/// me." Checked server-side (not just hidden in the UI) since the roster
/// write endpoint is otherwise reachable by anyone who can call a Tauri
/// command.
const ROSTER_ADMIN_TECH_ID: &str = "3569";

async fn inactive_tech_ids(client: &tokio_postgres::Client) -> Result<std::collections::HashSet<String>, String> {
    let rows = client
        .query(r#"SELECT tech_id FROM "RemanTechnicianRoster" WHERE is_active = false"#, &[])
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|r| r.get(0)).collect())
}

/// Ids the roster explicitly marks `is_commercial = true` — used by
/// `reman_analytics`'s technician-attribution reattribution (see its
/// "Roster-driven reattribution" doc comment). Same permissive default as
/// `inactive_tech_ids`/every other roster-backed check in this file: no
/// row at all means "not managed yet," treated as a real technician, not
/// as commercial — only an explicit flag triggers reattribution.
async fn commercial_tech_ids(client: &tokio_postgres::Client) -> Result<std::collections::HashSet<String>, String> {
    let rows = client
        .query(r#"SELECT tech_id FROM "RemanTechnicianRoster" WHERE is_commercial = true"#, &[])
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|r| r.get(0)).collect())
}

/// Ids the roster explicitly marks `is_cleaning = true` — the
/// notification system's recipient list for "job marked awaiting
/// cleaning" events. Same permissive default as `commercial_tech_ids`: no
/// row means "not on cleaning duty," not an error.
async fn cleaning_tech_ids(client: &tokio_postgres::Client) -> Result<std::collections::HashSet<String>, String> {
    let rows = client
        .query(r#"SELECT tech_id FROM "RemanTechnicianRoster" WHERE is_cleaning = true"#, &[])
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|r| r.get(0)).collect())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RosterEntry {
    pub tech_id: String,
    pub tech_name: String,
    pub is_technicien: bool,
    pub is_commercial: bool,
    pub is_cleaning: bool,
    pub is_responsable_technique: bool,
    pub is_responsable_de_site: bool,
    pub is_active: bool,
    pub salary_monthly: Option<f64>,
}

/// Full roster for the admin page — every technician id `technician_name_map`
/// has ever resolved a name for (same live 4D source as `reman_list_technicians`),
/// left-joined against whatever role/active state has been set in Postgres.
/// An id with no Postgres row yet shows as active with no roles assigned —
/// the same as it behaved before this feature existed.
#[tauri::command]
pub async fn reman_list_roster(requesting_tech_id: String, state: State<'_, AppState>) -> Result<Vec<RosterEntry>, String> {
    if requesting_tech_id != ROSTER_ADMIN_TECH_ID {
        return Err("Not authorized".to_string());
    }
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_reman_cache_tables(&client).await?;

    let name_map = async_runtime::spawn_blocking(|| with_reman_connection(technician_name_map))
        .await
        .map_err(|e| e.to_string())??;

    let rows = client
        .query(
            r#"SELECT tech_id, is_technicien, is_commercial, is_cleaning, is_responsable_technique, is_responsable_de_site, is_active, salary_monthly
               FROM "RemanTechnicianRoster""#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    #[allow(clippy::type_complexity)]
    let mut roster: std::collections::HashMap<String, (bool, bool, bool, bool, bool, bool, Option<f64>)> = std::collections::HashMap::new();
    for row in rows {
        let tech_id: String = row.get(0);
        roster.insert(tech_id, (row.get(1), row.get(2), row.get(3), row.get(4), row.get(5), row.get(6), row.get(7)));
    }

    let mut out: Vec<RosterEntry> = name_map
        .into_iter()
        .filter(|(id, name)| id != "0" && !name.eq_ignore_ascii_case("Superviseur"))
        .map(|(tech_id, tech_name)| {
            let (is_technicien, is_commercial, is_cleaning, is_responsable_technique, is_responsable_de_site, is_active, salary_monthly) =
                roster.get(&tech_id).cloned().unwrap_or((false, false, false, false, false, true, None));
            RosterEntry {
                tech_id,
                tech_name,
                is_technicien,
                is_commercial,
                is_cleaning,
                is_responsable_technique,
                is_responsable_de_site,
                is_active,
                salary_monthly,
            }
        })
        .collect();
    out.sort_by(|a, b| a.tech_name.cmp(&b.tech_name));
    Ok(out)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn reman_update_roster_entry(
    requesting_tech_id: String,
    tech_id: String,
    is_technicien: bool,
    is_commercial: bool,
    is_cleaning: bool,
    is_responsable_technique: bool,
    is_responsable_de_site: bool,
    is_active: bool,
    salary_monthly: Option<f64>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if requesting_tech_id != ROSTER_ADMIN_TECH_ID {
        return Err("Not authorized".to_string());
    }
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_reman_cache_tables(&client).await?;
    client
        .execute(
            r#"INSERT INTO "RemanTechnicianRoster"
                 (tech_id, is_technicien, is_commercial, is_cleaning, is_responsable_technique, is_responsable_de_site, is_active, salary_monthly, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
               ON CONFLICT (tech_id) DO UPDATE SET
                 is_technicien = $2, is_commercial = $3, is_cleaning = $4, is_responsable_technique = $5,
                 is_responsable_de_site = $6, is_active = $7, salary_monthly = $8, updated_at = now()"#,
            &[&tech_id, &is_technicien, &is_commercial, &is_cleaning, &is_responsable_technique, &is_responsable_de_site, &is_active, &salary_monthly],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Notifications: hand-off events (2026-08-31) ----
//
// Requested directly, with the real cost spelled out: "if I mark a job
// attente de nettoyage, I want to know when it is cleaned, same for
// service commercial, because technicians only put units on the shelves,
// if they don't go check all the time, they'll miss some stuff and it's
// the same reason we have some units late." A job leaving one person's
// hands and landing in a queue only the *next* person is expected to
// notice — with nothing telling them it arrived — is exactly the blind
// spot described. Two hand-offs get this today: a job marked "Attente de
// nettoyage" notifies whoever the roster flags `is_cleaning`; a job
// transferred to Service Commercial notifies whoever it already flags
// `is_commercial` (no new role needed there). Easy to extend to more
// hand-off types later — `kind` is a free string tag, not a fixed enum.

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NotificationRecord {
    pub id: i32,
    pub kind: String,
    pub ligcde_id: String,
    pub reference: Option<String>,
    pub message: String,
    pub created_at: String,
    pub read: bool,
}

/// Inserts one row per recipient — a plain fan-out at write time, not a
/// join at read time, so "mark this one read" only ever needs to update
/// exactly the row the reader is looking at. Silently does nothing if
/// `recipients` is empty (no one on that duty in the roster yet) — this
/// is a convenience layered on top of a real write that already
/// succeeded, so a missing recipient list should never fail the calling
/// command.
async fn create_notifications_for(
    pg: &tokio_postgres::Client,
    recipients: &std::collections::HashSet<String>,
    kind: &str,
    ligcde_id: &str,
    reference: Option<&str>,
    message: &str,
) -> Result<(), String> {
    for recipient in recipients {
        pg.execute(
            r#"INSERT INTO "RemanNotification" (recipient_tech_id, kind, ligcde_id, reference, message)
               VALUES ($1, $2, $3, $4, $5)"#,
            &[recipient, &kind, &ligcde_id, &reference, &message],
        )
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Unread notifications first (newest first), then the most recent 20
/// already-read ones — enough to catch up after being away without the
/// list growing forever. `tech_id` is the viewer's own claimed REMAN
/// identity (`currentUser.remanTechId`), not an admin-only parameter —
/// unlike the roster, every technician needs to read their own
/// notifications, not just the roster admin.
#[tauri::command]
pub async fn reman_list_notifications(tech_id: String, state: State<'_, AppState>) -> Result<Vec<NotificationRecord>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    let rows = pg
        .query(
            r#"(SELECT id, kind, ligcde_id, reference, message, created_at::text, (read_at IS NOT NULL) AS read
                FROM "RemanNotification" WHERE recipient_tech_id = $1 AND read_at IS NULL
                ORDER BY created_at DESC)
               UNION ALL
               (SELECT id, kind, ligcde_id, reference, message, created_at::text, (read_at IS NOT NULL) AS read
                FROM "RemanNotification" WHERE recipient_tech_id = $1 AND read_at IS NOT NULL
                ORDER BY created_at DESC LIMIT 20)"#,
            &[&tech_id],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| NotificationRecord {
            id: r.get(0),
            kind: r.get(1),
            ligcde_id: r.get(2),
            reference: r.get(3),
            message: r.get(4),
            created_at: r.get(5),
            read: r.get(6),
        })
        .collect())
}

/// Scoped to the caller's own tech_id — same "can only touch your own"
/// pattern as `reman_delete_saved_comment` — nothing in the UI would ever
/// send someone else's id, but this makes it true regardless.
#[tauri::command]
pub async fn reman_mark_notification_read(id: i32, tech_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    pg.execute(
        r#"UPDATE "RemanNotification" SET read_at = now() WHERE id = $1 AND recipient_tech_id = $2 AND read_at IS NULL"#,
        &[&id, &tech_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Marks every one of the caller's own unread notifications read at once
/// — offered next to "mark all read" in the panel rather than making
/// someone click through a long backlog one at a time.
#[tauri::command]
pub async fn reman_mark_all_notifications_read(tech_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    pg.execute(
        r#"UPDATE "RemanNotification" SET read_at = now() WHERE recipient_tech_id = $1 AND read_at IS NULL"#,
        &[&tech_id],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Job locks: "someone else has this open right now" (2026-09-01) ----
//
// See RemanJobLock's doc comment (ensure_reman_cache_tables) for why this
// exists. Deliberately a soft, expiring, best-effort lock rather than a
// hard one enforced at write time — `job_is_closed`'s guard is what
// actually prevents a corrupted outcome; this table only prevents the
// *confusing* case of two technicians both looking at the edit form at
// once, by telling the second one before they start typing.

const JOB_LOCK_TTL_SECONDS: i64 = 45;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct JobLockStatus {
    // True the moment this call itself successfully claimed or renewed
    // the lock for the caller — the frontend only renders the edit form
    // when this is true.
    pub held_by_me: bool,
    // True when someone else genuinely holds it right now (unexpired).
    pub locked_by_other: bool,
    pub other_tech_name: Option<String>,
}

/// Claims the lock for `tech_id` if it's free, expired, or already theirs
/// (a heartbeat renewal) — all in the single `INSERT ... ON CONFLICT`
/// below, so two BRAXON clients opening the same job in the same instant
/// can't both believe they won it. `RETURNING` only fires for the branch
/// that actually inserted/updated a row: no rows back means someone else
/// holds a still-valid lock, which triggers the fallback read to report
/// who. Split from the `#[tauri::command]` wrapper (same shape as
/// `reman_search_interventions_core`) so it's callable directly against a
/// plain `&Client` in a test, without needing a real Tauri `State`.
async fn acquire_job_lock_core(pg: &tokio_postgres::Client, ligcde_id: &str, tech_id: &str, tech_name: &str) -> Result<JobLockStatus, String> {
    let claimed = pg
        .query_opt(
            &format!(
                r#"INSERT INTO "RemanJobLock" (ligcde_id, tech_id, tech_name, acquired_at, expires_at)
                   VALUES ($1, $2, $3, now(), now() + interval '{JOB_LOCK_TTL_SECONDS} seconds')
                   ON CONFLICT (ligcde_id) DO UPDATE SET
                     tech_id = $2, tech_name = $3, acquired_at = now(), expires_at = now() + interval '{JOB_LOCK_TTL_SECONDS} seconds'
                   WHERE "RemanJobLock".tech_id = $2 OR "RemanJobLock".expires_at < now()
                   RETURNING tech_id"#
            ),
            &[&ligcde_id, &tech_id, &tech_name],
        )
        .await
        .map_err(|e| e.to_string())?;

    if claimed.is_some() {
        return Ok(JobLockStatus { held_by_me: true, locked_by_other: false, other_tech_name: None });
    }

    let holder = pg
        .query_opt(r#"SELECT tech_name FROM "RemanJobLock" WHERE ligcde_id = $1"#, &[&ligcde_id])
        .await
        .map_err(|e| e.to_string())?;
    Ok(JobLockStatus {
        held_by_me: false,
        locked_by_other: true,
        other_tech_name: holder.and_then(|r| r.get::<_, Option<String>>(0)),
    })
}

#[tauri::command]
pub async fn reman_acquire_job_lock(ligcde_id: String, tech_id: String, tech_name: String, state: State<'_, AppState>) -> Result<JobLockStatus, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    acquire_job_lock_core(&pg, &ligcde_id, &tech_id, &tech_name).await
}

/// Best-effort — called when a technician collapses the row or navigates
/// away. Only deletes the caller's own lock (the `tech_id` match), so a
/// stale/duplicate release call can never clear someone else's active
/// lock. Not calling this at all is fine too: `JOB_LOCK_TTL_SECONDS` is
/// the real backstop for a closed tab or a lost connection.
async fn release_job_lock_core(pg: &tokio_postgres::Client, ligcde_id: &str, tech_id: &str) -> Result<(), String> {
    pg.execute(r#"DELETE FROM "RemanJobLock" WHERE ligcde_id = $1 AND tech_id = $2"#, &[&ligcde_id, &tech_id])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn reman_release_job_lock(ligcde_id: String, tech_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    release_job_lock_core(&pg, &ligcde_id, &tech_id).await
}

// ---- Finance settings: shop-level costs for a rough annual profit estimate (2026-08-11) ----
//
// Requested directly: "can you calculate how much profit we make a year
// ... give me some fields so i can change in the app." See the
// `ensure_reman_cache_tables` doc comment above `RemanFinanceSettings`
// for why revenue and stock value aren't computed/stored here. Same
// admin gating as the roster (`ROSTER_ADMIN_TECH_ID`) — business
// financials are at least as sensitive as roles/active-status, and
// salaries (on the roster itself) live behind the exact same check.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct FinanceSettings {
    pub rent_monthly: Option<f64>,
    pub electricity_monthly: Option<f64>,
    pub reimbursements_monthly: Option<f64>,
    pub insurance_monthly: Option<f64>,
    pub supplies_monthly: Option<f64>,
    pub subscriptions_monthly: Option<f64>,
    pub misc_monthly: Option<f64>,
    pub debt_balance: Option<f64>,
    pub debt_monthly_payment: Option<f64>,
    pub stock_value: Option<f64>,
    pub tax_rate_percent: Option<f64>,
    /// Employer payroll charges (charges patronales), as a percentage
    /// applied on top of the roster's summed salaries — requested
    /// directly after the first pass came out far too optimistic against
    /// a real filed P&L; France-based labor cost is materially more than
    /// gross salary alone.
    pub employer_charges_percent: Option<f64>,
}

#[tauri::command]
pub async fn reman_get_finance_settings(requesting_tech_id: String, state: State<'_, AppState>) -> Result<FinanceSettings, String> {
    if requesting_tech_id != ROSTER_ADMIN_TECH_ID {
        return Err("Not authorized".to_string());
    }
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_reman_cache_tables(&client).await?;
    let row = client
        .query_opt(
            r#"SELECT rent_monthly, electricity_monthly, reimbursements_monthly, insurance_monthly,
                      supplies_monthly, subscriptions_monthly, misc_monthly, debt_balance,
                      debt_monthly_payment, stock_value, tax_rate_percent, employer_charges_percent
               FROM "RemanFinanceSettings" WHERE id = 1"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(match row {
        Some(r) => FinanceSettings {
            rent_monthly: r.get(0),
            electricity_monthly: r.get(1),
            reimbursements_monthly: r.get(2),
            insurance_monthly: r.get(3),
            supplies_monthly: r.get(4),
            subscriptions_monthly: r.get(5),
            misc_monthly: r.get(6),
            debt_balance: r.get(7),
            debt_monthly_payment: r.get(8),
            stock_value: r.get(9),
            tax_rate_percent: r.get(10),
            employer_charges_percent: r.get(11),
        },
        // No row saved yet — pre-fill rent with the one real figure
        // already given directly ("a field for rent which is around 5000
        // a month"), everything else starts blank rather than a guessed
        // default.
        None => FinanceSettings { rent_monthly: Some(5000.0), ..Default::default() },
    })
}

#[tauri::command]
pub async fn reman_update_finance_settings(
    requesting_tech_id: String,
    settings: FinanceSettings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if requesting_tech_id != ROSTER_ADMIN_TECH_ID {
        return Err("Not authorized".to_string());
    }
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_reman_cache_tables(&client).await?;
    client
        .execute(
            r#"INSERT INTO "RemanFinanceSettings"
                 (id, rent_monthly, electricity_monthly, reimbursements_monthly, insurance_monthly,
                  supplies_monthly, subscriptions_monthly, misc_monthly, debt_balance,
                  debt_monthly_payment, stock_value, tax_rate_percent, employer_charges_percent, updated_at)
               VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
               ON CONFLICT (id) DO UPDATE SET
                 rent_monthly = $1, electricity_monthly = $2, reimbursements_monthly = $3,
                 insurance_monthly = $4, supplies_monthly = $5, subscriptions_monthly = $6,
                 misc_monthly = $7, debt_balance = $8, debt_monthly_payment = $9,
                 stock_value = $10, tax_rate_percent = $11, employer_charges_percent = $12, updated_at = now()"#,
            &[
                &settings.rent_monthly, &settings.electricity_monthly, &settings.reimbursements_monthly,
                &settings.insurance_monthly, &settings.supplies_monthly, &settings.subscriptions_monthly,
                &settings.misc_monthly, &settings.debt_balance, &settings.debt_monthly_payment,
                &settings.stock_value, &settings.tax_rate_percent, &settings.employer_charges_percent,
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Supplier cost estimate: a real COGS number, not a guess (2026-08-11) ----
//
// The first cut of the Finance tab had no cost-of-goods field at all —
// checked directly against the shop's own filed accounts (Chiffre
// d'affaires 1.4M€, Marge brute 1.1M€, Résultat net 11.8K€ for FY
// 2024/2025) and the calculator was wildly optimistic, because it was
// crediting 100% of revenue as margin.
//
// Went looking for a real source rather than adding another manual
// field. `Stock.PA` (per-unit purchase price) looked promising at first
// but was already ruled out for the stock-value field above (every row
// has a `DateSortie`, no "still on hand" signal) — and it doesn't have
// dates either way, so it can't answer "how much did we spend this
// year." `Stock.NoIntLigCdeVte` (which stock unit fulfilled which job)
// turned out to be entirely unpopulated (0 of 779 rows) — checked live,
// dead end.
//
// `FactureFr`/`Lig_FactureFr` (real supplier invoices, 9172 header rows
// all-time, actively used — 1835 invoice + 120 credit-note lines in the
// trailing 365 days alone) is the real thing: actual money owed/paid to
// suppliers, with `FactureFr.Avoir` marking credit notes (their `MtHT`
// is already stored negative, confirmed live — no separate subtraction
// needed, a plain sum nets them out correctly) and, critically,
// `Lig_FactureFr.CpteGeneral` — a real French chart-of-accounts (PCG)
// ledger code, confirmed live to follow the standard numbering:
// `60x` = Achats (merchandise/materials — the actual COGS), `61x`/`62x`
// = Services extérieurs / Autres services extérieurs (rent, insurance,
// subcontracting, fees — "external charges" in French GAAP, a separate
// P&L line below gross margin, not COGS), `21x` = Immobilisations
// (equipment/capex — not an operating expense at all, excluded
// entirely). Confirmed live for the trailing 365 days: 60x = 438 521,80€,
// 61x+62x = 209 314,62€, 21x (excluded) = 89 667,33€.
//
// **Update, same day**: reported directly that 438K€ "insane... what did
// we spend" against the mental model "we buy an ABS at 200, sell at 400"
// — a fair challenge, since that model implies COGS should track roughly
// half of standard-exchange revenue, not a third of total revenue.
// Checked live at the 6-digit account level (still properly date-filtered
// via the `FactureFr` join, not the earlier undated sample): the flat
// `60x` bucket was hiding a real split. `602xxx`/`601xxx`/`606xxx`
// ("Achats stockés — autres approvisionnements" / "matières premières" /
// "achats non stockés de matières et fournitures" — genuine physical
// parts and consumables) total 193 607,40€. The other 244 914,40€ is
// entirely `604xxx` ("Achats d'études et prestations de services") —
// *purchased services*, not merchandise; for a shop that sends units to
// subcontractors (confirmed elsewhere in this file: `VST`/Validation
// Sous-Traitance is a real, common closing outcome), this is almost
// certainly what gets paid to those subcontractors, not units bought for
// resale. Splitting it out both makes the number legible and stops it
// from being mislabeled "cost of goods" when over half of it isn't goods
// at all.
//
// `61x`/`62x` stays a separate reference figure, unchanged from the
// first pass — not auto-applied to the Finance tab's manual fixed-cost
// fields, which stay admin-controlled (silently replacing them risks
// double-counting anything already entered manually that also happens to
// be supplier-invoiced).
//
// Also gained `from`/`to` params (previously hardcoded to a trailing
// 365-day window) so the Finance tab's new fiscal-year picker can ask for
// any period, same shape as `reman_analytics`.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SupplierCostEstimate {
    /// `601x`/`602x`/`606x` — physical parts/materials/consumables. The
    /// number that should track the "buy at 200, sell at 400" mental
    /// model, not the old undifferentiated `60x` total.
    pub parts_cogs: f64,
    /// `604x` — purchased services, most likely subcontracted repair/
    /// testing labor. A real cost, just not merchandise.
    pub subcontracted_services: f64,
    /// `61x`/`62x` — reference only, see doc comment above.
    pub external_charges: f64,
}

#[tauri::command]
pub async fn reman_supplier_cost_estimate(from_date: String, to_date: String) -> Result<SupplierCostEstimate, String> {
    let from = validate_iso_date(&from_date, "from date")?;
    let to = validate_iso_date(&to_date, "to date")?;
    async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| -> Result<SupplierCostEstimate, String> {
            let sql = format!(
                r#"SELECT l.CpteGeneral, l.MtNet
                   FROM Lig_FactureFr l
                   LEFT JOIN FactureFr f ON l.NoIntFactureFr = f.NoIntFactureFr
                   WHERE f.DateFacture BETWEEN '{from}' AND '{to}'
                   LIMIT 30000"#
            );
            let rows = run_query(conn, &sql)?;
            let mut parts_cogs = 0.0;
            let mut subcontracted_services = 0.0;
            let mut external_charges = 0.0;
            for r in rows {
                let acct = r[0].as_deref().unwrap_or("").trim();
                let amt: f64 = r[1].as_deref().and_then(|s| s.parse().ok()).unwrap_or(0.0);
                match acct.get(0..3) {
                    Some("601") | Some("602") | Some("606") => parts_cogs += amt,
                    Some("604") => subcontracted_services += amt,
                    _ => match acct.get(0..2) {
                        Some("61") | Some("62") => external_charges += amt,
                        _ => {}
                    },
                }
            }
            Ok(SupplierCostEstimate { parts_cogs, subcontracted_services, external_charges })
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---- Verified fault type: a technician's own confirmed read (2026-08-06) ----
//
// Requested directly: "i can verify the badges and set them as well, like
// if i read or test a unit i can just set if it's hydraulic or ecu fault
// or both." Complements (doesn't replace) the lexical `AbsFaultHint`
// classifier — a verified value always takes precedence over the guessed
// one wherever both are shown, and gets its own visual treatment
// (confirmed vs. inferred) so a technician's own read is never confused
// with a guess from intake symptom text.

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VerifiedFaultTypeRecord {
    pub fault_type: VerifiedFaultType,
    pub verified_by_tech_name: Option<String>,
    pub verified_at: Option<String>,
}

/// Batch-fetches verified fault types for every id in `ligcde_ids` — one
/// query regardless of how many jobs are in the current search-result
/// page, not one per row.
async fn verified_fault_types_for(
    client: &tokio_postgres::Client,
    ligcde_ids: &[String],
) -> Result<std::collections::HashMap<String, VerifiedFaultTypeRecord>, String> {
    if ligcde_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    let rows = client
        .query(
            // Cast to text in SQL rather than reading a typed timestamp —
            // this crate has no chrono/time feature enabled for
            // tokio-postgres, and every other date in this file is
            // already treated as a plain string, not a parsed type.
            r#"SELECT ligcde_id, fault_type, verified_by_tech_name, verified_at::text
               FROM "RemanVerifiedFaultType" WHERE ligcde_id = ANY($1)"#,
            &[&ligcde_ids],
        )
        .await
        .map_err(|e| e.to_string())?;
    let mut out = std::collections::HashMap::new();
    for row in rows {
        let ligcde_id: String = row.get(0);
        let fault_type_str: String = row.get(1);
        let Ok(fault_type) = VerifiedFaultType::parse(&fault_type_str) else { continue };
        out.insert(
            ligcde_id,
            VerifiedFaultTypeRecord {
                fault_type,
                verified_by_tech_name: row.get(2),
                verified_at: row.get(3),
            },
        );
    }
    Ok(out)
}

/// Merges the Postgres-side verified fault type into an already-built
/// `InterventionDetail` — the shared tail every command returning a detail
/// runs through, so `verified_fault_type` never drifts stale after a
/// write.
async fn with_verified_fault_type(
    pg: &tokio_postgres::Client,
    mut detail: InterventionDetail,
) -> Result<InterventionDetail, String> {
    let mut verified = verified_fault_types_for(pg, &[detail.id.clone()]).await?;
    detail.verified_fault_type = verified.remove(&detail.id);
    Ok(detail)
}

#[tauri::command]
pub async fn reman_set_verified_fault_type(
    ligcde_id: String,
    tech_id: String,
    tech_name: String,
    fault_type: String,
    state: State<'_, AppState>,
) -> Result<InterventionDetail, String> {
    let ligcde_id_num = parse_id(&ligcde_id, "job")?;
    let fault_type = VerifiedFaultType::parse(fault_type.trim())?;
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    pg.execute(
        r#"INSERT INTO "RemanVerifiedFaultType" (ligcde_id, fault_type, verified_by_tech_id, verified_by_tech_name, verified_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (ligcde_id) DO UPDATE SET
             fault_type = $2, verified_by_tech_id = $3, verified_by_tech_name = $4, verified_at = now()"#,
        &[&ligcde_id, &fault_type.as_str(), &tech_id, &tech_name],
    )
    .await
    .map_err(|e| e.to_string())?;
    let detail = refresh_intervention_with_retry(ligcde_id_num).await?;
    with_verified_fault_type(&pg, detail).await
}

#[tauri::command]
pub async fn reman_clear_verified_fault_type(
    ligcde_id: String,
    state: State<'_, AppState>,
) -> Result<InterventionDetail, String> {
    let ligcde_id_num = parse_id(&ligcde_id, "job")?;
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    pg.execute(r#"DELETE FROM "RemanVerifiedFaultType" WHERE ligcde_id = $1"#, &[&ligcde_id])
        .await
        .map_err(|e| e.to_string())?;
    let detail = refresh_intervention_with_retry(ligcde_id_num).await?;
    with_verified_fault_type(&pg, detail).await
}

// ---- Saved notes & Tests/Actions presets (personal, per-technician quick-pick) ----
//
// Requested directly: typing the same comment ("Nettoyage effectué, RAS",
// etc.) and re-checking the same Tests & Actions items job after job is
// slow — a personal, pickable list saves both. Personal per `tech_id`
// (not shop-wide) and available on every write feature that has a
// comment box (ER/ATN/close), per the user's own scoping choices.
// Entirely BRAXON's own Postgres — 4D has no concept of this at all.

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SavedComment {
    pub id: i32,
    pub text: String,
}

#[tauri::command]
pub async fn reman_list_saved_comments(tech_id: String, state: State<'_, AppState>) -> Result<Vec<SavedComment>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_reman_cache_tables(&client).await?;
    let rows = client
        .query(
            r#"SELECT id, text FROM "RemanSavedComment" WHERE tech_id = $1 ORDER BY created_at DESC"#,
            &[&tech_id],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.into_iter().map(|r| SavedComment { id: r.get(0), text: r.get(1) }).collect())
}

#[tauri::command]
pub async fn reman_add_saved_comment(tech_id: String, text: String, state: State<'_, AppState>) -> Result<SavedComment, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("Note text cannot be empty".to_string());
    }
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_reman_cache_tables(&client).await?;
    let row = client
        .query_one(
            r#"INSERT INTO "RemanSavedComment" (tech_id, text) VALUES ($1, $2) RETURNING id"#,
            &[&tech_id, &text],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(SavedComment { id: row.get(0), text })
}

#[tauri::command]
pub async fn reman_delete_saved_comment(tech_id: String, id: i32, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_reman_cache_tables(&client).await?;
    // Scoped to tech_id, not just id — a technician can only ever delete
    // their own saved notes, even though nothing in the UI would offer
    // someone else's id.
    client
        .execute(
            r#"DELETE FROM "RemanSavedComment" WHERE id = $1 AND tech_id = $2"#,
            &[&id, &tech_id],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SavedTestActionPreset {
    pub id: i32,
    pub name: String,
    pub service: String,
    pub param_ids: Vec<i64>,
}

#[tauri::command]
pub async fn reman_list_saved_test_presets(
    tech_id: String,
    service: String,
    state: State<'_, AppState>,
) -> Result<Vec<SavedTestActionPreset>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_reman_cache_tables(&client).await?;
    let rows = client
        .query(
            r#"SELECT id, name, service, param_ids_json FROM "RemanSavedTestActionPreset"
               WHERE tech_id = $1 AND service = $2 ORDER BY created_at DESC"#,
            &[&tech_id, &service],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let param_ids_json: String = r.get(3);
            let param_ids: Vec<i64> = serde_json::from_str(&param_ids_json).unwrap_or_default();
            SavedTestActionPreset { id: r.get(0), name: r.get(1), service: r.get(2), param_ids }
        })
        .collect())
}

#[tauri::command]
pub async fn reman_add_saved_test_preset(
    tech_id: String,
    service: String,
    name: String,
    param_ids: Vec<i64>,
    state: State<'_, AppState>,
) -> Result<SavedTestActionPreset, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Preset name cannot be empty".to_string());
    }
    if param_ids.is_empty() {
        return Err("Select at least one item before saving a preset".to_string());
    }
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_reman_cache_tables(&client).await?;
    let param_ids_json = serde_json::to_string(&param_ids).map_err(|e| e.to_string())?;
    let row = client
        .query_one(
            r#"INSERT INTO "RemanSavedTestActionPreset" (tech_id, service, name, param_ids_json)
               VALUES ($1, $2, $3, $4) RETURNING id"#,
            &[&tech_id, &service, &name, &param_ids_json],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(SavedTestActionPreset { id: row.get(0), name, service, param_ids })
}

#[tauri::command]
pub async fn reman_delete_saved_test_preset(tech_id: String, id: i32, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_reman_cache_tables(&client).await?;
    client
        .execute(
            r#"DELETE FROM "RemanSavedTestActionPreset" WHERE id = $1 AND tech_id = $2"#,
            &[&id, &tech_id],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Repair Knowledge Base (2026-08-26) ----
//
// See ensure_reman_cache_tables's doc comment on "RemanKnowledgeEntry" for
// the origin story. Two entry points from the rest of the app: a tech
// searches/browses here directly (fault code, ECU ref, or plain
// description), or logs a fix straight from a job's detail view — the
// "Log this fix" flow pre-fills ECU ref/family/vehicle from that job and
// links the new entry to it, so a codified record and the job that proved
// it out never drift apart.

const KNOWLEDGE_ENTRY_COLUMNS: &str = "id, ecu_ref, ecu_brand, ecu_family, vehicle_make, \
    vehicle_model, vehicle_year, fault_codes, cause_tags, fix_tags, linked_job_ids, notes, \
    created_by_tech_id, created_by_tech_name, created_at::text, updated_at::text";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeEntry {
    pub id: i32,
    pub ecu_ref: Option<String>,
    pub ecu_brand: Option<String>,
    pub ecu_family: Option<String>,
    pub vehicle_make: Option<String>,
    pub vehicle_model: Option<String>,
    pub vehicle_year: Option<String>,
    pub fault_codes: Vec<String>,
    pub cause_tags: Vec<String>,
    pub fix_tags: Vec<String>,
    pub linked_job_ids: Vec<String>,
    pub notes: Option<String>,
    pub created_by_tech_id: Option<String>,
    pub created_by_tech_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    // True when `linkedJobIds` contains the job id a query was scoped to.
    // Only ever set by reman_suggest_knowledge_entries; always false from
    // the plain search/list command, which isn't scoped to any one job.
    #[serde(default)]
    pub linked_to_this_job: bool,
    // True when one of this entry's `fault_codes` was found, as a
    // substring, inside the `symptom_text` a suggest query was scoped to
    // (the job's Observations/comments) — see
    // reman_suggest_knowledge_entries_impl's doc comment. Only ever set
    // there; always false elsewhere.
    #[serde(default)]
    pub fault_code_detected: bool,
}

fn knowledge_entry_from_row(row: &tokio_postgres::Row, scoped_job_id: Option<&str>) -> KnowledgeEntry {
    let linked_job_ids: Vec<String> = row.get(10);
    let linked_to_this_job = scoped_job_id.map(|id| linked_job_ids.iter().any(|j| j == id)).unwrap_or(false);
    KnowledgeEntry {
        id: row.get(0),
        ecu_ref: row.get(1),
        ecu_brand: row.get(2),
        ecu_family: row.get(3),
        vehicle_make: row.get(4),
        vehicle_model: row.get(5),
        vehicle_year: row.get(6),
        fault_codes: row.get(7),
        cause_tags: row.get(8),
        fix_tags: row.get(9),
        linked_job_ids,
        notes: row.get(11),
        created_by_tech_id: row.get(12),
        created_by_tech_name: row.get(13),
        created_at: row.get(14),
        updated_at: row.get(15),
        linked_to_this_job,
        fault_code_detected: false,
    }
}

/// Trims a freeform tag list down to non-empty, de-duplicated entries —
/// shared by every write command below so blank rows from a half-filled
/// tag input never make it into `fault_codes`/`cause_tags`/`fix_tags`.
fn clean_tags(tags: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for t in tags {
        let t = t.trim().to_string();
        if !t.is_empty() && !out.iter().any(|existing: &String| existing.eq_ignore_ascii_case(&t)) {
            out.push(t);
        }
    }
    out
}

async fn reman_search_knowledge_entries_impl(
    pg: &tokio_postgres::Client,
    query: Option<String>,
    family: Option<String>,
) -> Result<Vec<KnowledgeEntry>, String> {
    let q = query.unwrap_or_default().trim().to_string();
    let fam = family.unwrap_or_default().trim().to_string();
    let rows = pg
        .query(
            &format!(
                r#"SELECT {KNOWLEDGE_ENTRY_COLUMNS} FROM "RemanKnowledgeEntry"
                   WHERE ($1 = '' OR
                     ecu_ref ILIKE '%' || $1 || '%' OR
                     ecu_brand ILIKE '%' || $1 || '%' OR
                     ecu_family ILIKE '%' || $1 || '%' OR
                     vehicle_make ILIKE '%' || $1 || '%' OR
                     vehicle_model ILIKE '%' || $1 || '%' OR
                     notes ILIKE '%' || $1 || '%' OR
                     EXISTS (SELECT 1 FROM unnest(fault_codes) v WHERE v ILIKE '%' || $1 || '%') OR
                     EXISTS (SELECT 1 FROM unnest(cause_tags) v WHERE v ILIKE '%' || $1 || '%') OR
                     EXISTS (SELECT 1 FROM unnest(fix_tags) v WHERE v ILIKE '%' || $1 || '%')
                   )
                   AND ($2 = '' OR ecu_family ILIKE '%' || $2 || '%')
                   ORDER BY updated_at DESC
                   LIMIT 200"#
            ),
            &[&q, &fam],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(|r| knowledge_entry_from_row(r, None)).collect())
}

#[tauri::command]
pub async fn reman_search_knowledge_entries(
    query: Option<String>,
    family: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<KnowledgeEntry>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    reman_search_knowledge_entries_impl(&pg, query, family).await
}

/// Related-knowledge panel on a job's detail view. Three ways an entry can
/// show up here, most specific first: (1) already linked to this exact
/// job (`linkedToThisJob = true`); (2) one of its `fault_codes` was found
/// as a substring inside `symptom_text` — the job's own free text
/// (Observations/client/internal comments, technician step comments),
/// gathered frontend-side from fields the detail view already fetched, so
/// this never needs its own 4D query — flagged `faultCodeDetected = true`,
/// the "auto-detect the fault and show the potential fix" behavior
/// requested directly; (3) same ECU family as a weaker "others hit this
/// too" suggestion, for when the fault text doesn't literally contain a
/// code a job's write-up used (plenty don't — see MK100's "déséquilibre
/// de freinage," never a DTC). `length(v) >= 3` guards the fault-code
/// match against a stray short tag matching almost any text.
async fn reman_suggest_knowledge_entries_impl(
    pg: &tokio_postgres::Client,
    ligcde_id: String,
    family: Option<String>,
    symptom_text: Option<String>,
) -> Result<Vec<KnowledgeEntry>, String> {
    let fam = family.unwrap_or_default().trim().to_string();
    let symptom = symptom_text.unwrap_or_default().trim().to_string();
    let rows = pg
        .query(
            &format!(
                r#"SELECT {KNOWLEDGE_ENTRY_COLUMNS},
                     ($3 <> '' AND EXISTS (
                       SELECT 1 FROM unnest(fault_codes) v
                       WHERE length(v) >= 3 AND $3 ILIKE '%' || v || '%'
                     )) AS fault_code_detected
                   FROM "RemanKnowledgeEntry"
                   WHERE $1 = ANY(linked_job_ids)
                      OR ($2 <> '' AND ecu_family ILIKE '%' || $2 || '%')
                      OR ($3 <> '' AND EXISTS (
                           SELECT 1 FROM unnest(fault_codes) v
                           WHERE length(v) >= 3 AND $3 ILIKE '%' || v || '%'
                         ))
                   ORDER BY ($1 = ANY(linked_job_ids)) DESC, fault_code_detected DESC, updated_at DESC
                   LIMIT 20"#
            ),
            &[&ligcde_id, &fam, &symptom],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .map(|r| {
            let mut entry = knowledge_entry_from_row(r, Some(&ligcde_id));
            entry.fault_code_detected = r.get(16);
            entry
        })
        .collect())
}

#[tauri::command]
pub async fn reman_suggest_knowledge_entries(
    ligcde_id: String,
    family: Option<String>,
    symptom_text: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<KnowledgeEntry>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    reman_suggest_knowledge_entries_impl(&pg, ligcde_id, family, symptom_text).await
}

#[allow(clippy::too_many_arguments)]
async fn reman_create_knowledge_entry_impl(
    pg: &tokio_postgres::Client,
    ecu_ref: Option<String>,
    ecu_brand: Option<String>,
    ecu_family: Option<String>,
    vehicle_make: Option<String>,
    vehicle_model: Option<String>,
    vehicle_year: Option<String>,
    fault_codes: Vec<String>,
    cause_tags: Vec<String>,
    fix_tags: Vec<String>,
    notes: Option<String>,
    linked_job_ids: Vec<String>,
    tech_id: String,
    tech_name: String,
) -> Result<KnowledgeEntry, String> {
    let ecu_ref = ecu_ref.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let ecu_brand = ecu_brand.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let ecu_family = ecu_family.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let vehicle_make = vehicle_make.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let vehicle_model = vehicle_model.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let vehicle_year = vehicle_year.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let notes = notes.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let fault_codes = clean_tags(fault_codes);
    let cause_tags = clean_tags(cause_tags);
    let fix_tags = clean_tags(fix_tags);
    let linked_job_ids = clean_tags(linked_job_ids);
    if ecu_ref.is_none() && ecu_family.is_none() {
        return Err("Enter at least an ECU reference or family so this entry is findable".to_string());
    }
    // Not every fault is a code — some (MK100's "déséquilibre de
    // freinage," for one) are only ever written up as plain text, never a
    // DTC. Require either a code or a note, not specifically a code.
    if fault_codes.is_empty() && notes.is_none() {
        return Err("Enter a fault code, or describe the fault in the notes".to_string());
    }
    let row = pg
        .query_one(
            &format!(
                r#"INSERT INTO "RemanKnowledgeEntry"
                   (ecu_ref, ecu_brand, ecu_family, vehicle_make, vehicle_model, vehicle_year,
                    fault_codes, cause_tags, fix_tags, notes, linked_job_ids,
                    created_by_tech_id, created_by_tech_name)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                   RETURNING {KNOWLEDGE_ENTRY_COLUMNS}"#
            ),
            &[
                &ecu_ref, &ecu_brand, &ecu_family, &vehicle_make, &vehicle_model, &vehicle_year,
                &fault_codes, &cause_tags, &fix_tags, &notes, &linked_job_ids,
                &tech_id, &tech_name,
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(knowledge_entry_from_row(&row, None))
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn reman_create_knowledge_entry(
    ecu_ref: Option<String>,
    ecu_brand: Option<String>,
    ecu_family: Option<String>,
    vehicle_make: Option<String>,
    vehicle_model: Option<String>,
    vehicle_year: Option<String>,
    fault_codes: Vec<String>,
    cause_tags: Vec<String>,
    fix_tags: Vec<String>,
    notes: Option<String>,
    linked_job_ids: Vec<String>,
    tech_id: String,
    tech_name: String,
    state: State<'_, AppState>,
) -> Result<KnowledgeEntry, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    reman_create_knowledge_entry_impl(
        &pg, ecu_ref, ecu_brand, ecu_family, vehicle_make, vehicle_model, vehicle_year,
        fault_codes, cause_tags, fix_tags, notes, linked_job_ids, tech_id, tech_name,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
async fn reman_update_knowledge_entry_impl(
    pg: &tokio_postgres::Client,
    id: i32,
    ecu_ref: Option<String>,
    ecu_brand: Option<String>,
    ecu_family: Option<String>,
    vehicle_make: Option<String>,
    vehicle_model: Option<String>,
    vehicle_year: Option<String>,
    fault_codes: Vec<String>,
    cause_tags: Vec<String>,
    fix_tags: Vec<String>,
    notes: Option<String>,
) -> Result<KnowledgeEntry, String> {
    let ecu_ref = ecu_ref.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let ecu_brand = ecu_brand.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let ecu_family = ecu_family.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let vehicle_make = vehicle_make.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let vehicle_model = vehicle_model.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let vehicle_year = vehicle_year.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let notes = notes.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let fault_codes = clean_tags(fault_codes);
    let cause_tags = clean_tags(cause_tags);
    let fix_tags = clean_tags(fix_tags);
    if ecu_ref.is_none() && ecu_family.is_none() {
        return Err("Enter at least an ECU reference or family so this entry is findable".to_string());
    }
    if fault_codes.is_empty() && notes.is_none() {
        return Err("Enter a fault code, or describe the fault in the notes".to_string());
    }
    let row = pg
        .query_opt(
            &format!(
                r#"UPDATE "RemanKnowledgeEntry" SET
                     ecu_ref = $2, ecu_brand = $3, ecu_family = $4, vehicle_make = $5,
                     vehicle_model = $6, vehicle_year = $7, fault_codes = $8, cause_tags = $9,
                     fix_tags = $10, notes = $11, updated_at = now()
                   WHERE id = $1
                   RETURNING {KNOWLEDGE_ENTRY_COLUMNS}"#
            ),
            &[
                &id, &ecu_ref, &ecu_brand, &ecu_family, &vehicle_make, &vehicle_model, &vehicle_year,
                &fault_codes, &cause_tags, &fix_tags, &notes,
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    row.map(|r| knowledge_entry_from_row(&r, None)).ok_or_else(|| "Knowledge entry not found".to_string())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn reman_update_knowledge_entry(
    id: i32,
    ecu_ref: Option<String>,
    ecu_brand: Option<String>,
    ecu_family: Option<String>,
    vehicle_make: Option<String>,
    vehicle_model: Option<String>,
    vehicle_year: Option<String>,
    fault_codes: Vec<String>,
    cause_tags: Vec<String>,
    fix_tags: Vec<String>,
    notes: Option<String>,
    state: State<'_, AppState>,
) -> Result<KnowledgeEntry, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    reman_update_knowledge_entry_impl(
        &pg, id, ecu_ref, ecu_brand, ecu_family, vehicle_make, vehicle_model, vehicle_year,
        fault_codes, cause_tags, fix_tags, notes,
    )
    .await
}

#[tauri::command]
pub async fn reman_delete_knowledge_entry(id: i32, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    pg.execute(r#"DELETE FROM "RemanKnowledgeEntry" WHERE id = $1"#, &[&id])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn reman_link_job_to_knowledge_entry_impl(
    pg: &tokio_postgres::Client,
    id: i32,
    ligcde_id: String,
) -> Result<KnowledgeEntry, String> {
    let row = pg
        .query_opt(
            &format!(
                r#"UPDATE "RemanKnowledgeEntry"
                   SET linked_job_ids = (SELECT array_agg(DISTINCT x) FROM unnest(linked_job_ids || ARRAY[$2::text]) x),
                       updated_at = now()
                   WHERE id = $1
                   RETURNING {KNOWLEDGE_ENTRY_COLUMNS}"#
            ),
            &[&id, &ligcde_id],
        )
        .await
        .map_err(|e| e.to_string())?;
    row.map(|r| knowledge_entry_from_row(&r, Some(&ligcde_id))).ok_or_else(|| "Knowledge entry not found".to_string())
}

#[tauri::command]
pub async fn reman_link_job_to_knowledge_entry(
    id: i32,
    ligcde_id: String,
    state: State<'_, AppState>,
) -> Result<KnowledgeEntry, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    reman_link_job_to_knowledge_entry_impl(&pg, id, ligcde_id).await
}

async fn reman_unlink_job_from_knowledge_entry_impl(
    pg: &tokio_postgres::Client,
    id: i32,
    ligcde_id: String,
) -> Result<KnowledgeEntry, String> {
    let row = pg
        .query_opt(
            &format!(
                r#"UPDATE "RemanKnowledgeEntry"
                   SET linked_job_ids = array_remove(linked_job_ids, $2), updated_at = now()
                   WHERE id = $1
                   RETURNING {KNOWLEDGE_ENTRY_COLUMNS}"#
            ),
            &[&id, &ligcde_id],
        )
        .await
        .map_err(|e| e.to_string())?;
    row.map(|r| knowledge_entry_from_row(&r, None)).ok_or_else(|| "Knowledge entry not found".to_string())
}

#[tauri::command]
pub async fn reman_unlink_job_from_knowledge_entry(
    id: i32,
    ligcde_id: String,
    state: State<'_, AppState>,
) -> Result<KnowledgeEntry, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    reman_unlink_job_from_knowledge_entry_impl(&pg, id, ligcde_id).await
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeTagSuggestions {
    pub ecu_families: Vec<String>,
    pub ecu_brands: Vec<String>,
    pub cause_tags: Vec<String>,
    pub fix_tags: Vec<String>,
}

/// Autocomplete source for the entry form — every distinct value already
/// used, so tag choices converge toward reuse without a fixed vocabulary
/// forcing it (see ensure_reman_cache_tables's doc comment).
#[tauri::command]
pub async fn reman_list_knowledge_tag_suggestions(state: State<'_, AppState>) -> Result<KnowledgeTagSuggestions, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    async fn distinct_values(pg: &tokio_postgres::Client, sql: &str) -> Result<Vec<String>, String> {
        let rows = pg.query(sql, &[]).await.map_err(|e| e.to_string())?;
        Ok(rows.into_iter().map(|r| r.get(0)).collect())
    }
    let ecu_families = distinct_values(
        &pg,
        r#"SELECT DISTINCT ecu_family FROM "RemanKnowledgeEntry" WHERE ecu_family IS NOT NULL ORDER BY 1"#,
    )
    .await?;
    let ecu_brands = distinct_values(
        &pg,
        r#"SELECT DISTINCT ecu_brand FROM "RemanKnowledgeEntry" WHERE ecu_brand IS NOT NULL ORDER BY 1"#,
    )
    .await?;
    let cause_tags = distinct_values(
        &pg,
        r#"SELECT DISTINCT v FROM "RemanKnowledgeEntry", unnest(cause_tags) v ORDER BY 1"#,
    )
    .await?;
    let fix_tags = distinct_values(
        &pg,
        r#"SELECT DISTINCT v FROM "RemanKnowledgeEntry", unnest(fix_tags) v ORDER BY 1"#,
    )
    .await?;
    Ok(KnowledgeTagSuggestions { ecu_families, ecu_brands, cause_tags, fix_tags })
}

// ---- "Claim your technician" — linking a BRAXON login to a REMAN identity ----
//
// REMAN has no login of its own for technicians — they pick their name
// from a dropdown per job (see the NomDernierTech doc comment above), so
// there's nothing to authenticate against or auto-match a BRAXON username
// to. This just lists live, currently-active technicians so a BRAXON user
// can pick which one is them; the id/name pair gets stored on their
// `AppUser` row (see `commands::update_user_reman_tech`) and used to
// filter "my jobs" via `reman_search_interventions`'s `tech_id` param.

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TechnicianOption {
    pub tech_id: String,
    pub tech_name: String,
}

#[tauri::command]
pub async fn reman_list_technicians(state: State<'_, AppState>) -> Result<Vec<TechnicianOption>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    let inactive = inactive_tech_ids(&pg).await?;

    async_runtime::spawn_blocking(move || {
        with_reman_connection(|conn| -> Result<Vec<TechnicianOption>, String> {
            // Same shared source as reman_analytics/reman_get_intervention —
            // "Superviseur" and blank ids excluded since those aren't a real
            // individual technician to claim. People marked inactive in the
            // roster (left the shop) shouldn't be pickable going forward
            // either, even though their past closed jobs stay untouched.
            let map = technician_name_map(conn)?;
            let mut out: Vec<TechnicianOption> = map
                .into_iter()
                .filter(|(id, name)| id != "0" && !name.eq_ignore_ascii_case("Superviseur") && !inactive.contains(id))
                .map(|(tech_id, tech_name)| TechnicianOption { tech_id, tech_name })
                .collect();
            out.sort_by(|a, b| a.tech_name.cmp(&b.tech_name));
            Ok(out)
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn reman_save_hydraulic_report(
    ligcde_id: String,
    report_type: String,
    report_text: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    pg.execute(
        r#"INSERT INTO "RemanHydraulicReport" (ligcde_id, report_type, report_text)
           VALUES ($1, $2, $3)"#,
        &[&ligcde_id, &report_type, &report_text],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HydraulicReportSummary {
    pub id: i32,
    pub report_type: String,
    pub report_text: String,
    pub created_at: String,
}

/// Read side of `reman_save_hydraulic_report` — until this existed, saved
/// reports had no way to ever be viewed again once written.
#[tauri::command]
pub async fn reman_list_hydraulic_reports(
    ligcde_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<HydraulicReportSummary>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    let rows = pg
        .query(
            r#"SELECT id, report_type, report_text, created_at::text
               FROM "RemanHydraulicReport" WHERE ligcde_id = $1 ORDER BY created_at DESC"#,
            &[&ligcde_id],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .map(|r| HydraulicReportSummary {
            id: r.get(0),
            report_type: r.get(1),
            report_text: r.get(2),
            created_at: r.get(3),
        })
        .collect())
}

/// Lets a technician remove a saved report they made in error (wrong job,
/// duplicate save, etc.) — no undo, since there's nothing in the schema to
/// soft-delete into; the row is just gone.
#[tauri::command]
pub async fn reman_delete_hydraulic_report(id: i32, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let pg = database::connect(&config).await?;
    ensure_reman_cache_tables(&pg).await?;
    pg.execute(r#"DELETE FROM "RemanHydraulicReport" WHERE id = $1"#, &[&id])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_family_keeps_full_designation_untouched() {
        assert_eq!(derive_family("Calculateur ABS ATE MK100"), Some("Calculateur ABS ATE MK100".to_string()));
        assert_eq!(derive_family("Calculateur ABS Bosch 8.0"), Some("Calculateur ABS Bosch 8.0".to_string()));
        assert_eq!(derive_family("Calculateur ABS TRW"), Some("Calculateur ABS TRW".to_string()));
        assert_eq!(derive_family("Compteur Renault"), Some("Compteur Renault".to_string()));
        assert_eq!(derive_family("Compteur PSA"), Some("Compteur PSA".to_string()));
        assert_eq!(derive_family("  Multimedia PSA  "), Some("Multimedia PSA".to_string()));
        assert_eq!(derive_family("09030830090"), Some("09030830090".to_string()));
        assert_eq!(derive_family(""), None);
        assert_eq!(derive_family("   "), None);
    }

    #[test]
    fn classify_abs_fault_hint_matches_real_observations_examples() {
        // Real Observations text pulled from the mined dataset
        // (scripts/_scratch-abs-fault-pattern-mine-phrases.mjs output,
        // 2026-08-05) — one from each side, plus the not-101/no-match cases.
        assert_eq!(
            classify_abs_fault_hint(Some("101"), Some("Panne PermanenteDéséquilibre sur roue : cote droit ne freine pasECHANGE SUR BLOCK")),
            Some(AbsFaultHint::Hydraulic),
        );
        assert_eq!(
            classify_abs_fault_hint(Some("101"), Some("PROBLEME DE FREINAGEROUES BLOQUEES AVG")),
            Some(AbsFaultHint::Hydraulic),
        );
        assert_eq!(
            classify_abs_fault_hint(Some("101"), Some("Panne Permanente - no comms ABS - voyant abs esp et frein a main allumé - ")),
            Some(AbsFaultHint::Ecu),
        );
        assert_eq!(
            classify_abs_fault_hint(Some("101"), Some("Panne Permanente - tous les voyants allumés - pas de direction assistée")),
            Some(AbsFaultHint::Ecu),
        );
        // Not Type_Service=101 — no hint regardless of text.
        assert_eq!(classify_abs_fault_hint(Some("102"), Some("DESEQUILIBRE DE FREINAGE")), None);
        // 101 but no lexical match either way.
        assert_eq!(classify_abs_fault_hint(Some("101"), Some("Panne Intermitente")), None);
        assert_eq!(classify_abs_fault_hint(Some("101"), None), None);
    }

    #[test]
    fn fault_type_matches_precedence_and_both() {
        // Verified always wins over the lexical hint.
        assert!(fault_type_matches(Some(AbsFaultHint::Ecu), Some(VerifiedFaultType::Hydraulic), "hydraulic"));
        assert!(!fault_type_matches(Some(AbsFaultHint::Ecu), Some(VerifiedFaultType::Hydraulic), "ecu"));
        // No verified value: falls back to the hint.
        assert!(fault_type_matches(Some(AbsFaultHint::Ecu), None, "ecu"));
        assert!(!fault_type_matches(Some(AbsFaultHint::Ecu), None, "hydraulic"));
        // Both matches either single-type filter, but only "both" requires it exactly.
        assert!(fault_type_matches(None, Some(VerifiedFaultType::Both), "hydraulic"));
        assert!(fault_type_matches(None, Some(VerifiedFaultType::Both), "ecu"));
        assert!(fault_type_matches(None, Some(VerifiedFaultType::Both), "both"));
        assert!(!fault_type_matches(None, Some(VerifiedFaultType::Hydraulic), "both"));
        // Nothing at all: matches neither hydraulic nor ecu nor both.
        assert!(!fault_type_matches(None, None, "hydraulic"));
        assert!(!fault_type_matches(None, None, "both"));
    }
}
