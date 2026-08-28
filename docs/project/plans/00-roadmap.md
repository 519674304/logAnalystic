Document ID: PLAN-ROADMAP
Status: Approved
Approved by: 用户
Approved at: 2026-08-25
Depends on: REQ-OVERVIEW, RESP-MAP, DOMAIN-MAP, ARCH-TECH-SELECTION, ARCH-TECHNICAL-ARCHITECTURE, ARCH-PACKAGE-STRUCTURE
Supersedes:

# 实施路线图

> 因「Tauri → 本机 Web 服务」「整体载入内存 → 流式读取」「搜索后台任务 → 快速单查询」重构而修订（原版批准于 2026-07-07）。里程碑与计划入口全部按新架构重写，并补充关键路径评审、文件级实施清单、冒烟验收与仓库边界。

## 范围

本路线图覆盖本地日志分析软件实施计划。实施目标是完成两个核心能力：

1. 基础能力：目录工作区、流式读取、固定格式解析、快速单查询、上下文查看、保存搜索条件。
2. 进阶能力：基于 TOML 规则识别请求、计算时延、展示单次请求泳道图、导出时延 CSV。

运行形态为本机 Web 服务（axum + Vite），日志访问统一经 `LogSource` 端口（初始 ripgrep）。不包含服务器化、登录、多租户、外部插件框架、数据库、外部搜索引擎、消息队列和自动诊断知识库。

## 里程碑顺序

```text
M0 工程骨架与契约基线（Cargo workspace + web + DTO + 基线样例）
  -> M1 Rust 日志工作区（LogSource 端口 + ripgrep 流式 + 固定格式解析 + 快速单查询）
  -> M2 Rust 规则配置（TOML 加载/校验/组装/激活/备份/导出）
  -> M3 Rust 时延分析核心（请求识别/matcher/阶段时延/并行子进程/统计/组装）
  -> M4 本机 Web 服务与应用服务（axum 路由/handler/DTO/CORS + AppState + 存储 + CSV + Issue）
  -> M5 前端主流程 UI（搜索/规则/请求列表/SVG 泳道/钻取/导出）
  -> M6 性能、冒烟、打包（五档规模烟测 + 有界内存 + 打包）
```

## 复杂计划入口

| 计划 | 内容 |
| --- | --- |
| `01-project-skeleton-and-contracts-plan.md` | Cargo workspace（log-core + server）、Vite web、DTO、Issue、基线契约。 |
| `02-rust-log-workspace-plan.md` | `LogSource` 端口、ripgrep 流式读取、固定格式解析、快速单查询、上下文。 |
| `03-rust-rule-configuration-plan.md` | TOML 规则加载、校验职责链、组装、激活、备份、导出。 |
| `04-rust-latency-analysis-plan.md` | 请求识别、matcher 命中、阶段时延、跨子进程并行、统计、结果组装。 |
| `05-application-services-and-storage-plan.md` | AppState、axum handler、本地文件存储、CSV、Issue 处理。 |
| `06-frontend-ui-plan.md` | React 页面、搜索、规则、请求列表、SVG 时延泳道、日志钻取、导出交互。 |
| `07-testing-performance-packaging-plan.md` | 单元/集成/E2E、五档规模烟测、Windows 打包、本地诊断。 |
| `99-final-audit.md` | 最终安全网审计、追踪矩阵、未解决项。 |

## 集成顺序

1. 先建立契约和基线测试，保证后续模块输出有共同目标。
2. 先实现 log-core 的日志工作区（`LogSource` 端口 + ripgrep 引擎），再接 server 和 UI。
3. 每个 Rust 核心模块完成后都用基线 TOML 和日志样例做集成验证。
4. UI 只在 DTO 和 ViewModel 稳定后接入。
5. 规模烟测贯穿后半段，不能等 UI 完成后才发现流式读取或内存不达标。

## 发布检查点

| 检查点 | 通过条件 |
| --- | --- |
| CP1 契约可运行 | DTO、Issue、CSV 基线可被测试读取和比对。 |
| CP2 日志可查询 | 打开目录、流式读取、快速单查询、查看上下文在五档日志上可用；50KB 快速冒烟，5MB/30MB/500MB/2GB 用于规模与内存烟测。 |
| CP3 规则可激活 | 基线 TOML 能校验、组装、激活、备份和导出。 |
| CP4 时延可生成 | 基线日志和规则经 `LogSource.entries(时间范围)` 生成请求、阶段时延、统计和 CSV 数据。 |
| CP5 页面可闭环 | 用户能完成打开目录、搜索、规则、分析、查看、导出主流程。 |
| CP6 性能可验收 | 五档规模烟测证明峰值内存 < 2GB 且不整体载入阻塞。 |

## 关键路径与 token 投入评审

按对主流程的决定性程度排序：

| 步骤 | 难度/不确定性 | 相对投入 | 是否值得 | 说明 |
| --- | --- | --- | --- | --- |
| `LogSource` 端口 + ripgrep 流式引擎（跨块拼接、长行上限、有界内存） | 高 | 高 | 值得 | 整个重构的根基；搜索和时延分析都依赖它，做对则后续两个下游都稳。 |
| 快速单查询（关键字/短语/正则 + ≤1000 + truncated + total_matches） | 中 | 中 | 值得 | 主流程核心输出；正则超时与步数限制是唯一复杂点。 |
| 固定格式解析（LogEntry + 数据质量） | 低 | 低 | 值得 | 已有基线 TOML 和日志样例，规则清晰。 |
| 请求识别 + matcher + 阶段时延 + 并行子进程 | 高 | 高 | 值得 | 核心域，但逻辑与重构无关，可复用原设计（仅输入源改为 `LogSource.entries`）。 |
| axum server（路由/handler/DTO/CORS） | 低 | 低 | 值得 | 机械桥接，风险低。 |
| Vite 前端 + HTTP 客户端 | 中 | 中 | 值得 | 交互重写为快速单查询 + 加载态 + 截断滚动。 |
| 规则配置（TOML 校验链） | 中 | 中 | 值得 | 与重构无关，可复用原设计。 |
| CSV 导出 | 低 | 低 | 值得 | 已有基线。 |

**明确不投入：**

- 数据库 / 索引引擎（ripgrep 已满足；仅在出现真实反复查询加速需求时再换）。
- 后台任务、进度状态机、取消、分页、任务 ID（已被快速单查询取代）。
- P90 加载门槛调优（个人快速路径不投入边界性能，只做五档规模烟测）。
- 问题提示（首批不实现，仅作为 `LogSource` 后续下游保留）。

## 文件级实施清单（本重构）

以下为重构关键文件，映射到里程碑：

- `crates/log-core/src/domain/log_workspace/port.rs` — `LogSource` trait（open/scan/search/read_context/entries）。
- `crates/log-core/src/domain/log_workspace/workspace.rs` — `Workspace` 聚合（file_list + summary）。
- `crates/log-core/src/domain/log_workspace/log_parser.rs` — 固定格式解析。
- `crates/log-core/src/domain/log_workspace/saved_search_conditions.rs` — 保存搜索条件聚合。
- `crates/log-core/src/infrastructure/ripgrep_log_source.rs` — `LogSource` 的 ripgrep 实现（grep/grep-regex + regex + memchr，跨块拼接 + 长行上限）。
- `crates/log-core/src/application/log_workspace_service.rs` — 编排 open/search/read_context。
- `crates/server/src/http/handlers/log_handlers.rs` — 搜索与上下文 HTTP 端点。
- `crates/server/src/cors.rs` — 开发期 Vite 来源 CORS。
- `web/src/api/http-client.ts` + `web/src/features/log-search/` — 快速单查询 + 加载态 + 截断滚动 UI。
- `tests/fixtures/logs/` — 五档日志样例（50KB/5MB/30MB/500MB/2GB）。

## 冒烟验收

见 `docs/project/requirements/99-issue-table.md` 与 `docs/project/smoke/README.md`。核心冒烟点：

- 打开目录 → 显示文件清单与摘要（不整体载入）。
- 快速单查询 → 未出结果显示加载态；命中 ≤1000 滚动展示，超限返回 `truncated` + `total_matches`。
- 查看上下文 → 前后 n 行正确拼接跨块边界。
- 时延分析 → 在指定时间范围经 `LogSource.entries` 生成请求/阶段/统计/CSV。
- 规模烟测 → 五档日志峰值内存 < 2GB，不阻塞。

## 仓库边界

- **纳入版本控制**：源代码、`Cargo.toml` / `Cargo.lock`、`web/package.json` + 锁文件、`docs/project/`、`tests/fixtures/`、`.gitignore`、`.gitattributes`。
- **不纳入版本控制**：`target/`、`node_modules/`、`dist/`、`app-data/`（运行时配置）、`*.log`、本地环境与凭据文件。
- 锁文件（`Cargo.lock`、package lock）为可复现性输入，纳入跟踪；`app-data/` 属本地运行时状态，保持 untracked。
- 实施前核对 `.gitignore` 与 `.gitattributes`（已存在 `.gitattributes`），分阶段提交，禁止整仓 `git add -A`。

## 风险与前置验证

| 风险 | 处理 |
| --- | --- |
| Rust 对用户不熟悉 | 每个 Rust 模块必须有职责说明、文档注释和流程步骤注释。 |
| ripgrep 引擎库 API 学习成本 | M0 做最小可运行搜索探针，验证 grep/grep-regex 用法后再展开。 |
| 跨块拼接与长行边界 | 用含跨块与超长行的夹具做单测，先于规模烟测。 |
| 正则搜索拖慢 UI | Rust 搜索实现加入超时或步数限制，并单独压测。 |
| DTO 与 TypeScript 类型漂移 | 契约测试覆盖 Rust 输出样例和 TypeScript 消费样例。 |
| 本机服务暴露风险 | 服务仅监听 `127.0.0.1`；CORS 只允许 Vite dev 来源。 |
| SVG 时延图后续要替换 | UI 渲染只消费 ViewModel，SVG 不承载业务规则。 |
