Document ID: PLAN-SKELETON-CONTRACTS
Status: Draft
Approved by:
Approved at:
Depends on: PLAN-ROADMAP, ARCH-TECH-SELECTION, ARCH-TECHNICAL-ARCHITECTURE, ARCH-PACKAGE-STRUCTURE
Supersedes:

# 项目骨架与契约基线计划

> 因「Tauri → 本机 Web 服务」重构而修订（原版批准于 2026-07-07）。工程骨架改为 Cargo workspace（`crates/log-core` + `crates/server`）+ Vite 前端，移除 Tauri。

## PLAN-SKELETON-001 工程骨架

- 需求：REQ-WEB、REQ-OVERVIEW、REQ-SCOPE。
- 上下文与职责：全部上下文基础设施。
- ADR：ADR-009、ADR-002、ADR-008。
- 目标：建立 Cargo workspace（`crates/log-core` + `crates/server`）+ Vite 前端；server 能启动 axum 并返回健康状态。
- 依赖：无。
- 文件/模块：根 `Cargo.toml`、`crates/log-core/`、`crates/server/`、`package.json`、`vite.config.ts`；移除 `src-tauri/`。
- 步骤：
  1. 根 `Cargo.toml` 改为 `members = ["crates/log-core", "crates/server"]`。
  2. 创建 `crates/log-core`（lib，纯领域/应用/基础设施，无 axum 依赖）。
  3. 创建 `crates/server`（bin，axum + tokio + tower-http）。
  4. server 加 `/health` 端点返回版本。
  5. 移除 `src-tauri/` 与 `@tauri-apps/cli`，重新生成 `Cargo.lock`。
  6. 前端保留 Vite dev server（1420），server 开 CORS 允许该来源。
- 错误与回滚：初始化失败不保留半成品依赖配置；恢复到上一提交。
- 测试：`cargo build`、`cargo test`、`npm run dev` 可启动、`/health` 返回 200。
- 完成证据：`cargo run -p server` 能启动，浏览器访问 `http://127.0.0.1:<port>/health` 返回健康状态。

## PLAN-CONTRACT-001 Issue 契约

- 需求：REQ-ISSUES。
- 上下文与职责：RESP-ISSUE-HANDLE。
- ADR：ADR-002、ADR-006。
- 目标：定义 Rust `AppIssue/AppResult`、HTTP 错误响应 DTO 和 TypeScript issue 类型。
- 依赖：PLAN-SKELETON-001。
- 文件/模块：`crates/log-core/src/domain/issue/`、`crates/server/src/dto/issue_dto.rs`、`web/src/api/dto.ts`。
- 契约变化：category、level、sourceResponsibility、location、details、messageKey；cause 内部保留，不进 UI DTO。
- 步骤：
  1. 定义 Issue category 和 level 枚举。
  2. 定义 Rust 内部 Issue 与 HTTP DTO。
  3. 定义 TypeScript 对应类型。
  4. 定义 EXCEPTION 到 HTTP 错误响应的转换。
  5. 加 cause 不进 UI DTO 的测试。
- 测试：Rust 单元测试、TypeScript 类型测试、示例序列化快照。
- 完成证据：TIP/WARNING/EXCEPTION 三类样例能从 Rust 转成 TypeScript 可读 DTO。

## PLAN-CONTRACT-002 分析结果契约

- 需求：REQ-REQUEST、REQ-LATENCY、REQ-VIEW、REQ-LATENCY-EXPORT。
- 上下文与职责：CTX-LATENCY-ANALYSIS、RESP-ANALYSIS-ASSEMBLE、RESP-LATENCY-VIEW-PROJECT、RESP-LATENCY-EXPORT-PROJECT。
- ADR：ADR-006、ADR-007。
- 目标：定义 `LatencyAnalysisResult`、请求、命中、阶段、统计、ViewModel 和 CsvModel 的首批类型（经 HTTP DTO，而非 Tauri command）。
- 依赖：PLAN-CONTRACT-001。
- 文件/模块：`crates/server/src/dto/analysis_dto.rs`、`web/src/api/dto.ts`、`web/src/view-model/latency-view-model.ts`。
- 步骤：
  1. 按已批准契约定义 Rust DTO。
  2. 定义 TypeScript DTO 和 ViewModel。
  3. 写基线 JSON 样例。
  4. 写 Rust 序列化测试。
  5. 写 TypeScript 读取样例测试。
- 测试：契约快照测试、TypeScript 类型测试。
- 完成证据：基线结果 JSON 能被 TypeScript 读取并生成空白 ViewModel。

## PLAN-CONTRACT-003 基线样例接入

- 需求：BASELINE-PRIMARY、REQ-LATENCY-EXPORT。
- 上下文与职责：全部核心链路。
- ADR：ADR-006。
- 目标：把 `business-rules.example.toml` 和 `latency-analysis-export.example.csv` 纳入测试资源。
- 依赖：PLAN-CONTRACT-002。
- 文件/模块：`tests/fixtures/`、测试工具。
- 步骤：
  1. 建立测试资源目录。
  2. 复制或引用批准的 TOML 与 CSV 基线。
  3. 添加基线文件存在性和编码检查。
  4. 添加 CSV 表头和三段结构检查。
- 测试：Rust 集成测试。
- 完成证据：基线资源检查稳定通过。
