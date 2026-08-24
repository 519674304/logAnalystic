Document ID: PLAN-RUST-RULE-CONFIGURATION
Status: Draft
Approved by:
Approved at:
Depends on: PLAN-SKELETON-CONTRACTS, RESP-RULE-LIFECYCLE-DESIGN, ARCH-EXTENSION-PATTERNS
Supersedes:

# Rust 规则集管理实施计划

## 目标

实现规则集的导入、列表、详情查看、详情编辑和删除能力。页面不承担完整新建规则集流程，也不在主界面拆散 `log_matcher`、`stage` 等内部结构。

## PLAN-RULE-001 规则集导入

- 需求：REQ-RULESET。
- 职责：RESP-RULE-IMPORT。
- ADR：ADR-002、ADR-008。
- 目标：读取完整 TOML 规则集文件并解析为 `RawRuleConfig`。
- 文件/模块：`domain/rule_config/rule_set_loader.rs`、`domain/rule_config/raw_rule_config.rs`。
- 步骤：
  1. 使用 `toml` 解析规则文件。
  2. 保留原始配置字段。
  3. TOML 语法错误转换为 `RULE_SET / EXCEPTION`。
  4. 不在 loader 中做业务引用校验。
- 测试：基础 TOML、语法错误、缺失顶层结构。
- 完成证据：基础 TOML 可解析为 `RawRuleConfig`。

## PLAN-RULE-002 规则集校验职责链

- 需求：REQ-RULESET、REQ-ISSUES。
- 职责：RESP-RULE-VALIDATE、RESP-ISSUE-HANDLE。
- ADR：ARCH-EXTENSION-PATTERNS。
- 目标：实现规则集完整性校验和结构化 Issue 输出。
- 文件/模块：`domain/rule_config/validation/`。
- 步骤：
  1. 实现 schema/version 校验。
  2. 实现 ID 唯一性和引用完整性校验。
  3. 实现场景、enabled、export_enabled 校验。
  4. 实现 domain/application/process 校验。
  5. 实现 matcher、stage、subprocess group 校验。
  6. 基础结构错误短路，其余校验尽量汇总。
- 测试：每类校验的成功和失败样例、Issue 汇总、EXCEPTION 阻断。
- 完成证据：任一 EXCEPTION 存在时不能激活规则集。

## PLAN-RULE-003 规则集列表与详情投影

- 需求：REQ-RULESET。
- 职责：RESP-RULE-MANAGE。
- ADR：ADR-002、ARCH-EXTENSION-PATTERNS。
- 目标：把校验通过的规则集投影为可列表展示、可详情查看、可编辑保存的数据。
- 文件/模块：`domain/rule_config/rule_set.rs`、`domain/rule_config/rule_set_view.rs`。
- 步骤：
  1. 生成规则集列表项。
  2. 生成详情视图模型。
  3. 保留导入来源、导入时间、启用状态和场景信息。
  4. 不引入 RuleSetFactory 或 SnapshotFactory。
- 测试：列表项投影、详情投影、编辑回写、删除对象隔离。
- 完成证据：列表和详情都能由同一个规则集数据稳定投影。

## PLAN-RULE-004 规则集持久化与删除

- 需求：REQ-RULESET。
- 职责：RESP-RULE-PERSIST。
- ADR：ADR-003。
- 目标：保存导入后的规则集，并支持删除单个规则集。
- 文件/模块：`domain/rule_config/rule_set_repository.rs`、`infrastructure/file_storage/rule_catalog_store.rs`。
- 步骤：
  1. 读取已导入规则集。
  2. 持久化规则集列表。
  3. 支持删除单个规则集。
  4. 删除后刷新列表和详情状态。
- 测试：导入后持久化、删除后消失、重启后保持。
- 完成证据：规则集列表在本地恢复时与删除结果一致。
