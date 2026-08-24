//! Tauri 命令 DTO。
//!
//! 这些类型跨越前后端边界，用于本地查询和规则管理。

use std::collections::BTreeMap;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePackageImportDto {
    pub source_name: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RulePackageImportResultDto {
    pub operation: String,
    pub rule_set_id: String,
    pub version: String,
    pub versions: Vec<RulePackageVersionDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RulePackageVersionDto {
    pub rule_set_id: String,
    pub version: String,
    pub layers: Vec<RulePackageLayerDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RulePackageLayerDto {
    pub id: String,
    pub label: String,
    pub file_name: String,
    pub nodes: Vec<RulePackageNodeDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RulePackageNodeDto {
    pub id: String,
    pub name: String,
    pub node_type: String,
    pub table_path: String,
    pub fields: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePackageNodeUpdateDto {
    pub rule_set_id: String,
    pub version: String,
    pub layer_id: String,
    pub table_path: String,
    pub node_id: String,
    pub fields: BTreeMap<String, serde_json::Value>,
}
