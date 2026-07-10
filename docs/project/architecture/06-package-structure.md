Document ID: ARCH-PACKAGE-STRUCTURE
Status: Approved
Approved by: 用户
Approved at: 2026-07-07
Depends on: ARCH-TECHNICAL-ARCHITECTURE, PLAN-SKELETON-CONTRACTS, PLAN-ROADMAP
Supersedes:

# 包结构设计

## 目标

本文件定义首批工程骨架的包结构。包结构必须服务于三个目标：

1. 让职责边界在目录名和文件名上直接可见。
2. 让 Rust 代码通过模块说明和文档注释就能理解大部分意图。
3. 保证 UI、Tauri command、应用服务、领域逻辑和基础设施适配器可替换、可测试、可独立演进。

本文件只定义结构和职责，不开始创建工程文件。

## 总体结构

```text
logAnalystic/
  docs/
    project/
  src/
    app/
    api/
    components/
    features/
    view-model/
    test-support/
  src-tauri/
    src/
      commands/
      application/
      domain/
      infrastructure/
      dto/
      test_support/
      lib.rs
      main.rs
    tests/
  tests/
    fixtures/
      logs/
      rules/
      expected/
```

职责边界：

- `src/`：前端页面、交互、ViewModel 和 Tauri API 客户端。
- `src-tauri/src/`：Rust command、应用服务、领域逻辑、基础设施适配器和 DTO。
- `tests/fixtures/`：跨 Rust 和 TypeScript 共享的批准样例和测试数据。
- `docs/project/`：需求、领域、架构、计划和已批准基线。

## Rust 包结构

```text
src-tauri/src/
  lib.rs
  main.rs
  commands/
    mod.rs
    health_commands.rs
    log_commands.rs
    rule_commands.rs
    analysis_commands.rs
    export_commands.rs
  application/
    mod.rs
    app_state.rs
    operation_context.rs
    progress.rs
    task_runner.rs
    log_workspace_service.rs
    rule_set_service.rs
    latency_analysis_service.rs
    export_service.rs
    issue_service.rs
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
      imported_log_batch.rs
      parsed_log_entry.rs
      parsed_log_dataset.rs
      log_parser.rs
      log_index.rs
      log_search.rs
      log_context.rs
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
  dto/
    mod.rs
    command_dto.rs
    issue_dto.rs
    log_dto.rs
    rule_dto.rs
    analysis_dto.rs
    export_dto.rs
  infrastructure/
    mod.rs
    file_storage/
      mod.rs
      app_data_dir.rs
      atomic_file_writer.rs
      rule_storage.rs
      saved_query_storage.rs
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

## Rust 依赖方向

```text
commands
  -> application
  -> domain
  -> dto

application
  -> domain
  -> dto
  -> infrastructure ports/adapters

domain
  -> no Tauri
  -> no UI
  -> no filesystem
  -> no command DTO

infrastructure
  -> domain contracts
  -> local filesystem / csv / tracing

dto
  -> domain value extraction only
```

约束：

- `domain` 不引用 `tauri`、React、文件系统路径、窗口、事件或 UI 类型。
- `commands` 不做日志解析、规则校验、请求识别、时延计算或 CSV 拼装。
- `application` 负责流程编排、状态替换、任务互斥、Issue 路由和恢复策略。
- `infrastructure` 只实现本地能力，不拥有业务规则。
- `dto` 是跨 Tauri 边界的数据契约，不暴露 Rust 内部领域对象。

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
- `atomic_file_writer`

禁止把核心逻辑放入：

- `manager`
- `helper`
- `util`
- `common`
- `misc`
- `processor`

如果确实需要共享工具，必须命名为具体职责，例如 `timestamp_parser`、`csv_escape`、`fixture_loader`。

## TypeScript 包结构

```text
src/
  app/
    App.tsx
    app-state.ts
    app-actions.ts
    issue-presenter.ts
  api/
    tauri-client.ts
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
      LogImportPanel.tsx
      SearchPanel.tsx
      SearchResultList.tsx
      LogContextPanel.tsx
      saved-query-model.ts
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
  -> no React component state
  -> no Tauri command call

components
  -> presentational props
  -> no Tauri command call

api
  -> Tauri invoke
  -> DTO only
```

约束：

- React 组件不直接调用多个 Tauri command 拼业务流程；复杂流程放在 feature action 或 app action。
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
    rules/
      business-rules.example.toml
    expected/
      latency-analysis-export.example.csv
      latency-analysis-result.example.json
```

测试数据规则：

- `smoke-50kb.log` 覆盖主流程、关键 matcher、阶段时延、并行子进程组和 CSV 导出。
- `performance-5mb.log` 用于常规性能门槛。
- `performance-30mb.log` 用于上限性能门槛。
- `expected` 目录只保存可稳定比较的输出，不保存运行时缓存。

## 文件放置决策

| 内容 | 放置位置 | 原因 |
| --- | --- | --- |
| Tauri command | `src-tauri/src/commands` | 桥接前后端，隔离 Tauri 类型。 |
| 应用状态和任务 | `src-tauri/src/application` | 控制生命周期、互斥、原子替换和恢复。 |
| 业务规则和分析算法 | `src-tauri/src/domain` | 保持与 UI、文件系统、Tauri 解耦。 |
| 本地文件和 CSV | `src-tauri/src/infrastructure` | 适配本地能力，可替换。 |
| 跨边界数据 | `src-tauri/src/dto` 和 `src/api/dto.ts` | 明确 Rust/TypeScript 契约。 |
| 页面展示结构 | `src/view-model` | 支持 UI 替换，不污染核心分析。 |
| 通用展示组件 | `src/components` | 只做可复用 UI，不承载业务流程。 |
| 功能页面 | `src/features` | 按用户工作流聚合交互。 |

## 分层边界检查清单

每次新增文件前检查：

- 这个文件的职责能否用一句话说明。
- 文件名是否能表达职责。
- 是否把业务算法放进了 command、UI 或 infrastructure。
- 是否把 UI 状态放进了 DTO。
- 是否把本地文件路径传进了 domain。
- 是否使用了 `manager/helper/util/common/misc` 等模糊命名。
- Rust 文件顶部是否有模块职责说明。
- 核心结构体和函数是否有文档注释。

## 与实施计划的关系

- PLAN-SKELETON-001 创建本结构的最小骨架。
- PLAN-CONTRACT-001 和 PLAN-CONTRACT-002 优先填充 `domain/issue`、`dto` 和 `api/dto.ts`。
- PLAN-RUST-LOG-WORKSPACE、PLAN-RUST-RULE-CONFIGURATION、PLAN-RUST-LATENCY-ANALYSIS 按领域目录逐步实现。
- PLAN-APPLICATION-SERVICES-STORAGE 填充 `application`、`commands` 和 `infrastructure`。
- PLAN-FRONTEND-UI 填充 `features`、`view-model` 和 `components`。
