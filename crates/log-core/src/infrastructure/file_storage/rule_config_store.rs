//! 规则配置存储：整个规则配置文档（版本列表 + 生效版本指针）落到本地 JSON 文件。
//!
//! 只做「不透明 JSON 的读写」，不解析、不校验规则语义——TOML/ZIP 解析仍由前端负责。

use std::fs;
use std::path::PathBuf;

use serde_json::{json, Value};

const DEFAULT_DIR: &str = "app-data";
const FILE_NAME: &str = "rule-config.json";

fn default_document() -> Value {
    json!({ "versions": [], "active": null })
}

pub struct RuleConfigStore {
    base_dir: PathBuf,
}

impl RuleConfigStore {
    /// 以默认目录（相对 CWD 的 `app-data/`）构造。M6 打包时再定位到用户数据目录。
    pub fn new() -> Self {
        Self {
            base_dir: PathBuf::from(DEFAULT_DIR),
        }
    }

    /// 注入自定义目录，供测试使用临时目录，避免污染工作区。
    pub fn in_dir(base_dir: PathBuf) -> Self {
        Self { base_dir }
    }

    fn file_path(&self) -> PathBuf {
        self.base_dir.join(FILE_NAME)
    }

    /// 读取规则配置文档；文件缺失或 JSON 损坏时返回默认空文档（`versions` 空、`active` 空），
    /// 保证本机服务永不因本地文件异常而启动失败。
    pub fn load(&self) -> Result<Value, String> {
        let path = self.file_path();
        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(default_document()),
            Err(err) => return Err(format!("读取规则配置失败 {}: {err}", path.display())),
        };

        Ok(serde_json::from_str::<Value>(&text).unwrap_or_else(|_| default_document()))
    }

    /// 原子写入：先落临时文件，再 `rename` 替换目标文件（ADR-003）。
    pub fn save(&self, value: &Value) -> Result<(), String> {
        let path = self.file_path();
        fs::create_dir_all(&self.base_dir)
            .map_err(|err| format!("创建规则配置目录失败 {}: {err}", self.base_dir.display()))?;

        let text = serde_json::to_string_pretty(value)
            .map_err(|err| format!("序列化规则配置失败: {err}"))?;

        let tmp_path = self.base_dir.join(format!("{FILE_NAME}.tmp"));
        fs::write(&tmp_path, text)
            .map_err(|err| format!("写入规则配置临时文件失败 {}: {err}", tmp_path.display()))?;

        fs::rename(&tmp_path, &path)
            .map_err(|err| format!("替换规则配置文件失败 {}: {err}", path.display()))?;

        Ok(())
    }
}

impl Default for RuleConfigStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn temp_dir() -> PathBuf {
        let index = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("log-analystic-rule-config-store-test-{index}"));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn missing_file_returns_default_document() {
        let store = RuleConfigStore::in_dir(temp_dir());
        let loaded = store.load().expect("load should succeed");
        assert_eq!(loaded, json!({ "versions": [], "active": null }));
    }

    #[test]
    fn save_then_load_round_trips() {
        let store = RuleConfigStore::in_dir(temp_dir());
        let document = json!({
            "versions": [
                {
                    "ruleSetId": "demo",
                    "version": "1.0.0",
                    "layers": [
                        {
                            "id": "stages",
                            "label": "时延阶段",
                            "fileName": "stages.toml",
                            "nodes": [
                                {
                                    "id": "s1",
                                    "name": "请求开始",
                                    "nodeType": "stage",
                                    "tablePath": "stages",
                                    "fields": { "order": 1, "enabled": true, "tags": ["a", "b"] }
                                }
                            ]
                        }
                    ]
                }
            ],
            "active": { "ruleSetId": "demo", "version": "1.0.0" }
        });

        store.save(&document).expect("save should succeed");
        let loaded = store.load().expect("load should succeed");
        assert_eq!(loaded, document);
    }

    #[test]
    fn corrupt_file_returns_default_document() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).expect("create temp dir");
        fs::write(dir.join(FILE_NAME), "{ not valid json").expect("write corrupt file");

        let store = RuleConfigStore::in_dir(dir);
        let loaded = store.load().expect("load should recover with default");
        assert_eq!(loaded, json!({ "versions": [], "active": null }));
    }
}
