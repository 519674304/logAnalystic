Document ID: PLAN-RUST-RULE-CONFIGURATION
Status: Approved
Approved by: 用户
Approved at: 2026-07-07
Depends on: PLAN-SKELETON-CONTRACTS, RESP-RULE-LIFECYCLE-DESIGN, ARCH-EXTENSION-PATTERNS
Supersedes:

# Rust 规则配置计划

## PLAN-RULE-001 TOML 加载

- 需求：REQ-RULESET、BASELINE-PRIMARY。
- 职责：RESP-RULE-IMPORT。
- ADR：ADR-002、ADR-008。
- 目标：读取 TOML 内容并解析为 `RawRuleConfig`。
- 依赖：PLAN-CONTRACT-001、PLAN-CONTRACT-003。
- 文件/模块：`domain/rule_config/rule_set_loader.rs`、`domain/rule_config/raw_rule_config.rs`。
- 步骤：
  1. 使用 `toml` 解析规则。
  2. 保留原始配置字段。
  3. TOML 语法错误转为 `RULE_SET / EXCEPTION`。
  4. 不在 loader 中做业务引用校验。
- 测试：基线 TOML、语法错误、缺失顶层结构。
- 完成证据：基线 TOML 可解析为 RawRuleConfig。

## PLAN-RULE-002 规则校验职责链

- 需求：REQ-RULESET、REQ-ISSUES。
- 职责：RESP-RULE-VALIDATE、RESP-ISSUE-HANDLE。
- ADR：ARCH-EXTENSION-PATTERNS。
- 目标：实现规则校验职责链，输出结构化 Issue。
- 依赖：PLAN-RULE-001。
- 文件/模块：`domain/rule_config/validation/`。
- 步骤：
  1. 实现 schema/version 校验。
  2. 实现 ID 唯一性和引用完整性校验。
  3. 实现场景、enabled、export_enabled 校验。
  4. 实现 domain/application/process 校验。
  5. 实现 matcher、stage、subprocess group 校验。
  6. 基础结构错误短路，其他校验尽量汇总。
- 测试：每类校验的成功和失败样例、Issue 汇总、EXCEPTION 阻断。
- 完成证据：任一 EXCEPTION 存在时不能激活规则。

## PLAN-RULE-003 规则组装与快照

- 需求：REQ-RULESET、REQ-LATENCY。
- 职责：RESP-RULE-MANAGE、RESP-RULE-SNAPSHOT。
- ADR：ADR-002、ARCH-EXTENSION-PATTERNS。
- 目标：把校验通过的 RawRuleConfig 组装成不可变 `RuleSet` 和快照。
- 依赖：PLAN-RULE-002。
- 文件/模块：`domain/rule_config/rule_set_assembler.rs`、`domain/rule_config/rule_set.rs`。
- 步骤：
  1. 生成领域对象。
  2. 补齐默认值。
  3. 生成有效规则目录所需描述。
  4. 派生只读快照。
  5. 不引入 RuleSetFactory 或 SnapshotFactory。
- 测试：基线规则组装、enabled/export_enabled、场景过滤准备、快照不可变。
- 完成证据：组装后的 RuleSet 能供分析服务读取有效规则。

## PLAN-RULE-004 规则导出内容生成

- 需求：REQ-RULESET。
- 职责：RESP-RULE-EXPORT。
- ADR：ADR-003。
- 目标：把当前 RuleSet 或快照转换为可导出的 TOML 内容，不负责落盘。
- 依赖：PLAN-RULE-003。
- 文件/模块：`domain/rule_config/rule_set_exporter.rs`。
- 步骤：
  1. 读取已组装的 RuleSet。
  2. 按批准的 TOML 结构输出。
  3. 保留 enabled、export_enabled 和 applicable_scenario_ids。
  4. 导出内容再导入后业务含义一致。
- 测试：导出再导入、场景数组、enabled/export_enabled。
- 完成证据：基线规则导出内容可重新解析并通过校验。
