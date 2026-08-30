# 健康体检设计（Health Check）

## Goal

对导入的日志所对应的目标系统做一次**健康体检**，产出两类「问题」信号：**系统异常**（报错日志）与**时延异常**（慢阶段）。一次读日志、一次扫描，同时产出错误清单与慢请求清单，供前端「问题提示」页展示。

健康体检复用现有日志采集/解析（`LogSource.entries`）与栈式时延分析（`LatencyAnalyzer`），仅新增一个独立的健康体检领域模块与一个 HTTP 端点，不改动时延分析与日志读取的现有语义。

## 范围

- **系统异常（报错）**：命中错误过滤器（纯 pattern 匹配）的日志行。
- **时延异常（慢）**：某个 stage 样本耗时超过该 stage 配置的 `threshold_ms`。
- **日志丢失过滤**：本期不做。日志丢失从日志本身无迹可寻，无法识别，暂不建模。

形态为**一次性体检**：用户点「开始体检」，对当前工作区 + 时间范围 + 生效规则集跑一次，产出结果清单。不做常驻后台任务或实时监控。

## 架构与数据流

```
规则集(3层: definitions / matchers / stages)
   │  前端投影（新增投影逻辑）
   ▼
HealthCheckSpec { errorFilters, latency, slowThresholdByStage }
   │  POST /api/health/check { path, startTime?, endTime?, ...spec }
   ▼
后端：读一次 entries（复用 LogSource.entries）
   │  ① 错误扫描：遍历 entries 匹配 errorFilters → 系统异常清单
   │  ② 时延分析：SequentialStackSplitter.split(entries) → requests → LatencyAnalyzer::analyze(stages, requests)
   │  ③ 慢判定：对每个 stage 样本，duration_ms > 该 stage 阈值 → 慢阶段，按请求聚合
   ▼
HealthReport { summary, systemErrors, slowRequests }
   ▼
前端「问题提示」页（替换现有静态占位）
```

## 规则集扩展

在现有 3 层结构上新增两个可选字段，均不改变现有节点语义。

### 错误过滤器（`matchers` 层）

给 matcher 节点新增可选字段 `matcher_role`：

| 取值 | 语义 |
| --- | --- |
| 缺省 / 空 | 普通关键日志 matcher（现状不变） |
| `"error"` | 错误过滤器，健康体检据此判定「系统异常」 |

错误过滤器为**纯 pattern 匹配**：matcher 的 `pattern` + `type`（keyword/regex）匹配日志 `raw` 行，命中即记一条系统异常，不做 `level` 限定。命中多条/多个过滤器时，每条命中独立成一条系统异常记录。

### 慢阈值（`stages` 层）

给 stage 节点新增可选字段 `threshold_ms`（数值，毫秒）。**所有 stage（flow 级与进程级）均支持**，不限 flow 级。未配 `threshold_ms` 的 stage 不参与慢判定。

## 后端结构

新增领域模块 `crates/log-core/src/domain/health_check/`，与 `latency_analysis` 并列。

### 输入契约 `spec.rs`

```rust
pub struct StageThreshold {
    pub stage_id: String,
    pub threshold_ms: i64,
}

pub struct HealthCheckSpec {
    pub error_filters: Vec<Marker>,           // 复用 latency_analysis::spec::Marker
    pub latency: LatencyAnalysisSpec,          // 复用现有时延分析输入
    pub stage_thresholds: Vec<StageThreshold>, // 空向量 = 不判慢
}
```

### 结果契约 `result.rs`

```rust
pub struct SystemError {
    pub timestamp: String,
    pub level: String,
    pub tag: String,
    pub message: String,
}

pub struct SlowStage {
    pub stage_id: String,
    pub duration_ms: i64,
    pub threshold_ms: i64,
}

pub struct SlowRequest {
    pub request_id: String,
    pub total_ms: i64,
    pub slow_stages: Vec<SlowStage>,
}

pub struct HealthSummary {
    pub error_count: usize,
    pub slow_request_count: usize,   // 含慢阶段的请求去重计数
    pub slow_stage_count: usize,     // 慢阶段样本总数
    pub total_request_count: usize,
}

pub struct HealthReport {
    pub summary: HealthSummary,
    pub system_errors: Vec<SystemError>,
    pub slow_requests: Vec<SlowRequest>,
}
```

所有结构 `#[serde(rename_all = "camelCase")]`，与前端对齐。

### 分析器 `analyzer.rs`

`HealthCheckAnalyzer::check(spec: &HealthCheckSpec, entries: &[LogEntry]) -> Result<HealthReport, String>`：

1. **错误扫描**：遍历 entries，对每条 entry 用 `MarkerMatcher`（复用 `latency_analysis::marker`）依次匹配 `spec.error_filters` 的 `raw` 行，命中即 `SystemError { timestamp, level, tag, message }`；`tag` 取自 `entry.ext`（`LogExtension::Edge(EdgeExt.tag)`）。错误过滤器为空则错误清单为空（不做默认 level 扫描；系统异常的判定完全由规则集驱动）。
2. **时延分析**：复用现有 `SequentialStackSplitter`（`request_split` 端侧实现，入参 `spec.latency.request_starts` + `spec.latency.intercept_ends`）拆出请求队列，再 `LatencyAnalyzer::analyze(&spec.latency.process_stages, &requests)` 做 stage 匹配与统计。
3. **慢判定**：对每个 request 的每个 stage 样本，若其 `stage_id` 命中某条 `StageThreshold` 且 `duration_ms > threshold_ms`，记入该请求的 `slow_stages`。含 `slow_stages` 的请求纳入 `slow_requests`。
4. 汇总 `summary`。

`LatencyAnalyzer` 保持不变；健康体检只消费其产物。

### 应用层编排

`LogWorkspaceService` 新增：

```rust
pub fn health_check(&self, dir: &str, range: &TimeRange, spec: &HealthCheckSpec)
    -> Result<HealthReport, String> {
    let entries = self.source.entries(dir, range)?;
    HealthCheckAnalyzer::check(spec, &entries)
}
```

### 端点

`crates/server/src/main.rs` 新增路由 `POST /api/health/check`。请求 DTO 复用现有 `AnalyzeRequest` 的形状并扩展 `errorFilters` 与 `stageThresholds`；handler 走与 `latency_analyze` 相同的 requestId / started / completed / failed 事件与安全摘要（`errorFilterCount`、`stageThresholdCount`、`errorCount`、`slowRequestCount`），不落日志原文。

## 前端「问题提示」页

替换 [App.tsx](src/app/App.tsx) 中 `issue-tips` tab 的静态 `issueRules` 占位：

- 「开始体检」按钮：复用 `logFolderPath`、时间范围与生效规则集（`scenarioRules`）。
- 投影逻辑：从规则集投影 `HealthCheckSpec` —— `matcher_role="error"` 的 matcher → `errorFilters`；`threshold_ms` 的 stage → `stageThresholds`；时延部分复用 `runLatencyAnalysis` 现有的 spec 投影。
- 顶部汇总卡：系统异常 N 条 / 慢请求 M 条 / 慢阶段 K 个 / 体检请求总数。
- 系统异常清单：时间戳 · 级别 · tag · 消息。
- 慢请求清单：请求 id · 总耗时 · 各慢阶段（阶段名 · 耗时 · 阈值），阶段名由 stage id 经规则集映射（复用现有 `stageNameById` 逻辑）。

## 错误处理与安全

- 未选日志目录 / 未选生效规则集 → 友好提示（复用现有 message pattern），不发起请求。
- 无任何 error filter 且无任何 stage threshold → 体检仍可运行，返回空清单 + 总请求数。
- 遵循现有安全边界：健康体检日志事件不落原始日志行、query、路径或 rule JSON。

## 验收标准

- 给定含报错行与慢阶段的日志 + 规则集（配 error matcher 与 stage threshold），体检返回正确的 `systemErrors` 与 `slowRequests`。
- 未配 error filter 时 `systemErrors` 为空；未配 threshold 的 stage 不产生慢阶段。
- `LatencyAnalyzer` 的请求拆分、拦截过滤、统计语义保持不变（现有测试继续通过）。
- 单元测试覆盖：错误扫描命中、慢阈值判定、慢阶段按请求聚合、汇总计数。
- 集成测试覆盖 `/api/health/check` 端到端返回。
- `cargo test --workspace`、`cargo check`、`npm run test:ui-contract` 均通过。
