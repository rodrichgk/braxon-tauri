// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod serial;
mod database;
mod commands;

use std::sync::{Arc, Mutex};

pub struct AppState {
    pub db_config: Arc<Mutex<database::DbConfig>>,
    pub serial_connection: serial::SharedSerialConnection,
}

fn main() {
    let db_config = std::fs::read_to_string(database::config_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();

    let state = AppState {
        db_config: Arc::new(Mutex::new(db_config)),
        serial_connection: serial::create_serial_connection(),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::get_serial_ports,
            commands::get_pico_port,
            commands::connect_serial,
            commands::disconnect_serial,
            commands::send_serial_message,
            commands::is_serial_connected,
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
            commands::save_wss_calibration,
            commands::get_wss_calibration,
            commands::list_users,
            commands::create_user,
            commands::login_user,
            commands::create_repair_job,
            commands::get_repair_jobs,
            commands::update_repair_job,
            commands::delete_repair_job,
            commands::save_job_dtcs,
            commands::get_job_dtcs,
            commands::import_ecu_dtcs,
            commands::lookup_dtc,
            commands::get_ecu_db_stats,
            commands::get_ecu_list,
            commands::get_ecu_actuators,
            commands::match_ecu_ident,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
