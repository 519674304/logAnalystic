//! 规则目录命令处理器。

#[cfg(test)]
use std::path::Path;

use crate::application::rule_catalog_service::{
    delete_rule, import_rule_catalog, list_rule_catalog, upsert_rule,
};
use crate::application::rule_package_service::{
    import_rule_package as import_rule_package_service, list_rule_package_tree,
    update_rule_package_node as update_rule_package_node_service, RulePackageVersionTree,
};
#[cfg(test)]
use crate::application::rule_package_service::{import_rule_package_at, list_rule_package_tree_at};
use crate::dto::command_dto::{
    RuleCatalogImportDto, RulePackageImportDto, RulePackageImportResultDto, RulePackageLayerDto,
    RulePackageNodeDto, RulePackageNodeUpdateDto, RulePackageVersionDto, RuleRecordDto,
};
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
        record_type: dto.record_type,
        stage_type: dto.stage_type,
        order: dto.order,
        application_id: dto.application_id,
        process_id: dto.process_id,
        source_application_id: dto.source_application_id,
        target_application_id: dto.target_application_id,
        start_matcher_id: dto.start_matcher_id,
        end_matcher_id: dto.end_matcher_id,
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
        record_type: item.record_type,
        stage_type: item.stage_type,
        order: item.order,
        application_id: item.application_id,
        process_id: item.process_id,
        source_application_id: item.source_application_id,
        target_application_id: item.target_application_id,
        start_matcher_id: item.start_matcher_id,
        end_matcher_id: item.end_matcher_id,
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
pub fn import_rule_catalog_command(
    payload: RuleCatalogImportDto,
) -> Result<Vec<RuleRecordDto>, String> {
    import_rule_catalog(&payload.source_name, &payload.content)
        .map(|items| items.into_iter().map(to_dto).collect())
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "import_rule_package")]
pub fn import_rule_package(
    payload: RulePackageImportDto,
) -> Result<RulePackageImportResultDto, String> {
    let _ = payload.source_name;
    let result = import_rule_package_service(&payload.bytes).map_err(|error| error.to_string())?;
    let versions = list_rule_package_tree().map_err(|error| error.to_string())?;
    Ok(RulePackageImportResultDto {
        operation: result.operation,
        rule_set_id: result.rule_set_id,
        version: result.version,
        versions: versions.into_iter().map(to_version_dto).collect(),
    })
}

#[cfg(test)]
fn import_rule_package_command_at(
    base_dir: impl AsRef<Path>,
    payload: RulePackageImportDto,
) -> Result<RulePackageImportResultDto, String> {
    let result = import_rule_package_at(base_dir.as_ref(), &payload.bytes)
        .map_err(|error| error.to_string())?;
    let versions = list_rule_package_tree_at(base_dir).map_err(|error| error.to_string())?;
    Ok(RulePackageImportResultDto {
        operation: result.operation,
        rule_set_id: result.rule_set_id,
        version: result.version,
        versions: versions.into_iter().map(to_version_dto).collect(),
    })
}

#[tauri::command(rename = "list_rule_packages")]
pub fn list_rule_packages() -> Result<Vec<RulePackageVersionDto>, String> {
    list_rule_package_tree()
        .map(|versions| versions.into_iter().map(to_version_dto).collect())
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "update_rule_package_node")]
pub fn update_rule_package_node(
    payload: RulePackageNodeUpdateDto,
) -> Result<Vec<RulePackageVersionDto>, String> {
    update_rule_package_node_service(
        &payload.rule_set_id,
        &payload.version,
        &payload.layer_id,
        &payload.table_path,
        &payload.node_id,
        &payload.fields,
    )
    .map(|versions| versions.into_iter().map(to_version_dto).collect())
    .map_err(|error| error.to_string())
}

fn to_version_dto(version: RulePackageVersionTree) -> RulePackageVersionDto {
    RulePackageVersionDto {
        rule_set_id: version.rule_set_id,
        version: version.version,
        layers: version
            .layers
            .into_iter()
            .map(|layer| RulePackageLayerDto {
                id: layer.id,
                label: layer.label,
                file_name: layer.file_name,
                nodes: layer
                    .nodes
                    .into_iter()
                    .map(|node| RulePackageNodeDto {
                        id: node.id,
                        name: node.name,
                        node_type: node.node_type,
                        table_path: node.table_path,
                        fields: node.fields,
                    })
                    .collect(),
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Cursor, Write},
        time::{SystemTime, UNIX_EPOCH},
    };
    use zip::{write::SimpleFileOptions, ZipWriter};

    use crate::dto::command_dto::RulePackageImportDto;

    use super::{import_rule_package, import_rule_package_command_at};

    #[test]
    fn package_import_command_returns_created_operation() {
        let result = import_rule_package(RulePackageImportDto {
            source_name: "rules.zip".to_owned(),
            bytes: vec![],
        });

        assert!(result.is_err(), "empty ZIP must be rejected before storage");
    }

    #[test]
    fn package_import_returns_created_operation_and_version_tree() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("log_analystic_command_{stamp}"));
        let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default();
        let files = [
            ("manifest.toml", "[rule_set]\nid = \"RULESET-A\"\n\n[package]\nversion = \"1.0.0\"\n\n[package.layers]\nscenarios = \"scenarios.toml\"\ntopology = \"topology.toml\"\nmatchers = \"matchers.toml\"\nrelations = \"relations.toml\"\nstages = \"stages.toml\"\nflow = \"flow.toml\"\n"),
            ("scenarios.toml", "[[scenarios]]\nid = \"SCENARIO-A\"\n"),
            ("topology.toml", "[[applications]]\nid = \"APP-A\"\n"),
            ("matchers.toml", "[[log_matchers]]\nid = \"MATCHER-A\"\n"),
            ("relations.toml", "[[relations]]\nid = \"RELATION-A\"\n"),
            ("stages.toml", "[[stages]]\nid = \"STAGE-A\"\n"),
            ("flow.toml", "[[flow]]\nid = \"FLOW-A\"\n"),
        ];
        for (path, content) in files {
            archive.start_file(path, options).unwrap();
            archive.write_all(content.as_bytes()).unwrap();
        }

        let response = import_rule_package_command_at(
            &base_dir,
            RulePackageImportDto {
                source_name: "rules.zip".to_owned(),
                bytes: archive.finish().unwrap().into_inner(),
            },
        )
        .unwrap();

        assert_eq!(response.operation, "created");
        assert_eq!(response.versions.len(), 1);
        assert_eq!(response.versions[0].layers.len(), 6);
    }
}
