//! Log search DTOs shared across the command boundary.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogSearchModeDto {
    Keyword,
    Regex,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogSearchRequestDto {
    pub query: String,
    pub mode: LogSearchModeDto,
    pub case_sensitive: bool,
    pub context_lines: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
pub struct LogSearchResponseDto {
    pub total_matches: usize,
    pub hits: Vec<LogSearchHitDto>,
}
