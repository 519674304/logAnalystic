use std::sync::Arc;

use serde_json::Value;

pub trait RuleConfigStorePort: Send + Sync {
    fn load(&self) -> Result<Value, String>;
    fn save(&self, value: &Value) -> Result<(), String>;
}

/// 规则集应用服务：暴露规则配置文档的读/写入口，委托给本地文件存储。
pub struct RuleSetService {
    store: Arc<dyn RuleConfigStorePort>,
}

impl RuleSetService {
    pub fn new(store: impl RuleConfigStorePort + 'static) -> Self {
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
