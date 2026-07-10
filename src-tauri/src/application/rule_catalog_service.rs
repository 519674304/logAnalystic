//! 规则目录管理的应用服务。
//!
//! 这一版先做成本地可编辑、可导入、可覆盖保存的规则列表，
//! 方便桌面端在没有服务端的情况下直接使用。

use crate::infrastructure::file_storage::app_data_dir::resolve_data_dir;
use crate::infrastructure::file_storage::rule_catalog_store::{
    load_rule_catalog, rule_catalog_store_path, save_rule_catalog, RuleCatalogRecord,
};
use serde::Deserialize;
use std::io;

fn default_rules() -> Vec<RuleCatalogRecord> {
    vec![
        RuleCatalogRecord {
            id: String::from("rule-1"),
            name: String::from("RPC 调用B"),
            description: String::from("定位 A 到 B 的调用链路"),
            pattern: String::from("RPC 调用B"),
            enabled: true,
            export_enabled: true,
            scenarios: vec![String::from("core"), String::from("latency")],
        },
        RuleCatalogRecord {
            id: String::from("rule-2"),
            name: String::from("健康检查超时"),
            description: String::from("标记健康检查失败与重试"),
            pattern: String::from("health check timeout"),
            enabled: true,
            export_enabled: false,
            scenarios: vec![String::from("ops"), String::from("abnormal")],
        },
    ]
}

pub fn list_rule_catalog() -> io::Result<Vec<RuleCatalogRecord>> {
    let base_dir = resolve_data_dir()?;
    let path = rule_catalog_store_path(&base_dir);

    if !path.exists() {
        let defaults = default_rules();
        save_rule_catalog(&base_dir, &defaults)?;
        return Ok(defaults);
    }

    load_rule_catalog(base_dir)
}

pub fn upsert_rule(rule: RuleCatalogRecord) -> io::Result<Vec<RuleCatalogRecord>> {
    let base_dir = resolve_data_dir()?;
    let mut rules = list_rule_catalog()?;

    match rules.iter().position(|item| item.id == rule.id) {
        Some(index) => rules[index] = rule,
        None => rules.push(rule),
    }

    save_rule_catalog(&base_dir, &rules)?;
    Ok(rules)
}

pub fn delete_rule(rule_id: &str) -> io::Result<Vec<RuleCatalogRecord>> {
    let base_dir = resolve_data_dir()?;
    let mut rules = list_rule_catalog()?;
    rules.retain(|item| item.id != rule_id);
    save_rule_catalog(&base_dir, &rules)?;
    Ok(rules)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportedMatcherRecord {
    id: String,
    name: Option<String>,
    description: Option<String>,
    business_meaning: Option<String>,
    pattern: Option<String>,
    enabled: Option<bool>,
    export_enabled: Option<bool>,
    scenarios: Option<Vec<String>>,
    applicable_scenario_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ImportedRuleCatalogFile {
    log_matchers: Vec<ImportedMatcherRecord>,
    rules: Vec<ImportedMatcherRecord>,
}

fn matcher_to_record(matcher: ImportedMatcherRecord) -> RuleCatalogRecord {
    let name = matcher
        .name
        .or(matcher.business_meaning.clone())
        .unwrap_or_else(|| String::from("未命名规则"));
    let description = matcher
        .description
        .or(matcher.business_meaning)
        .unwrap_or_default();
    let scenarios = matcher
        .scenarios
        .or(matcher.applicable_scenario_ids)
        .unwrap_or_default();

    RuleCatalogRecord {
        id: matcher.id,
        name,
        description,
        pattern: matcher.pattern.unwrap_or_default(),
        enabled: matcher.enabled.unwrap_or(true),
        export_enabled: matcher.export_enabled.unwrap_or(true),
        scenarios,
    }
}

pub fn import_rule_catalog(source_name: &str, content: &str) -> io::Result<Vec<RuleCatalogRecord>> {
    let imported_rules = if source_name.to_ascii_lowercase().ends_with(".json") {
        import_json_rule_catalog(content)?
    } else {
        import_toml_rule_catalog(content)?
    };

    let base_dir = resolve_data_dir()?;
    save_rule_catalog(&base_dir, &imported_rules)?;
    Ok(imported_rules)
}

fn import_json_rule_catalog(content: &str) -> io::Result<Vec<RuleCatalogRecord>> {
    serde_json::from_str::<Vec<RuleCatalogRecord>>(content)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn import_toml_rule_catalog(content: &str) -> io::Result<Vec<RuleCatalogRecord>> {
    let parsed = toml::from_str::<ImportedRuleCatalogFile>(content)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;

    let mut imported = Vec::new();
    imported.extend(parsed.log_matchers.into_iter().map(matcher_to_record));
    imported.extend(parsed.rules.into_iter().map(matcher_to_record));

    if imported.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "规则文件中没有可导入的规则",
        ));
    }

    Ok(imported)
}
