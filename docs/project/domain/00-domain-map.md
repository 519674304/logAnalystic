Document ID: DOMAIN-MAP
Status: Draft
Approved by:
Approved at:
Depends on: REQ-OVERVIEW, REQ-SCOPE, BASELINE-PRIMARY, UI-BASELINE
Supersedes:

# 领域地图

## DDD 深度

本项目采用轻量 DDD。时延分析包含请求边界、场景规则、关键日志匹配、阶段计算和统计不变量，需要明确领域模型；本地文件、CSV 和 UI 保持适配器职责，不建立分布式服务或复杂事件体系。

## 子域分类

| 类型 | 内容 | 说明 |
| --- | --- | --- |
| 核心域 | 时延分析 | 请求识别、关键日志匹配、阶段时延、统计结果决定产品核心价值 |
| 支撑域 | 日志工作区 | 为核心域提供不可变日志数据和原始日志读取能力 |
| 支撑域 | 规则配置 | 为核心域提供经过完整校验的不可变规则快照 |
| 应用层 | 结果投影与交付 | 将分析结果转换为请求列表、页面模型和 CSV 表格模型 |
| 应用层 | 统一问题处理 | 按分类和等级执行路由、日志记录和用户提示转换 |

TOML 中的 `BusinessDomain` 表示被分析系统的业务领域；`CTX-*` 表示本软件内部的限界上下文，两者不是同一概念。

## 限界上下文

| ID | 名称 | 类型 | 核心所有权 |
| --- | --- | --- | --- |
| `CTX-LOG-WORKSPACE` | 日志工作区 | 支撑 | 日志会话、解析记录、数据质量、搜索、上下文、保存查询 |
| `CTX-RULE-CONFIG` | 规则配置 | 支撑 | RuleSet 聚合、校验、覆盖、备份、恢复、不可变快照 |
| `CTX-LATENCY-ANALYSIS` | 时延分析 | 核心 | 分析范围、请求识别、matcher 命中、阶段时延、统计 |

## 主业务流

```text
本地日志文件
  -> CTX-LOG-WORKSPACE
  -> ParsedLogDataset

TOML 规则集
  -> CTX-RULE-CONFIG
  -> RuleSetSnapshot

用户选择时间范围和分析场景
  -> CTX-LATENCY-ANALYSIS
  -> LatencyAnalysisResult
  -> RequestListData / LatencyViewData / LatencyExportTable
  -> UI / CSV
```

## 上下文契约

| 上游 | 契约 | 下游 | 规则 |
| --- | --- | --- | --- |
| 日志工作区 | `ParsedLogDataset` | 时延分析 | 不可变，只暴露日志 ID、序号、原始时间戳和结构化字段 |
| 日志工作区 | `LogLookupPort` | 结果投影 | 根据日志引用读取原始日志和前后上下文 |
| 规则配置 | `RuleSetSnapshot` | 时延分析 | 仅由已通过完整校验的 RuleSet 生成 |
| 时延分析 | `LatencyAnalysisResult` | 结果投影 | 不包含 UI 坐标、颜色、CSV 字符串或框架对象 |

## 依赖方向

- 日志工作区和规则配置互不依赖。
- 时延分析依赖两个上游契约，不修改上游数据。
- UI 和 CSV 只依赖投影模型，不读取 TOML 或重新计算时延。
- 上下文之间不共享内部实体，不建立共享大模型。
- 当前使用本地同步调用；领域事件和监听机制留到 Phase 3 评估。

## 需求映射

- `CTX-LOG-WORKSPACE`: REQ-INGEST、REQ-SEARCH、REQ-SAVED-QUERY
- `CTX-RULE-CONFIG`: REQ-RULESET
- `CTX-LATENCY-ANALYSIS`: REQ-REQUEST、REQ-LATENCY
- 应用层投影与交付: REQ-VIEW、REQ-LATENCY-EXPORT

## 明确排除

- 不把页面、数据库表、文件夹或部署进程直接当作限界上下文。
- 不为当前本地工具引入消息队列、分布式事务或微服务边界。
- 不在领域模型中保存完整重复日志正文。
