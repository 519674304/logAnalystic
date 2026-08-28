Document ID: CONTRACT-LATENCY-ANALYSIS-RESULT
Status: Approved
Approved by: 用户
Approved at: 2026-07-06
Depends on: CTX-LATENCY-ANALYSIS, BASELINE-PRIMARY, UI-BASELINE
Supersedes:

# 时延分析结果数据契约

> 因「规则集结构收敛（3 层）」而修订：取消 `SubprocessGroupDescriptor`、四类 stage type、`layer` 与 `role` 边界；stage 统一为一种，owner 区分 process/flow，流程级聚合 stage 按 `result` 拆结果分支、同 `order` 只命中一个，并行由 `subProcessIds` 表达；不再有 `endResults`。

## 目的

定义数据加工层的最终业务输出。请求列表、时延页面和 CSV 均从该契约投影，禁止各自重新读取 TOML、匹配日志或计算时延。

## 顶层结构

```text
LatencyAnalysisResult
├─ analysisRun
│  ├─ analysisRunId
│  ├─ datasetId
│  ├─ ruleSetSnapshotId
│  ├─ scenarioId
│  └─ scopeStart / scopeEnd
├─ ruleCatalog
│  ├─ businessFlow
│  ├─ applications[]
│  ├─ processes[]
│  ├─ logMatchers[]
│  └─ stages[]
├─ requests[]
└─ statistics
```

## EffectiveRuleCatalog

只携带投影需要的不可变描述，不包含 matcher 表达式或 TOML 编辑状态。

```text
LogMatcherDescriptor
├─ logMatcherId
├─ businessMeaning
├─ applicationId
├─ order
└─ exportEnabled

StageDescriptor
├─ stageId
├─ businessMeaning
├─ owner            # process | flow
├─ processId        # owner = process 时
├─ flowId           # owner = flow 时
├─ result           # 流程级聚合 stage 的结果分支名（同 order 多个分支，执行只命中一个）
├─ subProcessIds[]  # 跨子进程并行时
├─ order
└─ exportEnabled

ProcessDescriptor
├─ processId
├─ name
├─ applicationId
├─ parentProcessId
└─ kind

ApplicationDescriptor
├─ applicationId
├─ name
└─ logPrefix

BusinessFlowDescriptor
├─ flowId
├─ name
├─ domainId
├─ rootProcessId
└─ processIds[]
```

流程级聚合 stage（`owner = flow`、`order=1`）的开始匹配器标记请求开始；其 `result` 分支表达请求/流程的结果：同 `order` 的多个结果分支在定义上都存在，执行时只命中一个，命中的 `result` 即请求结果。

## RequestAnalysisResult

```text
RequestAnalysisResult
├─ systemRequestId
├─ displayStartTimestamp
├─ boundary
│  ├─ startLogRef
│  ├─ endLogRef（可以为空）
│  └─ endType
├─ result
├─ abnormal
├─ durationMs
├─ matcherHits[]
└─ stageLatencies[]
```

约束：

- systemRequestId 不能为空。
- displayStartTimestamp 使用开始日志原始时间戳。
- endLogRef 在请求由下一开始标记截断时可以为空。
- matcherHits 只包含当前场景有效 matcher 的命中。
- stageLatencies 只包含成功计算的阶段，不使用零值代替缺失阶段。
- `result` 取自命中的聚合 stage 结果分支的 `result`；请求由下一开始标记截断、未命中任何结果分支时，`result` 为空、`abnormal` 标记为真。

## MatcherHit

```text
MatcherHit
├─ logMatcherId
├─ systemRequestId
├─ logRef
├─ originalTimestamp
└─ comparableTimestamp
```

## StageLatency

```text
StageLatency
├─ stageId
├─ systemRequestId
├─ startLogRef
├─ endLogRef
├─ startTimestamp
├─ endTimestamp
└─ durationMs
```

起止日志必须位于同一次 req 内；跨应用 RPC 阶段允许跨应用和进程。跨子进程并行阶段的耗时 = 触发点到汇总点的总等待，其子进程阶段作为独立 `StageLatency` 出现在 `stageLatencies` 中。

## LatencyStatistics

```text
StageStatistics
├─ stageId
├─ sampleCount
├─ averageMs
├─ p90Ms
└─ maximumMs
```

统计只使用成功生成的 StageLatency 样本。

## 投影规则

- RequestListData 读取请求摘要，不读取 matcherHits 计算结果。
- LatencyViewData 使用应用、进程、阶段描述及选中请求的阶段结果。
- LatencyExportTable 使用 businessMeaning、exportEnabled、原始时间戳、durationMs 和统计。
- UI 颜色、坐标、组件状态和 CSV 转义不属于该契约。

## 版本原则

该契约在 Phase 4 映射为具体类型或 schema。新增可选展示字段可以兼容扩展；改变字段业务语义必须更新基线和受影响的下游文档。
