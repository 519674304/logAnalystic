use serde_json::Value;

use crate::infrastructure::file_storage::rule_config_store::RuleConfigStore;

/// 规则集应用服务：暴露规则配置文档的读/写入口，委托给本地文件存储。
pub struct RuleSetService {
    store: RuleConfigStore,
}

impl RuleSetService {
    pub fn new() -> Self {
        Self {
            store: RuleConfigStore::new(),
        }
    }

    pub fn list(&self) -> Result<Value, String> {
        self.store.load()
    }

    pub fn save(&self, value: &Value) -> Result<(), String> {
        self.store.save(value)
    }
}

impl Default for RuleSetService {
    fn default() -> Self {
        Self::new()
    }
}
