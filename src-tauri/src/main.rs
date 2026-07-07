#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

use log_analystic_tauri::commands::health_commands::health;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![health])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
