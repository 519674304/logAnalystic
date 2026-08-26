Document ID: ARCH-PACKAGE-STRUCTURE
Status: Approved
Approved by: 用户
Approved at: 2026-08-25
Depends on: ARCH-TECHNICAL-ARCHITECTURE, ARCH-TECH-SELECTION
Supersedes:

# 包结构设计

## 目标

本文件定义重构后工程骨架的包结构。包结构必须服务于三个目标：

1. 让职责边界在目录名和文件名上直接可见。
2. 让 Rust 代码通过模块说明和文档注释就能理解大部分意图。
3. 保证 UI、HTTP 层、应用服务、领域逻辑和基础设施适配器可替换、可测试、可独立演进。

本文件只定义结构和职责，不开始创建工程文件。

## 总体结构

```text
logAnalystic/
  docs/
    project/
  crates/
    log-core/          # 领域 + 应用 + 基础设施 + LogSource 端口（纯 Rust，无 Web 依赖）
    server/            # axum HTTP 层：路由、handler、DTO、main.rs
  web/                 # Vite + React + TypeScript 前端
  tests/
    fixtures/
      logs/
      rules/
      expected/
```

职责边界：

- `crates/log-core/`：领域逻辑、应用服务、`LogSource` 端口与 ripgrep 实现、本地文件与 CSV。
- `crates/server/`：axum 路由、handler、DTO 序列化、CORS、应用状态装配。
- `web/`：前端页面、交互、ViewModel 和 HTTP 客户端。
- `tests/fixtures/`：跨 Rust 和 TypeScript 共享的批准样例和测试数据。
- `docs/project/`：需求、领域、架构、计划和已批准基线。

## log-core 包结构

```text
crates/log-core/src/
  lib.rs
  domain/
    mod.rs
    issue/
      mod.rs
      issue.rs
      issue_category.rs
      issue_level.rs
      severity_policy.rs
      category_handler_registry.rs
    log_workspace/
      mod.rs
      port.rs                    # LogSource trait（统一日志访问端口）
      workspace.rs
      saved_search_conditions.rs
      log_entry.rs
      log_parser.rs
      data_quality.rs
    rule_config/
      mod.rs
      raw_rule_config.rs
      rule_set.rs
      rule_set_loader.rs
      rule_set_validator.rs
      rule_set_assembler.rs
      rule_set_exporter.rs
      effective_rule_catalog.rs
      validation/
        mod.rs
        schema_version_validator.rs
        unique_id_validator.rs
        reference_validator.rs
        scenario_validator.rs
        matcher_validator.rs
        stage_validator.rs
        subprocess_group_validator.rs
    latency_analysis/
      mod.rs
      analysis_scope.rs
      effective_rule_resolver.rs
      recognized_request.rs
      request_recognizer.rs
      matcher_hit.rs
      matcher_strategy.rs
      request_log_matcher.rs
      stage_latency.rs
      stage_latency_calculator.rs
      subprocess_group_result.rs
      latency_statistics.rs
      latency_statistics_aggregator.rs
      latency_analysis_result.rs
      latency_analysis_assembler.rs
  application/
    mod.rs
    app_state.rs
    log_workspace_service.rs
    rule_set_service.rs
    latency_analysis_service.rs
    export_service.rs
    issue_service.rs
  infrastructure/
    mod.rs
    ripgrep_log_source.rs       # LogSource 的 ripgrep 实现（grep/grep-regex + regex + memchr）
    file_storage/
      mod.rs
      app_data_dir.rs
      atomic_file_writer.rs
      rule_storage.rs
      saved_search_conditions_storage.rs
      preferences_storage.rs
      recent_files_storage.rs
    csv_writer/
      mod.rs
      latency_csv_writer.rs
    diagnostics/
      mod.rs
      tracing_setup.rs
      operation_timer.rs
  test_support/
    mod.rs
    fixture_loader.rs
    sample_log_builder.rs
    sample_rule_builder.rs
```

## server 包结构

```text
crates/server/src/
  lib.rs
  main.rs
  http/
    mod.rs
    routes.rs
    handlers/
      mod.rs
      health.rs
      log_handlers.rs
      rule_handlers.rs
      analysis_handlers.rs
      export_handlers.rs
  dto/
    mod.rs
    issue_dto.rs
    log_dto.rs
    rule_dto.rs
    analysis_dto.rs
    export_dto.rs
  app_state.rs
  cors.rs
```

## Rust 依赖方向

```text
server（axum）
  -> log-core application
  -> dto

log-core application
  -> domain
  -> dto（可选，值提取）
  -> infrastructure ports/adapters

log-core domain
  -> 无 axum
  -> 无 UI
  -> 无文件系统
  -> 无 HTTP DTO

log-core infrastructure
  -> domain 契约（含 LogSource）
  -> 本地文件系统 / ripgrep 引擎 / csv / tracing
```

约束：

- `domain` 不引用 axum、React、文件系统路径、HTTP、窗口、事件或 UI 类型。
- `server` 不做日志解析、规则校验、请求识别、时延计算或 CSV 拼装。
- `application` 负责流程编排、状态替换、Issue 路由和恢复策略。
- `infrastructure` 只实现本地能力（含 `LogSource` 的 ripgrep 实现），不拥有业务规则。
- `dto` 是跨 HTTP 边界的数据契约，不暴露 Rust 内部领域对象。

## Rust 模块说明模板

每个 Rust 模块文件顶部必须包含职责说明。模板如下：

```rust
//! 模块职责：
//! - 负责：
//!   - ...
//! - 不负责：
//!   - ...
//! - 输入：
//!   - ...
//! - 输出：
//!   - ...
//! - 依赖：
//!   - ...
//! - 主要失败情况：
//!   - ...
```

核心结构体必须写文档注释：

```rust
/// 表示一次已经识别出来的请求。
///
/// 生命周期：
/// - 由 RequestRecognizer 根据全局开始日志创建。
/// - 创建后不可修改边界。
/// - 后续 matcher、stage 和统计都通过 system_request_id 关联它。
///
/// 不变量：
/// - system_request_id 不能为空。
/// - start_log_ref 必须存在。
/// - end_log_ref 可以为空，因为结束可能由下一次开始日志截断。
```

核心函数必须写文档注释：

```rust
/// 在单次请求范围内执行当前场景有效的 matcher。
///
/// 调用时机：
/// - RequestRecognizer 已经生成 RecognizedRequest 之后。
///
/// 失败策略：
/// - matcher 配置非法返回 AppIssue。
/// - 普通 matcher 未命中不会失败，只产生后续阶段缺失问题。
```

## Rust 命名规则

使用业务职责命名，避免泛化命名。

推荐：

- `request_recognizer`
- `stage_latency_calculator`
- `rule_set_validator`
- `latency_analysis_assembler`
- `ripgrep_log_source`

禁止把核心逻辑放入：

- `manager`
- `helper`
- `util`
- `common`
- `misc`
- `processor`

如果确实需要共享工具，必须命名为具体职责，例如 `timestamp_parser`、`csv_escape`、`fixture_loader`。

## TypeScript 包结构（web）

> **过渡说明**：本节描述 M5 目标结构（`web/src/` 细粒度组件）。当前实现仍位于 `src/`（Tauri 时代的整体面板布局：`src/features/log-search/LogSearchPanel.tsx`、`src/features/rule-config/RuleCatalogPanel.tsx`、`src/features/latency-analysis/LatencyAnalysisPanel.tsx`），并保留 `src/api/tauri-client.ts` 与 `src/api/local-rule-package.ts` 的 localStorage 兜底。M5 迁移前新增的前端代码按当前 `src/` 结构落地；迁移到本节结构作为 roadmap M5 待办。

```text
web/src/
  app/
    App.tsx
    app-state.ts
    app-actions.ts
    issue-presenter.ts
  api/
    http-client.ts
    dto.ts
    commands.ts
  components/
    layout/
      AppShell.tsx
      Toolbar.tsx
      Sidebar.tsx
    controls/
      IconButton.tsx
      SegmentedControl.tsx
      FieldFilter.tsx
      IssueList.tsx
  features/
    log-search/
      WorkspacePanel.tsx
      SearchPanel.tsx
      SearchResultList.tsx
      LogContextPanel.tsx
      saved-search-conditions-model.ts
    rule-config/
      RuleEditor.tsx
      RuleValidationPanel.tsx
      RuleActions.tsx
    latency-analysis/
      AnalysisToolbar.tsx
      RequestList.tsx
      StatisticsPanel.tsx
      RawLogPanel.tsx
      export-actions.ts
      swimlane/
        LatencySwimlaneSvg.tsx
        StageBlock.tsx
        RpcEdge.tsx
        StageTooltip.tsx
  view-model/
    latency-view-model.ts
    latency-layout-builder.ts
    request-list-view-model.ts
    csv-export-view-model.ts
  test-support/
    fixture-loader.ts
    dto-builders.ts
```

## TypeScript 依赖方向

```text
features
  -> api
  -> view-model
  -> components

view-model
  -> api dto
  -> 无 React 组件状态
  -> 无 HTTP 调用

components
  -> 展示型 props
  -> 无 HTTP 调用

api
  -> fetch / http-client
  -> DTO only
```

约束：

- React 组件不直接发起多个 HTTP 请求拼业务流程；复杂流程放在 feature action 或 app action。
- `view-model` 可以做展示排序、颜色、坐标、分组，不做请求识别、matcher 命中或时延计算。
- SVG 组件只渲染 `LatencyAnalysisViewModel`，不读取 TOML，不读取日志，不计算时延。
- `api/dto.ts` 只表达跨边界数据结构，不能放 UI 状态。

## 测试资源结构

```text
tests/
  fixtures/
    logs/
      smoke-50kb.log
      performance-5mb.log
      performance-30mb.log
      performance-500mb.log
      performance-2gb.log
    rules/
      business-rules.example.toml
    expected/
      latency-analysis-export.example.csv
      latency-analysis-result.example.json
```

测试数据规则：

- `smoke-50kb.log` 覆盖主流程、关键 matcher、阶段时延、并行子进程组和 CSV 导出。
- 五档规模（50KB/5MB/30MB/500MB/2GB）用于规模烟测，验证有界内存与不阻塞（见 REQ-WEB）。
- `expected` 目录只保存可稳定比较的输出，不保存运行时缓存。

## 文件放置决策

| 内容 | 放置位置 | 原因 |
| --- | --- | --- |
| axum 路由与 handler | `crates/server/src/http` | 桥接前后端，隔离 HTTP 类型。 |
| 应用状态 | `crates/log-core/src/application` | 控制生命周期、互斥、原子替换和恢复。 |
| 业务规则和分析算法 | `crates/log-core/src/domain` | 保持与 UI、文件系统、HTTP 解耦。 |
| `LogSource` 端口 | `crates/log-core/src/domain/log_workspace/port.rs` | 领域拥有、infrastructure 实现的统一日志访问契约。 |
| ripgrep 引擎与本地能力 | `crates/log-core/src/infrastructure` | 适配本地能力，可替换。 |
| 跨边界数据 | `crates/server/src/dto` 和 `web/src/api/dto.ts` | 明确 Rust/TypeScript 契约。 |
| 页面展示结构 | `web/src/view-model` | 支持 UI 替换，不污染核心分析。 |
| 通用展示组件 | `web/src/components` | 只做可复用 UI，不承载业务流程。 |
| 功能页面 | `web/src/features` | 按用户工作流聚合交互。 |

## 分层边界检查清单

每次新增文件前检查：

- 这个文件的职责能否用一句话说明。
- 文件名是否能表达职责。
- 是否把业务算法放进了 handler、UI 或 infrastructure。
- 是否把 UI 状态放进了 DTO。
- 是否把本地文件路径传进了 domain。
- 是否使用了 `manager/helper/util/common/misc` 等模糊命名。
- Rust 文件顶部是否有模块职责说明。
- 核心结构体和函数是否有文档注释。
