Document ID: RESP-RULE-LIFECYCLE-DESIGN
Status: Approved
Approved by: 用户
Approved at: 2026-07-06
Depends on: CTX-RULE-CONFIG, REQ-RULESET, BASELINE-PRIMARY
Supersedes:

# 规则集生命周期设计

## 包含职责

RESP-RULE-IMPORT、RESP-RULE-VALIDATE、RESP-RULE-MANAGE、RESP-RULE-BACKUP、RESP-RULE-EXPORT、RESP-RULE-SNAPSHOT。

## 目的与非目标

保证只有完整、引用一致的规则集能够成为当前有效规则，并支持整体覆盖、上一版本恢复和不可变快照发布。不读取实际日志验证命中效果。

## 公共契约

```text
parseToml(content) -> RuleSetCandidate
validate(candidate) -> RuleValidationResult
activate(validatedCandidate) -> RuleSetSnapshot
restorePrevious() -> RuleSetSnapshot
exportCurrent() -> TomlContent
```

## 校验分组

- 文档结构和 schema 版本。
- ID 唯一性和引用完整性。
- 领域、应用和进程树。
- 场景、enabled、export_enabled 和适用场景数组。
- 请求边界规则覆盖全部场景。
- matcher 模式和字段限制。
- stage 起止引用、层级和顺序。
- 流程、分支和跨进程关系。
- 并行子进程组的父进程、触发阶段、子进程、汇总 matcher 和总时延阶段。

## 工作流

1. TOML 解析为候选模型。
2. 完整执行全部校验并汇总结构化 Issue。
3. 任一 EXCEPTION 存在时拒绝激活。
4. 校验通过后备份当前规则。
5. 原子替换当前规则。
6. 发布新的不可变快照。

## 不变量

- 校验失败不改变当前规则或备份。
- 只保留一个上一版本备份。
- 快照生成后不可修改。
- 分析运行固定引用一个快照 ID。

## 问题与恢复

- TOML 或引用错误：RULE_SET / EXCEPTION，拒绝候选规则。
- 恢复失败：RULE_SET / EXCEPTION，当前规则保持不变。
- 无上一版本：RULE_SET / TIP，不执行恢复。

## 扩展点候选

有序独立校验项可能适合职责链；具体顺序、短路和汇总策略由 Phase 3 决定。

## 测试边界

- 合法基线 TOML 通过并生成快照。
- 每类引用和场景不变量失败时拒绝激活。
- 覆盖、备份、恢复保持原子性。
- 导出后重新导入保持业务语义一致。
