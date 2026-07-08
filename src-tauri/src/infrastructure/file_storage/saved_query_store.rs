//! Saved query persistence for the local desktop app.
//!
//! The store intentionally stays small and file-based so the desktop shell can
//! preserve local-only query presets without introducing a server.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const SAVED_QUERY_STORE_FILE_NAME: &str = "saved-queries.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SavedQueryRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub group: String,
    pub tags: Vec<String>,
    pub query: String,
    pub time_range: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time before unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("log_analystic_saved_queries_{stamp}"))
    }

    #[test]
    fn missing_store_returns_empty_list() {
        let temp_dir = unique_temp_dir();
        let queries = load_saved_queries(&temp_dir).expect("missing file should not fail");
        assert!(queries.is_empty());
    }

    #[test]
    fn save_then_load_round_trips_saved_queries() {
        let temp_dir = unique_temp_dir();
        let expected = vec![SavedQueryRecord {
            id: "query-1".to_string(),
            name: "慢请求".to_string(),
            description: "定位最近的慢请求".to_string(),
            group: "latency".to_string(),
            tags: vec!["core".to_string(), "test".to_string()],
            query: "RPC 调用B".to_string(),
            time_range: "2026-06-12 10:30:00 ~ 2026-06-12 10:45:00".to_string(),
        }];

        save_saved_queries(&temp_dir, &expected).expect("save should succeed");
        let loaded = load_saved_queries(&temp_dir).expect("load should succeed");

        assert_eq!(loaded, expected);
    }

    #[test]
    fn invalid_json_is_reported() {
        let temp_dir = unique_temp_dir();
        fs::create_dir_all(&temp_dir).expect("temp dir");
        fs::write(
            temp_dir.join(SAVED_QUERY_STORE_FILE_NAME),
            "{ not valid json",
        )
        .expect("write invalid json");

        let error = load_saved_queries(&temp_dir).expect_err("invalid json should fail");
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
    }
}

pub fn load_saved_queries(base_dir: impl AsRef<Path>) -> io::Result<Vec<SavedQueryRecord>> {
    let path = store_file_path(base_dir.as_ref());
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}

pub fn save_saved_queries(
    base_dir: impl AsRef<Path>,
    queries: &[SavedQueryRecord],
) -> io::Result<()> {
    let base_dir = base_dir.as_ref();
    fs::create_dir_all(base_dir)?;

    let serialized = serde_json::to_string_pretty(queries)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    let path = store_file_path(base_dir);
    let temp_path = path.with_extension("json.tmp");

    fs::write(&temp_path, serialized)?;
    match fs::rename(&temp_path, &path) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            let _ = fs::remove_file(&temp_path);
            Err(rename_error)
        }
    }
}

fn store_file_path(base_dir: &Path) -> PathBuf {
    base_dir.join(SAVED_QUERY_STORE_FILE_NAME)
}
