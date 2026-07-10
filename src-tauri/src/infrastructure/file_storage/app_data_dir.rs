//! 解析本地应用数据目录。
//!
//! 桌面端的持久化数据不要绑在当前工作目录上，
//! 否则从不同入口启动时会读写到不同位置。

use std::env;
use std::io;
use std::path::PathBuf;

pub const DATA_DIR_ENV: &str = "LOG_ANALYSTIC_DATA_DIR";
pub const DEFAULT_DATA_DIR_NAME: &str = ".log_analystic_data";

pub fn resolve_data_dir() -> io::Result<PathBuf> {
    if let Ok(dir) = env::var(DATA_DIR_ENV) {
        return Ok(PathBuf::from(dir));
    }

    if let Ok(app_data) = env::var("APPDATA") {
        return Ok(PathBuf::from(app_data).join("logAnalystic"));
    }

    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        return Ok(PathBuf::from(local_app_data).join("logAnalystic"));
    }

    Ok(env::current_dir()?.join(DEFAULT_DATA_DIR_NAME))
}
