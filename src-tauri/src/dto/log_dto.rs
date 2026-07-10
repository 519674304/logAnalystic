//! 命令边界共享的日志搜索 DTO。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogSearchModeDto {
    Keyword,
    Regex,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogSearchRequestDto {
    pub query: String,
    pub mode: LogSearchModeDto,
    pub case_sensitive: bool,
    pub context_lines: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogSearchHitDto {
    pub line_number: usize,
    pub raw_line: String,
    pub timestamp: String,
    pub app: String,
    pub level: String,
    pub before: Vec<String>,
    pub after: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogSearchResponseDto {
    pub total_matches: usize,
    pub hits: Vec<LogSearchHitDto>,
}
