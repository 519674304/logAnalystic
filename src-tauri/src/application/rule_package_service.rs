use std::{collections::BTreeMap, fs, io, path::Path};

use crate::{
    domain::rule_package::RulePackage,
    infrastructure::file_storage::app_data_dir::resolve_data_dir,
    infrastructure::file_storage::rule_package_store::{
        save_rule_package, update_node_fields_in_toml, version_directory,
    },
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RulePackageImportResult {
    pub operation: String,
    pub rule_set_id: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RulePackageVersionTree {
    pub rule_set_id: String,
    pub version: String,
    pub layers: Vec<RulePackageLayerTree>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RulePackageLayerTree {
    pub id: String,
    pub label: String,
    pub file_name: String,
    pub nodes: Vec<RulePackageNode>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RulePackageNode {
    pub id: String,
    pub name: String,
    pub node_type: String,
    pub table_path: String,
    pub fields: BTreeMap<String, serde_json::Value>,
}

const LAYERS: [(&str, &str); 6] = [
    ("scenarios", "分析场景"),
    ("topology", "业务拓扑"),
    ("matchers", "日志匹配器"),
    ("relations", "关系与分组"),
    ("stages", "时延阶段"),
    ("flow", "业务流程"),
];

pub fn import_rule_package_at(
    base_dir: impl AsRef<Path>,
    zip_bytes: &[u8],
) -> io::Result<RulePackageImportResult> {
    let package = RulePackage::from_zip_bytes(zip_bytes)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    let version_path = version_directory(
        base_dir.as_ref(),
        &package.manifest.rule_set_id,
        &package.manifest.version,
    );
    let operation = if version_path.exists() {
        "replaced"
    } else {
        "created"
    };

    save_rule_package(base_dir, &package)?;
    Ok(RulePackageImportResult {
        operation: operation.to_owned(),
        rule_set_id: package.manifest.rule_set_id,
        version: package.manifest.version,
    })
}

pub fn import_rule_package(zip_bytes: &[u8]) -> io::Result<RulePackageImportResult> {
    import_rule_package_at(resolve_data_dir()?, zip_bytes)
}

pub fn list_rule_package_tree() -> io::Result<Vec<RulePackageVersionTree>> {
    list_rule_package_tree_at(resolve_data_dir()?)
}

pub fn list_rule_package_tree_at(
    base_dir: impl AsRef<Path>,
) -> io::Result<Vec<RulePackageVersionTree>> {
    let root = base_dir.as_ref().join("rule-packages");
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut versions = Vec::new();
    for rule_set_entry in fs::read_dir(root)? {
        let rule_set_entry = rule_set_entry?;
        if !rule_set_entry.file_type()?.is_dir() {
            continue;
        }
        for version_entry in fs::read_dir(rule_set_entry.path())? {
            let version_entry = version_entry?;
            if !version_entry.file_type()?.is_dir() {
                continue;
            }
            versions.push(read_version_tree(&version_entry.path())?);
        }
    }
    versions.sort_by(|left, right| {
        left.rule_set_id
            .cmp(&right.rule_set_id)
            .then_with(|| right.version.cmp(&left.version))
    });
    Ok(versions)
}

pub fn update_rule_package_node(
    rule_set_id: &str,
    version: &str,
    layer_id: &str,
    table_path: &str,
    node_id: &str,
    fields: &BTreeMap<String, serde_json::Value>,
) -> io::Result<Vec<RulePackageVersionTree>> {
    let base_dir = resolve_data_dir()?;
    update_rule_package_node_at(
        &base_dir,
        rule_set_id,
        version,
        layer_id,
        table_path,
        node_id,
        fields,
    )?;
    list_rule_package_tree_at(base_dir)
}

pub fn update_rule_package_node_at(
    base_dir: impl AsRef<Path>,
    rule_set_id: &str,
    version: &str,
    layer_id: &str,
    table_path: &str,
    node_id: &str,
    fields: &BTreeMap<String, serde_json::Value>,
) -> io::Result<()> {
    if !LAYERS
        .iter()
        .any(|(known_layer, _)| *known_layer == layer_id)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("未知规则层 {layer_id}"),
        ));
    }
    let version_dir = version_directory(&base_dir, rule_set_id, version);
    let manifest_text = fs::read_to_string(version_dir.join("manifest.toml"))?;
    let manifest = manifest_text
        .parse::<toml::Value>()
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    let file_name = manifest["package"]["layers"][layer_id]
        .as_str()
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                format!("manifest 缺少 {layer_id} 层映射"),
            )
        })?;
    if file_name.contains(['/', '\\']) || file_name == "." || file_name == ".." {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "规则层文件必须位于版本目录根层",
        ));
    }

    let mut package_files = BTreeMap::from([("manifest.toml".to_owned(), manifest_text)]);
    for (known_layer, _) in LAYERS {
        let mapped_file = manifest["package"]["layers"][known_layer]
            .as_str()
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("manifest 缺少 {known_layer} 层映射"),
                )
            })?;
        if mapped_file.contains(['/', '\\']) || mapped_file == "." || mapped_file == ".." {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "规则层文件必须位于版本目录根层",
            ));
        }
        package_files.insert(
            mapped_file.to_owned(),
            fs::read_to_string(version_dir.join(mapped_file))?,
        );
    }

    let original_layer = package_files.get(file_name).ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::NotFound,
            format!("找不到规则层文件 {file_name}"),
        )
    })?;
    let updated_layer = update_node_fields_in_toml(original_layer, table_path, node_id, fields)?;
    package_files.insert(file_name.to_owned(), updated_layer);

    let candidate = RulePackage::from_files(package_files)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    if candidate.manifest.rule_set_id != rule_set_id || candidate.manifest.version != version {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "规则包标识或版本与当前编辑目标不一致",
        ));
    }
    save_rule_package(base_dir, &candidate)
}

fn read_version_tree(version_dir: &Path) -> io::Result<RulePackageVersionTree> {
    let manifest_text = fs::read_to_string(version_dir.join("manifest.toml"))?;
    let manifest = manifest_text
        .parse::<toml::Value>()
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    let rule_set_id = manifest["rule_set"]["id"]
        .as_str()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "manifest 缺少 rule_set.id"))?
        .to_owned();
    let version = manifest["package"]["version"]
        .as_str()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "manifest 缺少 package.version"))?
        .to_owned();

    let mut layers = Vec::with_capacity(LAYERS.len());
    for (layer_id, label) in LAYERS {
        let file_name = manifest["package"]["layers"][layer_id]
            .as_str()
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("manifest 缺少 {layer_id} 层映射"),
                )
            })?
            .to_owned();
        let layer_text = fs::read_to_string(version_dir.join(&file_name))?;
        let layer_value = layer_text
            .parse::<toml::Value>()
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        let mut nodes = Vec::new();
        collect_nodes(&layer_value, "", &mut nodes);
        layers.push(RulePackageLayerTree {
            id: layer_id.to_owned(),
            label: label.to_owned(),
            file_name,
            nodes,
        });
    }

    Ok(RulePackageVersionTree {
        rule_set_id,
        version,
        layers,
    })
}

fn collect_nodes(value: &toml::Value, path: &str, nodes: &mut Vec<RulePackageNode>) {
    match value {
        toml::Value::Table(table) => {
            if let Some(id) = table.get("id").and_then(toml::Value::as_str) {
                let name = table
                    .get("name")
                    .and_then(toml::Value::as_str)
                    .unwrap_or(id)
                    .to_owned();
                let node_type = path.rsplit('.').next().unwrap_or("node").to_owned();
                let fields = table
                    .iter()
                    .filter(|(_, field)| is_editable_field(field))
                    .filter_map(|(key, field)| {
                        serde_json::to_value(field)
                            .ok()
                            .map(|value| (key.clone(), value))
                    })
                    .collect();
                nodes.push(RulePackageNode {
                    id: id.to_owned(),
                    name,
                    node_type,
                    table_path: path.to_owned(),
                    fields,
                });
            }
            for (key, child) in table {
                let child_path = if path.is_empty() {
                    key.clone()
                } else {
                    format!("{path}.{key}")
                };
                collect_nodes(child, &child_path, nodes);
            }
        }
        toml::Value::Array(items) => {
            for item in items {
                collect_nodes(item, path, nodes);
            }
        }
        _ => {}
    }
}

fn is_editable_field(value: &toml::Value) -> bool {
    match value {
        toml::Value::String(_)
        | toml::Value::Integer(_)
        | toml::Value::Float(_)
        | toml::Value::Boolean(_)
        | toml::Value::Datetime(_) => true,
        toml::Value::Array(values) => values.iter().all(is_editable_field),
        toml::Value::Table(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Cursor, Write},
        time::{SystemTime, UNIX_EPOCH},
    };
    use zip::{write::SimpleFileOptions, ZipWriter};

    use super::{import_rule_package_at, list_rule_package_tree_at, update_rule_package_node_at};

    fn complete_package_zip() -> Vec<u8> {
        let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default();
        let files = [
            ("manifest.toml", "[rule_set]\nid = \"RULESET-A\"\n\n[package]\nversion = \"1.0.0\"\n\n[package.layers]\nscenarios = \"scenarios.toml\"\ntopology = \"topology.toml\"\nmatchers = \"matchers.toml\"\nrelations = \"relations.toml\"\nstages = \"stages.toml\"\nflow = \"flow.toml\"\n"),
            ("scenarios.toml", "[[scenarios]]\nid = \"SCENARIO-A\"\n"),
            ("topology.toml", "[[applications]]\nid = \"APP-A\"\n"),
            (
                "matchers.toml",
                "# Keep this matcher comment\n[[log_matchers]]\nid = \"MATCHER-A\"\n",
            ),
            ("relations.toml", "[[relations]]\nid = \"RELATION-A\"\n"),
            ("stages.toml", "[[stages]]\nid = \"STAGE-A\"\n"),
            ("flow.toml", "[[flow]]\nid = \"FLOW-A\"\n"),
        ];
        for (path, content) in files {
            archive.start_file(path, options).unwrap();
            archive.write_all(content.as_bytes()).unwrap();
        }
        archive.finish().unwrap().into_inner()
    }

    #[test]
    fn reports_created_then_replaced_for_the_same_version() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("log_analystic_import_{stamp}"));
        let zip = complete_package_zip();

        assert_eq!(
            import_rule_package_at(&base_dir, &zip).unwrap().operation,
            "created"
        );
        assert_eq!(
            import_rule_package_at(&base_dir, &zip).unwrap().operation,
            "replaced"
        );
    }

    #[test]
    fn lists_versions_with_all_six_layers_and_their_nodes() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("log_analystic_tree_{stamp}"));
        import_rule_package_at(&base_dir, &complete_package_zip()).unwrap();

        let versions = list_rule_package_tree_at(&base_dir).unwrap();

        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].rule_set_id, "RULESET-A");
        assert_eq!(versions[0].version, "1.0.0");
        assert_eq!(versions[0].layers.len(), 6);
        assert_eq!(
            versions[0]
                .layers
                .iter()
                .map(|layer| layer.nodes.len())
                .sum::<usize>(),
            6
        );
        assert_eq!(versions[0].layers[2].nodes[0].id, "MATCHER-A");
    }

    #[test]
    fn invalid_reimport_does_not_change_the_stored_version() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("log_analystic_reject_{stamp}"));
        import_rule_package_at(&base_dir, &complete_package_zip()).unwrap();
        let matcher_path = base_dir.join("rule-packages/RULESET-A/1.0.0/matchers.toml");
        let before = std::fs::read(&matcher_path).unwrap();

        assert!(import_rule_package_at(&base_dir, b"not a zip").is_err());
        assert_eq!(std::fs::read(matcher_path).unwrap(), before);
    }

    #[test]
    fn updates_a_node_and_returns_it_in_the_next_tree_read() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("log_analystic_node_update_{stamp}"));
        import_rule_package_at(&base_dir, &complete_package_zip()).unwrap();
        let version_dir = base_dir.join("rule-packages/RULESET-A/1.0.0");
        let stages_before = std::fs::read(version_dir.join("stages.toml")).unwrap();
        let fields = std::collections::BTreeMap::from([
            (
                "name".to_owned(),
                serde_json::Value::String("Updated matcher".to_owned()),
            ),
            ("enabled".to_owned(), serde_json::Value::Bool(false)),
        ]);

        update_rule_package_node_at(
            &base_dir,
            "RULESET-A",
            "1.0.0",
            "matchers",
            "log_matchers",
            "MATCHER-A",
            &fields,
        )
        .unwrap();

        let versions = list_rule_package_tree_at(&base_dir).unwrap();
        let matcher = &versions[0].layers[2].nodes[0];
        assert_eq!(matcher.name, "Updated matcher");
        assert_eq!(matcher.fields["enabled"], serde_json::Value::Bool(false));
        assert!(std::fs::read_to_string(version_dir.join("matchers.toml"))
            .unwrap()
            .contains("# Keep this matcher comment"));
        assert_eq!(
            std::fs::read(version_dir.join("stages.toml")).unwrap(),
            stages_before
        );
    }

    #[test]
    fn invalid_node_edit_leaves_the_stored_version_unchanged() {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("log_analystic_invalid_edit_{stamp}"));
        import_rule_package_at(&base_dir, &complete_package_zip()).unwrap();
        let matcher_path = base_dir.join("rule-packages/RULESET-A/1.0.0/matchers.toml");
        let before = std::fs::read(&matcher_path).unwrap();
        let fields = std::collections::BTreeMap::from([(
            "process_id".to_owned(),
            serde_json::Value::String("PROCESS-MISSING".to_owned()),
        )]);

        assert!(update_rule_package_node_at(
            &base_dir,
            "RULESET-A",
            "1.0.0",
            "matchers",
            "log_matchers",
            "MATCHER-A",
            &fields,
        )
        .is_err());
        assert_eq!(std::fs::read(matcher_path).unwrap(), before);
    }
}
