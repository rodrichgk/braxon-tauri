use crate::database::{self, ABSData, ABSModule, DbConfig, MotorTest, SignalProfile};
use crate::serial::{self, SerialPortData};
use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
use chrono::Utc;
use uuid::Uuid;
use sha2::{Sha256, Digest};

// ---- Serial Port Commands ----

#[tauri::command]
pub async fn get_serial_ports() -> Result<Vec<SerialPortData>, String> {
    serial::SerialConnection::list_ports()
}

#[tauri::command]
pub async fn get_pico_port() -> Result<Option<String>, String> {
    Ok(serial::SerialConnection::find_pico_port())
}

#[tauri::command]
pub async fn connect_serial(
    port_name: String,
    baud_rate: u32,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    // connect() opens the port once and returns it alongside the rx channel.
    // The worker thread owns the port — no try_clone() needed.
    let (port, rx) = {
        let mut conn = state.serial_connection.lock().await;
        conn.connect(&port_name, baud_rate)?
    };

    let stop_flag = {
        let conn = state.serial_connection.lock().await;
        conn.stop_flag()
    };

    std::thread::spawn(move || {
        use std::io::{Read, Write};
        use std::sync::mpsc::TryRecvError;

        let mut port = port;
        let mut line_buf = String::new();
        let mut read_buf = [0u8; 256];

        loop {
            if stop_flag.load(std::sync::atomic::Ordering::SeqCst) {
                break;
            }

            // ---- TX: drain outgoing command queue (non-blocking) ----
            loop {
                match rx.try_recv() {
                    Ok(msg) => {
                        let data = msg.as_bytes();
                        if let Err(e) = port.write_all(data) {
                            // transient USB CDC stall on Windows — one retry
                            if e.raw_os_error() == Some(121) {
                                std::thread::sleep(std::time::Duration::from_millis(15));
                                let _ = port.write_all(data);
                            }
                        }
                    }
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => {
                        // Sender was dropped by disconnect() — exit cleanly
                        let _ = app_handle.emit_all("serial-disconnected", ());
                        return;
                    }
                }
            }

            // ---- RX: read available data (10 ms timeout) ----
            match port.read(&mut read_buf) {
                Ok(n) if n > 0 => {
                    if let Ok(chunk) = std::str::from_utf8(&read_buf[..n]) {
                        for c in chunk.chars() {
                            if c == '\n' {
                                let line = line_buf.trim().to_string();
                                if !line.is_empty() {
                                    let _ = app_handle.emit_all("serial-data", &line);
                                }
                                line_buf.clear();
                            } else if c != '\r' {
                                line_buf.push(c);
                            }
                        }
                    }
                }
                Ok(_) => {}
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => break, // device gone
            }
        }

        let _ = app_handle.emit_all("serial-disconnected", ());
    });

    Ok(())
}

#[tauri::command]
pub async fn disconnect_serial(state: State<'_, AppState>) -> Result<(), String> {
    let mut conn = state.serial_connection.lock().await;
    conn.disconnect();
    Ok(())
}

#[tauri::command]
pub async fn send_serial_message(message: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut msg = message;
    if !msg.ends_with('\n') {
        msg.push('\n');
    }
    let conn = state.serial_connection.lock().await;
    conn.send_message(msg)
}

#[tauri::command]
pub async fn is_serial_connected(state: State<'_, AppState>) -> Result<bool, String> {
    let conn = state.serial_connection.lock().await;
    Ok(conn.is_connected())
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
    Ok(format!("ok: PostgreSQL {}", version))
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

// ---- WSS Calibration Commands ----
// Store per-reference wheel speed calibration (4 channels) as JSON in the ABSData row.
// The column is added lazily with IF NOT EXISTS so no manual migration is needed.

#[tauri::command]
pub async fn save_wss_calibration(
    id: String,
    calibration: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    client
        .execute(
            r#"ALTER TABLE "ABSData" ADD COLUMN IF NOT EXISTS "wssCalibration" TEXT"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            r#"UPDATE "ABSData" SET "wssCalibration" = $2 WHERE id = $1"#,
            &[&id, &calibration],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_wss_calibration(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    client
        .execute(
            r#"ALTER TABLE "ABSData" ADD COLUMN IF NOT EXISTS "wssCalibration" TEXT"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    let row = client
        .query_opt(
            r#"SELECT "wssCalibration" FROM "ABSData" WHERE id = $1"#,
            &[&id],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.and_then(|r| r.get(0)))
}

// ---- Motor Test Commands ----

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

// ---- Auth / User Commands ----

// ── ECU DTC database ─────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EcuDtcEntry {
    pub dtc_raw:     i32,
    pub dtc_code:    String,
    pub description: String,
    pub ecu_name:    String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EcuDbStats {
    pub dtc_count: i64,
    pub ecu_count: i64,
}

/// Decode a raw 16-bit DTC integer into the standard P/C/B/U + 4-hex-digit code.
fn decode_dtc_code(raw: i32) -> String {
    let high = ((raw >> 8) & 0xFF) as u8;
    let low  = (raw & 0xFF) as u8;
    let type_char = match (high >> 6) & 0x03 {
        0 => 'P', 1 => 'C', 2 => 'B', _ => 'U',
    };
    let d1 = (high >> 4) & 0x03;
    let d2 = high & 0x0F;
    let d3 = (low >> 4) & 0x0F;
    let d4 = low & 0x0F;
    format!("{}{}{:X}{:X}{:X}", type_char, d1, d2, d3, d4)
}

async fn ensure_ecu_tables(client: &tokio_postgres::Client) -> Result<(), String> {
    client.execute(
        r#"CREATE TABLE IF NOT EXISTS "EcuDtc" (
            id          TEXT    PRIMARY KEY,
            ecu_name    TEXT    NOT NULL,
            ecu_file    TEXT    NOT NULL,
            protocol    TEXT,
            dtc_raw     INTEGER NOT NULL,
            dtc_code    TEXT    NOT NULL,
            description TEXT    NOT NULL,
            dtc_type    INTEGER DEFAULT 0,
            UNIQUE (ecu_file, dtc_raw)
        )"#,
        &[],
    ).await.map_err(|e| e.to_string())?;
    client.execute(
        r#"CREATE INDEX IF NOT EXISTS idx_ecu_dtc_raw ON "EcuDtc" (dtc_raw)"#,
        &[],
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn import_ecu_dtcs(folder_path: String, state: State<'_, AppState>) -> Result<usize, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_ecu_tables(&client).await?;

    let dir = std::fs::read_dir(&folder_path)
        .map_err(|e| format!("Cannot open folder: {}", e))?;

    let mut total = 0usize;

    for entry in dir {
        let path = match entry { Ok(e) => e.path(), Err(_) => continue };
        let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        // Only ABS*.json, skip .layout and other files
        if !filename.to_uppercase().starts_with("ABS") || !filename.ends_with(".json") {
            continue;
        }

        let file_stem = path.file_stem().and_then(|n| n.to_str()).unwrap_or("").to_string();

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c, Err(_) => continue,
        };
        let json: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v, Err(_) => continue,
        };

        let ecu_name = json["ecuname"].as_str().unwrap_or(&file_stem).to_string();
        let protocol = json["obd"]["protocol"].as_str().unwrap_or("").to_string();

        let devices = match json["devices"].as_array() {
            Some(d) => d, None => continue,
        };

        for device in devices {
            let dtc_raw = match device["dtc"].as_i64() {
                Some(v) => v as i32, None => continue,
            };
            let description = match device["name"].as_str() {
                Some(v) => v.to_string(), None => continue,
            };
            let dtc_type    = device["dtctype"].as_i64().unwrap_or(0) as i32;
            let dtc_code    = decode_dtc_code(dtc_raw);
            let id          = Uuid::new_v4().to_string();

            client.execute(
                r#"INSERT INTO "EcuDtc" (id, ecu_name, ecu_file, protocol, dtc_raw, dtc_code, description, dtc_type)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                   ON CONFLICT (ecu_file, dtc_raw) DO UPDATE SET
                       description = EXCLUDED.description,
                       dtc_code    = EXCLUDED.dtc_code,
                       ecu_name    = EXCLUDED.ecu_name"#,
                &[&id, &ecu_name, &file_stem, &protocol, &dtc_raw, &dtc_code, &description, &dtc_type],
            ).await.ok();

            total += 1;
        }
    }

    Ok(total)
}

#[tauri::command]
pub async fn lookup_dtc(dtc_raw: i32, state: State<'_, AppState>) -> Result<Option<EcuDtcEntry>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await.map_err(|e| e.to_string())?;
    let row = client.query_opt(
        r#"SELECT dtc_raw, dtc_code, description, ecu_name
           FROM "EcuDtc" WHERE dtc_raw = $1 ORDER BY ecu_name LIMIT 1"#,
        &[&dtc_raw],
    ).await.ok().flatten();
    Ok(row.map(|r| EcuDtcEntry {
        dtc_raw:     r.get(0),
        dtc_code:    r.get(1),
        description: r.get(2),
        ecu_name:    r.get(3),
    }))
}

#[tauri::command]
pub async fn get_ecu_db_stats(state: State<'_, AppState>) -> Result<EcuDbStats, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await.map_err(|e| e.to_string())?;
    let row = client.query_opt(
        r#"SELECT COUNT(*)::bigint, COUNT(DISTINCT ecu_name)::bigint FROM "EcuDtc""#,
        &[],
    ).await.ok().flatten();
    Ok(match row {
        Some(r) => EcuDbStats { dtc_count: r.get(0), ecu_count: r.get(1) },
        None    => EcuDbStats { dtc_count: 0, ecu_count: 0 },
    })
}

// ── ECU actuator commands ─────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EcuInfo {
    pub ecu_file:        String,
    pub ecu_name:        String,
    pub protocol:        String,
    pub send_id:         Option<String>,
    pub recv_id:         Option<String>,
    pub hardware_family: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActuatorEntry {
    pub id:         String,
    pub name:       String,
    pub label:      String,
    pub sent_bytes: String,
    pub category:   String,
}

#[tauri::command]
pub async fn get_ecu_list(state: State<'_, AppState>) -> Result<Vec<EcuInfo>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let rows = match client.query(
        r#"SELECT DISTINCT ON (ecu_file) ecu_file, ecu_name, protocol, send_id, recv_id, hardware_family
           FROM "EcuActuator" ORDER BY ecu_file, ecu_name"#,
        &[],
    ).await {
        Ok(r)  => r,
        Err(_) => return Ok(vec![]), // table not yet populated
    };
    Ok(rows.iter().map(|r| EcuInfo {
        ecu_file:        r.get(0),
        ecu_name:        r.get(1),
        protocol:        r.get(2),
        send_id:         r.get(3),
        recv_id:         r.get(4),
        hardware_family: r.get(5),
    }).collect())
}

#[tauri::command]
pub async fn get_ecu_actuators(ecu_file: String, state: State<'_, AppState>) -> Result<Vec<ActuatorEntry>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let rows = match client.query(
        r#"SELECT id, name, label, sent_bytes, category
           FROM "EcuActuator" WHERE ecu_file = $1
           ORDER BY category, label"#,
        &[&ecu_file],
    ).await {
        Ok(r)  => r,
        Err(_) => return Ok(vec![]),
    };
    Ok(rows.iter().map(|r| ActuatorEntry {
        id:         r.get(0),
        name:       r.get(1),
        label:      r.get(2),
        sent_bytes: r.get(3),
        category:   r.get(4),
    }).collect())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentMatch {
    pub ecu_file: String,
    pub ecu_name: String,
}

#[tauri::command]
pub async fn match_ecu_ident(
    supplier: String,
    version:  String,
    soft:     String,
    state: State<'_, AppState>,
) -> Result<Option<IdentMatch>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;

    // Try exact match on all three fields first
    let row = client.query_opt(
        r#"SELECT DISTINCT ecu_file, ecu_name FROM "EcuAutoIdent"
           WHERE supplier = $1 AND version = $2 AND soft = $3 LIMIT 1"#,
        &[&supplier, &version, &soft],
    ).await.ok().flatten();

    if let Some(r) = row {
        return Ok(Some(IdentMatch { ecu_file: r.get(0), ecu_name: r.get(1) }));
    }

    // Fallback: supplier + soft only (version may drift across reprogramming)
    let row = client.query_opt(
        r#"SELECT DISTINCT ecu_file, ecu_name FROM "EcuAutoIdent"
           WHERE supplier = $1 AND soft = $2 LIMIT 1"#,
        &[&supplier, &soft],
    ).await.ok().flatten();

    Ok(row.map(|r| IdentMatch { ecu_file: r.get(0), ecu_name: r.get(1) }))
}

// ── Auth / User Commands ──────────────────────────────────────

fn hash_password(password: &str) -> String {
    let mut h = Sha256::new();
    h.update(password.as_bytes());
    format!("{:x}", h.finalize())
}

async fn ensure_auth_tables(client: &tokio_postgres::Client) -> Result<(), String> {
    client
        .execute(
            r#"CREATE TABLE IF NOT EXISTS "AppUser" (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(
            r#"CREATE TABLE IF NOT EXISTS "RepairJob" (
                id TEXT PRIMARY KEY,
                job_number TEXT NOT NULL,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                abs_ref TEXT,
                abs_ref_id TEXT,
                status TEXT NOT NULL DEFAULT 'in_progress',
                notes TEXT,
                started_at TEXT NOT NULL,
                completed_at TEXT
            )"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    // Lazy column additions — safe to run every time (IF NOT EXISTS added in PG 9.6+)
    client
        .execute(r#"ALTER TABLE "RepairJob" ADD COLUMN IF NOT EXISTS dtcs TEXT"#, &[])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUserInfo {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairJobRow {
    pub id: String,
    pub job_number: String,
    pub user_id: String,
    pub user_name: String,
    pub abs_ref: Option<String>,
    pub abs_ref_id: Option<String>,
    pub status: String,
    pub notes: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub dtcs: Option<String>,
}

#[tauri::command]
pub async fn list_users(state: State<'_, AppState>) -> Result<Vec<AppUserInfo>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_auth_tables(&client).await?;
    let rows = client
        .query(r#"SELECT id, name FROM "AppUser" ORDER BY name"#, &[])
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(|r| AppUserInfo { id: r.get(0), name: r.get(1) }).collect())
}

#[tauri::command]
pub async fn create_user(name: String, password: String, state: State<'_, AppState>) -> Result<AppUserInfo, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_auth_tables(&client).await?;
    let id = Uuid::new_v4().to_string();
    let hash = hash_password(&password);
    let now = Utc::now().to_rfc3339();
    client
        .execute(
            r#"INSERT INTO "AppUser" (id, name, password_hash, created_at) VALUES ($1, $2, $3, $4)"#,
            &[&id, &name, &hash, &now],
        )
        .await
        .map_err(|e| {
            if e.to_string().contains("unique") || e.to_string().contains("duplicate") {
                "A user with that name already exists".to_string()
            } else {
                e.to_string()
            }
        })?;
    Ok(AppUserInfo { id, name })
}

#[tauri::command]
pub async fn login_user(name: String, password: String, state: State<'_, AppState>) -> Result<AppUserInfo, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_auth_tables(&client).await?;
    let hash = hash_password(&password);
    let row = client
        .query_opt(
            r#"SELECT id, name FROM "AppUser" WHERE name = $1 AND password_hash = $2"#,
            &[&name, &hash],
        )
        .await
        .map_err(|e| e.to_string())?;
    match row {
        Some(r) => Ok(AppUserInfo { id: r.get(0), name: r.get(1) }),
        None => Err("Invalid name or password".to_string()),
    }
}

#[tauri::command]
pub async fn create_repair_job(
    job_number: String,
    user_id: String,
    user_name: String,
    abs_ref: Option<String>,
    abs_ref_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<RepairJobRow, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_auth_tables(&client).await?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    client
        .execute(
            r#"INSERT INTO "RepairJob" (id, job_number, user_id, user_name, abs_ref, abs_ref_id, status, notes, started_at)
               VALUES ($1, $2, $3, $4, $5, $6, 'in_progress', NULL, $7)"#,
            &[&id, &job_number, &user_id, &user_name, &abs_ref, &abs_ref_id, &now],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(RepairJobRow {
        id,
        job_number,
        user_id,
        user_name,
        abs_ref,
        abs_ref_id,
        status: "in_progress".to_string(),
        notes: None,
        started_at: now,
        completed_at: None,
        dtcs: None,
    })
}

#[tauri::command]
pub async fn get_repair_jobs(state: State<'_, AppState>) -> Result<Vec<RepairJobRow>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_auth_tables(&client).await?;
    let rows = client
        .query(
            r#"SELECT id, job_number, user_id, user_name, abs_ref, abs_ref_id, status, notes, started_at, completed_at, dtcs
               FROM "RepairJob" ORDER BY started_at DESC"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .map(|r| RepairJobRow {
            id: r.get(0),
            job_number: r.get(1),
            user_id: r.get(2),
            user_name: r.get(3),
            abs_ref: r.get(4),
            abs_ref_id: r.get(5),
            status: r.get(6),
            notes: r.get(7),
            started_at: r.get(8),
            completed_at: r.get(9),
            dtcs: r.get(10),
        })
        .collect())
}

#[tauri::command]
pub async fn update_repair_job(
    id: String,
    status: String,
    notes: Option<String>,
    abs_ref: Option<String>,
    abs_ref_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_auth_tables(&client).await?;
    let completed_at: Option<String> = match status.as_str() {
        "in_progress" => None,
        _ => Some(Utc::now().to_rfc3339()),
    };
    client
        .execute(
            r#"UPDATE "RepairJob" SET status=$2, notes=$3, abs_ref=$4, abs_ref_id=$5, completed_at=$6 WHERE id=$1"#,
            &[&id, &status, &notes, &abs_ref, &abs_ref_id, &completed_at],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_repair_job(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    client
        .execute(r#"DELETE FROM "RepairJob" WHERE id = $1"#, &[&id])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn save_job_dtcs(id: String, dtcs_json: String, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    client
        .execute(r#"UPDATE "RepairJob" SET dtcs=$2 WHERE id=$1"#, &[&id, &dtcs_json])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_job_dtcs(id: String, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    let row = client
        .query_opt(r#"SELECT dtcs FROM "RepairJob" WHERE id=$1"#, &[&id])
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.and_then(|r| r.get::<_, Option<String>>(0)))
}
