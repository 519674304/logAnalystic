Document ID: CTX-LATENCY-ANALYSIS
Status: Draft
Approved by:
Approved at:
Depends on: REQ-REQUEST, REQ-LATENCY, CTX-LOG-WORKSPACE, CTX-RULE-CONFIG
Supersedes:

# 时延分析上下文

## 目的

使用不可变日志数据集和规则快照，在用户指定时间范围与分析场景下识别 req、匹配关键日志、计算阶段时延并生成统一统计结果。

## 聚合根 LatencyAnalysisRun

一次分析运行作为整体聚合，包含：

```text
LatencyAnalysisRun
├─ AnalysisScope
├─ datasetId
├─ ruleSetSnapshotId
├─ scenarioId
├─ EffectiveRuleCatalog
├─ RecognizedRequest[]
│  ├─ RequestBoundary
│  ├─ MatcherHit[]
│  ├─ StageLatency[]
│  ├─ SubprocessGroupResult[]
│  └─ RequestResult
└─ LatencyStatistics
```

聚合生成后不可修改。时间范围、场景、规则快照或数据集变化时创建新的分析运行。

## 主要模型

| 类型 | 名称 | 含义 |
| --- | --- | --- |
| 值对象 | `AnalysisScope` | 用户选择的起止时间、场景、数据集和规则快照 |
| 实体 | `RecognizedRequest` | 由全局开始标记划分的一次 req |
| 值对象 | `RequestBoundary` | 开始日志引用、结束日志引用或下一开始边界 |
| 实体 | `MatcherHit` | 某 req 内关键 matcher 命中的日志引用 |
| 值对象 | `StageLatency` | 阶段、起止日志引用、起止时间和耗时 |
| 值对象 | `SubprocessGroupResult` | 触发阶段、并行子进程、汇总日志和组总等待时延 |
| 值对象 | `LatencyStatistics` | 各阶段样本数、平均值、P90 和最大值 |

## 不变量

- `systemRequestId` 不能为空。
- 仅开始日志时间位于 `AnalysisScope` 的请求进入分析。
- 请求进入分析后完整处理到结束日志或下一开始日志之前，不按时间范围截断。
- 找不到开始日志时不生成请求。
- 请求范围内未命中 matcher 的日志不进入时延模型，但仍保留在日志工作区。
- 每个 `MatcherHit` 关联一个已识别请求。
- 每个阶段的起止命中位于同一次请求内。
- 请求边界识别不受分析场景影响。
- 普通 matcher 和 stage 仅在启用且适用于当前场景时参与分析。
- `export_enabled` 不影响计算结果。
- 并行子进程在触发阶段完成后进入分析，各自独立匹配，不要求按配置顺序结束。
- 主进程汇总 matcher 命中表示并行组整体完成；不要求为每个子进程定义返回主进程的日志。
- 主进程后续阶段只能使用汇总 matcher 或其后的日志作为开始边界。
- 分析结果携带投影所需的精简有效规则目录；投影层不回读 TOML 或可编辑 RuleSet。

## 主生命周期

```text
选择时间范围和场景
  -> 固化 AnalysisScope
  -> 解析有效规则
  -> 识别范围内请求
  -> 在每次请求内匹配关键日志
  -> 计算普通阶段与并行子进程组时延
  -> 汇总统计
  -> 生成不可变 LatencyAnalysisRun
```

## 领域服务

- `EffectiveRuleResolver`
- `RequestRecognizer`
- `RequestLogMatcher`
- `StageLatencyCalculator`
- `LatencyStatisticsAggregator`

## 输入与输出

- 输入：`ParsedLogDataset`、`RuleSetSnapshot`、时间范围、分析场景。
- 输出：`LatencyAnalysisResult`，包含有效规则目录、请求明细、关键命中、阶段时延和统计；详细契约见 `04-analysis-result-contract.md`。

## 上下文关系

- 日志工作区提供日志事实；本上下文只保存日志引用。
- 规则配置提供规则快照；本上下文不读取编辑中规则。
- 结果投影消费分析结果；本上下文不生成 UI 坐标或 CSV 字符串。

## 领域事件决定

当前不引入领域事件。主流程采用显式同步调用和返回值；完成、失败和替换通知留给 Phase 3 评估。

## 问题所有权

- 请求边界：RESP-REQUEST-RECOGNIZE。
- 重复 matcher：RESP-LOG-MATCH。
- 阶段边界：RESP-STAGE-CALCULATE。
- 统计性能：RESP-LATENCY-STATISTICS。

## 需求覆盖

REQ-REQUEST、REQ-LATENCY。

## 明确排除

- 不修改日志数据或规则快照。
- 不保存重复原始日志正文。
- 不负责页面渲染、CSV 编码或文件保存。
- 不支持实时流、分布式 req 处理或单 req 独立持久化。
