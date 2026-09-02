# 专科诊断（Specialist Diagnosis）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「问题提示」页内新增「专科诊断」子 tab：左侧为诊断问题列表（可新增/删除），右侧展示选中问题对当前日志、当前时间窗的诊断结论。诊断问题由**多个判断依据**组合而成，每个判断依据是一条「在某个时间窗内找 marker/stage 是否命中」的搜索，配一条「且/或」连接符与一条短结论；问题级配「命中时结论 / 未命中时结论」两句话术。运行端点 `POST /api/diagnostic/run`；问题列表持久化到后端本地 JSON（`app-data/diagnostic-problems.json`）。

**Architecture:** 新增独立领域模块 `log-core/domain/specialist_diagnosis`，复用 `Marker`/`MarkerMatcher`（搜索）与 `StageSpec`（stage 配对）。`DiagnosticAnalyzer::run` 吃「读到的条目 + 时间窗起止」，逐判断依据做「三种下界过滤 → 搜索 → 命中/配对 → 判定」，再按「且/或」折叠出最终结论，返回 `DiagnosticReport`。持久化复用 rule-config 的「不透明 JSON 存储」模式（新 `DiagnosticProblemStore` + `DiagnosticProblemService`）。前端新增 client + 解析 helper + 子 tab 组件。

**Tech Stack:** Rust 2021、serde（`rename_all = "camelCase"`）、axum 0.8、tracing、React + TypeScript（Vite）。

**Spec:** [2026-09-01-diagnostic-workflow-conditions-design.md](../specs/2026-09-01-diagnostic-workflow-conditions-design.md)

## Global Constraints

- 所有跨边界 DTO / 结果结构用 `#[serde(rename_all = "camelCase")]`；前端字段 camelCase，后端字段 snake_case。
- 复用现成类型：搜索复用 `latency_analysis::spec::{Marker, MarkerMode, StageSpec}` 与 `latency_analysis::marker::MarkerMatcher`；时间戳解析复用 `latency_analysis::timestamp::timestamp_to_ms`。
- 诊断与「时延分析」解耦：不复刻 request 拆分 / 去重，只做「在时间窗内找 marker/stage 是否命中」。
- 三种下界（相对 `t0`，从 `t1` 往回）：`window`（`[t0,t1]`）、`boundedBacktrack`（`[t0−W,t1]`）、`unbounded`（`(−∞,t1]`）。`W` 建规则时配，非全局。
- 命中返回：`first`（首个命中）／`all`（列出全部命中，stage 列全部实例）。
- stage 配对三态：`closed`（有 end 且晚于最后 start）、`unclosed`（有 start 但无晚于它的 end）、`missing`（无 start）。
- 判定：matcher 的 `when ∈ {hit, miss}`，stage 的 `when ∈ {closed, unclosed, missing}`；判断依据「命中」= 实际状态等于 `when`。
- 逻辑折叠：从左到右 `acc = true`，逐条 `acc = (connector==or) ? (acc || satisfied) : (acc && satisfied)`；首条 connector 忽略。
- 最终结论：命中 → `拼接命中判断的短结论（"；"分隔）+ "；" + 命中时结论`；未命中 → `未命中时结论`。
- 诊断日志安全边界：不落原始日志行、query、路径；handler 只记录安全摘要（判断数、命中布尔）。

---

## File Structure

- Modify: `crates/log-core/src/domain/latency_analysis/timestamp.rs`（加 `ms_to_timestamp`）
- Create: `crates/log-core/src/domain/specialist_diagnosis/mod.rs`
- Create: `crates/log-core/src/domain/specialist_diagnosis/spec.rs`
- Create: `crates/log-core/src/domain/specialist_diagnosis/result.rs`
- Create: `crates/log-core/src/domain/specialist_diagnosis/analyzer.rs`
- Modify: `crates/log-core/src/domain/mod.rs`
- Modify: `crates/log-core/src/application/log_workspace_service.rs`（加 `run_diagnostic`）
- Create: `crates/log-core/src/infrastructure/file_storage/diagnostic_problem_store.rs`
- Modify: `crates/log-core/src/infrastructure/file_storage/mod.rs`
- Create: `crates/log-core/src/application/diagnostic_problem_service.rs`
- Modify: `crates/log-core/src/application/mod.rs`
- Modify: `crates/server/src/main.rs`（端点 + DTO + 路由）
- Test: `crates/server/tests/specialist_diagnosis_integration.rs`
- Modify: `src/api/dto.ts`
- Create: `src/api/specialist-diagnosis-client.ts`
- Create: `src/features/health-check/SpecialistDiagnosisPanel.tsx`
- Modify: `src/features/health-check/HealthCheckPanel.tsx`（加子 tab 容器）
- Modify: `src/app/App.tsx`

---

### Task 1: 时间戳反向函数 `ms_to_timestamp`

**Files:** Modify `crates/log-core/src/domain/latency_analysis/timestamp.rs`

在 `timestamp_to_ms` 之后加 `ms_to_timestamp(ms: i64) -> String`（`YYYY-MM-DD HH:MM:SS.mmm`），配 `civil_from_days`（`days_from_civil` 的逆）。供「有界回溯」把 `t0 − W` 换算回时间戳串做字符串比较。

---

### Task 2: 领域模块 specialist_diagnosis

**Files:** Create `mod.rs` / `spec.rs` / `result.rs` / `analyzer.rs`；Modify `domain/mod.rs`

**Interfaces:**
- Consumes: `latency_analysis::{spec::{Marker, StageSpec}, marker::MarkerMatcher, timestamp::timestamp_to_ms}`、`log_workspace::log_entry::LogEntry`。
- Produces: `SearchRange`、`Connector`、`ReturnMode`、`JudgmentType`、`DiagnosticJudgment`、`DiagnosticProblem`、`HitEvidence`、`JudgmentResult`、`DiagnosticReport`、`DiagnosticAnalyzer::run(problem, entries, t0, t1) -> Result<DiagnosticReport, String>`。

先写失败测试（matcher hit/miss、stage closed/unclosed/missing、三种下界、且/或折叠、结论拼接），再写实现。`domain/mod.rs` 加 `pub mod specialist_diagnosis;`。

---

### Task 3: 持久化 store + service + GET/PUT 端点

**Files:** Create `diagnostic_problem_store.rs` / `diagnostic_problem_service.rs`；Modify `file_storage/mod.rs`、`application/mod.rs`、`server/src/main.rs`

**Interfaces:**
- `DiagnosticProblemStore`：镜像 `RuleConfigStore`，`app-data/diagnostic-problems.json`，`load()/save()` 不透明 JSON（默认文档 `{ "problems": [] }`）。
- `DiagnosticProblemService { list(), save(value) }`：镜像 `RuleSetService`。
- HTTP：`GET /api/diagnostic-problems`（返回 `{ problems: [...] }`）、`PUT /api/diagnostic-problems`（保存整份文档）。`AppState` 增加 `diagnostic_service`。

---

### Task 4: 运行端点 POST /api/diagnostic/run + 集成测试

**Files:** Modify `server/src/main.rs`；Test `server/tests/specialist_diagnosis_integration.rs`

**Interfaces:**
- `LogWorkspaceService::run_diagnostic(dir, range, problem) -> Result<DiagnosticReport, String>`：读一次 `entries(dir, {start: None, end: range.end})`（无界往回读到 `t1`），交 `DiagnosticAnalyzer::run(problem, &entries, range.start, range.end)`。
- HTTP `POST /api/diagnostic/run`：请求 `{ path, startTime?, endTime?, problem }`，`problem` 携带**已解析的** marker/stage（前端负责把 matcherId/stageId 投影成 pattern），返回 `DiagnosticReport`。
- 集成测试：临时 `.log`（一条开关 matcher + 一段收音 stage），跑一个「唤不醒」问题断言 `hit` 与结论。

---

### Task 5: 前端 DTO + client + 解析 helper

**Files:** Modify `src/api/dto.ts`；Create `src/api/specialist-diagnosis-client.ts`

**Interfaces:**
- `DiagnosticProblemConfigDto`（持久化形状，含 `matcherId`/`stageId` 引用）、`DiagnosticJudgmentConfigDto`。
- `runDiagnostic(path, problem, timeRange) -> DiagnosticReport`；`listDiagnosticProblems()` / `saveDiagnosticProblems(problems)`。
- 解析 helper：`resolveDiagnosticProblem(problem, rules: RuleRecordDto[])` 把 `matcherId`→`{pattern,mode}`、`stageId`→`{id, startMarkers, endMarkers}` 投影成运行形状。

---

### Task 6: 前端子 tab UI + App 接入

**Files:** Create `SpecialistDiagnosisPanel.tsx`；Modify `HealthCheckPanel.tsx`、`App.tsx`

**UI:** `HealthCheckPanel` 加两个子 tab（普通诊断 / 专科诊断）。专科诊断 tab：左侧问题列表（每条可选中、可删除、顶部「新增」按钮），右侧结果区（选中问题名 + 最终结论 + 各判断依据的命中状态与证据）。「新增/编辑」用 `modal-backdrop`/`modal-card` 弹窗（复用 rule-config modal 模式），配置：问题名、命中/未命中结论、判断依据列表（类型 matcher/stage + 目标下拉 + 搜索范围 + 命中条件 + 返回模式 + 短结论 + 且/或）。App 新增 `diagnosticProblems` / `diagnosticReport` / `diagnosticMessage` 状态与 `runDiagnostic` 动作，装载与保存走后端 client。

---

### Task 7: 构建验证

- `cargo test --workspace`：全部 PASS（含新增领域单测与集成测试）。
- `npm run build`：TypeScript 编译通过。
- `npm run test:ui-contract`：通过。

---

## Plan Self-Review

- **Spec coverage**：三种下界、stage 三态配对、命中/不命中判定、且/或折叠、两句话术、命中返回（first/all）、持久化、运行端点、前端子 tab 均覆盖。
- **Placeholder scan**：无 TBD/TODO；每步有明确产物与接口。
- **Type consistency**：后端 snake_case 域类型（`hit_label`/`miss_label`/`return_mode`/`window_ms`）与前端 camelCase DTO（`hitLabel`/`missLabel`/`returnMode`/`windowMs`）一致；`DiagnosticReport` 字段 `name`/`hit`/`conclusion`/`judgments` 在领域层、端点、集成测试、前端 client 命名一致。
- **接口核验**：复用 `Marker`/`MarkerMatcher`/`StageSpec`（已核验 `spec.rs`/`marker.rs`）；`LogWorkspaceService.entries` 按 `TimeRange {start,end}` 字符串过滤（已核验 `ripgrep_log_source.rs` 的 `in_range`）；集成测试走公开 `server::app::app()`。
