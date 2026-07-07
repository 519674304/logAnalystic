//! Health check command used by the desktop shell.

#[tauri::command]
pub fn health() -> String {
    "ok".to_string()
}
