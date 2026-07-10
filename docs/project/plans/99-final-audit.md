Document ID: PLAN-FINAL-AUDIT
Status: Approved
Approved by: 用户
Approved at: 2026-07-07
Depends on: PLAN-ROADMAP, PLAN-SKELETON-CONTRACTS, PLAN-RUST-LOG-WORKSPACE, PLAN-RUST-RULE-CONFIGURATION, PLAN-RUST-LATENCY-ANALYSIS, PLAN-APPLICATION-SERVICES-STORAGE, PLAN-FRONTEND-UI, PLAN-TESTING-PERFORMANCE-PACKAGING
Supersedes:

# 最终安全网审计

## Whole

- 项目目标仍是本地日志分析工具，优先完成日志搜索和时延分析。
- 用户仍是本机测试人员和开发人员。
- 首批仍不包含服务器化、登录、多租户、外部插件、数据库或搜索引擎。
- 实施路线按契约、Rust 核心、应用服务、UI、验收推进。

## Parts

| 复杂能力 | 独立计划 |
| --- | --- |
| 工程骨架与契约 | PLAN-SKELETON-CONTRACTS |
| 日志工作区 | PLAN-RUST-LOG-WORKSPACE |
| 规则配置 | PLAN-RUST-RULE-CONFIGURATION |
| 时延分析核心 | PLAN-RUST-LATENCY-ANALYSIS |
| 应用服务与存储 | PLAN-APPLICATION-SERVICES-STORAGE |
| 前端主流程 UI | PLAN-FRONTEND-UI |
| 测试、性能、打包 | PLAN-TESTING-PERFORMANCE-PACKAGING |

## Cross-Boundary Flows

| 流程 | 状态 |
| --- | --- |
| 日志导入 -> 数据集 -> 搜索 -> 上下文 | 已覆盖 PLAN-RUST-LOG-WORKSPACE 和 PLAN-FRONTEND-UI。 |
| TOML -> 校验 -> RuleSet -> ActiveRuleSet | 已覆盖 PLAN-RUST-RULE-CONFIGURATION 和 PLAN-APPLICATION-SERVICES-STORAGE。 |
| 数据集 + 规则 -> 请求 -> matcher -> stage -> 统计 -> 结果 | 已覆盖 PLAN-RUST-LATENCY-ANALYSIS。 |
| 结果 -> ViewModel -> SVG/请求列表/日志钻取 | 已覆盖 PLAN-FRONTEND-UI。 |
| 结果 -> CsvModel -> UTF-8 BOM CSV | 已覆盖 PLAN-APP-004 和 PLAN-UI-006。 |
| Issue -> command DTO -> UI 提示 | 已覆盖 PLAN-CONTRACT-001 和 PLAN-APP-005。 |

## Exceptions and Recovery

| 情况 | 处理 |
| --- | --- |
| 验证失败 | 结构化 Issue；EXCEPTION 阻断当前操作；保留上一有效状态。 |
| 部分成功 | 行级解析失败进入数据质量列表；文件级失败整批失败。 |
| 重复输入 | 同类任务执行中拒绝重复提交。 |
| 超时 | 正则搜索超时中止查询，不展示不完整结果。 |
| 取消 | 第一版不支持取消，执行中禁用重复入口。 |
| 重试耗尽 | 第一版无自动重试，用户修正输入后手动重跑。 |
| 依赖不可用 | 无外部服务依赖；本地文件失败进入 Issue。 |
| 数据损坏 | 配置读取失败按 Issue 提示，尽量使用默认配置启动。 |
| 降级模式 | 规则/日志/分析失败保留上一份有效状态。 |
| 回滚或补偿 | 规则和数据集采用成功后原子替换；失败不覆盖。 |
| 重启恢复 | 只恢复规则、保存查询、最近文件、偏好；分析结果重新生成。 |

## Extension Safety

- 外部插件框架第一版不做。
- 拦截器只在应用边界处理上下文、计时、异常转换和恢复。
- 监听器只处理进度，失败不影响主流程。
- 工厂模式不引入。
- 策略只用于内置 matcher。
- 状态模式不引入，使用明确状态字段。

## Traceability Matrix

| Requirement | Context | Responsibility | ADR | Plan | Test |
| --- | --- | --- | --- | --- | --- |
| REQ-INGEST | CTX-LOG-WORKSPACE | RESP-LOG-LOAD / PARSE / DATASET / QUALITY | ADR-002 / ADR-004 | PLAN-RUST-LOG-WORKSPACE | PLAN-TEST-001 / PLAN-PERF-001 |
| REQ-SEARCH | CTX-LOG-WORKSPACE | RESP-LOG-SEARCH / LOG-DRILLDOWN | ADR-004 | PLAN-RUST-LOG-WORKSPACE / PLAN-FRONTEND-UI | PLAN-TEST-001 / PLAN-TEST-002 |
| REQ-SAVED-QUERY | CTX-LOG-WORKSPACE | RESP-SAVED-QUERY | ADR-003 | PLAN-APPLICATION-SERVICES-STORAGE / PLAN-FRONTEND-UI | PLAN-TEST-002 / PLAN-TEST-003 |
| REQ-RULESET | CTX-RULE-CONFIG | RESP-RULE-* | ADR-003 / ARCH-EXTENSION-PATTERNS | PLAN-RUST-RULE-CONFIGURATION / PLAN-FRONTEND-UI | PLAN-TEST-001 / PLAN-TEST-003 |
| REQ-REQUEST | CTX-LATENCY-ANALYSIS | RESP-REQUEST-RECOGNIZE | ADR-002 | PLAN-RUST-LATENCY-ANALYSIS | PLAN-TEST-001 / PLAN-TEST-003 |
| REQ-LATENCY | CTX-LATENCY-ANALYSIS | RESP-SCENARIO-RESOLVE / LOG-MATCH / STAGE-CALCULATE / STATISTICS / COORDINATE | ADR-002 / ADR-006 | PLAN-RUST-LATENCY-ANALYSIS | PLAN-TEST-001 / PLAN-PERF-001 |
| REQ-VIEW | CTX-LATENCY-ANALYSIS | RESP-REQUEST-LIST-PROJECT / LATENCY-VIEW-PROJECT / UI-RENDER | ADR-006 / ADR-007 | PLAN-FRONTEND-UI | PLAN-TEST-002 / PLAN-TEST-003 |
| REQ-LATENCY-EXPORT | CTX-LATENCY-ANALYSIS | RESP-LATENCY-EXPORT-PROJECT / CSV-WRITE | ADR-006 | PLAN-APPLICATION-SERVICES-STORAGE / PLAN-FRONTEND-UI | PLAN-TEST-001 / PLAN-TEST-003 |
| REQ-ISSUES | 全部上下文 | RESP-ISSUE-HANDLE | ARCH-EXTENSION-PATTERNS | PLAN-SKELETON-CONTRACTS / PLAN-APPLICATION-SERVICES-STORAGE | PLAN-TEST-001 / PLAN-TEST-002 |
| REQ-SCOPE | 全部上下文 | 全部主流程 | ADR-001 / ADR-003 / ADR-005 / ADR-008 | PLAN-ROADMAP / PLAN-TESTING-PERFORMANCE-PACKAGING | PLAN-PERF-001 / PLAN-PACKAGE-001 |

## Unresolved Items

当前没有阻塞实施计划的业务决策。具体测试命令、Tauri 版本和项目初始化命令留到实施阶段按当时工具链确定，但不得改变已批准架构边界。

## Final Decision

实施计划满足：

- 每个需求有计划和测试路径。
- 每个计划有需求来源。
- 依赖顺序可执行。
- 复杂职责均已拆独立计划。
- 性能目标有基准任务。
- 失败恢复、配置损坏、正则超时和状态保留均有处理路径。
