Document ID: ARCH-TECH-SELECTION
Status: Approved
Approved by: 用户
Approved at: 2026-08-25
Depends on: REQ-SCOPE, REQ-WEB, DOMAIN-MAP
Supersedes:

# 技术选型与 ADR

> 因「Tauri → 本机 Web 服务」「整体载入内存 → 流式读取」「搜索后台任务 → 快速单查询」重构而修订（原版批准于 2026-07-07）。ADR-001 废止，新增 ADR-009 / ADR-010。

## 量化约束

| 维度 | 约束 |
| --- | --- |
| 使用方式 | 本地工具，测试人员和开发人员在本机使用。 |
| 用户规模 | 单用户，无多用户协作。 |
| 数据规模 | 目标日志量五档：50KB / 5MB / 30MB / 500MB / 2GB。 |
| 延迟目标 | 快速单查询常用操作 P90 <= 1s；大文件扫描阈值由冒烟测定（不预设 5MB/30MB 加载门槛）。 |
| 内存目标 | 峰值内存 < 2GB；流式读取，内存随时间范围子集而非总日志量增长。 |
| 持久化 | 规则、上一版本规则备份、保存搜索条件、最近文件和 UI 偏好落盘；日志、搜索结果与分析结果不落盘。 |
| 部署 | 服务仅监听 `127.0.0.1`，不服务器化、不登录、不租户、不远程同步。 |
| 安全 | 不主动上传日志、规则或分析结果；不开放任意 shell 或远程 URL。 |
| 团队熟悉度 | Rust 对用户不熟悉，必须用职责说明和文档注释降低理解成本。 |

## ADR-001 桌面运行形态（已废止）

**原决策：采用 Tauri + React + TypeScript + Rust。** 已由 ADR-009 取代（2026-08-25）。Tauri 负责桌面窗口与本地文件能力的方案不再适用，因为重构目标是去掉桌面壳、改为本机 Web 服务。

## ADR-002 核心能力分层

**决策：核心分析能力放 Rust，页面交互放 TypeScript，HTTP handler 只做桥接。**

```text
React / TypeScript
  -> 页面状态
  -> 筛选条件
  -> 视图展示
  -> SVG 图形交互

axum HTTP handler
  -> 参数转换
  -> 调用 Rust application service
  -> 返回 DTO（JSON）

Rust（log-core）
  -> 流式日志读取（LogSource）
  -> 固定格式解析
  -> 快速单查询
  -> 规则 TOML 解析与校验
  -> 请求识别
  -> log_matcher 命中
  -> 阶段时延计算
  -> 统计聚合
  -> CSV 数据生成
```

HTTP handler 不写业务规则，不直接操作 UI 状态，不读取 TOML 以外的领域含义。

## ADR-003 本地持久化

**决策：第一版不引入数据库，使用本地文件存储配置。**

```text
app-data/
  rules/
    active.toml
    previous.toml
  saved-search-conditions.json
  preferences.json
  recent-files.json
```

不引入 SQLite、IndexedDB 或其他数据库。规则激活采用临时文件写入后原子替换。保存搜索条件、偏好和最近文件是小文件覆盖写，失败时保留旧文件。

## ADR-004 日志访问与搜索

**决策：所有日志访问收敛到一个 `LogSource` 端口，初始由 ripgrep 引擎实现；不建立内存索引或预解析数据集。**

搜索在筛选范围内按需流式扫描：关键字/短语搜索扫描字符串，正则搜索使用 Rust `regex`（`memchr` SIMD + 字面前缀提取加速），编译失败返回规则化错误，执行设置超时或步数限制。返回命中最多 1000 条 + `total_matches` + `truncated`。

拒绝 Elasticsearch、Tantivy、Lucene、SQLite FTS 以及自建内存索引。日志量虽可达 2GB，但每次查询按时间范围扫描即可满足延迟目标；将来若出现「反复查询同一批日志且需要索引加速」的真实场景，可在 `LogSource` 端口后替换为数据库实现，不牵动领域。

## ADR-005 查询执行方式

**决策：快速单查询，不引入后台任务、进度状态机、取消或任务 ID。**

搜索发起后同步执行，未出结果时前端显示加载态；完成后展示命中列表（≤1000，滚动）。不做进度条、取消按钮或分页。时延分析为一次显式触发的同步计算，结果不可变。

首批使用 `tokio` 提供异步运行时支撑 axum 服务，但不为单个查询建立后台任务队列。

## ADR-006 数据契约

**决策：Rust 输出 DTO，TypeScript 消费 DTO/ViewModel，CSV 使用独立 CsvModel。**

```text
Rust DTO（JSON，经 HTTP）
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

Rust（log-core）首批依赖：

- `serde` / `serde_json`
- `toml`
- `regex`
- `memchr`
- `grep` / `grep-regex` / `grep-searcher`（ripgrep 引擎库，实现 `LogSource`）
- `tokio`
- `thiserror`
- `csv`
- `tracing`

Rust（server）首批依赖：

- `axum`
- `tokio`
- `tower` / `tower-http`（含 CORS）
- `serde` / `serde_json`

TypeScript 首批依赖：

- `react`
- `typescript`
- `vite`
- `lucide-react`

轻量状态管理先使用 React state/context，复杂后再评估 Zustand。第一版不引入 ECharts、D3、数据库、搜索引擎、消息队列、工作流引擎、外部插件框架或桌面壳框架。

## ADR-009 本机 Web 服务运行形态

**决策：去除 Tauri 桌面壳，改为本机 Web 服务。前端为 Vite + React + TypeScript，后端为 axum（tokio），服务仅监听 `127.0.0.1`。**

| 选项 | 结论 | 原因 |
| --- | --- | --- |
| axum + tokio（本机 Web 服务）+ Vite 前端 | 采用 | 去掉桌面壳的打包/权限复杂度，浏览器提供成熟 UI 生态，本机回环监听无暴露风险。 |
| 保留 Tauri + 内嵌服务 | 拒绝 | 桌面壳带来打包与权限成本，且未给当前本地工具增加价值。 |
| 纯 Web 静态页 | 拒绝 | 仍需要本地进程做文件读取、解析与搜索，不能只靠浏览器。 |

开发期前端由 Vite dev server 提供（默认端口，如 1420），后端开启 CORS 允许该来源；生产期前端静态产物由后端或本地文件直接提供。

## ADR-010 统一日志访问端口

**决策：领域层定义 `LogSource` 端口，搜索、时延分析和后续「问题提示」都只依赖该端口；初始引擎为 ripgrep，可替换为数据库。**

端口由领域拥有、infrastructure 实现：

```text
LogSource
  - open(dir)              -> Workspace { file_list, summary }
  - scan(range)            -> 流式原始行迭代（固定缓冲区、跨块拼接、长行上限）
  - search(cond, range)    -> { hits≤1000, context, total_matches, truncated }
  - read_context(ref, n)   -> 某行引用前后 n 行
  - entries(range)         -> 流式解析后的结构化日志条目（供时延分析）
```

引擎藏在端口后，下游不触碰文件或具体引擎。避免为搜索、时延分析、「问题提示」各建一条日志读取路径。
