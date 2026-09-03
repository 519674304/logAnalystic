use std::sync::Arc;

use serde_json::Value;

pub trait DiagnosticProblemStorePort: Send + Sync {
    fn load(&self) -> Result<Value, String>;
    fn save(&self, value: &Value) -> Result<(), String>;
}

/// 诊断问题应用服务：暴露诊断问题列表的读/写入口，委托给本地文件存储。
pub struct DiagnosticProblemService {
    store: Arc<dyn DiagnosticProblemStorePort>,
}

impl DiagnosticProblemService {
    pub fn new(store: impl DiagnosticProblemStorePort + 'static) -> Self {
        Self {
            store: Arc::new(store),
        }
    }

    pub fn list(&self) -> Result<Value, String> {
        self.store.load()
    }

    pub fn save(&self, value: &Value) -> Result<(), String> {
        self.store.save(value)
    }
}
