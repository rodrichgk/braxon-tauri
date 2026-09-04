// BRAXON client registry + shared scan tables.
//
// Every BRAXON install talks directly to the same Postgres (see
// database.rs / reman.rs) — that shared DB is already the app's
// cross-client coordination bus (RemanLiveCache, cross-client
// notifications). QR-code scanning reuses it:
//
//   * "BraxonClient"     — one row per install, refreshed on a heartbeat.
//                          Lets us answer "how many clients are running"
//                          and resolve a pc_id in a QR to a real machine.
//   * "BraxonScanInbox"  — a phone (via the standalone scan-service on the
//                          Ubuntu box, see scan-service/) INSERTs one row
//                          addressed to a pc_id; that machine's app polls
//                          it (scan_inbox.rs) and opens the job.
//
// The pc_id is a UUID generated once and persisted next to db_config.json
// in %APPDATA%\braxon\. Hostname / OS user are captured too, purely so the
// registry and the phone confirmation page can show something
// human-readable instead of a bare UUID.

use crate::database;
use crate::AppState;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{async_runtime, State};

/// How often each client re-stamps its `last_seen`. `braxon_active_clients`
/// counts anything seen in the last 2 minutes as online, so this has ~2.5x
/// headroom for a missed beat (slow DB, brief network blip) before a
/// running client drops off the count.
const HEARTBEAT_SECS: u64 = 45;

/// Path to the persisted pc_id, in the same %APPDATA%\braxon\ directory as
/// db_config.json.
fn client_id_path() -> std::path::PathBuf {
    database::config_dir().join("client_id.txt")
}

/// Stable per-install id. Read from disk, or generated once and persisted.
/// Falls back to an ephemeral in-memory UUID if the file can't be written
/// (read-only profile, permissions) — a new id every launch is worse for
/// the client count but never blocks the app.
pub fn client_id() -> &'static str {
    static ID: OnceLock<String> = OnceLock::new();
    ID.get_or_init(|| {
        let path = client_id_path();
        if let Ok(existing) = std::fs::read_to_string(&path) {
            let trimmed = existing.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        let fresh = uuid::Uuid::new_v4().to_string();
        if let Err(e) = std::fs::write(&path, &fresh) {
            eprintln!("[registry] could not persist client id to {path:?}: {e} — using an ephemeral id this session");
        }
        fresh
    })
}

fn hostname() -> String {
    #[cfg(windows)]
    let raw = std::env::var("COMPUTERNAME").ok();
    #[cfg(not(windows))]
    let raw = std::env::var("HOSTNAME").ok();
    raw.filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn os_user() -> String {
    #[cfg(windows)]
    let raw = std::env::var("USERNAME").ok();
    #[cfg(not(windows))]
    let raw = std::env::var("USER").ok();
    raw.filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// What the frontend needs to build a QR value and label it — see
/// src/lib/braxonScan.ts.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClientIdentity {
    pub pc_id: String,
    pub hostname: String,
    pub os_user: String,
    pub app_version: String,
}

fn identity() -> ClientIdentity {
    ClientIdentity {
        pc_id: client_id().to_string(),
        hostname: hostname(),
        os_user: os_user(),
        app_version: app_version().to_string(),
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActiveClient {
    pub pc_id: String,
    pub hostname: Option<String>,
    pub os_user: Option<String>,
    pub app_version: Option<String>,
    /// ISO-ish UTC text (`YYYY-MM-DDTHH:MM:SSZ`) — tokio-postgres here has
    /// no chrono feature, so timestamps come back as text.
    pub last_seen: Option<String>,
    /// True for the row belonging to this machine.
    pub is_me: bool,
}

static SCAN_TABLES_ENSURED: AtomicBool = AtomicBool::new(false);

/// Creates the two shared tables if they're not there yet. Idempotent and
/// safe to call from every client on every poll — the standalone
/// scan-service creates the identical schema on its own boot, whichever
/// runs first wins. Mirrors reman.rs's `ensure_reman_cache_tables` (its
/// own atomic-guarded `CREATE TABLE IF NOT EXISTS` block) rather than
/// extending it — this pair isn't REMAN-specific.
pub async fn ensure_scan_tables(client: &tokio_postgres::Client) -> Result<(), String> {
    if SCAN_TABLES_ENSURED.load(Ordering::Relaxed) {
        return Ok(());
    }
    client
        .batch_execute(
            r#"
            CREATE TABLE IF NOT EXISTS "BraxonClient" (
                pc_id       TEXT PRIMARY KEY,
                hostname    TEXT,
                os_user     TEXT,
                app_version TEXT,
                first_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
                last_seen   TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS "BraxonScanInbox" (
                id          BIGSERIAL PRIMARY KEY,
                pc_id       TEXT NOT NULL,
                entity      TEXT NOT NULL,
                key         TEXT NOT NULL,
                label       TEXT,
                source      TEXT,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                consumed_at TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS "BraxonScanInbox_pending_idx"
                ON "BraxonScanInbox" (pc_id, created_at)
                WHERE consumed_at IS NULL;
            "#,
        )
        .await
        .map_err(|e| e.to_string())?;
    SCAN_TABLES_ENSURED.store(true, Ordering::Relaxed);
    Ok(())
}

async fn upsert_heartbeat(client: &tokio_postgres::Client) -> Result<(), String> {
    let pc_id = client_id().to_string();
    let host = hostname();
    let user = os_user();
    let version = app_version().to_string();
    client
        .execute(
            r#"INSERT INTO "BraxonClient" (pc_id, hostname, os_user, app_version, last_seen)
               VALUES ($1, $2, $3, $4, now())
               ON CONFLICT (pc_id) DO UPDATE SET
                   hostname    = EXCLUDED.hostname,
                   os_user     = EXCLUDED.os_user,
                   app_version = EXCLUDED.app_version,
                   last_seen   = now()"#,
            &[&pc_id, &host, &user, &version],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Heartbeat loop — same shape as reman.rs's `spawn_cross_client_notification_scanner`
/// (lock the shared config, connect, do the thing, sleep, repeat; every
/// failure just logs and retries on the next tick). No-ops quietly while
/// the DB is unconfigured (empty host) or unreachable.
pub fn spawn_client_registry(db_config: Arc<Mutex<database::DbConfig>>) {
    async_runtime::spawn(async move {
        loop {
            let config = db_config.lock().map(|c| c.clone()).ok();
            if let Some(config) = config.filter(|c| !c.host.trim().is_empty()) {
                match database::connect(&config).await {
                    Ok(client) => {
                        if let Err(e) = ensure_scan_tables(&client).await {
                            eprintln!("[registry] failed to ensure scan tables: {e}");
                        } else if let Err(e) = upsert_heartbeat(&client).await {
                            eprintln!("[registry] heartbeat failed, will retry: {e}");
                        }
                    }
                    Err(e) => eprintln!("[registry] could not connect to Postgres: {e}"),
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(HEARTBEAT_SECS)).await;
        }
    });
}

#[tauri::command]
pub fn braxon_client_identity() -> ClientIdentity {
    identity()
}

/// Everything seen in the last 2 minutes — one heartbeat is 45s, so a live
/// client always lands inside this window. `is_me` marks this machine's own
/// row so the UI can say "this PC" next to it.
#[tauri::command]
pub async fn braxon_active_clients(state: State<'_, AppState>) -> Result<Vec<ActiveClient>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    if config.host.trim().is_empty() {
        return Ok(Vec::new());
    }
    let client = database::connect(&config).await?;
    ensure_scan_tables(&client).await?;
    let me = client_id();
    let rows = client
        .query(
            r#"SELECT pc_id, hostname, os_user, app_version,
                      to_char(last_seen AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen
               FROM "BraxonClient"
               WHERE last_seen > now() - interval '2 minutes'
               ORDER BY hostname NULLS LAST, pc_id"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .map(|r| {
            let pc_id: String = r.get("pc_id");
            ActiveClient {
                is_me: pc_id == me,
                pc_id,
                hostname: r.get("hostname"),
                os_user: r.get("os_user"),
                app_version: r.get("app_version"),
                last_seen: r.get("last_seen"),
            }
        })
        .collect())
}
