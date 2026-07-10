//! Tauri 命令 DTO。
//!
//! 这些类型跨越前后端边界，用于本地查询和规则管理。
//! 保持它们适合 serde 序列化，并尽量精简。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponseDto {
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedQueryRecordDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub group: String,
    pub tags: Vec<String>,
    pub query: String,
    pub mode: String,
    pub case_sensitive: bool,
    pub time_range: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RuleRecordDto {
    pub id: String,
    pub name: String,
    pub description: String,
    pub pattern: String,
    pub enabled: bool,
    pub export_enabled: bool,
    pub scenarios: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleCatalogImportDto {
    pub source_name: String,
    pub content: String,
}
