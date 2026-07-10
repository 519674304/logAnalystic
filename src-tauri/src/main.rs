#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            log_analystic_tauri::commands::health_commands::health,
            log_analystic_tauri::commands::search_commands::search_logs_command,
            log_analystic_tauri::commands::saved_query_commands::list_saved_queries_command,
            log_analystic_tauri::commands::saved_query_commands::upsert_saved_query_command,
            log_analystic_tauri::commands::saved_query_commands::delete_saved_query_command,
            log_analystic_tauri::commands::rule_commands::list_rule_catalog_command,
            log_analystic_tauri::commands::rule_commands::upsert_rule_command,
            log_analystic_tauri::commands::rule_commands::delete_rule_command,
            log_analystic_tauri::commands::rule_commands::import_rule_catalog_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
