use serde::Serialize;

use crate::domain::log_workspace::log_entry::LogEntry;
use crate::domain::log_workspace::workspace::Workspace;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchMode {
    Keyword,
    Regex,
}

#[derive(Debug, Clone)]
pub struct SearchCondition {
    pub query: String,
    pub mode: SearchMode,
    pub case_sensitive: bool,
}

/// 时间范围。`start` / `end` 为 `YYYY-MM-DD HH:MM:SS[.mmm]` 形式，空值表示不限。
#[derive(Debug, Clone, Default)]
pub struct TimeRange {
    pub start: Option<String>,
    pub end: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub line_number: u64,
    pub raw_line: String,
    pub file_path: String,
    pub timestamp: String,
    pub app: String,
    pub level: String,
    pub before: Vec<String>,
    pub after: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub total_matches: u64,
    pub hits: Vec<SearchHit>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogContextData {
    pub file_path: String,
    pub line_number: u64,
    pub before: Vec<String>,
    pub after: Vec<String>,
}

/// 统一日志访问端口：领域拥有，基础设施实现（初始 ripgrep）。
///
/// 当前实现 open / search / read_context 三条搜索主链路；
/// scan / entries（供时延分析流式消费）在 M3 阶段补充。
pub trait LogSource {
    fn open(&self, dir: &str) -> Result<Workspace, String>;
    fn search(
        &self,
        dir: &str,
        cond: &SearchCondition,
        range: &TimeRange,
        context_lines: usize,
    ) -> Result<SearchResult, String>;
    fn read_context(
        &self,
        file_path: &str,
        line_number: u64,
        context_lines: usize,
    ) -> Result<LogContextData, String>;
    /// 单遍解析目录内时间范围内的全部日志条目，供时延分析流式消费。
    fn entries(&self, dir: &str, range: &TimeRange) -> Result<Vec<LogEntry>, String>;
}
