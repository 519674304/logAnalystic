Document ID: RESP-MAP
Status: Approved
Approved by: 用户
Approved at: 2026-07-06
Depends on: DOMAIN-MAP, CTX-LOG-WORKSPACE, CTX-RULE-CONFIG, CTX-LATENCY-ANALYSIS
Supersedes:

# 职责总图

## 日志工作区

| ID | 目的 | 输入 | 输出 | 复杂度 | 详细设计 |
| --- | --- | --- | --- | --- | --- |
| `RESP-LOG-LOAD` | 读取日志并建立导入批次 | 本地文件 | ImportedLogBatch | 中 | 总图内说明 |
| `RESP-LOG-PARSE` | 固定格式解析 | 原始行 | ParsedLogEntry | 中 | 总图内说明 |
| `RESP-LOG-DATASET` | 时间合并并发布数据集 | 解析记录 | ParsedLogDataset | 中 | 总图内说明 |
| `RESP-LOG-QUALITY` | 汇总质量与耗时 | 导入结果 | DataQualitySummary | 简单 | 总图内说明 |
| `RESP-LOG-SEARCH` | 搜索、过滤和上下文 | 数据集、查询 | SearchResult | 复杂 | 01 |
| `RESP-SAVED-QUERY` | 管理保存查询 | 查询命令 | SavedQueryCatalog | 简单 | 总图内说明 |

`RESP-LOG-LOAD`、`RESP-LOG-PARSE` 和 `RESP-LOG-DATASET` 依次形成不可变数据集；任一职责不得解释业务流程。`RESP-SAVED-QUERY` 独立持久化，只保存查询条件。

## 规则配置

| ID | 目的 | 输入 | 输出 | 复杂度 | 详细设计 |
| --- | --- | --- | --- | --- | --- |
| `RESP-RULE-IMPORT` | TOML 转候选规则 | TOML | RuleSetCandidate | 中 | 02 |
| `RESP-RULE-VALIDATE` | 完整校验规则 | 候选规则 | RuleValidationResult | 复杂 | 02 |
| `RESP-RULE-MANAGE` | 覆盖、编辑和恢复 | 已校验规则、命令 | RuleSet | 复杂 | 02 |
| `RESP-RULE-BACKUP` | 保留上一版本 | 当前规则 | RuleSetBackup | 简单 | 02 |
| `RESP-RULE-EXPORT` | 导出 TOML | RuleSet | TOML | 简单 | 02 |
| `RESP-RULE-SNAPSHOT` | 发布不可变快照 | RuleSet | RuleSetSnapshot | 中 | 02 |

## 时延分析

| ID | 目的 | 输入 | 输出 | 复杂度 | 详细设计 |
| --- | --- | --- | --- | --- | --- |
| `RESP-ANALYSIS-SCOPE` | 固化分析范围 | 时间、场景、数据版本 | AnalysisScope | 简单 | 04 |
| `RESP-SCENARIO-RESOLVE` | 解析有效规则 | 快照、场景 | EffectiveAnalysisRules | 中 | 04 |
| `RESP-REQUEST-RECOGNIZE` | 划分 req | 数据集、边界规则、范围 | RecognizedRequest[] | 复杂 | 03 |
| `RESP-LOG-MATCH` | req 内关键日志匹配 | 请求范围、有效 matcher | MatcherHit[] | 复杂 | 04 |
| `RESP-STAGE-CALCULATE` | 计算阶段时延 | 命中、有效 stage | StageLatency[] | 复杂 | 04 |
| `RESP-LATENCY-STATISTICS` | 汇总阶段统计 | 请求阶段结果 | LatencyStatistics | 中 | 04 |
| `RESP-ANALYSIS-ASSEMBLE` | 组装不可变结果 | 全部分析产物 | LatencyAnalysisRun | 中 | 04 |
| `RESP-ANALYSIS-COORDINATE` | 协调完整分析流程 | 数据集、规则、范围 | LatencyAnalysisResult | 复杂 | 04 |

## 结果投影与交付

| ID | 目的 | 输入 | 输出 | 复杂度 | 详细设计 |
| --- | --- | --- | --- | --- | --- |
| `RESP-REQUEST-LIST-PROJECT` | 生成可筛选请求摘要 | 分析结果、列表条件 | RequestListData | 中 | 05 |
| `RESP-LATENCY-VIEW-PROJECT` | 生成 req 泳道与统计模型 | 分析结果、选中 req | LatencyViewData | 复杂 | 05 |
| `RESP-LOG-DRILLDOWN` | 读取阶段边界及上下文 | 日志引用 | LogContextData | 中 | 05 |
| `RESP-LATENCY-EXPORT-PROJECT` | 生成三段式表格 | 分析结果 | LatencyExportTable | 中 | 05 |
| `RESP-CSV-WRITE` | 写 UTF-8 BOM CSV | 表格模型 | CSV 文件 | 简单 | 05 |
| `RESP-UI-RENDER` | 渲染已确认页面 | LatencyViewData | UI | 复杂 | 05 |

## 统一问题处理

| ID | 目的 | 输入 | 输出 | 复杂度 | 详细设计 |
| --- | --- | --- | --- | --- | --- |
| `RESP-ISSUE-HANDLE` | 分类、路由、处理、日志和用户转换 | Issue | IssueHandlingResult | 复杂 | 06 |

## 依赖原则

- 领域职责不依赖 UI、CSV 或具体存储。
- 协调职责依赖职责接口，不接管领域算法。
- 投影只转换数据，不重新计算时延。
- 所有问题统一进入 RESP-ISSUE-HANDLE，不允许模块自建旁路。

## 需求追踪

- REQ-INGEST -> RESP-LOG-LOAD / PARSE / DATASET / QUALITY
- REQ-SEARCH -> RESP-LOG-SEARCH
- REQ-SAVED-QUERY -> RESP-SAVED-QUERY
- REQ-RULESET -> RESP-RULE-*
- REQ-REQUEST -> RESP-REQUEST-RECOGNIZE
- REQ-LATENCY -> RESP-SCENARIO-RESOLVE / LOG-MATCH / STAGE-CALCULATE / STATISTICS / COORDINATE
- REQ-VIEW -> RESP-REQUEST-LIST-PROJECT / LATENCY-VIEW-PROJECT / LOG-DRILLDOWN / UI-RENDER
- REQ-LATENCY-EXPORT -> RESP-LATENCY-EXPORT-PROJECT / CSV-WRITE
- REQ-ISSUES -> RESP-ISSUE-HANDLE 及各问题产生职责
