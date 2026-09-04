// Polls "BraxonScanInbox" for scans addressed to this machine and forwards
// them to the webview.
//
// Flow: a phone opens the QR's URL -> the standalone scan-service on the
// Ubuntu box (see scan-service/) INSERTs one row into "BraxonScanInbox"
// with this machine's pc_id -> this loop claims the row (sets consumed_at
// so no other tick, here or on a restart, re-fires it) and emits
// `braxon-scan` -> src/components/ScanListener.tsx navigates to the job.
//
// One small indexed query every few seconds. The app already polls
// 4D-backed queues every 15s (reman.rs INTERVENTIONS_REFRESH_MS); this is
// far cheaper — a partial-index lookup on `(pc_id) WHERE consumed_at IS
// NULL` that returns nothing on the vast majority of ticks.

use crate::client_registry::{client_id, ensure_scan_tables};
use crate::database;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{async_runtime, AppHandle, Manager};

const POLL_MS: u64 = 2500;

/// Only rows this fresh are acted on. A phone scan is meant to be picked up
/// within seconds; anything older is a client that was offline when the
/// scan happened (still claimed on this pass so it doesn't pile up, just
/// not surfaced — opening a job nobody asked for minutes later would be
/// more confusing than silently dropping it).
const MAX_AGE: &str = "2 minutes";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScanEvent {
    entity: String,
    key: String,
    label: Option<String>,
}

async fn drain_once(client: &tokio_postgres::Client, app: &AppHandle) -> Result<(), String> {
    let pc_id = client_id().to_string();
    let rows = client
        .query(
            &format!(
                r#"UPDATE "BraxonScanInbox" SET consumed_at = now()
                   WHERE id IN (
                       SELECT id FROM "BraxonScanInbox"
                       WHERE pc_id = $1 AND consumed_at IS NULL
                       ORDER BY id
                       LIMIT 10
                   )
                   RETURNING entity, key, label,
                             (created_at > now() - interval '{MAX_AGE}') AS fresh"#
            ),
            &[&pc_id],
        )
        .await
        .map_err(|e| e.to_string())?;

    for row in rows {
        let fresh: bool = row.get("fresh");
        let event = ScanEvent {
            entity: row.get("entity"),
            key: row.get("key"),
            label: row.get("label"),
        };
        if !fresh {
            eprintln!("[scan-inbox] dropping stale scan {}/{}", event.entity, event.key);
            continue;
        }
        eprintln!("[scan-inbox] delivering {}/{} to webview", event.entity, event.key);
        if let Err(e) = app.emit_all("braxon-scan", &event) {
            eprintln!("[scan-inbox] emit failed: {e}");
        }
    }
    Ok(())
}

/// Spawned from main.rs's `.setup()` (it needs the `AppHandle` to emit).
/// Same connect / do-work / sleep / retry loop as the registry heartbeat;
/// quiet no-op while the DB is unconfigured or unreachable.
pub fn spawn_scan_inbox_poller(app: AppHandle, db_config: Arc<Mutex<database::DbConfig>>) {
    async_runtime::spawn(async move {
        eprintln!("[scan-inbox] polling for pc_id={}", client_id());
        loop {
            let config = db_config.lock().map(|c| c.clone()).ok();
            if let Some(config) = config.filter(|c| !c.host.trim().is_empty()) {
                match database::connect(&config).await {
                    Ok(client) => {
                        if let Err(e) = ensure_scan_tables(&client).await {
                            eprintln!("[scan-inbox] failed to ensure scan tables: {e}");
                        } else if let Err(e) = drain_once(&client, &app).await {
                            eprintln!("[scan-inbox] poll failed, will retry: {e}");
                        }
                    }
                    Err(e) => eprintln!("[scan-inbox] could not connect to Postgres: {e}"),
                }
            }
            tokio::time::sleep(std::time::Duration::from_millis(POLL_MS)).await;
        }
    });
}
