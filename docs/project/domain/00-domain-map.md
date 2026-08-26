Document ID: DOMAIN-MAP
Status: Approved
Approved by: 用户
Approved at: 2026-08-25
Depends on: REQ-OVERVIEW, REQ-SCOPE, REQ-WEB, BASELINE-PRIMARY, UI-BASELINE
Supersedes:

# 领域地图

> 因「Tauri → 本机 Web 服务」「整体载入内存 → 流式读取」「搜索后台任务 → 快速单查询」的重构而修订（原版批准于 2026-07-06）。核心变化：所有日志处理收敛到一个 `LogSource` 端口（初始 ripgrep 实现），搜索、时延分析与后续的「问题提示」都从该端口取数，不再有「预解析内存数据集 + 搜索索引」这条独立路径。

## DDD 深度

本项目采用轻量 DDD。时延分析包含请求边界、场景规则、关键日志匹配、阶段计算和统计不变量，需要明确领域模型；日志读取、搜索、CSV 和 UI 保持适配器职责，不建立分布式服务或复杂事件体系。

## 子域分类

| 类型 | 内容 | 说明 |
| --- | --- | --- |
| 核心域 | 时延分析 | 请求识别、关键日志匹配、阶段时延、统计结果决定产品核心价值 |
| 支撑域 | 日志工作区 | 为核心域与其它下游提供统一 `LogSource` 日志访问能力 |
| 支撑域 | 规则配置 | 为核心域提供经过完整校验的不可变规则快照 |
| 应用层 | 本机 Web API | 将各领域能力通过 HTTP 端点暴露给浏览器前端（axum，127.0.0.1） |
| 应用层 | 结果投影与交付 | 将分析结果转换为请求列表、页面模型和 CSV 表格模型 |
| 应用层 | 统一问题处理 | 按分类和等级执行路由、日志记录和用户提示转换 |

TOML 中的 `BusinessDomain` 表示被分析系统的业务领域；`CTX-*` 表示本软件内部的限界上下文，两者不是同一概念。

## 限界上下文

| ID | 名称 | 类型 | 核心所有权 |
| --- | --- | --- | --- |
| `CTX-LOG-WORKSPACE` | 日志工作区 | 支撑 | 目录工作区、`LogSource` 端口、数据质量、快速单查询搜索、上下文、保存搜索条件 |
| `CTX-RULE-CONFIG` | 规则配置 | 支撑 | RuleSet 聚合、校验、覆盖、备份、恢复、不可变快照 |
| `CTX-LATENCY-ANALYSIS` | 时延分析 | 核心 | 分析范围、请求识别、matcher 命中、阶段时延、统计 |

## 统一日志访问端口

所有日志读取收敛到一个领域端口 `LogSource`，搜索、时延分析和后续的「问题提示」都只依赖它，不直接触碰具体引擎：

```text
LogSource（领域拥有，infrastructure 实现，初始引擎 = ripgrep）

- open(dir)              -> Workspace { file_list, summary }
- scan(range)            -> 流式原始行迭代（固定缓冲区、跨块拼接、长行上限）
- search(cond, range)    -> { hits≤1000, context, total_matches, truncated }
- read_context(ref, n)   -> 某行引用前后 n 行
- entries(range)         -> 流式解析后的结构化日志（固定格式解析，供时延分析）
```

引擎藏在端口后：初始用 ripgrep（Rust `regex` + `memchr` + 字面前缀提取），将来若出现「反复查询同一批日志、需要索引加速」的真实场景，可换成数据库实现而不牵动领域。

## 主业务流

```text
本地日志目录
  -> CTX-LOG-WORKSPACE 工作区（文件清单 + 摘要）
  -> LogSource 端口
       ├─ search -> 搜索命中（≤1000 + truncated）
       ├─ entries(时间范围) -> CTX-LATENCY-ANALYSIS -> LatencyAnalysisResult
       └─ （后续阶段）-> 问题提示

TOML 规则集
  -> CTX-RULE-CONFIG -> RuleSetSnapshot
  -> CTX-LATENCY-ANALYSIS

LatencyAnalysisResult
  -> 请求列表 / 泳道视图 / CSV 导出
  -> UI / CSV
```

## 上下文契约

| 上游 | 契约 | 下游 | 规则 |
| --- | --- | --- | --- |
| 日志工作区 | `LogSource`（open/scan/search/read_context/entries） | 搜索、时延分析、（后续）问题提示 | 端口是唯一日志入口；下游不触碰文件或引擎 |
| 规则配置 | `RuleSetSnapshot` | 时延分析 | 仅由已通过完整校验的 RuleSet 生成 |
| 时延分析 | `LatencyAnalysisResult` | 结果投影 | 不包含 UI 坐标、颜色、CSV 字符串或框架对象 |

## 依赖方向

- 日志工作区和规则配置互不依赖。
- 时延分析依赖规则配置契约，日志读取经 `LogSource` 端口完成，不修改上游数据。
- 「问题提示」是后续阶段的下游消费者：依赖 `LogSource`、时延分析结果与规则上下文；当前不在首批交付，但端口已为其保留，避免将来为它再引入一套日志读取。
- 本机 Web API 是应用/适配层，依赖各领域契约，通过 DTO 映射向浏览器交付结果；不承载领域规则。
- UI 和 CSV 只依赖投影模型与 DTO，不读取 TOML、不重新计算时延、不直接触碰日志文件。
- 上下文之间不共享内部实体，不建立共享大模型。
- 当前使用本地同步调用；流式读取在固定缓冲区上逐文件推进，不建立后台任务或进度状态机。

## 需求映射

- `CTX-LOG-WORKSPACE`: REQ-INGEST、REQ-SEARCH、REQ-WEB（工作区/搜索/有界内存）
- `CTX-RULE-CONFIG`: REQ-RULESET
- `CTX-LATENCY-ANALYSIS`: REQ-REQUEST、REQ-LATENCY
- 应用层本机 Web API: REQ-WEB（运行形态/CORS/复用能力）
- 应用层投影与交付: REQ-VIEW、REQ-LATENCY-EXPORT

## 明确排除

- 不把页面、数据库表、文件夹或部署进程直接当作限界上下文；本机 Web API 属于应用/适配层，不是限界上下文。
- 不为当前本地工具引入消息队列、分布式事务或微服务边界。
- 不在领域模型中保存完整重复日志正文；搜索命中、上下文与解析条目都按需经 `LogSource` 读取。
- 「问题提示」首批不建独立上下文；仅作为 `LogSource` 的后续下游记录。
