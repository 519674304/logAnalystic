Document ID: ARCH-TECHNICAL-ARCHITECTURE
Status: Approved
Approved by: 用户
Approved at: 2026-07-07
Depends on: ARCH-TECH-SELECTION, CONTRACT-LATENCY-ANALYSIS-RESULT
Supersedes:

# 技术架构设计

## 运行组件

```text
Desktop App
  -> React UI
  -> TypeScript application state
  -> Tauri command adapter
  -> Rust application services
  -> Rust domain modules
  -> Rust infrastructure adapters
  -> Local app-data files
```

## 依赖方向

```text
UI
  -> TypeScript application
  -> Tauri command DTO
  -> Rust application service
  -> Domain model / domain service
  -> Ports
  <- Infrastructure adapters
```

规则：

- 领域模型不依赖 Tauri、React、文件系统或 UI 类型。
- Tauri command 只依赖应用服务和 DTO。
- Infrastructure 实现文件读写、配置目录、CSV 写出、日志记录等端口。
- UI 只消费 DTO 和 ViewModel，不读取存储记录，不重新计算业务结果。

## Rust 目录职责建议

```text
src-tauri/src/
  commands/
    log_commands.rs
    rule_commands.rs
    analysis_commands.rs
    export_commands.rs
  application/
    log_workspace_service.rs
    rule_set_service.rs
    latency_analysis_service.rs
    export_service.rs
  domain/
    log_workspace/
    rule_config/
    latency_analysis/
    issue/
  infrastructure/
    file_storage/
    csv_writer/
    diagnostics/
  dto/
    command_dto.rs
    analysis_dto.rs
    issue_dto.rs
```

命名跟职责文档对齐，避免用过于泛化的 `manager`、`helper`、`util` 承载核心逻辑。

## TypeScript 目录职责建议

```text
src/
  app/
    App.tsx
    app-state.ts
  api/
    tauri-client.ts
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

### 日志加载

```text
选择文件
  -> Tauri command 校验路径和扩展名
  -> LogWorkspaceService
  -> 文件读取
  -> 固定格式解析
  -> 多文件按时间合并
  -> 建立 LogIndex
  -> 发布 ParsedLogDataset 快照
  -> 返回加载摘要和数据质量列表
```

加载失败时不替换上一份成功数据集。

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

- 当前日志数据集。
- 当前规则集。
- 当前分析结果。
- 正在执行的任务状态。
- 最近一次操作 Issue。

`AppState` 必须通过应用服务受控修改，不允许 command 或 UI 随意写内部字段。

## 错误处理

```text
Rust domain/application
  -> AppIssue / AppResult
  -> Tauri CommandErrorDto
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

- 不接入网络 API。
- 不上传日志、规则或分析结果。
- 不做登录、权限、租户。
- Tauri 权限最小化，只开放文件选择、读取指定日志文件、写入配置和导出 CSV。
- 不开放任意 shell 执行。
- 不开放远程 URL 加载。
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
