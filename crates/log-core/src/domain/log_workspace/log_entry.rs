use serde::Serialize;

/// 固定格式单行日志解析结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub line_no: u64,
    pub timestamp: String,
    pub pid: u32,
    pub tid: u32,
    pub level: String,
    pub app_prefix: String,
    pub package_name: String,
    pub tag: String,
    pub message: String,
    pub raw: String,
}
