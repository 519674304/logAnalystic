#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use log_analystic_tauri::commands::health_commands::health;
use log_analystic_tauri::commands::search_commands::search_logs_command;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![health, search_logs_command])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
