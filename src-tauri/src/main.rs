// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod websocket;
mod serial;
mod database;
mod commands;

use std::sync::{Arc, Mutex};

pub struct AppState {
    websocket_server: Arc<Mutex<Option<websocket::WebSocketServer>>>,
    pub db_config: Arc<Mutex<database::DbConfig>>,
    pub serial_connection: serial::SharedSerialConnection,
}

fn main() {
    // Load saved DB config from file, or use defaults
    let db_config = std::fs::read_to_string(database::config_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let state = AppState {
        websocket_server: Arc::new(Mutex::new(None)),
        db_config: Arc::new(Mutex::new(db_config)),
        serial_connection: serial::create_serial_connection(),
    };

    tauri::Builder::default()
        .manage(state)
        .setup(|app| {
            let app_handle = app.handle();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = websocket::start_websocket_server(app_handle).await {
                    eprintln!("Failed to start WebSocket server: {}", e);
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_serial_ports,
            commands::connect_serial,
            commands::disconnect_serial,
            commands::send_serial_message,
            commands::is_serial_connected,
            commands::get_devices,
            commands::select_device,
            commands::send_device_message,
            commands::get_db_config,
            commands::save_db_config,
            commands::test_db_connection,
            commands::get_modules,
            commands::create_module,
            commands::delete_module,
            commands::get_abs_data,
            commands::search_abs_data,
            commands::save_abs_data,
            commands::update_abs_data,
            commands::delete_abs_data,
            commands::get_profiles,
            commands::save_profile,
            commands::update_profile,
            commands::delete_profile,
            commands::get_motor_tests,
            commands::save_motor_test,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
