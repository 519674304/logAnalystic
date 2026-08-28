Document ID: RESP-REQUEST-RECOGNITION-DESIGN
Status: Draft
Approved by:
Approved at:
Depends on: CTX-LATENCY-ANALYSIS, REQ-REQUEST
Supersedes:

# 请求识别设计

## 目的与非目标

根据流程级聚合 stage（`order=1`）的开始匹配器命中，在用户时间范围内识别每次 req；按命中的聚合 stage `result` 分支判定结果。只确定请求边界和结果，不匹配普通关键日志，不计算阶段时延。

## 公共契约

```text
recognize(dataset, aggregateStages, timeRange) -> RecognizedRequest[]
```

每个结果至少包含 systemRequestId、开始日志引用、开始原始时间戳、结束边界类型、结束日志引用、结束结果和日志序号范围。

## 主算法语义

1. 在数据集中按时间顺序查找聚合 stage（`order=1`）的开始匹配器命中。
2. 只选择开始时间位于用户范围内的开始命中。
3. 为每个开始命中生成非空 systemRequestId。
4. 查找聚合 stage 各 `result` 分支的结束匹配器命中，判定结果与 `result`。
5. 找不到结果分支命中时，边界截止到下一次开始命中之前。
6. 请求一旦纳入，完整保留其结束边界，不按用户时间范围截断。

## 不变量

- 场景不得改变请求数量或边界。
- 请求范围不重叠。
- 日志开始到首个请求开始之前的内容不属于任何请求。
- 请求内未命中普通 matcher 的日志仍属于日志数据范围，但不进入时延模型。
- systemRequestId 在一次分析运行中唯一且不能为空。

## 问题与恢复

- 缺少结果分支日志但存在下一开始：按确认规则正常结束，不作为 EXCEPTION。
- 最后一段无结束且无下一开始：生成结构化边界 Issue，处理策略由 Phase 3 确定。
- 多流程边界重叠：REQUEST_RECOGNITION / EXCEPTION，不生成冲突结果。

## 依赖

- 依赖 ParsedLogDataset 顺序读取。
- 依赖 RuleSetSnapshot 中固定生效的聚合 stage（`order=1`）开始匹配器与 `result` 分支。
- 不依赖普通场景有效规则。

## 测试边界

- 有结果分支日志、无结束但有下一开始。
- 时间范围只筛选开始标记，不截断已纳入请求。
- 首个开始前日志不生成请求。
- systemRequestId 稳定、唯一、非空。
- 场景切换不改变请求边界。
