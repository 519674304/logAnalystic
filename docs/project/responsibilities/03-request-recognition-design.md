Document ID: RESP-REQUEST-RECOGNITION-DESIGN
Status: Draft
Approved by:
Approved at:
Depends on: CTX-LATENCY-ANALYSIS, REQ-REQUEST
Supersedes:

# 请求识别设计

## 目的与非目标

根据全局请求开始和结束规则，在用户时间范围内识别每次 req。只确定请求边界和结果，不匹配普通关键日志，不计算阶段时延。

## 公共契约

```text
recognize(dataset, boundaryRules, timeRange) -> RecognizedRequest[]
```

每个结果至少包含 systemRequestId、开始日志引用、开始原始时间戳、结束边界类型、结束日志引用、结束结果和日志序号范围。

## 主算法语义

1. 在数据集中按时间顺序查找全局开始标记。
2. 只选择开始时间位于用户范围内的开始标记。
3. 为每个开始标记生成非空 systemRequestId。
4. 查找第一条有效结束日志。
5. 找不到结束日志时，边界截止到下一次全局开始日志之前。
6. 请求一旦纳入，完整保留其结束边界，不按用户时间范围截断。

## 不变量

- 场景不得改变请求数量或边界。
- 请求范围不重叠。
- 日志开始到首个请求开始之前的内容不属于任何请求。
- 请求内未命中普通 matcher 的日志仍属于日志数据范围，但不进入时延模型。
- systemRequestId 在一次分析运行中唯一且不能为空。

## 问题与恢复

- 缺少结束日志但存在下一开始：按确认规则正常结束，不作为 EXCEPTION。
- 最后一段无结束且无下一开始：生成结构化边界 Issue，处理策略由 Phase 3 确定。
- 多流程边界重叠：REQUEST_RECOGNITION / EXCEPTION，不生成冲突结果。

## 依赖

- 依赖 ParsedLogDataset 顺序读取。
- 依赖 RuleSetSnapshot 中固定生效的请求边界规则。
- 不依赖普通场景有效规则。

## 测试边界

- 有结束日志、无结束但有下一开始。
- 时间范围只筛选开始标记，不截断已纳入请求。
- 首个开始前日志不生成请求。
- systemRequestId 稳定、唯一、非空。
- 场景切换不改变请求边界。
