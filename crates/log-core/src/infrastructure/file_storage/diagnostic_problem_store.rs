//! 诊断问题存储：整个诊断问题列表落到本地 JSON 文件。
//!
//! 只做「不透明 JSON 的读写」，不解析、不校验诊断语义——投影与校验仍由前端负责。

use std::fs;
use std::path::PathBuf;

use serde_json::{json, Value};

const DEFAULT_DIR: &str = "app-data";
const FILE_NAME: &str = "diagnostic-problems.json";

fn default_document() -> Value {
    json!({ "problems": [] })
}

pub struct DiagnosticProblemStore {
    base_dir: PathBuf,
}

impl DiagnosticProblemStore {
    /// 以默认目录（相对 CWD 的 `app-data/`）构造。M6 打包时再定位到用户数据目录。
    pub fn new() -> Self {
        Self {
            base_dir: PathBuf::from(DEFAULT_DIR),
        }
    }

    fn file_path(&self) -> PathBuf {
        self.base_dir.join(FILE_NAME)
    }

    /// 读取诊断问题文档；文件缺失或 JSON 损坏时返回默认空文档，保证本机服务永不因本地文件异常而启动失败。
    pub fn load(&self) -> Result<Value, String> {
        let path = self.file_path();
        let text = match fs::read_to_string(&path) {
            Ok(text) => text,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(default_document()),
            Err(err) => return Err(format!("读取诊断问题失败 {}: {err}", path.display())),
        };

        Ok(serde_json::from_str::<Value>(&text).unwrap_or_else(|_| default_document()))
    }

    /// 原子写入：先落临时文件，再 `rename` 替换目标文件（ADR-003）。
    pub fn save(&self, value: &Value) -> Result<(), String> {
        let path = self.file_path();
        fs::create_dir_all(&self.base_dir)
            .map_err(|err| format!("创建诊断问题目录失败 {}: {err}", self.base_dir.display()))?;

        let text = serde_json::to_string_pretty(value)
            .map_err(|err| format!("序列化诊断问题失败: {err}"))?;

        let tmp_path = self.base_dir.join(format!("{FILE_NAME}.tmp"));
        fs::write(&tmp_path, text)
            .map_err(|err| format!("写入诊断问题临时文件失败 {}: {err}", tmp_path.display()))?;

        fs::rename(&tmp_path, &path)
            .map_err(|err| format!("替换诊断问题文件失败 {}: {err}", path.display()))?;

        Ok(())
    }
}

impl Default for DiagnosticProblemStore {
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
        let dir =
            std::env::temp_dir().join(format!("log-analystic-diagnostic-problem-store-test-{index}"));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn missing_file_returns_default_document() {
        let store = DiagnosticProblemStore { base_dir: temp_dir() };
        let loaded = store.load().expect("load should succeed");
        assert_eq!(loaded, json!({ "problems": [] }));
    }

    #[test]
    fn save_then_load_round_trips() {
        let store = DiagnosticProblemStore { base_dir: temp_dir() };
        let document = json!({
            "problems": [
                {
                    "id": "p1",
                    "name": "唤不醒",
                    "hitLabel": "唤不醒",
                    "missLabel": "唤醒正常",
                    "judgments": []
                }
            ]
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

        let store = DiagnosticProblemStore { base_dir: dir };
        let loaded = store.load().expect("load should recover with default");
        assert_eq!(loaded, json!({ "problems": [] }));
    }
}
