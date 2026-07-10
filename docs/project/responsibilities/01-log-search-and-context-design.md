Document ID: RESP-LOG-SEARCH-DESIGN
Status: Approved
Approved by: 用户
Approved at: 2026-07-06
Depends on: CTX-LOG-WORKSPACE, REQ-SEARCH
Supersedes:

# 日志搜索与上下文设计

## 包含职责

`RESP-LOG-SEARCH`，以及其使用的日志上下文读取能力。

## 目的与非目标

在不可变日志数据集上执行关键字、短语、正则和结构化字段过滤，并按日志引用读取原始上下文。不识别 req，不执行业务 matcher。

## 公共契约

```text
search(datasetId, SearchCriteria) -> SearchResult
readContext(datasetId, logRef, before, after) -> LogContextData
```

`SearchCriteria` 包含查询模式、文本、字段过滤、时间条件、应用条件、上下文范围和排序。`SearchResult` 包含命中日志引用、摘要、总数和耗时。

## 工作流

1. 校验查询条件。
2. 选择关键字、短语、正则或结构化字段执行路径。
3. 在候选集合中执行过滤。
4. 按时间升序生成命中引用。
5. 根据需要读取前后上下文。

## 不变量

- 结果固定按时间升序。
- 上下文默认前后 10 行，并受已确认上限约束。
- 正则超时时不返回不完整结果。
- 查询不修改数据集和索引。

## 依赖

- 依赖 ParsedLogDataset 读取接口和搜索索引端口。
- 不依赖时延分析或规则配置。

## 问题与恢复

- 正则语法错误：EXCEPTION，中止查询，保留查询条件。
- 正则超时：EXCEPTION，中止查询，不返回部分结果。
- 无命中：TIP，返回空结果。

具体模式和超时机制由 Phase 4 决定。

## 测试边界

- 关键字、短语、正则和组合字段查询。
- 时间升序和上下文边界。
- 正则错误、超时和空结果。
- 查询不会改变原始数据。
