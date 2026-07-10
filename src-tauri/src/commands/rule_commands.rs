//! 规则目录命令处理器。
use crate::application::rule_catalog_service::{
    delete_rule, import_rule_catalog, list_rule_catalog, upsert_rule,
};
use crate::dto::command_dto::{RuleCatalogImportDto, RuleRecordDto};
use crate::infrastructure::file_storage::rule_catalog_store::RuleCatalogRecord;

fn from_dto(dto: RuleRecordDto) -> RuleCatalogRecord {
    RuleCatalogRecord {
        id: dto.id,
        name: dto.name,
        description: dto.description,
        pattern: dto.pattern,
        enabled: dto.enabled,
        export_enabled: dto.export_enabled,
        scenarios: dto.scenarios,
    }
}

fn to_dto(item: RuleCatalogRecord) -> RuleRecordDto {
    RuleRecordDto {
        id: item.id,
        name: item.name,
        description: item.description,
        pattern: item.pattern,
        enabled: item.enabled,
        export_enabled: item.export_enabled,
        scenarios: item.scenarios,
    }
}

#[tauri::command(rename = "list_rule_catalog")]
pub fn list_rule_catalog_command() -> Result<Vec<RuleRecordDto>, String> {
    list_rule_catalog()
        .map(|items| items.into_iter().map(to_dto).collect())
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "upsert_rule_catalog")]
pub fn upsert_rule_command(rule: RuleRecordDto) -> Result<Vec<RuleRecordDto>, String> {
    upsert_rule(from_dto(rule))
        .map(|items| items.into_iter().map(to_dto).collect())
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "delete_rule_catalog")]
pub fn delete_rule_command(rule_id: String) -> Result<Vec<RuleRecordDto>, String> {
    delete_rule(&rule_id)
        .map(|items| items.into_iter().map(to_dto).collect())
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "import_rule_catalog")]
pub fn import_rule_catalog_command(payload: RuleCatalogImportDto) -> Result<Vec<RuleRecordDto>, String> {
    import_rule_catalog(&payload.source_name, &payload.content)
        .map(|items| items.into_iter().map(to_dto).collect())
        .map_err(|error| error.to_string())
}
