Document ID: PLAN-ROADMAP
Status: Approved
Approved by: 用户
Approved at: 2026-07-07
Depends on: REQ-OVERVIEW, RESP-MAP, ARCH-TECH-SELECTION, ARCH-TECHNICAL-ARCHITECTURE, ARCH-PERFORMANCE-TESTING
Supersedes:

# 实施路线图

## 范围

本路线图覆盖首批本地日志分析软件实施计划。实施目标是完成两个核心能力：

1. 基础能力：固定格式日志导入、解析、搜索、上下文查看、保存查询。
2. 进阶能力：基于 TOML 规则识别请求、计算时延、展示单次请求泳道图、导出时延 CSV。

不包含服务器化、登录、多租户、外部插件框架、数据库、外部搜索引擎、消息队列和自动诊断知识库。

## 里程碑顺序

```text
M0 项目骨架与契约基线
  -> M1 Rust 日志工作区
  -> M2 Rust 规则配置
  -> M3 Rust 时延分析核心
  -> M4 应用服务、本地存储、任务与 Issue
  -> M5 前端主流程 UI
  -> M6 性能、冒烟、打包
```

## 复杂计划入口

| 计划 | 内容 |
| --- | --- |
| `01-project-skeleton-and-contracts-plan.md` | Tauri/React/Rust 工程骨架、DTO、Issue、基线契约。 |
| `02-rust-log-workspace-plan.md` | 日志读取、固定格式解析、多文件合并、内存索引、搜索与上下文。 |
| `03-rust-rule-configuration-plan.md` | TOML 规则加载、校验职责链、组装、激活、备份、导出。 |
| `04-rust-latency-analysis-plan.md` | 请求识别、matcher 命中、阶段时延、并行子进程组、统计、结果组装。 |
| `05-application-services-and-storage-plan.md` | AppState、Tauri command、异步任务、本地文件存储、CSV、Issue 处理。 |
| `06-frontend-ui-plan.md` | React 页面、搜索、规则、请求列表、SVG 时延泳道、日志钻取、导出交互。 |
| `07-testing-performance-packaging-plan.md` | 单元/集成/E2E、性能基准、Windows 打包、本地诊断。 |
| `99-final-audit.md` | 最终安全网审计、追踪矩阵、未解决项。 |

## 简单计划项

### PLAN-DOC-001 文档入口维护

- 需求：REQ-OVERVIEW。
- 职责：文档导航。
- ADR：无。
- 目标：保持 `docs/project/00-index.md` 阶段状态、文档目录和依赖关系准确。
- 依赖：每个阶段文档完成后执行。
- 变更：更新 `docs/project/00-index.md`。
- 测试：`rg` 检查阶段状态、文档路径和 Draft/Approved 状态。
- 完成证据：索引能指向所有计划文档，无失效路径。

## 集成顺序

1. 先建立契约和基线测试，保证后续模块输出有共同目标。
2. 先实现 Rust 核心数据处理，再接应用服务和 UI。
3. 每个 Rust 核心模块完成后都用基线 TOML 和日志样例做集成验证。
4. UI 只在 DTO 和 ViewModel 稳定后接入。
5. 性能基准贯穿后半段，不能等 UI 完成后才发现核心处理慢。

## 发布检查点

| 检查点 | 通过条件 |
| --- | --- |
| CP1 契约可运行 | DTO、Issue、CSV 基线可被测试读取和比对。 |
| CP2 日志可查询 | 50KB/5MB/30MB 日志能加载、合并、搜索和查看上下文；50KB 用于快速冒烟，5MB/30MB 用于性能门槛。 |
| CP3 规则可激活 | 基线 TOML 能校验、组装、激活、备份和导出。 |
| CP4 时延可生成 | 基线日志和规则生成请求、阶段时延、统计和 CSV 数据。 |
| CP5 页面可闭环 | 用户能完成导入、搜索、规则、分析、查看、导出主流程。 |
| CP6 性能可验收 | 需求定义的 P90 和内存目标有测试证据。 |

## 风险与前置验证

| 风险 | 处理 |
| --- | --- |
| Rust 对用户不熟悉 | 每个 Rust 模块必须有职责说明、文档注释和流程步骤注释。 |
| Tauri 环境依赖安装失败 | M0 做最小启动和打包验证。 |
| DTO 与 TypeScript 类型漂移 | 契约测试覆盖 Rust 输出样例和 TypeScript 消费样例。 |
| 正则搜索拖慢 UI | Rust 搜索实现加入超时或步数限制，并单独压测。 |
| SVG 时延图后续要替换 | UI 渲染只消费 ViewModel，SVG 不承载业务规则。 |
| GitHub push 网络不稳定 | 本地提交必须完成；push 失败时记录状态并后续重试。 |
