// Generic shared key/value settings, in BRAXON's own Postgres — one row
// per key, last write wins. Currently used for `hidden_pages` (the list of
// sidebar pages the developer has hidden from the rest of the shop while
// they're still in development, see src/contexts/DevGateContext.tsx), but
// deliberately generic so other app-wide toggles can reuse it.

use crate::database;
use crate::AppState;
use chrono::Utc;
use tauri::State;

async fn ensure_table(client: &tokio_postgres::Client) -> Result<(), String> {
    client
        .execute(
            r#"CREATE TABLE IF NOT EXISTS "AppSetting" (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_app_setting(key: String, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_table(&client).await?;
    let row = client
        .query_opt(r#"SELECT value FROM "AppSetting" WHERE key = $1"#, &[&key])
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.map(|r| r.get(0)))
}

#[tauri::command]
pub async fn set_app_setting(key: String, value: String, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_table(&client).await?;
    let now = Utc::now().to_rfc3339();
    client
        .execute(
            r#"INSERT INTO "AppSetting" (key, value, updated_at) VALUES ($1, $2, $3)
               ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3"#,
            &[&key, &value, &now],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
