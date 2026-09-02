Document ID: REV-001
Status: Draft
Approved by:
Approved at:
Depends on: docs/project/architecture/06-package-structure.md, docs/project/architecture/03-technology-selection-adrs.md
Supersedes: —

# 代码架构评审：职责不清与架构债

一次对当前代码库的结构性评审。范围覆盖前端（`src/`）与后端（`crates/`），聚焦「职责归属不清」造成的架构债，而不是功能缺陷或性能问题。

## 结论摘要

三个独立的问题，同一个根因：

| # | 问题 | 位置 | 严重度 |
| --- | --- | --- | --- |
| 1 | 前端超级组件，领域投影逻辑寄生在 React 组件里 | `src/app/App.tsx`（1123 行） | 高 |
| 2 | application 层直接构造 infrastructure 具体类型，绕过 port | `crates/log-core/src/application/` | 高 |
| 3 | 800 行 `main.rs` 承担 DTO / 映射 / handler / 路由 / 观测 / 组合根六种职责 | `crates/server/src/main.rs` | 中 |

根因：**迁移是「加」不是「换」，且开发循环里从没有一道「回头看架构」的关卡**。三者中 #2 与 #3 是一条线——组合根本该唯一负责装配具体实现，但装配下沉到了 application 层内部。

---

## 问题 1：App.tsx 超级组件

`src/app/App.tsx` 共 1123 行，是第二大的文件（`src/view-model/latency-view-model.ts` 577 行）的两倍。核心不是「state 太多」，而是**领域职责（规则投影）寄生在组件里**：

| 关注点 | 位置 | 本该在哪 |
| --- | --- | --- |
| 全部 state（约 30 个 `useState`，跨 4 个 tab） | `src/app/App.tsx:389-419` | 各 feature / 独立 store |
| 规则投影 `projectRuleRecords` | `src/app/App.tsx:170-242` | 领域层（文档中的 `EffectiveRuleResolver`） |
| 时延投影 `buildLatencySpecProjection` | `src/app/App.tsx:255-322` | 领域层 |
| 场景过滤 `filterRulesByScenario` | `src/app/App.tsx:244-247` | 领域层 |
| CSV 组装 + 转义 + 下载 | `src/app/App.tsx:324-380` | 独立导出模块 |
| localStorage 读写（6 个 helper） | `src/app/App.tsx:59-119` | 持久化层 |
| Tauri 文件夹选择兜底 | `src/app/App.tsx:547-570` | 已死的平台层 |

三个具体坏味道：

1. **投影逻辑跨文件重复。** `buildLatencySpecProjection` 里的 `toMarker` / `startMatcherIdsOf` / `endMatcherIdsOf`，在 `src/api/specialist-diagnosis-client.ts:72-119` 的 `resolveDiagnosticProblem` 里几乎原样复制了一份（`toMarker` 逐字相同）。改一处必漏另一处。

2. **死代码 / 演示数据混入生产路径。**
   - `src/app/app-actions.ts`（14 行）：无任何文件 import，纯死代码。
   - `src/app/app-state.ts`（89 行）：只有 `latencyResult` 被引用，其余 `savedQueries` / `issueRules` / `sampleLogs` / `LogEntry` / `IssueRule` 全是早期 demo 数据。
   - `latencyResult` 被拿去当「空态占位」——`src/app/App.tsx:50` `sampleLatencyViewModel = mapToViewModel(latencyResult)`，喂给 `buildLatencyViewModelFromRules`（`src/app/App.tsx:445-451`）。硬编码样例数据耦合进了真实渲染路径。
   - `src/api/tauri-client.ts:23-148`：`sampleLogLines` / `parseLine` / `localSearch` / `invokeCommand` / `health()` 是 Tauri 时代的兜底 + 样例搜索，实际搜索走 `src/api/http-client.ts` 的 `searchLogs`，这段已死。

3. **`tauri-client.ts` 名不副实。** 规则部分（`src/api/tauri-client.ts:180-245`）已全走 `GET/PUT /api/rule-config`，文件名仍叫 Tauri。

**后果**：投影无法单测、无法被后端复用；跨文件重复带来隐性不一致；demo 数据污染真实路径。

**改法**：抽 `EffectiveRuleResolver`（合并两份投影去重）→ 清死代码 + 把 `sampleLatencyViewModel` 换成真正的空态 → 用 feature 级 state 把 App 拆成四个 tab 容器 → `tauri-client.ts` 改名。

---

## 问题 2：application 层直接构造 infrastructure 具体类型

`crates/log-core/src/application/` 三个服务都焊死了具体实现：

- `log_workspace_service.rs:20-29`：字段是具体类型 `source: RipgrepLogSource`，`new()` 里 `source: RipgrepLogSource` 写死。
- `rule_set_service.rs:6-15`：`store: RuleConfigStore`，**连 port trait 都没有**，直接 new 具体实现。
- `diagnostic_problem_service.rs:6-15`：`store: DiagnosticProblemStore`，同样没有 port。

三个问题叠加：

1. **领域层有正确的 port，application 层却绕过了它。** `LogSource` / `RequestSplitter` / `LogParser` 都是领域 trait（`domain/log_workspace/port.rs`），但 `LogWorkspaceService` 不用 `Box<dyn LogSource>` 或泛型 `S: LogSource`，而是焊死 `RipgrepLogSource`。trait 只在 `ripgrep_log_source.rs` 内部 `impl` 了一下，没起到依赖倒置作用。

2. **不可测试、不可替换。** `analyze` 直接 `self.source.entries(dir, range)` 读真实文件系统，无法注入 fake `LogSource` 做单测；store 没有 port，未来换持久化介质（DB / 用户数据目录）得改 application 代码。store 的 `in_dir()` 只是「测具体 store」，不是「测 service 对 port 的行为」。

3. **`log-core` 的「纯领域」名不副实。** infrastructure（ripgrep + file_storage）与 application/domain 同住一个 crate，application 直接 new 它们，导致号称「无 axum/tokio/fs 的纯逻辑」这一层实际已与 `std::fs`、文件路径耦合。

**后果**：违反依赖倒置（对照 `architecture/06-package-structure.md` 里「application 只依赖 port」的硬规则）；不可单测；`log-core` 纯度是假象。

**改法**：`LogWorkspaceService` 持有 `Box<dyn LogSource>`、`new(source: ...)` 注入；给 store 抽 `trait RuleConfigStore` / `DiagnosticProblemStore`，service 接收 trait object；具体实现的选择上移到组合根（`main.rs` 的 `app()`）。

---

## 问题 3：main.rs 800 行承担过多职责

`crates/server/src/main.rs` 共 800 行，塞了六件事：

| 职责 | 位置 |
| --- | --- |
| DTO 定义（约 19 个 struct） | `main.rs:44-205` |
| DTO → spec 映射（约 190 行） | `main.rs:207-398` |
| tracing / 观测 | `main.rs:400-458`、`705-711` |
| 11 个 handler | `main.rs:460-703` |
| 路由表 + 组合根 | `main.rs:713-747` |
| ApiError + main + 测试 | `main.rs:749-800` |

问题不止是「长」，有三处具体坏味道：

1. **映射逻辑重复。** `to_spec`（`main.rs:236-267`）和 `to_health_spec`（`main.rs:269-315`）里 `process_stages → StageSpec` 的映射几乎一模一样，`to_health_spec` 把 `to_spec` 的代码整段抄了一遍；同时单独定义了 `to_stage_spec`（`main.rs:317-331`）却没复用。改 marker/stage 结构要动 4 处。

2. **mode 解析重复。** `to_marker`（`main.rs:225-234`）用 `parse_mode_with_fallback`，`search` handler（`main.rs:498-501`）又独立解析一遍 mode 并重复 log fallback。

3. **组合根被劈成两半。** `app()`（`main.rs:741-747`）只负责 new `*Service`，但具体 infra 的选择在 service 内部（见问题 2）。正确 DI 应该在这里一次性把 `RipgrepLogSource` 和两个 store new 出来注入。

**改法**：拆成 `dto.rs`（DTO 定义）、`mapping.rs`（`to_spec` / `to_health_spec` / `to_problem`，去重、复用 `to_stage_spec`）、`router.rs`（路由装配）、`handlers/`（按资源拆），tracing 并入 `diagnostics.rs`；`main.rs` 只留 `main()` + 组合根。

---

## 根因分析

问题 2 与问题 3 其实是一条线：**组合根本该是唯一「new 具体实现、做装配」的地方，但它只装配到 service 粒度就停了，剩下的 infra 装配被下沉到 application 层内部。** 把 `LogSource` / store 的注入上提到 `app()`，问题 2 和 3 一起解决。

更深一层，四个机制共同导致了这些债：

1. **迁移是「加」不是「换」。** 项目走了 Tauri → localStorage → HTTP 三次迁移，每次「新增一条新路径，旧的留着」。删旧代码不是任何 feature 的目标。证据：`tauri-client.ts` 的 `localSearch` / `invokeCommand` / `sampleLogLines` 还在，`App.tsx` 的 `__TAURI__.dialog` 兜底还在，`app-state.ts` 的 demo 数据还在喂渲染。

2. **「按场景实现」的代价。** 以用户口头最小场景为准的工作模式换速度是划算的，但代价是领域概念没有家——投影逻辑被当成「组件上方的纯函数」写（局部合理），却从未被晋升成 `EffectiveRuleResolver` 模块，于是第二个投影需求（诊断）来了又复制一份。

3. **AI 增量 diff 的天性。** 每一步都是「最省事的正确」：`source: RipgrepLogSource`（零成本单元结构体）比 `Box<dyn LogSource>` + 注入省事；`main.rs` 是「只有一个文件时新东西都往里加」的默认归宿。每一步单独看都编译通过、测试通过、局部合理，架构在几十个这种 diff 里累积腐化。

4. **循环里没有架构关卡。** `cargo check` 不查分层（具体类型照样编译）；Node 的「契约检查」只断言子串存在；没有一道评审步骤说「这违反了依赖方向」。文档里写了依赖方向规则，但没有东西强制它。

**结论**：这些不是「写错了」的失误，而是「feature 优先、重构延后、无架构关卡」这套流程的确定性产物。看清它们需要跨 turn 的架构审计，而这一步在快速交付模式下被省略了。

---

## 建议落地顺序

按风险从低到高：

1. **#2 + #3（Rust 侧重构）**：port 注入 + `main.rs` 拆文件。自包含、有 `cargo test` 兜底，是三者里风险最低、收益最确定的一块。
2. **#1（前端）**：先抽 `EffectiveRuleResolver`（去重）+ 死代码清理（最不危险），再动 feature 级 state 拆分。

**防回归**（可选，随重构一起做）：把文档里的依赖方向变成一条可检查的规则，例如「application 层不得 import `infrastructure::` 具体类型」的 grep / CI 检查，替代靠自觉。
