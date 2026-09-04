use serde::{Deserialize, Serialize};
use tokio_postgres::{Client, NoTls};
use tauri::async_runtime;

// Database connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbConfig {
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
}

impl Default for DbConfig {
    fn default() -> Self {
        Self {
            host: String::new(),
            port: 5432,
            database: String::new(),
            username: String::new(),
            password: String::new(),
        }
    }
}

/// %APPDATA%\braxon — holds db_config.json and client_id.txt. Kept outside
/// src-tauri/ so Tauri's dev watcher doesn't trigger a hot-reload on writes.
/// (Was "pic-abs-tester" before v1.1 — see `migrate_legacy_config_dir`.)
pub fn config_dir() -> std::path::PathBuf {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".to_string());
    let dir = std::path::Path::new(&appdata).join("braxon");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// Returns the path to db_config.json stored in %APPDATA%\braxon\.
pub fn config_path() -> std::path::PathBuf {
    config_dir().join("db_config.json")
}

/// One-time copy of everything from the old "pic-abs-tester" folder into the
/// new "braxon" one, so an existing install keeps its DB credentials after
/// the rename. Copies rather than moves, so an older BRAXON build on the
/// same machine still finds its config. Call once at startup before reading
/// `config_path()`.
pub fn migrate_legacy_config_dir() {
    let new_dir = config_dir();
    if new_dir.join("db_config.json").exists() {
        return; // already on the new layout
    }
    let appdata = match std::env::var("APPDATA") {
        Ok(v) => v,
        Err(_) => return,
    };
    let legacy = std::path::Path::new(&appdata).join("pic-abs-tester");
    if !legacy.join("db_config.json").exists() {
        return; // nothing to migrate
    }
    if let Ok(entries) = std::fs::read_dir(&legacy) {
        for entry in entries.flatten() {
            let from = entry.path();
            if from.is_file() {
                if let Some(name) = from.file_name() {
                    let _ = std::fs::copy(&from, new_dir.join(name));
                }
            }
        }
        eprintln!("[config] migrated settings from {legacy:?} to {new_dir:?}");
    }
}

/// Create a new PostgreSQL client connection.
/// Each call creates a new connection - suitable for a desktop app.
pub async fn connect(config: &DbConfig) -> Result<Client, String> {
    let connection_string = format!(
        "host={} port={} dbname={} user={} password='{}' sslmode=disable",
        config.host, config.port, config.database, config.username, config.password
    );

    let (client, connection) = tokio_postgres::connect(&connection_string, NoTls)
        .await
        .map_err(|e| format!("DB connection failed: {}", e))?;

    async_runtime::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("PostgreSQL connection error: {}", e);
        }
    });

    Ok(client)
}

// ---- Model structs (match Prisma schema exactly) ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ABSModule {
    pub id: String,
    pub name: String,
    #[serde(rename = "valveCount")]
    pub valve_count: i32,
    pub description: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ABSData {
    pub id: String,
    pub reference: String,
    pub manufacturer: String,
    #[serde(rename = "wssType")]
    pub wss_type: Option<String>,
    #[serde(rename = "absAdapter")]
    pub abs_adapter: Option<String>,
    #[serde(rename = "absConnector")]
    pub abs_connector: Option<String>,
    #[serde(rename = "canSpeed")]
    pub can_speed: Option<String>,
    #[serde(rename = "canIdLine")]
    pub can_id_line: Option<String>,
    #[serde(rename = "canByte")]
    pub can_byte: Option<String>,
    #[serde(rename = "canValue")]
    pub can_value: Option<String>,
    pub comments: Option<String>,
    #[serde(rename = "testValidated")]
    pub test_validated: Option<String>,
    #[serde(rename = "otherReferences")]
    pub other_references: Option<String>,
    #[serde(rename = "kLine")]
    pub k_line: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalProfile {
    pub id: String,
    pub name: String,
    pub points: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MotorTest {
    pub id: String,
    #[serde(rename = "motorType")]
    pub motor_type: String,
    #[serde(rename = "jobNumber")]
    pub job_number: String,
    pub report: Option<String>,
    #[serde(rename = "testResult")]
    pub test_result: String,
    #[serde(rename = "testDuration")]
    pub test_duration: f64,
    pub category: String,
    #[serde(rename = "testData")]
    pub test_data: String,
    #[serde(rename = "excludeZones")]
    pub exclude_zones: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}
