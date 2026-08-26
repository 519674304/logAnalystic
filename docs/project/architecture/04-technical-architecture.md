Document ID: ARCH-TECHNICAL-ARCHITECTURE
Status: Approved
Approved by: 用户
Approved at: 2026-08-25
Depends on: ARCH-TECH-SELECTION, DOMAIN-MAP
Supersedes:

# 技术架构设计

> 因「Tauri → 本机 Web 服务」「整体载入内存 → 流式读取」重构而修订（原版批准于 2026-07-07）：运行组件、依赖方向、数据流和安全边界全部重写。

## 运行组件

```text
浏览器前端（Vite dev / 静态产物）
  -> axum HTTP 服务（127.0.0.1）
    -> HTTP handler（路由 + 参数转换 + DTO）
    -> Rust application services（log-core）
    -> Rust domain modules（log-core）
    -> LogSource 端口 <- ripgrep 引擎（infrastructure）
    -> 本地 app-data 文件
```

两个 Rust crate：`log-core`（领域 + 应用 + 基础设施 + `LogSource` 端口与 ripgrep 实现）与 `server`（axum HTTP 层 + DTO）。前端为 `web/`（Vite + React + TypeScript）。

## 依赖方向

```text
UI（web）
  -> HTTP DTO
  -> axum HTTP handler（server）
  -> application service（log-core）
  -> Domain model / domain service（log-core）
  -> LogSource 端口
  <- ripgrep 引擎实现（infrastructure）
```

规则：

- 领域模型不依赖 axum、React、文件系统或 UI 类型。
- HTTP handler 只依赖应用服务和 DTO，不写业务规则。
- Infrastructure 实现 `LogSource`、文件读写、配置目录、CSV 写出、日志记录等端口。
- UI 只消费 DTO 和 ViewModel，不读取存储记录，不重新计算业务结果。

## Rust 目录职责建议（log-core）

```text
crates/log-core/src/
  domain/
    log_workspace/
      port.rs          # LogSource 端口（trait）
      workspace.rs
      saved_search_conditions.rs
      data_quality.rs
    rule_config/
    latency_analysis/
    issue/
  application/
    log_workspace_service.rs
    rule_set_service.rs
    latency_analysis_service.rs
    export_service.rs
    issue_service.rs
  infrastructure/
    ripgrep_log_source.rs   # LogSource 的 ripgrep 实现
    file_storage/
    csv_writer/
    diagnostics/
```

命名跟职责文档对齐，避免用过于泛化的 `manager`、`helper`、`util` 承载核心逻辑。

## TypeScript 目录职责建议（web）

```text
web/src/
  app/
    App.tsx
    app-state.ts
  api/
    http-client.ts
    dto.ts
  features/
    log-search/
    rule-config/
    latency-analysis/
  components/
    layout/
    controls/
  view-model/
    latency-view-model.ts
    latency-layout-builder.ts
```

`view-model` 只负责展示结构和布局数据，不写请求识别、matcher 命中或时延计算。

## 主要数据流

### 日志工作区

```text
选择目录
  -> HTTP handler 校验目录
  -> LogWorkspaceService
  -> LogSource.open(dir) 扫描候选文件
  -> 返回 Workspace { file_list, summary, data_quality }
```

工作区只持有文件清单与摘要，不加载日志正文。

### 搜索

```text
搜索条件 + 时间范围
  -> HTTP handler 转 DTO
  -> LogWorkspaceService
  -> LogSource.search(cond, range)
  -> { hits≤1000, context, total_matches, truncated }
  -> 返回 SearchResult DTO
```

查看上下文时按行引用调用 `LogSource.read_context(ref, n)`。

### 规则激活

```text
导入或编辑 TOML
  -> RuleSetLoader
  -> RawRuleConfig
  -> RuleValidationChain
  -> RuleSetAssembler
  -> RuleSet
  -> 写 previous.toml
  -> 原子替换 active.toml
  -> 发布 ActiveRuleSet
```

校验失败时不覆盖当前规则和备份。

### 时延分析

```text
时间范围 + 场景
  -> LatencyAnalysisService 固化输入
  -> AnalysisScopeResolver
  -> ScenarioRuleResolver
  -> LogSource.entries(时间范围) 流式结构化日志
  -> RequestRecognizer
  -> RequestLogMatcher
  -> StageLatencyCalculator
  -> LatencyStatisticsAggregator
  -> LatencyAnalysisAssembler
  -> LatencyAnalysisResult
```

分析成功后原子替换当前结果。失败时上一份结果保持可用。

### 页面展示

```text
LatencyAnalysisResult
  -> LatencyAnalysisViewModel
  -> LatencyLayoutBuilder
  -> RequestList / LatencySwimlaneSvg / StatisticsPanel / RawLogPanel
```

SVG 渲染组件只消费布局后的展示数据，不知道业务规则含义。

### CSV 导出

```text
LatencyAnalysisResult
  -> LatencyAnalysisCsvModel
  -> csv writer
  -> UTF-8 BOM CSV 文件
```

CSV 不从页面表格反推，不读取 DOM，不重新计算时延。

## AppState

`AppState` 保存当前会话快照：

- 当前工作区（目录 + 文件清单 + 摘要）。
- 当前规则集快照。
- 当前分析结果。

`AppState` 必须通过应用服务受控修改，不允许 handler 或 UI 随意写内部字段。没有后台任务状态或进度状态机。

## 错误处理

```text
Rust domain/application
  -> AppIssue / AppResult
  -> HTTP 错误响应 DTO
  -> TypeScript issue model
  -> UI message projection
```

约束：

- Rust 内部保留 cause 和诊断日志。
- 传给 UI 的错误对象不包含堆栈。
- `TIP`、`WARNING`、`EXCEPTION` 等级保留。
- `EXCEPTION` 中断当前操作并保留上一份有效状态。
- UI 不拼接技术堆栈，不直接解释底层异常。

## 本地安全边界

- 服务仅监听 `127.0.0.1`，不暴露局域网或公网。
- 不接入网络 API，不上传日志、规则或分析结果。
- 不做登录、权限、租户。
- 仅开放读取指定日志目录、写入配置和导出 CSV；不开放任意 shell 执行或远程 URL 加载。
- 开发期 CORS 只允许 Vite dev 来源；生产期不开放任意跨域。
- 诊断日志不记录原始日志全文，只记录操作耗时、数量和错误分类。

## Rust 可读性约束

Rust 对当前用户不熟悉，因此 Rust 代码必须以职责和注释为主要理解入口。

每个 Rust 模块文件顶部必须说明：

- 模块负责什么。
- 模块不负责什么。
- 输入是什么。
- 输出是什么。
- 依赖谁。
- 主要失败情况是什么。

核心结构体必须写文档注释，说明业务含义、生命周期和关键不变量。核心函数必须写文档注释，说明调用时机、参数、返回值和失败策略。复杂流程必须有步骤注释。

第一版避免复杂宏、过度泛型、trait 套 trait 和为了 Rust 风格而增加的抽象。清晰、可读、可调试优先。
