Document ID: RESP-LATENCY-PIPELINE-DESIGN
Status: Draft
Approved by:
Approved at:
Depends on: CTX-LATENCY-ANALYSIS, RESP-REQUEST-RECOGNITION-DESIGN, REQ-LATENCY
Supersedes:

# 时延分析流水线设计

## 包含职责

RESP-ANALYSIS-SCOPE、RESP-SCENARIO-RESOLVE、RESP-LOG-MATCH、RESP-STAGE-CALCULATE、RESP-LATENCY-STATISTICS、RESP-ANALYSIS-ASSEMBLE、RESP-ANALYSIS-COORDINATE。

## 目的与非目标

协调一次完整批量分析并产生不可变结果。流水线不解析 TOML、不读取文件、不渲染 UI、不写 CSV。

## 公共契约

```text
analyze(dataset, ruleSetSnapshot, timeRange, scenarioId)
  -> LatencyAnalysisResult
```

## 数据流

```text
AnalysisScope
  -> EffectiveAnalysisRules
  -> RecognizedRequest[]
  -> MatcherHit[] per request
  -> StageLatency[] per request
  -> LatencyStatistics
  -> EffectiveRuleCatalog
  -> LatencyAnalysisRun
```

## 场景解析

- 请求边界规则始终生效。
- 普通 matcher 和 stage 必须 `enabled=true`。
- 当前 scenarioId 必须存在于 `applicable_scenario_ids`。
- `export_enabled` 保留到结果中，但不影响匹配和计算。

## 日志匹配

- 只在某次 RecognizedRequest 的日志序号范围内执行普通 matcher。
- MatcherHit 保存 matcher ID、日志引用、原始时间戳和所属 systemRequestId。
- 同一 matcher 重复命中的主流程策略按批准规则取第一次；相关提示留给问题处理。
- 未命中 matcher 的普通日志不进入分析结果。

## 阶段计算

- stage 引用 start_matcher_id 和 end_matcher_id。
- 起止 MatcherHit 必须属于同一次请求。
- 时延使用可比较时间值相减，输出毫秒数；原始时间戳文本继续保留在日志引用中。
- RPC 阶段允许起止日志属于不同应用和不同进程。
- business 与 internal 层分别按自己的顺序处理，允许复用边界日志。

## 统计聚合

- 统计对象按 stage ID 汇总。
- 样本数只包含成功生成该阶段时延的请求。
- 输出样本数、平均值、P90 和最大值。
- 不完整阶段不以零值参与统计。

## 协调职责

协调器只负责固定输入版本、调用顺序、取消后续步骤和组装结果，不实现 matcher 或时延算法。组装结果时写入投影所需的精简 EffectiveRuleCatalog。任一 EXCEPTION 导致当前分析运行不发布，上一有效结果保持不变。

## 问题与恢复

- 场景不存在或有效规则不一致：RULE_SET / EXCEPTION。
- matcher 未命中：LOG_MATCHING / WARNING 或 TIP，按阶段依赖决定。
- 阶段边界缺失：STAGE_CALCULATION / WARNING，不生成该阶段样本。
- 时间顺序非法：STAGE_CALCULATION / EXCEPTION，不发布错误阶段结果。
- 统计降级：STATISTICS / WARNING，具体策略留到 Phase 4。

## 扩展点候选

- matcher 类型和阶段计算类型可能使用策略。
- 流水线前后可能使用拦截器处理统一问题和计时。
- 当前不确定具体模式，Phase 3 按生命周期评估。

## 测试边界

- 同一输入产生确定性结果。
- FULL 与 CORE 场景生成不同有效规则，但请求边界相同。
- RPC、应用处理和内部阶段计算。
- 缺失阶段不污染统计。
- UI 或 CSV 变化不影响流水线测试。
