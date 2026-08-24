#[cfg(test)]
mod tests {
    use std::{
        collections::BTreeMap,
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::domain::rule_package::{RulePackage, RulePackageManifest};

    use super::{
        save_rule_package, temporary_version_directory, update_layer_node_field,
        update_layer_node_fields, version_directory,
    };

    fn unique_temp_dir() -> std::path::PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("log_analystic_rule_package_{stamp}"))
    }

    fn package(pattern: &str) -> RulePackage {
        let layers = BTreeMap::from([
            ("scenarios".to_owned(), "[[scenarios]]\nid = \"SCENARIO-A\"\n".to_owned()),
            ("topology".to_owned(), "[[applications]]\nid = \"APP-A\"\n".to_owned()),
            ("matchers".to_owned(), format!("# Keep this comment\n[[log_matchers]]\nid = \"MATCHER-A\"\npattern = \"{pattern}\"\n")),
            ("relations".to_owned(), "[[relations]]\nid = \"RELATION-A\"\n".to_owned()),
            ("stages".to_owned(), "[[stages]]\nid = \"STAGE-A\"\n".to_owned()),
            ("flow".to_owned(), "[[flow]]\nid = \"FLOW-A\"\n".to_owned()),
        ]);
        RulePackage {
            manifest: RulePackageManifest {
                rule_set_id: "RULESET-A".to_owned(),
                version: "1.0.0".to_owned(),
                layers: BTreeMap::from([
                    ("scenarios".to_owned(), "scenarios.toml".to_owned()),
                    ("topology".to_owned(), "topology.toml".to_owned()),
                    ("matchers".to_owned(), "matchers.toml".to_owned()),
                    ("relations".to_owned(), "relations.toml".to_owned()),
                    ("stages".to_owned(), "stages.toml".to_owned()),
                    ("flow".to_owned(), "flow.toml".to_owned()),
                ]),
            },
            layers,
            files: BTreeMap::new(),
        }
    }

    #[test]
    fn same_version_replaces_the_complete_package() {
        let base_dir = unique_temp_dir();
        save_rule_package(&base_dir, &package("before")).unwrap();
        save_rule_package(&base_dir, &package("after")).unwrap();

        let matcher_file = version_directory(&base_dir, "RULESET-A", "1.0.0").join("matchers.toml");
        assert!(fs::read_to_string(matcher_file).unwrap().contains("after"));
    }

    #[test]
    fn patch_versions_use_distinct_temporary_directories() {
        let base_dir = unique_temp_dir();
        let first = version_directory(&base_dir, "RULESET-A", "1.0.0");
        let second = version_directory(&base_dir, "RULESET-A", "1.0.1");

        assert_ne!(
            temporary_version_directory(&first),
            temporary_version_directory(&second)
        );
    }

    #[test]
    fn matcher_edit_keeps_its_surrounding_comment() {
        let base_dir = unique_temp_dir();
        save_rule_package(&base_dir, &package("before")).unwrap();

        update_layer_node_field(
            &base_dir,
            "RULESET-A",
            "1.0.0",
            "matchers",
            "log_matchers",
            "MATCHER-A",
            "pattern",
            "after",
        )
        .unwrap();

        let matcher_file = version_directory(&base_dir, "RULESET-A", "1.0.0").join("matchers.toml");
        let saved = fs::read_to_string(matcher_file).unwrap();
        assert!(saved.contains("# Keep this comment"));
        assert!(saved.contains("pattern = \"after\""));
    }

    #[test]
    fn mapped_layer_edit_updates_typed_fields_without_touching_other_files() {
        let base_dir = unique_temp_dir();
        let mut package = package("before");
        package
            .manifest
            .layers
            .insert("matchers".to_owned(), "custom-matchers.toml".to_owned());
        save_rule_package(&base_dir, &package).unwrap();
        let version_dir = version_directory(&base_dir, "RULESET-A", "1.0.0");
        let stages_before = fs::read(version_dir.join("stages.toml")).unwrap();
        let fields = BTreeMap::from([
            (
                "pattern".to_owned(),
                serde_json::Value::String("after".to_owned()),
            ),
            ("enabled".to_owned(), serde_json::Value::Bool(false)),
        ]);

        update_layer_node_fields(
            &version_dir.join("custom-matchers.toml"),
            "log_matchers",
            "MATCHER-A",
            &fields,
        )
        .unwrap();

        let saved = fs::read_to_string(version_dir.join("custom-matchers.toml")).unwrap();
        assert!(saved.contains("# Keep this comment"));
        assert!(saved.contains("pattern = \"after\""));
        assert!(saved.contains("enabled = false"));
        assert_eq!(
            fs::read(version_dir.join("stages.toml")).unwrap(),
            stages_before
        );
    }
}

use std::{
    fs, io,
    path::{Path, PathBuf},
};

use toml_edit::{Array, DocumentMut, Table, Value};

use crate::domain::rule_package::RulePackage;

pub fn version_directory(base_dir: impl AsRef<Path>, rule_set_id: &str, version: &str) -> PathBuf {
    base_dir
        .as_ref()
        .join("rule-packages")
        .join(rule_set_id)
        .join(version)
}

pub fn save_rule_package(base_dir: impl AsRef<Path>, package: &RulePackage) -> io::Result<()> {
    let target = version_directory(
        base_dir,
        &package.manifest.rule_set_id,
        &package.manifest.version,
    );
    let temporary = temporary_version_directory(&target);
    let parent = target.parent().expect("version directory has a parent");

    let _ = fs::remove_dir_all(&temporary);
    fs::create_dir_all(&temporary)?;
    fs::write(
        &temporary.join("manifest.toml"),
        package
            .files
            .get("manifest.toml")
            .cloned()
            .unwrap_or_else(|| render_manifest(package)),
    )?;
    for (layer, content) in &package.layers {
        let file_name = package.manifest.layers.get(layer).ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidData, format!("缺少 {layer} 层映射"))
        })?;
        fs::write(temporary.join(file_name), content)?;
    }

    fs::create_dir_all(parent)?;
    let _ = fs::remove_dir_all(&target);
    fs::rename(temporary, target)
}

fn temporary_version_directory(target: &Path) -> PathBuf {
    let version = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("version");
    target.with_file_name(format!(".{version}.tmp"))
}

pub fn update_layer_node_field(
    base_dir: impl AsRef<Path>,
    rule_set_id: &str,
    version: &str,
    layer: &str,
    table_name: &str,
    node_id: &str,
    field: &str,
    new_value: &str,
) -> io::Result<()> {
    let path = version_directory(base_dir, rule_set_id, version).join(format!("{layer}.toml"));
    let fields = std::collections::BTreeMap::from([(
        field.to_owned(),
        serde_json::Value::String(new_value.to_owned()),
    )]);
    update_layer_node_fields(&path, table_name, node_id, &fields)
}

pub fn update_layer_node_fields(
    path: impl AsRef<Path>,
    table_path: &str,
    node_id: &str,
    fields: &std::collections::BTreeMap<String, serde_json::Value>,
) -> io::Result<()> {
    let path = path.as_ref();
    let content = fs::read_to_string(&path)?;
    let updated = update_node_fields_in_toml(&content, table_path, node_id, fields)?;
    fs::write(path, updated)
}

pub fn update_node_fields_in_toml(
    content: &str,
    table_path: &str,
    node_id: &str,
    fields: &std::collections::BTreeMap<String, serde_json::Value>,
) -> io::Result<String> {
    let mut document = content
        .parse::<DocumentMut>()
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    let table = find_node_table_mut(&mut document, table_path, node_id)?;
    for (field, field_value) in fields {
        if field == "id" {
            continue;
        }
        table[field] = toml_edit::Item::Value(json_to_toml_value(field_value)?);
    }
    Ok(document.to_string())
}

fn find_node_table_mut<'a>(
    document: &'a mut DocumentMut,
    table_path: &str,
    node_id: &str,
) -> io::Result<&'a mut Table> {
    let path: Vec<&str> = table_path
        .split('.')
        .filter(|part| !part.is_empty())
        .collect();
    match path.as_slice() {
        [table_name] => {
            if document
                .get(*table_name)
                .and_then(|item| item.as_table())
                .and_then(|table| table.get("id"))
                .and_then(|item| item.as_str())
                == Some(node_id)
            {
                return document
                    .get_mut(*table_name)
                    .and_then(|item| item.as_table_mut())
                    .ok_or_else(|| {
                        io::Error::new(
                            io::ErrorKind::InvalidData,
                            format!("找不到节点表 {table_path}"),
                        )
                    });
            }
            document
                .get_mut(*table_name)
                .and_then(|item| item.as_array_of_tables_mut())
                .and_then(|tables| {
                    tables.iter_mut().find(|table| {
                        table.get("id").and_then(|item| item.as_str()) == Some(node_id)
                    })
                })
                .ok_or_else(|| {
                    io::Error::new(io::ErrorKind::NotFound, format!("找不到节点 {node_id}"))
                })
        }
        [parent_name, table_name] => document
            .get_mut(*parent_name)
            .and_then(|item| item.as_table_mut())
            .and_then(|parent| parent.get_mut(*table_name))
            .and_then(|item| item.as_array_of_tables_mut())
            .and_then(|tables| {
                tables
                    .iter_mut()
                    .find(|table| table.get("id").and_then(|item| item.as_str()) == Some(node_id))
            })
            .ok_or_else(|| {
                io::Error::new(io::ErrorKind::NotFound, format!("找不到节点 {node_id}"))
            }),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("不支持的节点路径 {table_path}"),
        )),
    }
}

fn json_to_toml_value(input: &serde_json::Value) -> io::Result<Value> {
    match input {
        serde_json::Value::String(value) => Ok(Value::from(value.as_str())),
        serde_json::Value::Bool(value) => Ok(Value::from(*value)),
        serde_json::Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                Ok(Value::from(value))
            } else if let Some(value) = value.as_f64() {
                Ok(Value::from(value))
            } else {
                Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "数值超出 TOML 支持范围",
                ))
            }
        }
        serde_json::Value::Array(values) => {
            let mut array = Array::new();
            for item in values {
                array.push(json_to_toml_value(item)?);
            }
            Ok(Value::Array(array))
        }
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "节点字段只支持字符串、布尔值、数字和数组",
        )),
    }
}

fn render_manifest(package: &RulePackage) -> String {
    let mut manifest = format!(
        "[rule_set]\nid = \"{}\"\n\n[package]\nversion = \"{}\"\n\n[package.layers]\n",
        package.manifest.rule_set_id, package.manifest.version
    );
    for (layer, path) in &package.manifest.layers {
        manifest.push_str(&format!("{layer} = \"{path}\"\n"));
    }
    manifest
}
