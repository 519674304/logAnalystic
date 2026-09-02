use serde_json::Value;

use crate::infrastructure::file_storage::diagnostic_problem_store::DiagnosticProblemStore;

/// 诊断问题应用服务：暴露诊断问题列表的读/写入口，委托给本地文件存储。
pub struct DiagnosticProblemService {
    store: DiagnosticProblemStore,
}

impl DiagnosticProblemService {
    pub fn new() -> Self {
        Self {
            store: DiagnosticProblemStore::new(),
        }
    }

    pub fn list(&self) -> Result<Value, String> {
        self.store.load()
    }

    pub fn save(&self, value: &Value) -> Result<(), String> {
        self.store.save(value)
    }
}

impl Default for DiagnosticProblemService {
    fn default() -> Self {
        Self::new()
    }
}
