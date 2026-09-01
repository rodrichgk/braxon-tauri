use crate::database::{self, ABSData, ABSModule, DbConfig, MotorTest, SignalProfile};
use crate::reman;
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
            r#"INSERT INTO "ABSModule" (id, name, "valveCount", description, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW())"#,
            &[&id, &name, &valve_count, &description],
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
            r#"SELECT id, reference, manufacturer, "wssType", "absAdapter", "absConnector", "canSpeed", "canIdLine", "canByte", "canValue", comments, "testValidated", "otherReferences", "kLine", "createdAt"::text, "updatedAt"::text FROM "ABSData" ORDER BY reference LIMIT 100"#,
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
            k_line: row.get(13),
            created_at: row.get(14),
            updated_at: row.get(15),
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
            r#"SELECT id, reference, manufacturer, "wssType", "absAdapter", "absConnector", "canSpeed", "canIdLine", "canByte", "canValue", comments, "testValidated", "otherReferences", "kLine", "createdAt"::text, "updatedAt"::text FROM "ABSData" WHERE reference ILIKE $1 OR manufacturer ILIKE $1 OR "wssType" ILIKE $1 OR "otherReferences" ILIKE $1 ORDER BY reference LIMIT 50"#,
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
            k_line: row.get(13),
            created_at: row.get(14),
            updated_at: row.get(15),
        })
        .collect();
    Ok(data)
}

#[tauri::command]
pub async fn save_abs_data(data: ABSData, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    client
        .execute(
            r#"INSERT INTO "ABSData" (id, reference, manufacturer, "wssType", "absAdapter", "absConnector", "canSpeed", "canIdLine", "canByte", "canValue", comments, "testValidated", "otherReferences", "kLine", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())"#,
            &[&data.id, &data.reference, &data.manufacturer, &data.wss_type, &data.abs_adapter, &data.abs_connector, &data.can_speed, &data.can_id_line, &data.can_byte, &data.can_value, &data.comments, &data.test_validated, &data.other_references, &data.k_line],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_abs_data(data: ABSData, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    client
        .execute(
            r#"UPDATE "ABSData" SET manufacturer=$2, "wssType"=$3, "absAdapter"=$4, "absConnector"=$5, "canSpeed"=$6, "canIdLine"=$7, "canByte"=$8, "canValue"=$9, comments=$10, "testValidated"=$11, "otherReferences"=$12, "kLine"=$13, "updatedAt"=NOW() WHERE id=$1"#,
            &[&data.id, &data.manufacturer, &data.wss_type, &data.abs_adapter, &data.abs_connector, &data.can_speed, &data.can_id_line, &data.can_byte, &data.can_value, &data.comments, &data.test_validated, &data.other_references, &data.k_line],
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
    client
        .execute(
            r#"INSERT INTO "SignalProfile" (id, name, points, "isDefault", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,NOW(),NOW()) ON CONFLICT (id) DO UPDATE SET name=$2, points=$3, "isDefault"=$4, "updatedAt"=NOW()"#,
            &[&profile.id, &profile.name, &profile.points, &profile.is_default],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn update_profile(profile: SignalProfile, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    client
        .execute(
            r#"UPDATE "SignalProfile" SET name=$2, points=$3, "isDefault"=$4, "updatedAt"=NOW() WHERE id=$1"#,
            &[&profile.id, &profile.name, &profile.points, &profile.is_default],
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
    client
        .execute(
            r#"INSERT INTO "MotorTest" (id, "motorType", "jobNumber", report, "testResult", "testDuration", category, "testData", "excludeZones", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())"#,
            &[&test.id, &test.motor_type, &test.job_number, &test.report, &test.test_result, &test.test_duration, &test.category, &test.test_data, &test.exclude_zones],
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

#[derive(Serialize, Clone)]
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

// ── ABS reference → ECU record lookup ─────────────────────────
//
// The DDT4ALL-derived tables ("EcuActuator", "EcuAutoIdent") are keyed by
// ecu_file — the diagnostic model — not by the physical reference printed on
// the ABS block. "EcuAbsRef" is the index between the two: one row per ABS
// reference, holding the resolved ecu_file and/or the CAN addressing found by
// the discovery sweep. It is BRAXON-owned (see DATABASE.md).

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AbsRefLookup {
    /// Reference exactly as the caller typed it.
    pub abs_ref:         String,
    /// Alphanumeric-only uppercase key actually used for matching.
    pub normalized:      String,
    /// "mapping" (saved ref→ECU row), "family" (guessed from the reference
    /// digits), or "unknown" (nothing matched).
    pub source:          String,
    pub hardware_family: Option<String>,
    /// Vehicle manufacturer from "ABSData", when the reference is known there.
    pub manufacturer:    Option<String>,
    /// Resolved addressing — mapping row first, then the ECU record.
    pub send_id:         Option<String>,
    pub recv_id:         Option<String>,
    pub protocol:        Option<String>,
    /// Full ECU record when exactly one could be resolved.
    pub ecu:             Option<EcuInfo>,
    /// Same-family ECUs when the reference maps to more than one model.
    pub candidates:      Vec<EcuInfo>,
    pub in_abs_data:     bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryCandidate {
    pub send_id: String,
    pub recv_id: String,
    /// "family" (same hardware family), "db" (any ECU in the DB) or "saved"
    /// (address found by an earlier discovery sweep).
    pub source:  String,
    pub label:   String,
}

/// Alphanumeric-only uppercase form of an ABS reference, so `10.0961-1464.3`,
/// `10 0961 1464 3` and `1009611464.3` all collapse to the same key.
fn normalize_abs_ref(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric()).collect::<String>().to_uppercase()
}

/// Hardware family guessed from the reference printed on the ABS unit.
/// Mirrors `guessHardwareFamily()` in `src/lib/absRef.ts` — keep both in sync.
///   ATE/Continental: 10.0960-xxxx → MK60, 10.0970-xxxx → MK70
///   Bosch:           0 265 25x xxx → Bosch 8.x, 0 265 95x xxx → Gen 9
fn guess_hardware_family(abs_ref: &str) -> Option<String> {
    let n = normalize_abs_ref(abs_ref);
    let b = n.as_bytes();
    let starts = |p: &str| n.starts_with(p);

    let family = if starts("100961") {
        "MK61"
    } else if starts("100960") || starts("100175") || starts("100176") {
        "MK60"
    } else if starts("100970") || starts("100971") || starts("100972") || starts("100973") {
        "MK70"
    } else if starts("100200") || starts("100201") || starts("100202") || starts("100203") {
        "MK20"
    } else if starts("026595") {
        "Bosch Gen 9"
    } else if starts("02652") && b.len() >= 6 && b[5].is_ascii_digit() {
        "Bosch 8.x"
    } else if starts("026508") || starts("026509") {
        "Bosch 8.0"
    } else {
        return None;
    };
    Some(family.to_string())
}

/// `0x740`, `740`, ` 740 ` → `740`. Returns None for blank/garbage input.
fn normalize_can_id(id: Option<String>) -> Option<String> {
    let raw = id?;
    let t = raw.trim().trim_start_matches("0x").trim_start_matches("0X");
    if t.is_empty() || !t.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    Some(format!("{:0>3}", t.to_uppercase()))
}

async fn ensure_abs_ref_table(client: &tokio_postgres::Client) -> Result<(), String> {
    client.execute(
        r#"CREATE TABLE IF NOT EXISTS "EcuAbsRef" (
            abs_ref         TEXT PRIMARY KEY,
            raw_ref         TEXT NOT NULL,
            ecu_file        TEXT,
            send_id         TEXT,
            recv_id         TEXT,
            protocol        TEXT,
            hardware_family TEXT,
            source          TEXT NOT NULL DEFAULT 'manual',
            updated_at      TEXT NOT NULL
        )"#,
        &[],
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

async fn ecu_by_file(client: &tokio_postgres::Client, ecu_file: &str) -> Option<EcuInfo> {
    let row = client.query_opt(
        r#"SELECT ecu_file, ecu_name, protocol, send_id, recv_id, hardware_family
           FROM "EcuActuator" WHERE ecu_file = $1 LIMIT 1"#,
        &[&ecu_file],
    ).await.ok().flatten()?;
    Some(EcuInfo {
        ecu_file:        row.get(0),
        ecu_name:        row.get(1),
        protocol:        row.get(2),
        send_id:         row.get(3),
        recv_id:         row.get(4),
        hardware_family: row.get(5),
    })
}

async fn ecus_by_family(client: &tokio_postgres::Client, family: &str) -> Vec<EcuInfo> {
    let rows = match client.query(
        r#"SELECT DISTINCT ON (ecu_file) ecu_file, ecu_name, protocol, send_id, recv_id, hardware_family
           FROM "EcuActuator" WHERE hardware_family = $1 ORDER BY ecu_file, ecu_name"#,
        &[&family],
    ).await {
        Ok(r)  => r,
        Err(_) => return vec![], // DDT4ALL tables not imported yet
    };
    rows.iter().map(|r| EcuInfo {
        ecu_file:        r.get(0),
        ecu_name:        r.get(1),
        protocol:        r.get(2),
        send_id:         r.get(3),
        recv_id:         r.get(4),
        hardware_family: r.get(5),
    }).collect()
}

/// Resolve an ABS reference to everything needed to talk to the unit:
/// protocol, CAN addressing and the ECU record whose actuators apply.
#[tauri::command]
pub async fn get_ecu_by_abs_ref(
    abs_ref: String,
    state: State<'_, AppState>,
) -> Result<Option<AbsRefLookup>, String> {
    let trimmed = abs_ref.trim().to_string();
    let normalized = normalize_abs_ref(&trimmed);
    if normalized.is_empty() {
        return Ok(None);
    }

    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_abs_ref_table(&client).await?;

    let mut result = AbsRefLookup {
        abs_ref:         trimmed.clone(),
        normalized:      normalized.clone(),
        source:          "unknown".to_string(),
        hardware_family: guess_hardware_family(&trimmed),
        manufacturer:    None,
        send_id:         None,
        recv_id:         None,
        protocol:        None,
        ecu:             None,
        candidates:      vec![],
        in_abs_data:     false,
    };

    // Vehicle manufacturer, so the brand selector can follow the reference.
    // Matched on the normalized reference, or loosely on the free-text
    // "otherReferences" column where equivalences are recorded.
    let like_raw = format!("%{}%", trimmed);
    if let Ok(Some(row)) = client.query_opt(
        r#"SELECT manufacturer FROM "ABSData"
           WHERE UPPER(REGEXP_REPLACE(reference, '[^A-Za-z0-9]', '', 'g')) = $1
              OR "otherReferences" ILIKE $2
           ORDER BY (UPPER(REGEXP_REPLACE(reference, '[^A-Za-z0-9]', '', 'g')) = $1) DESC
           LIMIT 1"#,
        &[&normalized, &like_raw],
    ).await {
        result.in_abs_data = true;
        result.manufacturer = row.get::<_, Option<String>>(0);
    }

    // 1. Saved ref → ECU mapping (exact normalized key).
    let mapping = client.query_opt(
        r#"SELECT ecu_file, send_id, recv_id, protocol, hardware_family
           FROM "EcuAbsRef" WHERE abs_ref = $1"#,
        &[&normalized],
    ).await.ok().flatten();

    if let Some(m) = mapping {
        let ecu_file: Option<String> = m.get(0);
        result.source          = "mapping".to_string();
        result.send_id         = m.get(1);
        result.recv_id         = m.get(2);
        result.protocol        = m.get(3);
        result.hardware_family = m.get::<_, Option<String>>(4).or(result.hardware_family);

        if let Some(f) = ecu_file {
            if let Some(ecu) = ecu_by_file(&client, &f).await {
                result.send_id  = result.send_id.clone().or_else(|| ecu.send_id.clone());
                result.recv_id  = result.recv_id.clone().or_else(|| ecu.recv_id.clone());
                result.protocol = result.protocol.clone().or_else(|| Some(ecu.protocol.clone()));
                result.hardware_family = result.hardware_family.clone().or_else(|| ecu.hardware_family.clone());
                result.ecu = Some(ecu);
            }
        }
        return Ok(Some(result));
    }

    // 2. No mapping — fall back to the hardware family the reference implies.
    if let Some(family) = result.hardware_family.clone() {
        let mut matches = ecus_by_family(&client, &family).await;
        // An ECU without a send_id is K-line only: no use for CAN addressing.
        matches.sort_by_key(|e| e.send_id.is_none());
        let addressable: Vec<&EcuInfo> = matches.iter().filter(|e| e.send_id.is_some()).collect();

        if addressable.len() == 1 {
            let ecu = addressable[0].clone();
            result.source   = "family".to_string();
            result.send_id  = ecu.send_id.clone();
            result.recv_id  = ecu.recv_id.clone();
            result.protocol = Some(ecu.protocol.clone());
            result.ecu      = Some(ecu);
        } else if !matches.is_empty() {
            result.source     = "family".to_string();
            result.candidates = matches;
        }
    }

    Ok(Some(result))
}

/// Store (or update) the ECU model and/or CAN addressing for an ABS reference,
/// so the next lookup of that reference configures the session instantly.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn save_abs_ref_ecu(
    abs_ref:         String,
    ecu_file:        Option<String>,
    send_id:         Option<String>,
    recv_id:         Option<String>,
    protocol:        Option<String>,
    hardware_family: Option<String>,
    source:          Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let trimmed = abs_ref.trim().to_string();
    let normalized = normalize_abs_ref(&trimmed);
    if normalized.is_empty() {
        return Err("ABS reference is empty".to_string());
    }

    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_abs_ref_table(&client).await?;

    let send_id = normalize_can_id(send_id);
    let recv_id = normalize_can_id(recv_id);
    let family  = hardware_family.or_else(|| guess_hardware_family(&trimmed));
    let source  = source.unwrap_or_else(|| "manual".to_string());
    let now     = Utc::now().to_rfc3339();

    // COALESCE keeps previously stored values when this call omits them —
    // saving a discovered address must not wipe an existing ecu_file link.
    client.execute(
        r#"INSERT INTO "EcuAbsRef"
             (abs_ref, raw_ref, ecu_file, send_id, recv_id, protocol, hardware_family, source, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (abs_ref) DO UPDATE SET
             raw_ref         = EXCLUDED.raw_ref,
             ecu_file        = COALESCE(EXCLUDED.ecu_file,        "EcuAbsRef".ecu_file),
             send_id         = COALESCE(EXCLUDED.send_id,         "EcuAbsRef".send_id),
             recv_id         = COALESCE(EXCLUDED.recv_id,         "EcuAbsRef".recv_id),
             protocol        = COALESCE(EXCLUDED.protocol,        "EcuAbsRef".protocol),
             hardware_family = COALESCE(EXCLUDED.hardware_family, "EcuAbsRef".hardware_family),
             source          = EXCLUDED.source,
             updated_at      = EXCLUDED.updated_at"#,
        &[&normalized, &trimmed, &ecu_file, &send_id, &recv_id, &protocol, &family, &source, &now],
    ).await.map_err(|e| e.to_string())?;

    Ok(())
}

/// CAN addressing already known to work for some ECU, ordered so the most
/// likely candidates for `hardware_family` come first. The discovery sweep
/// tries these before falling back to blind ranges.
#[tauri::command]
pub async fn get_discovery_candidates(
    hardware_family: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<DiscoveryCandidate>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_abs_ref_table(&client).await?;

    let want = hardware_family.unwrap_or_default().to_uppercase();
    let mut out: Vec<DiscoveryCandidate> = vec![];

    let push = |out: &mut Vec<DiscoveryCandidate>,
                send: Option<String>, recv: Option<String>,
                source: &str, label: String| {
        let Some(send_id) = normalize_can_id(send) else { return };
        // Renault CAN convention when the DB has no explicit response ID.
        let recv_id = normalize_can_id(recv).unwrap_or_else(|| {
            let n = i64::from_str_radix(&send_id, 16).unwrap_or(0) + 0x20;
            format!("{:03X}", n)
        });
        if out.iter().any(|c| c.send_id == send_id && c.recv_id == recv_id) {
            return; // already queued from a higher-priority source
        }
        out.push(DiscoveryCandidate { send_id, recv_id, source: source.to_string(), label });
    };

    // Addresses proven by earlier discovery sweeps first — same bench, same
    // kind of unit, so they are the best guesses available.
    if let Ok(rows) = client.query(
        r#"SELECT send_id, recv_id, raw_ref, hardware_family FROM "EcuAbsRef"
           WHERE send_id IS NOT NULL ORDER BY updated_at DESC"#,
        &[],
    ).await {
        let (mut same, mut other): (Vec<_>, Vec<_>) = rows.iter().partition(|r| {
            !want.is_empty()
                && r.get::<_, Option<String>>(3).map(|f| f.to_uppercase()) == Some(want.clone())
        });
        for r in same.drain(..).chain(other.drain(..)) {
            let label: String = r.get(2);
            push(&mut out, r.get(0), r.get(1), "saved", label);
        }
    }

    // Then every addressable ECU in the DDT4ALL tables, same family first.
    if let Ok(rows) = client.query(
        r#"SELECT DISTINCT ON (send_id, recv_id) send_id, recv_id, ecu_name, hardware_family
           FROM "EcuActuator" WHERE send_id IS NOT NULL AND send_id <> ''
           ORDER BY send_id, recv_id, ecu_name"#,
        &[],
    ).await {
        let (mut same, mut other): (Vec<_>, Vec<_>) = rows.iter().partition(|r| {
            !want.is_empty()
                && r.get::<_, Option<String>>(3).map(|f| f.to_uppercase()) == Some(want.clone())
        });
        for r in same.drain(..) {
            let label: String = r.get(2);
            push(&mut out, r.get(0), r.get(1), "family", label);
        }
        for r in other.drain(..) {
            let label: String = r.get(2);
            push(&mut out, r.get(0), r.get(1), "db", label);
        }
    }

    Ok(out)
}

// ── Auth / User Commands ──────────────────────────────────────

// New salted format: "$sha256v2$<uuid-salt>$<sha256(salt+password)>"
fn hash_password(password: &str) -> String {
    let salt = Uuid::new_v4().to_string();
    let mut h = Sha256::new();
    h.update(salt.as_bytes());
    h.update(password.as_bytes());
    format!("$sha256v2${}${:x}", salt, h.finalize())
}

// Verifies against both old (unsalted) and new (salted) stored hashes.
fn verify_password(password: &str, stored: &str) -> bool {
    if let Some(rest) = stored.strip_prefix("$sha256v2$") {
        // New format: strip prefix then split on '$' → [salt, hash]
        let mut parts = rest.splitn(2, '$');
        let (Some(salt), Some(expected)) = (parts.next(), parts.next()) else { return false };
        let mut h = Sha256::new();
        h.update(salt.as_bytes());
        h.update(password.as_bytes());
        format!("{:x}", h.finalize()) == expected
    } else {
        // Legacy unsalted SHA-256 — keeps existing accounts working
        let mut h = Sha256::new();
        h.update(password.as_bytes());
        format!("{:x}", h.finalize()) == stored
    }
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
    client
        .execute(r#"ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS role TEXT"#, &[])
        .await
        .map_err(|e| e.to_string())?;
    // Which REMAN 4D technician this BRAXON login maps to — REMAN has no
    // login of its own (technicians just pick their name from a dropdown,
    // see reman.rs's NomDernierTech comments), so the link is claimed
    // manually here rather than guessed from name similarity ("gabhy" in
    // BRAXON vs "Gabhy Kiba" in 4D isn't a safe auto-match in general).
    client
        .execute(r#"ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS reman_tech_id TEXT"#, &[])
        .await
        .map_err(|e| e.to_string())?;
    client
        .execute(r#"ALTER TABLE "AppUser" ADD COLUMN IF NOT EXISTS reman_tech_name TEXT"#, &[])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUserInfo {
    pub id: String,
    pub name: String,
    pub role: Option<String>,
    pub reman_tech_id: Option<String>,
    pub reman_tech_name: Option<String>,
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
        .query(r#"SELECT id, name, role, reman_tech_id, reman_tech_name FROM "AppUser" ORDER BY name"#, &[])
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .iter()
        .map(|r| AppUserInfo {
            id: r.get(0),
            name: r.get(1),
            role: r.get(2),
            reman_tech_id: r.get(3),
            reman_tech_name: r.get(4),
        })
        .collect())
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
    Ok(AppUserInfo { id, name, role: None, reman_tech_id: None, reman_tech_name: None })
}

#[tauri::command]
pub async fn login_user(name: String, password: String, state: State<'_, AppState>) -> Result<AppUserInfo, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_auth_tables(&client).await?;
    let row = client
        .query_opt(
            r#"SELECT id, name, password_hash, role, reman_tech_id, reman_tech_name FROM "AppUser" WHERE name = $1"#,
            &[&name],
        )
        .await
        .map_err(|e| e.to_string())?;
    match row {
        Some(r) => {
            let stored_hash: String = r.get(2);
            if verify_password(&password, &stored_hash) {
                Ok(AppUserInfo {
                    id: r.get(0),
                    name: r.get(1),
                    role: r.get(3),
                    reman_tech_id: r.get(4),
                    reman_tech_name: r.get(5),
                })
            } else {
                Err("Invalid name or password".to_string())
            }
        }
        None => Err("Invalid name or password".to_string()),
    }
}

#[tauri::command]
pub async fn update_user_role(user_id: String, role: String, state: State<'_, AppState>) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_auth_tables(&client).await?;
    client
        .execute(r#"UPDATE "AppUser" SET role = $2 WHERE id = $1"#, &[&user_id, &role])
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Links a BRAXON login to a REMAN 4D technician identity — both the id
/// (`LigCde.TechDernInterv`, used to filter "my jobs") and the display
/// name are stored, since REMAN has no login/user table of its own to
/// look either up from later. `tech_id`/`tech_name` are `Option` so the
/// link can be cleared (pass `None` for both) as well as set.
#[tauri::command]
pub async fn update_user_reman_tech(
    user_id: String,
    tech_id: Option<String>,
    tech_name: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    ensure_auth_tables(&client).await?;
    client
        .execute(
            r#"UPDATE "AppUser" SET reman_tech_id = $2, reman_tech_name = $3 WHERE id = $1"#,
            &[&user_id, &tech_id, &tech_name],
        )
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
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

// ---- Arbitrary file export (used by the DTC Scanner bus recorder) ----
// Writes directly via std::fs so the destination isn't limited to the
// fs-plugin's $APPDATA scope — the path comes from a user-driven save dialog.
#[tauri::command]
pub async fn save_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

// ---- REMAN forecast-vs-actual comparison ----
//
// Went through four designs across two days before landing here, each
// abandoned live once its problem showed up: (1) a persisted Postgres
// snapshot ("RemanForecastSnapshot") capturing one frozen baseline
// prediction each morning, compared against actual outcomes for that same
// fixed id list — missed real same-day repairs whenever a job wasn't
// polled while still open (a unit cycling through "Attente de Pièces"
// closed with nobody ever having tracked it). (2) growing that same
// snapshot's id list *and* recomputing its predicted mix as new units
// landed (client-polling-based) — fixed the missed-repairs problem, but
// then showed a *second*, different "Repaired ~N" number right next to
// the live top-panel one, because the two were forecasting different
// populations (18 units live right now vs. 21 cumulative units tracked
// since the morning, some already closed) — confusing shown side by
// side: "on top says 7 repairs but in predicted just underneath it says
// repairs wtf is happening?" (3) — 2026-08-03 — no persistence, no
// tracking at all: `predicted` was just `reman::reman_forecast_open_queue()`'s
// live number reused. Explicitly chosen at the time over (2): "drop the
// morning's prediction and just use the growing forecast which should be
// live." Reported directly two days later, 2026-08-06: "it was 12 all
// day now it just dropped suddenly to 8... the only thing that should
// make it change its prediction is new units coming in, and they can't
// possibly decrease the repair numbers right?" — a live rate-on-current-
// bench number necessarily moves both ways (confirmed live: a genuinely
// high-churn day, 25 arrivals/18 closures, explains the swing), but
// that's not what was actually wanted here. (4) — this version —
// `predicted`/`units_with_tech` now come from
// `reman::forecast_today_cumulative`: a *stateless, server-side*
// recreation of design (2)'s idea (never decreases, only grows with new
// arrivals) without design (2)'s actual flaw, which was specifically
// about *client-side polling* building the tracked population and
// therefore missing jobs nobody happened to poll while open — this
// version re-derives "today's population" fresh from 4D on every call
// (currently open ∪ closed today), no tracking, so that failure mode
// doesn't apply. `actual` stays `reman::reman_actual_outcomes_today()`,
// shop-wide closures today, unchanged. The display-confusion problem that
// killed (2) is addressed separately in `RemanForecast.tsx` — distinct
// labeling for this cumulative number vs. the live "on the bench right
// now" one shown elsewhere on the panel, not by reverting the metric.

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForecastComparison {
    /// Size of `reman::forecast_today_cumulative`'s population (currently
    /// open ∪ closed today) — grows through the day, never shrinks.
    pub units_today: u32,
    pub predicted: reman::PredictedMix,
    pub actual: reman::OutcomeBreakdown,
}

#[tauri::command]
pub async fn reman_compare_forecast_to_actual(state: State<'_, AppState>) -> Result<ForecastComparison, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    reman::ensure_reman_cache_tables(&client).await?;
    let (units_today, predicted) = reman::forecast_today_cumulative(&client).await?;
    let actual = reman::reman_actual_outcomes_today(&client).await?;
    Ok(ForecastComparison { units_today, predicted, actual })
}

// ---- Forecast accuracy history (2026-08-14) ----
//
// `RemanForecastDailySnapshot` (17:25 daily capture, see reman.rs's
// `try_run_forecast_snapshot`) was built storage-only, deliberately not
// surfaced anywhere — "it doesn't need to be displayed" at the time.
// Requested directly once a week of real data existed: "how was the
// prediction, are we spot on or way off... can we look at it in the
// app?" One new read-only command exposing what's already been captured;
// no new writes, no change to the capture logic itself.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForecastAccuracyDay {
    pub date: String,
    pub units_with_tech: i32,
    pub predicted: reman::PredictedMix,
    pub actual: reman::OutcomeBreakdown,
}

#[tauri::command]
pub async fn reman_forecast_accuracy_history(state: State<'_, AppState>) -> Result<Vec<ForecastAccuracyDay>, String> {
    let config = state.db_config.lock().map_err(|e| e.to_string())?.clone();
    let client = database::connect(&config).await?;
    reman::ensure_reman_cache_tables(&client).await?;
    let rows = client
        .query(
            r#"SELECT snapshot_date, units_with_tech, predicted_json, actual_json
               FROM "RemanForecastDailySnapshot" ORDER BY snapshot_date ASC"#,
            &[],
        )
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter()
        .map(|r| {
            let date: String = r.get(0);
            let units_with_tech: i32 = r.get(1);
            let predicted_json: String = r.get(2);
            let actual_json: String = r.get(3);
            let predicted: reman::PredictedMix = serde_json::from_str(&predicted_json).map_err(|e| e.to_string())?;
            let actual: reman::OutcomeBreakdown = serde_json::from_str(&actual_json).map_err(|e| e.to_string())?;
            Ok(ForecastAccuracyDay { date, units_with_tech, predicted, actual })
        })
        .collect()
}
