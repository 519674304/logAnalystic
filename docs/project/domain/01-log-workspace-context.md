Document ID: CTX-LOG-WORKSPACE
Status: Approved
Approved by: 用户
Approved at: 2026-07-06
Depends on: REQ-INGEST, REQ-SEARCH, REQ-SAVED-QUERY
Supersedes:

# 日志工作区上下文

## 目的

将本地固定格式日志转换为可搜索、可引用的当前会话数据集，并维护跨会话保存的查询定义。该上下文只描述日志事实，不解释业务请求或时延阶段。

## 聚合

### LogWorkspaceSession

当前会话聚合根，拥有导入批次、加载状态、数据集引用和质量摘要。关闭软件后销毁。

### SavedQueryCatalog

保存查询聚合根，拥有保存查询的创建、修改、删除和命名唯一性。生命周期跨越日志会话。

## 主要模型

| 类型 | 名称 | 含义 |
| --- | --- | --- |
| 实体 | `ImportedFile` | 本次批次读取的文件及身份信息 |
| 实体 | `ParsedLogEntry` | 解析成功的日志，具有稳定日志 ID 和全局序号 |
| 值对象 | `OriginalTimestamp` | 日志中的原始时间戳文本及可比较时间值 |
| 值对象 | `LogLocation` | 文件 ID、原始行号和合并后序号 |
| 值对象 | `DataQualitySummary` | 总行数、成功数、失败数、耗时 |
| 实体 | `SavedQuery` | 名称、条件、分组与标签 |

## 不变量

- 一个成功发布的数据集在当前会话中不可修改。
- 合并后每条成功日志具有唯一日志 ID 和稳定全局序号。
- 解析失败行不进入搜索、请求识别或时延分析。
- 原始时间戳文本必须保留，以支持 CSV 原样导出。
- 保存查询不持有当前会话日志结果。

## 输入与输出

- 输入：本地日志文件、搜索条件、日志引用、保存查询命令。
- 输出：`ParsedLogDataset`、`SearchResult`、`LogContextData`、`DataQualitySummary`、`SavedQueryCatalog`。

## 领域服务

- 日志固定格式解析。
- 多文件时间合并。
- 搜索索引构建与查询执行。
- 按日志引用读取边界日志和前后上下文。

## 上下文关系

- 向时延分析提供不可变 `ParsedLogDataset`。
- 通过 `LogLookupPort` 向结果投影提供原始日志读取。
- 不依赖规则配置或时延分析模型。

## 问题所有权

- 文件读取与重复：RESP-LOG-LOAD。
- 单行解析失败：RESP-LOG-PARSE、RESP-LOG-QUALITY。
- 正则语法和超时：RESP-LOG-SEARCH。

## 需求覆盖

REQ-INGEST、REQ-SEARCH、REQ-SAVED-QUERY。

## 明确排除

- 不识别业务请求。
- 不执行业务 matcher。
- 不计算阶段或统计时延。
- 不永久保存会话日志数据。
