// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod serial;
mod database;
mod commands;
mod reman;
mod f2evo;
mod hydraulic_import;

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

    reman::ensure_reman_dsn_registered();
    reman::spawn_local_proxy();
    reman::spawn_etl_scheduler(state.db_config.clone());
    reman::spawn_forecast_snapshot_scheduler(state.db_config.clone());

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
            commands::update_user_role,
            commands::update_user_reman_tech,
            commands::create_repair_job,
            commands::get_repair_jobs,
            commands::update_repair_job,
            commands::delete_repair_job,
            commands::save_job_dtcs,
            commands::get_job_dtcs,
            commands::save_text_file,
            commands::import_ecu_dtcs,
            commands::lookup_dtc,
            commands::get_ecu_db_stats,
            commands::get_ecu_list,
            commands::get_ecu_actuators,
            commands::match_ecu_ident,
            commands::get_ecu_by_abs_ref,
            commands::save_abs_ref_ecu,
            commands::get_discovery_candidates,
            reman::reman_search_interventions,
            reman::reman_get_intervention,
            reman::reman_search_clients,
            reman::reman_get_client,
            reman::reman_search_stock,
            reman::reman_get_article_stock,
            reman::reman_recent_stock_processing,
            reman::reman_search_achat,
            reman::reman_analytics,
            reman::reman_shop_status,
            reman::reman_forecast_open_queue,
            reman::reman_list_technicians,
            reman::reman_search_knowledge_entries,
            reman::reman_suggest_knowledge_entries,
            reman::reman_create_knowledge_entry,
            reman::reman_update_knowledge_entry,
            reman::reman_delete_knowledge_entry,
            reman::reman_link_job_to_knowledge_entry,
            reman::reman_unlink_job_from_knowledge_entry,
            reman::reman_list_knowledge_tag_suggestions,
            reman::reman_add_repair_step,
            reman::reman_mark_awaiting_cleaning,
            reman::reman_mark_piece_cleaned,
            reman::reman_add_validation_step,
            reman::reman_close_job_as_repaired,
            reman::reman_confirm_accessoire,
            reman::reman_transfer_to_commercial,
            reman::reman_set_verified_fault_type,
            reman::reman_clear_verified_fault_type,
            reman::reman_list_roster,
            reman::reman_update_roster_entry,
            reman::reman_list_notifications,
            reman::reman_mark_notification_read,
            reman::reman_mark_all_notifications_read,
            reman::reman_acquire_job_lock,
            reman::reman_release_job_lock,
            reman::reman_get_finance_settings,
            reman::reman_update_finance_settings,
            reman::reman_supplier_cost_estimate,
            reman::reman_list_saved_comments,
            reman::reman_add_saved_comment,
            reman::reman_delete_saved_comment,
            reman::reman_list_saved_test_presets,
            reman::reman_add_saved_test_preset,
            reman::reman_delete_saved_test_preset,
            reman::reman_save_hydraulic_report,
            reman::reman_list_hydraulic_reports,
            reman::reman_delete_hydraulic_report,
            reman::reman_dsn_status,
            commands::reman_compare_forecast_to_actual,
            commands::reman_forecast_accuracy_history,
            f2evo::f2evo_electronics_send,
            f2evo::f2evo_gearbox_send,
            f2evo::f2evo_hydraulic_send,
            f2evo::f2evo_sensor_send,
            f2evo::f2evo_washing_send,
            f2evo::f2evo_probe,
            f2evo::f2evo_parse_line,
            f2evo::f2evo_parse_hydraulic_report,
            hydraulic_import::import_hydraulic_cycles,
            hydraulic_import::hydraulic_lookup_abs_model,
            hydraulic_import::hydraulic_load_abs_program,
            hydraulic_import::hydraulic_build_abs_upload,
            hydraulic_import::hydraulic_list_test_channels,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
