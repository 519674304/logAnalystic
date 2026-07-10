//! 规则目录条目的本地持久化。
//!
//! 在第一版桌面应用里，规则量足够小，可以先放进一个 JSON 文件。

use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const RULE_CATALOG_STORE_FILE_NAME: &str = "rule-catalog.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuleCatalogRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub pattern: String,
    pub enabled: bool,
    pub export_enabled: bool,
    pub scenarios: Vec<String>,
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
        std::env::temp_dir().join(format!("log_analystic_rule_catalog_{stamp}"))
    }

    #[test]
    fn missing_store_returns_empty_list() {
        let temp_dir = unique_temp_dir();
        let rules = load_rule_catalog(&temp_dir).expect("missing file should not fail");
        assert!(rules.is_empty());
    }

    #[test]
    fn save_then_load_round_trips_rule_catalog() {
        let temp_dir = unique_temp_dir();
        let expected = vec![RuleCatalogRecord {
            id: "rule-1".to_string(),
            name: "慢请求标记".to_string(),
            description: "匹配 RPC 调用B".to_string(),
            pattern: "RPC 调用B".to_string(),
            enabled: true,
            export_enabled: true,
            scenarios: vec!["core".to_string(), "latency".to_string()],
        }];

        save_rule_catalog(&temp_dir, &expected).expect("save should succeed");
        let loaded = load_rule_catalog(&temp_dir).expect("load should succeed");

        assert_eq!(loaded, expected);
    }
}

pub fn load_rule_catalog(base_dir: impl AsRef<Path>) -> io::Result<Vec<RuleCatalogRecord>> {
    let path = store_file_path(base_dir.as_ref());
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}

pub fn save_rule_catalog(
    base_dir: impl AsRef<Path>,
    rules: &[RuleCatalogRecord],
) -> io::Result<()> {
    write_json(base_dir.as_ref(), RULE_CATALOG_STORE_FILE_NAME, rules)
}

pub fn rule_catalog_store_path(base_dir: impl AsRef<Path>) -> PathBuf {
    store_file_path(base_dir.as_ref())
}

fn write_json<T: Serialize + ?Sized>(base_dir: &Path, file_name: &str, payload: &T) -> io::Result<()> {
    fs::create_dir_all(base_dir)?;

    let serialized = serde_json::to_string_pretty(payload)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    let path = base_dir.join(file_name);
    let temp_path = path.with_extension("tmp");

    let _ = fs::remove_file(&temp_path);
    fs::write(&temp_path, serialized)?;
    let _ = fs::remove_file(&path);
    match fs::rename(&temp_path, &path) {
        Ok(()) => Ok(()),
        Err(rename_error) => {
            let _ = fs::remove_file(&temp_path);
            Err(rename_error)
        }
    }
}

fn store_file_path(base_dir: &Path) -> PathBuf {
    base_dir.join(RULE_CATALOG_STORE_FILE_NAME)
}
