Document ID: CTX-LOG-WORKSPACE
Status: Approved
Approved by: 用户
Approved at: 2026-08-25
Depends on: REQ-INGEST, REQ-SEARCH, REQ-WEB
Supersedes:

# 日志工作区上下文

> 因「整体载入 → 流式」重构而修订（原版批准于 2026-07-06）：删除「导入批次 + 时间合并 + 搜索索引 + ParsedLogDataset」，改为「目录工作区 + 统一 `LogSource` 端口 + 快速单查询 + 保存搜索条件」。

## 目的

把本地日志目录转换成一个可搜索、可引用的工作区，并通过统一的 `LogSource` 端口向搜索、时延分析和后续「问题提示」提供日志访问。该上下文只描述日志事实，不解释业务请求或时延阶段。

## 聚合

### LogWorkspace

当前会话的工作区聚合根：持有目录路径、扫描到的文件清单、摘要（文件数、总大小）与数据质量统计。不持有日志正文或解析后的内存数据集；关闭后销毁。

### SavedSearchConditions

保存的搜索条件（关键字/匹配模式/大小写），本地持久化，跨会话保留。不做命名查询列表。

## 统一日志访问端口

`LogSource` 是本上下文对外提供的唯一日志访问契约，初始由 ripgrep 实现（Rust `regex` + `memchr` + 字面前缀提取），可替换为数据库实现：

| 操作 | 说明 |
| --- | --- |
| `open(dir)` | 校验目录、扫描候选文件，返回 `Workspace { file_list, summary }` |
| `scan(range)` | 流式迭代原始行：固定缓冲区、跨块残行拼接、长行上限 |
| `search(cond, range)` | 快速单查询：返回 `{ hits≤1000, context, total_matches, truncated }` |
| `read_context(ref, n)` | 按行引用读前后 n 行上下文 |
| `entries(range)` | 流式解析指定时间范围的结构化日志条目，供时延分析 |

## 不变量

- 工作区只保存文件清单与摘要，不保存完整日志文本。
- 流式读取的内存使用不随日志总大小线性增长。
- 解析失败行不进入搜索、请求识别或时延分析，只进入数据质量统计。
- 搜索命中默认最多保留前 1000 条，同时持续统计 `total_matches` 并返回 `truncated`。
- 保存搜索条件不持有当前会话日志结果。

## 输入与输出

- 输入：本地日志目录、搜索条件、时间范围、日志引用、保存搜索条件命令。
- 输出：`Workspace` 摘要、`LogSource` 端口、`LogSearchResult`、`LogContextData`、数据质量统计、保存搜索条件。

## 领域服务

日志固定格式解析、流式读取、快速单查询执行、上下文读取，统一收敛到 `LogSource` 端口实现中，不作为独立并行路径。

## 上下文关系

- 经 `LogSource` 端口向搜索、时延分析及后续「问题提示」提供日志访问。
- 不依赖规则配置或时延分析模型。

## 问题所有权

文件读取/重复、单行解析失败与质量、正则语法与超时，分别落在日志工作区内的读取、解析、搜索职责上（具体 RESP 映射在 Phase 4 职责设计复核）。

## 需求覆盖

REQ-INGEST、REQ-SEARCH、REQ-WEB（工作区/搜索/有界内存）。

## 明确排除

- 不识别业务请求、不执行业务 matcher、不计算阶段或统计时延。
- 不永久保存会话日志数据。
- 不预先构建完整解析数据集或搜索索引。
