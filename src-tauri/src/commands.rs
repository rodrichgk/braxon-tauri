use crate::database::{self, ABSData, ABSModule, DbConfig, MotorTest, SignalProfile};
use crate::serial::{self, SerialPortData};
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use chrono::Utc;
use uuid::Uuid;

// ---- Serial Port Commands ----

#[tauri::command]
pub async fn get_serial_ports() -> Result<Vec<SerialPortData>, String> {
    serial::SerialConnection::list_ports()
}

#[tauri::command]
pub async fn connect_serial(_port_name: String, _baud_rate: u32) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn disconnect_serial() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn send_serial_message(_message: String) -> Result<(), String> {
    Ok(())
}

// ---- WebSocket Device Commands ----

#[tauri::command]
pub async fn get_devices() -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn select_device(_device_id: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub async fn send_device_message(_device_id: String, _message: String) -> Result<(), String> {
    Ok(())
}

// ---- DB Config Commands ----

#[tauri::command]
pub async fn get_db_config(state: State<'_, AppState>) -> Result<DbConfig, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    Ok(config)
}

#[tauri::command]
pub async fn save_db_config(config: DbConfig, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut current = state.db_config.lock().map_err(|e| e.to_string())?;
        *current = config.clone();
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(database::config_path(), json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn test_db_connection(state: State<'_, AppState>) -> Result<String, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let row = client
        .query_one("SELECT version()", &[])
        .await
        .map_err(|e| format!("Query failed: {}", e))?;
    let version: String = row.try_get(0).map_err(|e| format!("Failed to read version: {}", e))?;
    Ok(format!("Connected! PostgreSQL {}", version))
}

// ---- ABS Module Commands ----

#[tauri::command]
pub async fn get_modules(state: State<'_, AppState>) -> Result<Vec<ABSModule>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let rows = client
        .query(
            r#"SELECT id, name, "valveCount", description, "createdAt"::text, "updatedAt"::text FROM "ABSModule" ORDER BY name"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;

    let modules = rows
        .iter()
        .map(|row| ABSModule {
            id: row.get(0),
            name: row.get(1),
            valve_count: row.get(2),
            description: row.get(3),
            created_at: row.get(4),
            updated_at: row.get(5),
        })
        .collect();
    Ok(modules)
}

#[tauri::command]
pub async fn create_module(name: String, valve_count: i32, description: String, state: State<'_, AppState>) -> Result<ABSModule, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    client
        .execute(
            r#"INSERT INTO "ABSModule" (id, name, "valveCount", description, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)"#,
            &[&id, &name, &valve_count, &description, &now, &now],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(ABSModule { id, name, valve_count, description, created_at: now.clone(), updated_at: now })
}

#[tauri::command]
pub async fn delete_module(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    client
        .execute(r#"DELETE FROM "ABSModule" WHERE id = $1"#, &[&id])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---- ABS Data Commands ----

#[tauri::command]
pub async fn get_abs_data(state: State<'_, AppState>) -> Result<Vec<ABSData>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let rows = client
        .query(
            r#"SELECT id, reference, manufacturer, "wssType", "absAdapter", "absConnector", "canSpeed", "canIdLine", "canByte", "canValue", comments, "testValidated", "otherReferences", "createdAt"::text, "updatedAt"::text FROM "ABSData" ORDER BY reference LIMIT 100"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;

    let data = rows
        .iter()
        .map(|row| ABSData {
            id: row.get(0),
            reference: row.get(1),
            manufacturer: row.get(2),
            wss_type: row.get(3),
            abs_adapter: row.get(4),
            abs_connector: row.get(5),
            can_speed: row.get(6),
            can_id_line: row.get(7),
            can_byte: row.get(8),
            can_value: row.get(9),
            comments: row.get(10),
            test_validated: row.get(11),
            other_references: row.get(12),
            created_at: row.get(13),
            updated_at: row.get(14),
        })
        .collect();
    Ok(data)
}

#[tauri::command]
pub async fn search_abs_data(query: String, state: State<'_, AppState>) -> Result<Vec<ABSData>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let pattern = format!("%{}%", query);
    let rows = client
        .query(
            r#"SELECT id, reference, manufacturer, "wssType", "absAdapter", "absConnector", "canSpeed", "canIdLine", "canByte", "canValue", comments, "testValidated", "otherReferences", "createdAt"::text, "updatedAt"::text FROM "ABSData" WHERE reference ILIKE $1 OR manufacturer ILIKE $1 OR "wssType" ILIKE $1 ORDER BY reference LIMIT 50"#,
            &[&pattern],
        )
        .await
        .map_err(|e| e.to_string())?;

    let data = rows
        .iter()
        .map(|row| ABSData {
            id: row.get(0),
            reference: row.get(1),
            manufacturer: row.get(2),
            wss_type: row.get(3),
            abs_adapter: row.get(4),
            abs_connector: row.get(5),
            can_speed: row.get(6),
            can_id_line: row.get(7),
            can_byte: row.get(8),
            can_value: row.get(9),
            comments: row.get(10),
            test_validated: row.get(11),
            other_references: row.get(12),
            created_at: row.get(13),
            updated_at: row.get(14),
        })
        .collect();
    Ok(data)
}

#[tauri::command]
pub async fn save_abs_data(data: ABSData, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let now = Utc::now().to_rfc3339();
    client
        .execute(
            r#"INSERT INTO "ABSData" (id, reference, manufacturer, "wssType", "absAdapter", "absConnector", "canSpeed", "canIdLine", "canByte", "canValue", comments, "testValidated", "otherReferences", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::timestamptz,$15::timestamptz)"#,
            &[&data.id, &data.reference, &data.manufacturer, &data.wss_type, &data.abs_adapter, &data.abs_connector, &data.can_speed, &data.can_id_line, &data.can_byte, &data.can_value, &data.comments, &data.test_validated, &data.other_references, &now, &now],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_abs_data(data: ABSData, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let now = Utc::now().to_rfc3339();
    client
        .execute(
            r#"UPDATE "ABSData" SET manufacturer=$2, "wssType"=$3, "absAdapter"=$4, "absConnector"=$5, "canSpeed"=$6, "canIdLine"=$7, "canByte"=$8, "canValue"=$9, comments=$10, "testValidated"=$11, "otherReferences"=$12, "updatedAt"=$13::timestamptz WHERE id=$1"#,
            &[&data.id, &data.manufacturer, &data.wss_type, &data.abs_adapter, &data.abs_connector, &data.can_speed, &data.can_id_line, &data.can_byte, &data.can_value, &data.comments, &data.test_validated, &data.other_references, &now],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_abs_data(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    client
        .execute(r#"DELETE FROM "ABSData" WHERE id = $1"#, &[&id])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Signal Profile Commands ----

#[tauri::command]
pub async fn get_profiles(state: State<'_, AppState>) -> Result<Vec<SignalProfile>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let rows = client
        .query(
            r#"SELECT id, name, points, "isDefault", "createdAt"::text, "updatedAt"::text FROM "SignalProfile" ORDER BY name"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;

    let profiles = rows
        .iter()
        .map(|row| SignalProfile {
            id: row.get(0),
            name: row.get(1),
            points: row.get(2),
            is_default: row.get(3),
            created_at: row.get(4),
            updated_at: row.get(5),
        })
        .collect();
    Ok(profiles)
}

#[tauri::command]
pub async fn save_profile(profile: SignalProfile, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let now = Utc::now().to_rfc3339();
    client
        .execute(
            r#"INSERT INTO "SignalProfile" (id, name, points, "isDefault", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz) ON CONFLICT (id) DO UPDATE SET name=$2, points=$3, "isDefault"=$4, "updatedAt"=$6::timestamptz"#,
            &[&profile.id, &profile.name, &profile.points, &profile.is_default, &now, &now],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_profile(profile: SignalProfile, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let now = Utc::now().to_rfc3339();
    client
        .execute(
            r#"UPDATE "SignalProfile" SET name=$2, points=$3, "isDefault"=$4, "updatedAt"=$5::timestamptz WHERE id=$1"#,
            &[&profile.id, &profile.name, &profile.points, &profile.is_default, &now],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_profile(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    client
        .execute(r#"DELETE FROM "SignalProfile" WHERE id = $1"#, &[&id])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---- Motor Test Commands ----

#[tauri::command]
pub async fn get_motor_tests(state: State<'_, AppState>) -> Result<Vec<MotorTest>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let rows = client
        .query(
            r#"SELECT id, "motorType", "jobNumber", report, "testResult", "testDuration", category, "testData", "excludeZones", "createdAt"::text, "updatedAt"::text FROM "MotorTest" ORDER BY "createdAt" DESC LIMIT 100"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;

    let tests = rows
        .iter()
        .map(|row| MotorTest {
            id: row.get(0),
            motor_type: row.get(1),
            job_number: row.get(2),
            report: row.get(3),
            test_result: row.get(4),
            test_duration: row.get(5),
            category: row.get(6),
            test_data: row.get(7),
            exclude_zones: row.get(8),
            created_at: row.get(9),
            updated_at: row.get(10),
        })
        .collect();
    Ok(tests)
}

#[tauri::command]
pub async fn save_motor_test(test: MotorTest, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let now = Utc::now().to_rfc3339();
    client
        .execute(
            r#"INSERT INTO "MotorTest" (id, "motorType", "jobNumber", report, "testResult", "testDuration", category, "testData", "excludeZones", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz)"#,
            &[&test.id, &test.motor_type, &test.job_number, &test.report, &test.test_result, &test.test_duration, &test.category, &test.test_data, &test.exclude_zones, &now, &now],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
