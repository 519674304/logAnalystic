//! 规则目录管理的应用服务。
//!
//! 规则导入后会保存 matcher 和 stage 两类条目。matcher 用于日志命中，
//! stage 用于时延分析页面和后续真实时延计算。

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
            record_type: Some(String::from("matcher")),
            stage_type: None,
            order: None,
            application_id: None,
            process_id: None,
            source_application_id: None,
            target_application_id: None,
            start_matcher_id: None,
            end_matcher_id: None,
        },
        RuleCatalogRecord {
            id: String::from("rule-2"),
            name: String::from("健康检查超时"),
            description: String::from("标记健康检查失败与重试"),
            pattern: String::from("health check timeout"),
            enabled: true,
            export_enabled: false,
            scenarios: vec![String::from("ops"), String::from("abnormal")],
            record_type: Some(String::from("matcher")),
            stage_type: None,
            order: None,
            application_id: None,
            process_id: None,
            source_application_id: None,
            target_application_id: None,
            start_matcher_id: None,
            end_matcher_id: None,
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
    #[serde(alias = "business_meaning")]
    business_meaning: Option<String>,
    pattern: Option<String>,
    enabled: Option<bool>,
    #[serde(alias = "export_enabled")]
    export_enabled: Option<bool>,
    scenarios: Option<Vec<String>>,
    #[serde(alias = "applicable_scenario_ids")]
    applicable_scenario_ids: Option<Vec<String>>,
    #[serde(alias = "process_id")]
    process_id: Option<String>,
    #[serde(alias = "application_id")]
    application_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportedStageRecord {
    id: String,
    name: Option<String>,
    description: Option<String>,
    #[serde(alias = "business_meaning")]
    business_meaning: Option<String>,
    enabled: Option<bool>,
    #[serde(alias = "export_enabled")]
    export_enabled: Option<bool>,
    scenarios: Option<Vec<String>>,
    #[serde(alias = "applicable_scenario_ids")]
    applicable_scenario_ids: Option<Vec<String>>,
    #[serde(rename = "type")]
    stage_type: Option<String>,
    order: Option<i64>,
    #[serde(alias = "process_id")]
    process_id: Option<String>,
    #[serde(alias = "application_id")]
    application_id: Option<String>,
    #[serde(alias = "source_application_id")]
    source_application_id: Option<String>,
    #[serde(alias = "target_application_id")]
    target_application_id: Option<String>,
    #[serde(alias = "start_matcher_id")]
    start_matcher_id: Option<String>,
    #[serde(alias = "end_matcher_id")]
    end_matcher_id: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct ImportedRuleCatalogFile {
    #[serde(alias = "log_matchers")]
    log_matchers: Vec<ImportedMatcherRecord>,
    rules: Vec<ImportedMatcherRecord>,
    stages: Vec<ImportedStageRecord>,
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
        record_type: Some(String::from("matcher")),
        stage_type: None,
        order: None,
        application_id: matcher.application_id,
        process_id: matcher.process_id,
        source_application_id: None,
        target_application_id: None,
        start_matcher_id: None,
        end_matcher_id: None,
    }
}

fn stage_to_record(stage: ImportedStageRecord) -> RuleCatalogRecord {
    let name = stage
        .name
        .or(stage.business_meaning.clone())
        .unwrap_or_else(|| String::from("未命名阶段"));
    let description = stage
        .description
        .or(stage.business_meaning)
        .unwrap_or_default();
    let scenarios = stage
        .scenarios
        .or(stage.applicable_scenario_ids)
        .unwrap_or_default();
    let start_matcher_id = stage.start_matcher_id;
    let end_matcher_id = stage.end_matcher_id;
    let pattern = match (&start_matcher_id, &end_matcher_id) {
        (Some(start), Some(end)) => format!("{start} -> {end}"),
        _ => String::new(),
    };

    RuleCatalogRecord {
        id: stage.id,
        name,
        description,
        pattern,
        enabled: stage.enabled.unwrap_or(true),
        export_enabled: stage.export_enabled.unwrap_or(true),
        scenarios,
        record_type: Some(String::from("stage")),
        stage_type: stage.stage_type,
        order: stage.order,
        application_id: stage.application_id,
        process_id: stage.process_id,
        source_application_id: stage.source_application_id,
        target_application_id: stage.target_application_id,
        start_matcher_id,
        end_matcher_id,
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
    imported.extend(parsed.stages.into_iter().map(stage_to_record));

    if imported.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "规则文件中没有可导入的规则",
        ));
    }

    Ok(imported)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toml_import_keeps_latency_stages_for_analysis_projection() {
        let content = r#"
[[log_matchers]]
id = "LOG-START"
name = "Start"
business_meaning = "Request starts"
enabled = true
export_enabled = true
applicable_scenario_ids = ["SCENARIO-CORE"]
pattern = "request started"

[[log_matchers]]
id = "LOG-END"
name = "End"
business_meaning = "Request ends"
enabled = true
export_enabled = true
applicable_scenario_ids = ["SCENARIO-CORE"]
pattern = "request completed"

[[stages]]
id = "STAGE-A"
name = "A stage"
business_meaning = "A application processing"
enabled = true
export_enabled = true
applicable_scenario_ids = ["SCENARIO-CORE"]
type = "APPLICATION_PROCESSING"
order = 1
application_id = "APP-A"
start_matcher_id = "LOG-START"
end_matcher_id = "LOG-END"
"#;

        let imported = import_toml_rule_catalog(content).expect("toml import should succeed");
        let stage = imported
            .iter()
            .find(|record| record.id == "STAGE-A")
            .expect("latency stage should be imported");

        assert_eq!(stage.record_type.as_deref(), Some("stage"));
        assert_eq!(stage.pattern, "LOG-START -> LOG-END");
        assert_eq!(stage.start_matcher_id.as_deref(), Some("LOG-START"));
        assert_eq!(stage.end_matcher_id.as_deref(), Some("LOG-END"));
    }
}
