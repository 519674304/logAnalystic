//! Tauri 命令 DTO。
//!
//! 这些类型跨越前后端边界，用于本地查询和规则管理。

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
    #[serde(default)]
    pub record_type: Option<String>,
    #[serde(default)]
    pub stage_type: Option<String>,
    #[serde(default)]
    pub order: Option<i64>,
    #[serde(default)]
    pub application_id: Option<String>,
    #[serde(default)]
    pub process_id: Option<String>,
    #[serde(default)]
    pub source_application_id: Option<String>,
    #[serde(default)]
    pub target_application_id: Option<String>,
    #[serde(default)]
    pub start_matcher_id: Option<String>,
    #[serde(default)]
    pub end_matcher_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleCatalogImportDto {
    pub source_name: String,
    pub content: String,
}
