use serde::Serialize;

use crate::domain::log_workspace::log_extension::LogExtension;

/// 统一日志条目：core 为所有来源必有字段，ext 按来源分型。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub line_no: u64,
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub raw: String,
    pub ext: LogExtension,
}

impl LogEntry {
    pub fn trace_id(&self) -> Option<&str> {
        self.ext.trace_id()
    }

    pub fn app(&self) -> Option<&str> {
        self.ext.app()
    }
}
