// History of units tested on the Signal HIL bench.
//
// The ECU test report (EcuTestReport.tsx) already produces a PDF per unit,
// but until now nothing outlived that single PDF — the draft it's built
// from lives only in localStorage and gets overwritten by the next unit.
// A job-linked test additionally gets its plain-text body pushed into
// REMAN 4D (reman.rs's reman_save_ecu_report), but that only works when a
// REMAN job is linked; there's nowhere for a unit tested outside the job
// system (bench validation, a spare ECU, a warranty check with no job
// number yet) to be recorded at all.
//
// "SignalHilTest" is one row per generated report, in BRAXON's own
// Postgres (same DB as RepairJob/EcuDtc/AppUser — not REMAN's 4D). job_*
// columns are nullable on purpose: every unit tested gets a row here
// whether or not it's tied to a REMAN job, so this is the complete history
// regardless of job linkage. report_json keeps the full EcuReportDraft
// snapshot so a past report can be reviewed or re-printed later.

use crate::database;
use crate::AppState;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

async fn ensure_table(client: &tokio_postgres::Client) -> Result<(), String> {
    client
        .execute(
            r#"CREATE TABLE IF NOT EXISTS "SignalHilTest" (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                operator TEXT,
                verdict TEXT,
                reason TEXT,
                abs_ref TEXT,
                manufacturer TEXT,
                wss_type TEXT,
                brand TEXT,
                ecu_name TEXT,
                hardware_family TEXT,
                protocol TEXT,
                send_id TEXT,
                recv_id TEXT,
                fault_count INTEGER NOT NULL DEFAULT 0,
                current_peak_a DOUBLE PRECISION,
                voltage_v DOUBLE PRECISION,
                job_number TEXT,
                job_label TEXT,
                ligcde_id TEXT,
                notes TEXT,
                report_json TEXT NOT NULL
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            r#"CREATE INDEX IF NOT EXISTS signal_hil_test_created_at_idx ON "SignalHilTest" (created_at DESC)"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalHilTestInput {
    pub operator: Option<String>,
    pub verdict: Option<String>,
    pub reason: Option<String>,
    pub abs_ref: Option<String>,
    pub manufacturer: Option<String>,
    pub wss_type: Option<String>,
    pub brand: Option<String>,
    pub ecu_name: Option<String>,
    pub hardware_family: Option<String>,
    pub protocol: Option<String>,
    pub send_id: Option<String>,
    pub recv_id: Option<String>,
    #[serde(default)]
    pub fault_count: i32,
    pub current_peak_a: Option<f64>,
    pub voltage_v: Option<f64>,
    /// Missing whenever the unit isn't linked to a REMAN job.
    pub job_number: Option<String>,
    pub job_label: Option<String>,
    pub ligcde_id: Option<String>,
    pub notes: Option<String>,
    /// Full EcuReportDraft snapshot, as sent by the frontend — opaque here.
    pub report_json: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalHilTestRow {
    pub id: String,
    pub created_at: String,
    pub operator: Option<String>,
    pub verdict: Option<String>,
    pub reason: Option<String>,
    pub abs_ref: Option<String>,
    pub manufacturer: Option<String>,
    pub wss_type: Option<String>,
    pub brand: Option<String>,
    pub ecu_name: Option<String>,
    pub hardware_family: Option<String>,
    pub protocol: Option<String>,
    pub send_id: Option<String>,
    pub recv_id: Option<String>,
    pub fault_count: i32,
    pub current_peak_a: Option<f64>,
    pub voltage_v: Option<f64>,
    pub job_number: Option<String>,
    pub job_label: Option<String>,
    pub ligcde_id: Option<String>,
    pub notes: Option<String>,
    pub report_json: String,
}

const ROW_COLUMNS: &str = r#"id, created_at, operator, verdict, reason, abs_ref, manufacturer,
    wss_type, brand, ecu_name, hardware_family, protocol, send_id, recv_id, fault_count,
    current_peak_a, voltage_v, job_number, job_label, ligcde_id, notes, report_json"#;

fn row_to_struct(r: &tokio_postgres::Row) -> SignalHilTestRow {
    SignalHilTestRow {
        id: r.get(0),
        created_at: r.get(1),
        operator: r.get(2),
        verdict: r.get(3),
        reason: r.get(4),
        abs_ref: r.get(5),
        manufacturer: r.get(6),
        wss_type: r.get(7),
        brand: r.get(8),
        ecu_name: r.get(9),
        hardware_family: r.get(10),
        protocol: r.get(11),
        send_id: r.get(12),
        recv_id: r.get(13),
        fault_count: r.get(14),
        current_peak_a: r.get(15),
        voltage_v: r.get(16),
        job_number: r.get(17),
        job_label: r.get(18),
        ligcde_id: r.get(19),
        notes: r.get(20),
        report_json: r.get(21),
    }
}

#[tauri::command]
pub async fn save_signal_hil_test(
    input: SignalHilTestInput,
    state: State<'_, AppState>,
) -> Result<SignalHilTestRow, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_table(&client).await?;

    let id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    client
        .execute(
            &format!(
                r#"INSERT INTO "SignalHilTest" ({ROW_COLUMNS})
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)"#
            ),
            &[
                &id,
                &created_at,
                &input.operator,
                &input.verdict,
                &input.reason,
                &input.abs_ref,
                &input.manufacturer,
                &input.wss_type,
                &input.brand,
                &input.ecu_name,
                &input.hardware_family,
                &input.protocol,
                &input.send_id,
                &input.recv_id,
                &input.fault_count,
                &input.current_peak_a,
                &input.voltage_v,
                &input.job_number,
                &input.job_label,
                &input.ligcde_id,
                &input.notes,
                &input.report_json,
            ],
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(SignalHilTestRow {
        id,
        created_at,
        operator: input.operator,
        verdict: input.verdict,
        reason: input.reason,
        abs_ref: input.abs_ref,
        manufacturer: input.manufacturer,
        wss_type: input.wss_type,
        brand: input.brand,
        ecu_name: input.ecu_name,
        hardware_family: input.hardware_family,
        protocol: input.protocol,
        send_id: input.send_id,
        recv_id: input.recv_id,
        fault_count: input.fault_count,
        current_peak_a: input.current_peak_a,
        voltage_v: input.voltage_v,
        job_number: input.job_number,
        job_label: input.job_label,
        ligcde_id: input.ligcde_id,
        notes: input.notes,
        report_json: input.report_json,
    })
}

/// Newest first. `search` matches (case-insensitively) the ABS ref, ECU
/// name, manufacturer, job number or job label — enough to find a unit by
/// any of the things a technician would remember about it.
#[tauri::command]
pub async fn list_signal_hil_tests(
    search: Option<String>,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<SignalHilTestRow>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_table(&client).await?;

    let cap = limit.unwrap_or(300).clamp(1, 2000);
    let needle = search.filter(|s| !s.trim().is_empty()).map(|s| format!("%{}%", s.trim()));

    let rows = if let Some(needle) = needle {
        client
            .query(
                &format!(
                    r#"SELECT {ROW_COLUMNS} FROM "SignalHilTest"
                       WHERE abs_ref ILIKE $1 OR ecu_name ILIKE $1 OR manufacturer ILIKE $1
                          OR job_number ILIKE $1 OR job_label ILIKE $1
                       ORDER BY created_at DESC LIMIT $2"#
                ),
                &[&needle, &cap],
            )
            .await
    } else {
        client
            .query(
                &format!(r#"SELECT {ROW_COLUMNS} FROM "SignalHilTest" ORDER BY created_at DESC LIMIT $1"#),
                &[&cap],
            )
            .await
    }
    .map_err(|e| e.to_string())?;

    Ok(rows.iter().map(row_to_struct).collect())
}

#[tauri::command]
pub async fn delete_signal_hil_test(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_table(&client).await?;
    client
        .execute(r#"DELETE FROM "SignalHilTest" WHERE id = $1"#, &[&id])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
