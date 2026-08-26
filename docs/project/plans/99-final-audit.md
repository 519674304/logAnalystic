Document ID: PLAN-FINAL-AUDIT
Status: Approved
Approved by: 用户
Approved at: 2026-08-25
Depends on: PLAN-ROADMAP, DOMAIN-MAP, RESP-MAP, ARCH-TECH-SELECTION, ARCH-TECHNICAL-ARCHITECTURE
Supersedes:

# 最终安全网审计

> 因「Tauri → 本机 Web 服务」「整体载入内存 → 流式读取」重构而修订（原版批准于 2026-07-07）。追踪矩阵与职责 ID 已按新架构更新；详细计划 ID 留待 writing-plans 阶段生成。

## Whole

- 项目目标仍是本地日志分析工具，优先完成日志搜索和时延分析。
- 用户仍是本机测试人员和开发人员，单用户。
- 首批仍不包含服务器化、登录、多租户、外部插件、数据库或搜索引擎。
- 运行形态为本机 Web 服务（axum + Vite），日志访问统一经 `LogSource` 端口（ripgrep）。
- 实施路线按契约、log-core 核心、server、UI、验收推进。

## Parts

| 复杂能力 | 计划 |
| --- | --- |
| 工程骨架与契约 | PLAN-SKELETON-CONTRACTS |
| 日志工作区（LogSource + ripgrep 流式） | PLAN-RUST-LOG-WORKSPACE |
| 规则配置 | PLAN-RUST-RULE-CONFIGURATION |
| 时延分析核心 | PLAN-RUST-LATENCY-ANALYSIS |
| 本机 Web 服务与应用服务 | PLAN-APPLICATION-SERVICES-STORAGE |
| 前端主流程 UI | PLAN-FRONTEND-UI |
| 测试、性能、打包 | PLAN-TESTING-PERFORMANCE-PACKAGING |

## Cross-Boundary Flows

| 流程 | 状态 |
| --- | --- |
| 目录 -> 工作区 -> LogSource -> 搜索 -> 上下文 | 已覆盖 PLAN-RUST-LOG-WORKSPACE 和 PLAN-FRONTEND-UI。 |
| TOML -> 校验 -> RuleSet -> ActiveRuleSet | 已覆盖 PLAN-RUST-RULE-CONFIGURATION 和 PLAN-APPLICATION-SERVICES-STORAGE。 |
| LogSource.entries(时间范围) + 规则 -> 请求 -> matcher -> stage -> 统计 -> 结果 | 已覆盖 PLAN-RUST-LATENCY-ANALYSIS。 |
| 结果 -> ViewModel -> SVG/请求列表/日志钻取 | 已覆盖 PLAN-FRONTEND-UI。 |
| 结果 -> CsvModel -> UTF-8 BOM CSV | 已覆盖 PLAN-APPLICATION-SERVICES-STORAGE。 |
| Issue -> HTTP 错误响应 -> UI 提示 | 已覆盖 PLAN-SKELETON-CONTRACTS 和 PLAN-APPLICATION-SERVICES-STORAGE。 |

## Exceptions and Recovery

| 情况 | 处理 |
| --- | --- |
| 校验失败 | 结构化 Issue；EXCEPTION 阻断当前操作；保留上一有效状态。 |
| 部分成功 | 行级解析失败进入数据质量列表；单文件不可读跳过该文件并报告原因。 |
| 重复输入 | 快速单查询同步执行，无重复提交状态机。 |
| 超时 | 正则搜索超时中止查询，不展示不完整结果。 |
| 取消 | 第一版不支持取消；查询同步执行，未出结果时显示加载态。 |
| 重试耗尽 | 第一版无自动重试，用户修正输入后手动重跑。 |
| 依赖不可用 | 无外部服务依赖；本地文件失败进入 Issue。 |
| 数据损坏 | 配置读取失败按 Issue 提示，尽量使用默认配置启动。 |
| 降级模式 | 规则/日志/分析失败保留上一份有效状态。 |
| 回滚或补偿 | 规则采用成功后原子替换；失败不覆盖。 |
| 重启恢复 | 只恢复规则、保存搜索条件、最近文件、偏好；分析结果重新生成。 |

## Extension Safety

- 外部插件框架第一版不做。
- 拦截器只在应用边界处理上下文、计时、异常转换和恢复。
- 监听器只处理进度，失败不影响主流程（快速单查询场景无需进度监听）。
- 工厂模式不引入。
- 策略只用于内置 matcher。
- 状态模式不引入，使用明确状态字段。
- 引擎可替换点收敛在 `LogSource` 端口：ripgrep 现为唯一实现，将来可在端口后替换为数据库实现而不牵动领域。

## Traceability Matrix

| Requirement | Context | Responsibility | ADR | Plan |
| --- | --- | --- | --- | --- |
| REQ-INGEST | CTX-LOG-WORKSPACE | RESP-LOG-OPEN / STREAM / PARSE / QUALITY | ADR-004 / ADR-010 | PLAN-RUST-LOG-WORKSPACE |
| REQ-SEARCH | CTX-LOG-WORKSPACE | RESP-LOG-SEARCH / RESP-SAVE-SEARCH-CONDITIONS | ADR-004 / ADR-010 | PLAN-RUST-LOG-WORKSPACE / PLAN-FRONTEND-UI |
| REQ-WEB | 应用层本机 Web API | HTTP handler / AppState | ADR-009 / ADR-010 | PLAN-APPLICATION-SERVICES-STORAGE / PLAN-SKELETON-CONTRACTS |
| REQ-RULESET | CTX-RULE-CONFIG | RESP-RULE-* | ADR-003 | PLAN-RUST-RULE-CONFIGURATION / PLAN-FRONTEND-UI |
| REQ-REQUEST | CTX-LATENCY-ANALYSIS | RESP-REQUEST-RECOGNIZE | ADR-002 / ADR-010 | PLAN-RUST-LATENCY-ANALYSIS |
| REQ-LATENCY | CTX-LATENCY-ANALYSIS | RESP-SCENARIO-RESOLVE / LOG-MATCH / STAGE-CALCULATE / STATISTICS / COORDINATE | ADR-002 / ADR-006 / ADR-010 | PLAN-RUST-LATENCY-ANALYSIS |
| REQ-VIEW | CTX-LATENCY-ANALYSIS | RESP-REQUEST-LIST-PROJECT / LATENCY-VIEW-PROJECT / UI-RENDER | ADR-006 / ADR-007 | PLAN-FRONTEND-UI |
| REQ-LATENCY-EXPORT | CTX-LATENCY-ANALYSIS | RESP-LATENCY-EXPORT-PROJECT / CSV-WRITE | ADR-006 | PLAN-APPLICATION-SERVICES-STORAGE / PLAN-FRONTEND-UI |
| REQ-ISSUES | 全部上下文 | RESP-ISSUE-HANDLE | ADR-002 | PLAN-SKELETON-CONTRACTS / PLAN-APPLICATION-SERVICES-STORAGE |
| REQ-SCOPE | 全部上下文 | 全部主流程 | ADR-003 / ADR-005 / ADR-009 | PLAN-ROADMAP / PLAN-TESTING-PERFORMANCE-PACKAGING |

## Unresolved Items

当前没有阻塞实施计划的业务决策。具体测试命令、依赖版本和项目初始化命令留到实施阶段按当时工具链确定，但不得改变已批准架构边界（本机 Web 服务、`LogSource` 统一端口、ripgrep 初始引擎、有界内存、快速单查询）。

详细计划文档（PLAN-SKELETON-CONTRACTS、PLAN-RUST-LOG-WORKSPACE 等）在实施阶段由 writing-plans 按本路线图与领域/职责/架构文档重新生成；旧的 Tauri / 内存索引 / 后台任务语义不再作为实现依据。

## Final Decision

实施计划满足：

- 每个需求有计划和测试路径。
- 每个计划有需求来源。
- 依赖顺序可执行。
- 复杂职责均已拆独立计划。
- 规模与内存目标有基准任务（五档烟测）。
- 失败恢复、配置损坏、正则超时和状态保留均有处理路径。
