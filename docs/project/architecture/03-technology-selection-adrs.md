Document ID: ARCH-TECH-SELECTION
Status: Approved
Approved by: 用户
Approved at: 2026-07-07
Depends on: REQ-SCOPE, ARCH-LIFECYCLE-OVERVIEW, ARCH-EXTENSION-PATTERNS
Supersedes:

# 技术选型与 ADR

## 量化约束

| 维度 | 约束 |
| --- | --- |
| 使用方式 | 本地桌面工具，测试人员和开发人员在本机使用。 |
| 用户规模 | 用户数量少，无多用户协作。 |
| 数据规模 | 单次加载总日志量目标上限 30MB。 |
| 延迟目标 | 5MB 加载 P90 <= 1s；30MB 加载 P90 <= 5s；常用操作 P90 <= 1s。 |
| 内存目标 | 峰值内存 <= 2GB。 |
| 持久化 | 规则、上一版本规则备份、保存查询、最近文件和 UI 偏好落盘；日志索引和分析结果不落盘。 |
| 部署 | 不服务器化，不登录，不租户，不远程同步。 |
| 安全 | 不主动上传日志、规则或分析结果。 |
| 团队熟悉度 | Rust 对用户不熟悉，必须用职责说明和文档注释降低理解成本。 |

## ADR-001 桌面运行形态

**决策：采用 Tauri + React + TypeScript + Rust。**

Tauri 负责桌面窗口、本地文件能力、打包和前后端通信。React/TypeScript 负责页面交互和展示。Rust 负责文件、解析、索引、规则校验、时延分析和 CSV 生成。

| 选项 | 结论 | 原因 |
| --- | --- | --- |
| Tauri + React + TypeScript + Rust | 采用 | 本地能力完整，资源占用轻，Rust 适合性能敏感的数据处理。 |
| Electron + React + TypeScript | 拒绝 | 生态成熟但运行时偏重，首批本地工具没有必要承担更高资源成本。 |
| 纯 Web 本地页面 | 拒绝 | 本地文件访问、配置持久化、导出和后台任务体验受浏览器限制。 |

## ADR-002 核心能力分层

**决策：核心分析能力放 Rust，页面交互放 TypeScript，Tauri command 只做桥接。**

```text
React / TypeScript
  -> 页面状态
  -> 筛选条件
  -> 视图展示
  -> SVG 图形交互

Tauri command
  -> 参数转换
  -> 调用 Rust application service
  -> 返回 DTO

Rust
  -> 日志解析
  -> 多文件排序合并
  -> 内存索引
  -> 规则 TOML 解析与校验
  -> 请求识别
  -> log_matcher 命中
  -> 阶段时延计算
  -> 统计聚合
  -> CSV 数据生成
```

Tauri command 不写业务规则，不直接操作 UI 状态，不读取 TOML 以外的领域含义。

## ADR-003 本地持久化

**决策：第一版不引入数据库，使用本地文件存储配置。**

```text
app-data/
  rules/
    active.toml
    previous.toml
  saved-queries.json
  preferences.json
  recent-files.json
```

不引入 SQLite、IndexedDB 或其他数据库。规则激活采用临时文件写入后原子替换。保存查询、偏好和最近文件是小文件覆盖写，失败时保留旧文件。

## ADR-004 搜索实现

**决策：不引入外部搜索引擎，使用 Rust 内存索引和受控扫描。**

基础索引记录时间戳、应用、级别、原始行号和原始文本引用。关键字和短语搜索在筛选范围内扫描字符串。正则搜索使用 Rust `regex`，编译失败返回规则化错误，执行设置超时或步数限制。

拒绝 Elasticsearch、Tantivy、Lucene 类组件和 SQLite FTS。30MB 单机日志量不足以证明这些组件的复杂度。

## ADR-005 后台任务

**决策：使用 Tauri async command + Rust 受控后台任务，不引入任务队列。**

日志加载、规则校验、时延分析和 CSV 导出可以异步执行。同一时间只允许一个加载任务和一个分析任务。UI 通过任务 ID 接收进度，执行中禁用重复入口，失败时保留上一份成功状态。

首批使用 `tokio` 做异步调度，使用 Tauri 事件机制发送进度。

## ADR-006 数据契约

**决策：Rust 输出 DTO，TypeScript 消费 DTO/ViewModel，CSV 使用独立 CsvModel。**

```text
Rust DTO
  -> TypeScript DTO
  -> LatencyAnalysisViewModel
  -> React / SVG

Rust DTO
  -> LatencyAnalysisCsvModel
  -> CSV 文件
```

UI 不消费 Rust 内部领域对象。后续可以从 Rust DTO 自动生成 TypeScript 类型；第一版允许手写类型，但必须通过契约样例测试防止漂移。

## ADR-007 时延图形实现

**决策：第一版使用 React + SVG 自绘时延泳道图。**

SVG 只渲染 ViewModel 提供的坐标、颜色、文本和引用 ID，不承载业务规则。后续如需更换 Canvas、ECharts 或 HTML 时间轴，只替换渲染适配器和必要的布局构建器，不改时延分析核心。

## ADR-008 首批依赖

Rust 首批依赖：

- `tauri`
- `serde` / `serde_json`
- `toml`
- `regex`
- `tokio`
- `thiserror`
- `csv`
- `tracing`

TypeScript 首批依赖：

- `react`
- `typescript`
- `vite`
- `lucide-react`

轻量状态管理先使用 React state/context，复杂后再评估 Zustand。第一版不引入 ECharts、D3、数据库、搜索引擎、消息队列、工作流引擎、外部插件框架或服务器框架。
