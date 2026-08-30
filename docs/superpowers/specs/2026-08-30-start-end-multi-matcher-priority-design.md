# Start / End 多 matcher 优先级设计

## Goal

让 stage 的 **start 与 end 都支持多个 matcher**，且两者统一为「**数组顺序优先**」的优先级 fallback 语义；同时让「请求拆分点」（`request_start`）也支持多值。端侧日志可能因格式差异/丢失导致某个起止日志缺失，用多个 matcher 冗余覆盖，减少阶段丢失与请求切分失败。

## 语义

### 表示（对称 end 既有做法）

- `start_matcher_id`（单数）保留作简写，新增 `start_matcher_ids`（数组）。
- `end_matcher_id`（单数）保留作简写，`end_matcher_ids`（数组）已存在。
- 有效 matcher 列表 = 去重(`[单数]` + `数组`)，**保持数组顺序**（单数恒排最前）。已有规则包/模板零改动继续可用。

### 数组顺序优先（start 与 end 共用）

给定有效 matcher 列表 `M = [m0, m1, ...]`，在一个请求的日志条目序列（时间升序）上：

1. 依次检查 `m0`：若 `m0` 在该请求任意一条日志命中，取 `m0` 的**首次命中**位置（时间戳 + 原始时间串）作为结果，停止。
2. 否则检查 `m1`，以此类推。
3. 全不命中 → 结果不存在（该 stage 无 start / 无 end）。

数组靠前的 matcher 是「首选」，靠后的是 fallback——**即使靠后的 matcher 在日志里出现得更早，也用靠前 matcher 的命中点**。

> 行为变更：end 的判定从既有「取最早命中」改为「数组顺序优先」。既有测试 `stage_multiple_ends_takes_earliest` 及文档中「取最早」表述需同步修改。

### 请求拆分点（request_start）——与 stage 语义不同

`request_start` 多值后是「**任一命中即压栈开新请求**」：扫描日志时，任一 `request_starts` 命中都关闭当前请求并开启新请求（每个「请求开始」日志都是一个新请求，多 marker 只是识别开始日志的多种形态）。**不是**「选一个」，因此不走数组顺序优先。

## 变更清单

### Rust core

- `crates/log-core/src/domain/latency_analysis/spec.rs`
  - `StageSpec { start: Marker }` → `{ starts: Vec<Marker> }`（`ends: Vec<Marker>` 保持）。
  - `LatencyAnalysisSpec { request_start: Marker }` → `{ request_starts: Vec<Marker> }`。
- `crates/log-core/src/domain/latency_analysis/analyzer.rs`
  - `StageRule { start: MarkerMatcher }` → `{ starts: Vec<MarkerMatcher> }`。
  - `analyze()` 组装：`starts: s.starts.iter().map(MarkerMatcher::build).collect()`。
  - `analyze_request` 抽一个 `find_priority_match(matchers, entries) -> Option<(i64, String)>` 供 start 与 end 复用（数组顺序优先）；start/end 各调用一次，`duration = (end - start).max(0)`。
  - 更新全部测试（`StageSpec { start: ... }` → `starts: vec![...]`）；新增「start 数组顺序优先」「end 数组顺序优先」「start fallback（首个未命中用第二个）」用例。
- `crates/log-core/src/domain/request_split/sequential_stack.rs`
  - `SequentialStackSplitter { request_start: MarkerMatcher }` → `{ request_starts: Vec<MarkerMatcher> }`。
  - `new(request_start: Marker, ...)` → `new(request_starts: Vec<Marker>, ...)`。
  - `split` 内 `self.request_start.matches(line)` → `self.request_starts.iter().any(|m| m.matches(line))`。
  - 更新测试；新增「多个 request_start 任一命中开新请求」用例。
- `crates/log-core/src/application/log_workspace_service.rs`
  - `SequentialStackSplitter::new(spec.request_start.clone(), ...)` → `new(spec.request_starts.clone(), ...)`。

### Rust server

- `crates/server/src/main.rs`
  - `StageSpecDto { start_pattern, start_mode? }` → `{ start_markers: Vec<MarkerDto> }`（对称 `end_markers`）。
  - `AnalyzeRequest { request_start: MarkerDto }` → `{ request_starts: Vec<MarkerDto> }`。
  - `to_spec` 相应：`request_starts: req.request_starts.iter().map(to_marker).collect()`；stage `starts: s.start_markers.iter().map(to_marker).collect()`。

### 前端

- `src/api/latency-analysis-client.ts`
  - `LatencyStageSpec { startPattern, startMode? }` → `{ startMarkers: LogMarker[] }`（对称 `endMarkers`）。
  - `LatencyAnalysisSpec.requestStart: LogMarker` → `requestStarts: LogMarker[]`；`AnalyzeRequestBody` 同步。
- `src/app/App.tsx`（`runLatencyAnalysis`）
  - 新增 `startMatcherIdsOf(stage)`（对称 `endMatcherIdsOf`，保持顺序去重）。
  - `requestStartStage` 用 `startMatcherIdsOf(...).map(toMarker)` 生成 `requestStarts`。
  - stage 投影：`startMarkers = startMatcherIdsOf(stage).map(toMarker)`，`endMarkers` 保持。
- `src/view-model/latency-view-model.ts`
  - 新增 `hasStartMatcher(rule)` = `!!rule.startMatcherId || (rule.startMatcherIds?.length ?? 0) > 0`。
  - 两处 `rule.startMatcherId && hasEndMatcher(rule)` 过滤改为 `hasStartMatcher(rule) && hasEndMatcher(rule)`。
  - `intervalStepOptions` 的 flatMap 纳入 start 数组全部 id。
- `src/view-model/rule-topology-view-model.ts` + `src/features/rule-config/RuleTopologyCanvas.tsx`
  - `RuleTopologyStageViewModel` 增加 `startMatcherNames: string[]`，解析数组 id 到名称；tooltip 展示多个 start（对称 end）。

### 文档 / 记忆

- `docs/project/templates/rule-package-attribute-reference.md`：新增 `start_matcher_id`（简写）与 `start_matcher_ids`（数组，任一命中、数组顺序优先）两行；`end_matcher_ids` 语义由「取最早」改为「数组顺序优先」。
- 相关 domain / requirements 文档中「取最早」表述同步为「数组顺序优先」。
- 记忆 `rule-package-scope-decision.md` 同步。

## 不做

- 不改变 `start_matcher` 的「单数必填」性质——单数仍是简写，数组是扩展；两者都缺时才视为该 stage 无 start。
- 不改 `intercept` 拦截 stage 的 `end_matcher_ids` 语义（拦截是「命中即丢整个请求」，与优先级无关）。
- 不迁移既有模板/示例的单数写法（去重逻辑已保证向后兼容）。

## Acceptance

1. `cargo test`：新增的「start/end 数组顺序优先」「start fallback」「request_starts 任一命中开新请求」用例通过；既有 end/拦截/冒烟用例全绿。
2. `npm run build`（含 `tsc`）通过。
3. 端到端手动：导入带 `start_matcher_ids` 与 `end_matcher_ids` 的规则包 → 跑时延分析 → 确认 start/end 均按数组顺序取命中，请求拆分正常，明细表正常出列。
