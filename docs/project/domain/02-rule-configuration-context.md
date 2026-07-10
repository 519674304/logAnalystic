Document ID: CTX-RULE-CONFIG
Status: Approved
Approved by: 用户
Approved at: 2026-07-06
Depends on: REQ-RULESET, BASELINE-PRIMARY
Supersedes:

# 规则配置上下文

## 目的

维护可编辑、可校验、可覆盖和可恢复的业务规则集，并向时延分析发布不可变规则快照。

## 聚合根 RuleSet

RuleSet 统一拥有：

- `AnalysisScenario`
- `BusinessDomain`
- `Application`
- `BusinessProcess`
- `LogMatcher`
- `ProcessRelation`
- `SubprocessGroup`
- `StageDefinition`
- `BusinessFlow`

采用单一聚合根，因为 TOML 整体导入和覆盖，且对象之间存在跨类型 ID、进程树、阶段边界、场景和顺序不变量。

## 主要值对象

- `RuleSetId`、`SchemaVersion`、`BusinessVersion`
- `RuleReference`
- `MatcherPattern`
- `ApplicableScenarioSet`
- `RuleActivation`
- `StageOrder`
- `BusinessMeaning`

## 不变量

- 所有稳定 ID 在所属类型中唯一。
- 所有引用目标存在且类型正确。
- 进程父子关系无环，根进程存在。
- 并行子进程组的父进程、触发阶段、子进程、汇总 matcher 和总时延阶段引用完整。
- 同一并行组内的子进程属于该组父进程的后代，且至少包含一个子进程。
- matcher 和 stage 的 `enabled`、`export_enabled` 明确。
- `applicable_scenario_ids` 只引用已定义场景。
- 全局请求开始和结束 matcher 启用并覆盖全部场景。
- 已启用 stage 的起止 matcher 在该 stage 的全部适用场景中可用。
- 未通过完整校验的候选规则不能替换当前 RuleSet。

## 生命周期

```text
TOML
  -> RuleSetCandidate
  -> 完整校验
  -> 备份当前规则
  -> 原子替换
  -> RuleSetSnapshot
```

校验失败时，当前规则和上一版本备份均保持不变。

## 输入与输出

- 输入：TOML、规则编辑命令、恢复命令。
- 输出：`RuleValidationResult`、当前 `RuleSet`、`RuleSetBackup`、`RuleSetSnapshot`、导出 TOML。

## 上下文关系

- 向时延分析发布 `RuleSetSnapshot`。
- 不读取实际日志，不验证某个规则能否在当前日志中命中。
- 不依赖 UI 表单结构或 TOML 解析库类型。

## 问题所有权

- 格式、引用、场景、顺序和完整性：RESP-RULE-VALIDATE。
- 覆盖、备份和恢复：RESP-RULE-MANAGE、RESP-RULE-BACKUP。

## 需求覆盖

REQ-RULESET-001 至 REQ-RULESET-022。

## 明确排除

- 不识别 req。
- 不计算时延。
- 不保存分析结果。
- 不把具体错误码序号固化在聚合中。
