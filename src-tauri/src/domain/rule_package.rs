use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Cursor, Read},
};

use serde::Deserialize;
use zip::ZipArchive;

const LAYER_NAMES: [&str; 6] = [
    "scenarios",
    "topology",
    "matchers",
    "relations",
    "stages",
    "flow",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RulePackageManifest {
    pub rule_set_id: String,
    pub version: String,
    pub layers: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
struct RawManifest {
    rule_set: RawRuleSet,
    package: RawPackage,
}

#[derive(Debug, Deserialize)]
struct RawRuleSet {
    id: String,
}

#[derive(Debug, Deserialize)]
struct RawPackage {
    version: String,
    layers: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RulePackage {
    pub manifest: RulePackageManifest,
    pub layers: BTreeMap<String, String>,
    pub files: BTreeMap<String, String>,
}

impl RulePackage {
    pub fn from_zip_bytes(bytes: &[u8]) -> Result<Self, String> {
        let mut archive = ZipArchive::new(Cursor::new(bytes))
            .map_err(|error| format!("无法读取规则包 ZIP：{error}"))?;
        let mut files = BTreeMap::new();

        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|error| format!("无法读取 ZIP 条目：{error}"))?;
            let path = entry.name().to_owned();

            if entry.is_dir() {
                continue;
            }
            if !is_root_file(&path) {
                return Err(format!("规则包只允许 ZIP 根目录文件：{path}"));
            }

            let mut content = String::new();
            entry
                .read_to_string(&mut content)
                .map_err(|error| format!("无法读取规则包文件 {path}：{error}"))?;
            files.insert(path, content);
        }

        Self::from_files(files)
    }

    pub fn from_files(files: BTreeMap<String, String>) -> Result<Self, String> {
        let manifest_content = files
            .get("manifest.toml")
            .ok_or_else(|| "规则包缺少根目录 manifest.toml".to_owned())?;
        let raw_manifest = toml::from_str::<RawManifest>(manifest_content)
            .map_err(|error| format!("manifest.toml 无法解析：{error}"))?;
        let manifest = RulePackageManifest {
            rule_set_id: raw_manifest.rule_set.id,
            version: raw_manifest.package.version,
            layers: raw_manifest.package.layers,
        };
        if !is_safe_storage_segment(&manifest.rule_set_id) {
            return Err("manifest.toml 的 rule_set.id 不是安全的目录标识".to_owned());
        }
        if !is_safe_storage_segment(&manifest.version) {
            return Err("manifest.toml 的 package.version 不是安全的目录标识".to_owned());
        }

        let mut layers = BTreeMap::new();
        for layer_name in LAYER_NAMES {
            let path = manifest
                .layers
                .get(layer_name)
                .ok_or_else(|| format!("manifest.toml 缺少 {layer_name} 层映射"))?;
            if !is_root_file(path) {
                return Err(format!("{layer_name} 层必须映射到 ZIP 根目录文件：{path}"));
            }
            let content = files
                .get(path)
                .ok_or_else(|| format!("规则包缺少 {layer_name} 层文件：{path}"))?;
            layers.insert(layer_name.to_owned(), content.clone());
        }

        validate_layers(&layers)?;

        Ok(Self {
            manifest,
            layers,
            files,
        })
    }
}

fn validate_layers(layers: &BTreeMap<String, String>) -> Result<(), String> {
    let mut documents = Vec::with_capacity(layers.len());
    let mut ids = BTreeSet::new();
    for (layer_name, content) in layers {
        let document = content
            .parse::<toml::Value>()
            .map_err(|error| format!("{layer_name} 层 TOML 无法解析：{error}"))?;
        collect_ids(&document, layer_name, &mut ids)?;
        documents.push((layer_name, document));
    }
    for (layer_name, document) in &documents {
        validate_references(document, layer_name, &ids)?;
    }
    Ok(())
}

fn collect_ids(value: &toml::Value, path: &str, ids: &mut BTreeSet<String>) -> Result<(), String> {
    match value {
        toml::Value::Table(table) => {
            if let Some(id) = table.get("id").and_then(toml::Value::as_str) {
                if !ids.insert(id.to_owned()) {
                    return Err(format!("重复节点 ID：{id}（{path}）"));
                }
            }
            for (key, child) in table {
                collect_ids(child, &format!("{path}.{key}"), ids)?;
            }
        }
        toml::Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                collect_ids(item, &format!("{path}[{index}]"), ids)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_references(
    value: &toml::Value,
    path: &str,
    ids: &BTreeSet<String>,
) -> Result<(), String> {
    match value {
        toml::Value::Table(table) => {
            for (key, child) in table {
                let field_path = format!("{path}.{key}");
                if key != "id" && key.ends_with("_id") {
                    if let Some(reference) = child.as_str() {
                        if !ids.contains(reference) {
                            return Err(format!("无效引用 {field_path} = {reference}"));
                        }
                    }
                } else if key.ends_with("_ids") {
                    if let Some(references) = child.as_array() {
                        for reference in references.iter().filter_map(toml::Value::as_str) {
                            if !ids.contains(reference) {
                                return Err(format!("无效引用 {field_path} 包含 {reference}"));
                            }
                        }
                    }
                }
                validate_references(child, &field_path, ids)?;
            }
        }
        toml::Value::Array(items) => {
            for (index, item) in items.iter().enumerate() {
                validate_references(item, &format!("{path}[{index}]"), ids)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn is_root_file(path: &str) -> bool {
    !path.is_empty()
        && !path.starts_with('/')
        && !path.contains(['/', '\\'])
        && path != "."
        && path != ".."
}

fn is_safe_storage_segment(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value
            .chars()
            .all(|character| character.is_alphanumeric() || matches!(character, '-' | '_' | '.'))
}

#[cfg(test)]
mod tests {
    use std::{
        collections::BTreeMap,
        io::{Cursor, Write},
    };

    use zip::{write::SimpleFileOptions, ZipWriter};

    use super::RulePackage;

    fn package_zip(matchers: &str, stages: &str) -> Vec<u8> {
        let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default();
        let files = [
            ("manifest.toml", "[rule_set]\nid = \"RULESET-A\"\n\n[package]\nversion = \"1.0.0\"\n\n[package.layers]\nscenarios = \"scenarios.toml\"\ntopology = \"topology.toml\"\nmatchers = \"matchers.toml\"\nrelations = \"relations.toml\"\nstages = \"stages.toml\"\nflow = \"flow.toml\"\n"),
            ("scenarios.toml", "[[analysis_scenarios]]\nid = \"SCENARIO-A\"\n"),
            ("topology.toml", "[[applications]]\nid = \"APP-A\"\n"),
            ("matchers.toml", matchers),
            ("relations.toml", "[[process_relations]]\nid = \"RELATION-A\"\n"),
            ("stages.toml", stages),
            ("flow.toml", "[business_flow]\nid = \"FLOW-A\"\n"),
        ];
        for (path, content) in files {
            archive.start_file(path, options).unwrap();
            archive.write_all(content.as_bytes()).unwrap();
        }
        archive.finish().unwrap().into_inner()
    }

    #[test]
    fn reads_a_complete_rule_package_from_zip_bytes() {
        let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default();
        let files = [
            (
                "manifest.toml",
                r#"[rule_set]
id = "RULESET-A-PARALLEL"

[package]
version = "1.1.0"

[package.layers]
scenarios = "scenarios.toml"
topology = "topology.toml"
matchers = "matchers.toml"
relations = "relations.toml"
stages = "stages.toml"
flow = "flow.toml"
"#,
            ),
            ("scenarios.toml", "[[scenarios]]\nid = \"scenario-a\"\n"),
            ("topology.toml", "[[topology]]\nid = \"topology-a\"\n"),
            ("matchers.toml", "[[matchers]]\nid = \"matcher-a\"\n"),
            ("relations.toml", "[[relations]]\nid = \"relation-a\"\n"),
            ("stages.toml", "[[stages]]\nid = \"stage-a\"\n"),
            ("flow.toml", "[[flow]]\nid = \"flow-a\"\n"),
        ];

        for (path, content) in files {
            archive.start_file(path, options).unwrap();
            archive.write_all(content.as_bytes()).unwrap();
        }

        let package = RulePackage::from_zip_bytes(&archive.finish().unwrap().into_inner()).unwrap();

        assert_eq!(package.manifest.rule_set_id, "RULESET-A-PARALLEL");
        assert_eq!(package.manifest.version, "1.1.0");
        assert_eq!(package.layers.len(), 6);
    }

    #[test]
    fn rejects_duplicate_node_ids() {
        let bytes = package_zip(
            "[[log_matchers]]\nid = \"MATCHER-A\"\n\n[[log_matchers]]\nid = \"MATCHER-A\"\n",
            "[[stages]]\nid = \"STAGE-A\"\n",
        );

        let error = RulePackage::from_zip_bytes(&bytes).unwrap_err();

        assert!(error.contains("重复节点 ID"));
    }

    #[test]
    fn rejects_missing_key_references() {
        let bytes = package_zip(
            "[[log_matchers]]\nid = \"MATCHER-A\"\n",
            "[[stages]]\nid = \"STAGE-A\"\nstart_matcher_id = \"MATCHER-MISSING\"\n",
        );

        let error = RulePackage::from_zip_bytes(&bytes).unwrap_err();

        assert!(error.contains("无效引用"));
        assert!(error.contains("MATCHER-MISSING"));
    }

    #[test]
    fn rejects_manifest_identity_that_can_escape_the_storage_directory() {
        let manifest = "[rule_set]\nid = \"../RULESET-A\"\n\n[package]\nversion = \"1.0.0\"\n\n[package.layers]\nscenarios = \"scenarios.toml\"\ntopology = \"topology.toml\"\nmatchers = \"matchers.toml\"\nrelations = \"relations.toml\"\nstages = \"stages.toml\"\nflow = \"flow.toml\"\n";
        let files = BTreeMap::from([
            ("manifest.toml".to_owned(), manifest.to_owned()),
            (
                "scenarios.toml".to_owned(),
                "[[scenarios]]\nid = \"SCENARIO-A\"\n".to_owned(),
            ),
            (
                "topology.toml".to_owned(),
                "[[applications]]\nid = \"APP-A\"\n".to_owned(),
            ),
            (
                "matchers.toml".to_owned(),
                "[[log_matchers]]\nid = \"MATCHER-A\"\n".to_owned(),
            ),
            (
                "relations.toml".to_owned(),
                "[[relations]]\nid = \"RELATION-A\"\n".to_owned(),
            ),
            (
                "stages.toml".to_owned(),
                "[[stages]]\nid = \"STAGE-A\"\n".to_owned(),
            ),
            (
                "flow.toml".to_owned(),
                "[[flow]]\nid = \"FLOW-A\"\n".to_owned(),
            ),
        ]);

        let error = RulePackage::from_files(files).unwrap_err();

        assert!(error.contains("rule_set.id"));
    }

    #[test]
    fn reads_the_project_baseline_rule_package() {
        let baseline_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../docs/project/baselines/business-rules-split");
        let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default();
        for file_name in [
            "manifest.toml",
            "scenarios.toml",
            "topology.toml",
            "matchers.toml",
            "relations.toml",
            "stages.toml",
            "flow.toml",
        ] {
            archive.start_file(file_name, options).unwrap();
            archive
                .write_all(&std::fs::read(baseline_dir.join(file_name)).unwrap())
                .unwrap();
        }

        let package = RulePackage::from_zip_bytes(&archive.finish().unwrap().into_inner()).unwrap();

        assert_eq!(package.manifest.rule_set_id, "RULESET-A-PARALLEL");
        assert_eq!(package.manifest.version, "1.1.0");
    }

    #[test]
    fn reads_the_downloadable_chinese_template() {
        let template_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../public/templates/rule-package-template.zip");
        let package = RulePackage::from_zip_bytes(&std::fs::read(template_path).unwrap()).unwrap();

        assert_eq!(package.manifest.rule_set_id, "RULESET-TEMPLATE");
        assert_eq!(package.manifest.version, "1.0.0");
        assert!(package.files["manifest.toml"].contains("同版本号会覆盖"));
        assert!(package.layers.values().all(|content| content.contains('#')));
    }
}
