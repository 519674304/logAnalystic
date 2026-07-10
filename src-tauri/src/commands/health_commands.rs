//! 桌面壳层使用的健康检查命令。

#[tauri::command]
pub fn health() -> String {
    "ok".to_string()
}
