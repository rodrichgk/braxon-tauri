// Cluster Bench signal catalog — the shared, growing list of "every possible
// dashboard light/sensor" a technician can pick from in the Cluster Bench UI
// (src/components/ClusterBenchDashboard.tsx), per docs/DASHBOARD-BENCH.md.
//
// "ClusterBenchSignal" is BRAXON-owned Postgres (same DB as
// RepairJob/EcuDtc/SignalHilTest — see DATABASE.md), not REMAN's 4D. It
// holds only *display* metadata (kind/category/unit/icon) — a stable,
// human-meaningful key any tech or future vehicle profile can reference.
// It deliberately does NOT hold CAN wiring (frame id, bit position, scale):
// that's per-vehicle and belongs to a future profile table (see
// docs/DASHBOARD-BENCH.md §8's still-open "profile storage" decision); the
// demo profile's wiring stays in `src/lib/builtinClusterCanProfiles.ts` for
// now. `get_cluster_bench_catalog` self-seeds the builtin list on every call
// (`ON CONFLICT (name) DO NOTHING`) so a fresh DB "just works" without a
// separate import step, the same way `EcuDtc` is populated by
// `import_ecu_dtcs` — except this seed has no external file to import, so
// it seeds itself from `SEED_SIGNALS` below.

use crate::database;
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

async fn ensure_table(client: &tokio_postgres::Client) -> Result<(), String> {
    client
        .execute(
            r#"CREATE TABLE IF NOT EXISTS "ClusterBenchSignal" (
                name       TEXT PRIMARY KEY,
                kind       TEXT NOT NULL,
                category   TEXT NOT NULL,
                unit       TEXT,
                icon_key   TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClusterBenchSignalRow {
    pub name: String,
    pub kind: String,
    pub category: String,
    pub unit: Option<String>,
    pub icon_key: Option<String>,
    pub sort_order: i32,
}

fn row_to_struct(r: &tokio_postgres::Row) -> ClusterBenchSignalRow {
    ClusterBenchSignalRow {
        name: r.get(0),
        kind: r.get(1),
        category: r.get(2),
        unit: r.get(3),
        icon_key: r.get(4),
        sort_order: r.get(5),
    }
}

/// `(name, kind, category, unit, icon_key)`. `kind` is "gauge" or
/// "telltale"; `category` groups the picker UI ("gauge", "lighting",
/// "safety", "drivetrain", "doors"). Covers the common ISO 2575 dashboard
/// symbol set — a real vehicle only lights up a subset, which is exactly
/// why the UI lets a tech hide the rest per vehicle/test rather than
/// showing all of them unconditionally. `icon_key` is a lookup key into the
/// frontend's own icon registry (`src/components/ClusterBenchDashboard.tsx`)
/// — Postgres has no business holding a React component reference.
const SEED_SIGNALS: &[(&str, &str, &str, Option<&str>, Option<&str>)] = &[
    // ---- Gauges ----
    ("fuel_pct", "gauge", "gauge", Some("%"), None),
    ("coolant_temp_c", "gauge", "gauge", Some("°C"), None),
    ("rpm", "gauge", "gauge", Some("rpm"), None),
    ("speed_kmh", "gauge", "gauge", Some("km/h"), None),
    ("oil_temp_c", "gauge", "gauge", Some("°C"), None),
    ("battery_voltage", "gauge", "gauge", Some("V"), None),
    ("boost_pressure_bar", "gauge", "gauge", Some("bar"), None),
    ("oil_pressure_bar", "gauge", "gauge", Some("bar"), None),
    // ---- Safety telltales ----
    ("handbrake", "telltale", "safety", None, Some("hand-raised")),
    ("seatbelt", "telltale", "safety", None, Some("user")),
    ("seatbelt_passenger", "telltale", "safety", None, Some("user")),
    ("oil_pressure", "telltale", "safety", None, Some("beaker")),
    ("check_engine", "telltale", "safety", None, Some("cpu-chip")),
    ("battery", "telltale", "safety", None, Some("battery")),
    ("abs_fault", "telltale", "safety", None, Some("arrow-path")),
    ("fuel_low", "telltale", "safety", None, Some("exclamation-triangle")),
    ("airbag", "telltale", "safety", None, Some("shield-exclamation")),
    ("esp_fault", "telltale", "safety", None, Some("cog")),
    ("esp_off", "telltale", "safety", None, Some("cog")),
    ("brake_system", "telltale", "safety", None, Some("exclamation-triangle")),
    ("epb_fault", "telltale", "safety", None, Some("hand-raised")),
    ("tpms", "telltale", "safety", None, Some("exclamation-triangle")),
    ("washer_fluid_low", "telltale", "safety", None, Some("beaker")),
    ("bulb_failure", "telltale", "safety", None, Some("light-bulb")),
    // ---- Drivetrain / emissions telltales ----
    ("dpf", "telltale", "drivetrain", None, Some("fire")),
    ("adblue_low", "telltale", "drivetrain", None, Some("beaker")),
    ("glow_plug", "telltale", "drivetrain", None, Some("fire")),
    ("immobilizer", "telltale", "drivetrain", None, Some("key")),
    ("service_due", "telltale", "drivetrain", None, Some("wrench")),
    ("cruise_active", "telltale", "drivetrain", None, Some("arrow-path")),
    ("trailer_connected", "telltale", "drivetrain", None, Some("truck")),
    ("steering_fault", "telltale", "drivetrain", None, Some("cog")),
    // ---- Lighting telltales ----
    ("high_beam", "telltale", "lighting", None, Some("light-bulb")),
    ("low_beam", "telltale", "lighting", None, Some("light-bulb")),
    ("front_fog", "telltale", "lighting", None, Some("sun")),
    ("rear_fog", "telltale", "lighting", None, Some("sun")),
    ("position_lights", "telltale", "lighting", None, Some("light-bulb")),
    ("hazard", "telltale", "lighting", None, Some("exclamation-triangle")),
    ("turn_left", "telltale", "lighting", None, Some("arrow-long-left")),
    ("turn_right", "telltale", "lighting", None, Some("arrow-long-right")),
    // ---- Door / body telltales ----
    ("door_open", "telltale", "doors", None, Some("arrow-right-on-rectangle")),
    ("door_fl", "telltale", "doors", None, Some("arrow-right-on-rectangle")),
    ("door_fr", "telltale", "doors", None, Some("arrow-right-on-rectangle")),
    ("door_rl", "telltale", "doors", None, Some("arrow-right-on-rectangle")),
    ("door_rr", "telltale", "doors", None, Some("arrow-right-on-rectangle")),
    ("bonnet_open", "telltale", "doors", None, Some("lock-closed")),
    ("boot_open", "telltale", "doors", None, Some("lock-closed")),
    ("coolant_level_low", "telltale", "doors", None, Some("beaker")),
];

async fn seed(client: &tokio_postgres::Client) -> Result<(), String> {
    for (i, (name, kind, category, unit, icon_key)) in SEED_SIGNALS.iter().enumerate() {
        client
            .execute(
                r#"INSERT INTO "ClusterBenchSignal" (name, kind, category, unit, icon_key, sort_order)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   ON CONFLICT (name) DO NOTHING"#,
                &[name, kind, category, unit, icon_key, &(i as i32)],
            )
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The full catalog, self-seeding on first call. Existing rows (including
/// anything a tech has since added or customized beyond the builtin set)
/// are never overwritten — only missing names are inserted.
#[tauri::command]
pub async fn get_cluster_bench_catalog(state: State<'_, AppState>) -> Result<Vec<ClusterBenchSignalRow>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_table(&client).await?;
    seed(&client).await?;

    let rows = client
        .query(
            r#"SELECT name, kind, category, unit, icon_key, sort_order
               FROM "ClusterBenchSignal" ORDER BY sort_order, name"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(row_to_struct).collect())
}

/// Add or edit one catalog entry — how a tech extends the catalog with a
/// signal the builtin seed doesn't cover, without needing a code change.
#[tauri::command]
pub async fn upsert_cluster_bench_signal(
    signal: ClusterBenchSignalRow,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_table(&client).await?;
    client
        .execute(
            r#"INSERT INTO "ClusterBenchSignal" (name, kind, category, unit, icon_key, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (name) DO UPDATE SET
                   kind = EXCLUDED.kind, category = EXCLUDED.category,
                   unit = EXCLUDED.unit, icon_key = EXCLUDED.icon_key,
                   sort_order = EXCLUDED.sort_order"#,
            &[
                &signal.name, &signal.kind, &signal.category,
                &signal.unit, &signal.icon_key, &signal.sort_order,
            ],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_has_no_duplicate_names() {
        let names: std::collections::HashSet<_> = SEED_SIGNALS.iter().map(|s| s.0).collect();
        assert_eq!(names.len(), SEED_SIGNALS.len());
    }

    #[test]
    fn every_seed_signal_is_a_gauge_or_a_telltale() {
        for (name, kind, ..) in SEED_SIGNALS {
            assert!(*kind == "gauge" || *kind == "telltale", "{name} has unknown kind {kind}");
        }
    }

    #[test]
    fn every_gauge_has_a_unit_and_no_icon_and_vice_versa_for_telltales() {
        for (name, kind, _category, unit, icon_key) in SEED_SIGNALS {
            if *kind == "gauge" {
                assert!(unit.is_some(), "{name} is a gauge with no unit");
                assert!(icon_key.is_none(), "{name} is a gauge with an icon (icons are telltale-only)");
            } else {
                assert!(unit.is_none(), "{name} is a telltale with a unit (units are gauge-only)");
                assert!(icon_key.is_some(), "{name} is a telltale with no icon_key");
            }
        }
    }

    #[test]
    fn row_serializes_to_camel_case() {
        let row = ClusterBenchSignalRow {
            name: "fuel_pct".into(),
            kind: "gauge".into(),
            category: "gauge".into(),
            unit: Some("%".into()),
            icon_key: None,
            sort_order: 0,
        };
        let v: serde_json::Value = serde_json::to_value(&row).unwrap();
        assert_eq!(v["iconKey"], serde_json::Value::Null);
        assert_eq!(v["sortOrder"], 0);
        assert!(v.get("icon_key").is_none());
    }
}
