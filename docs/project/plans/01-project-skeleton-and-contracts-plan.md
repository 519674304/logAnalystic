Document ID: PLAN-SKELETON-CONTRACTS
Status: Approved
Approved by: 用户
Approved at: 2026-07-07
Depends on: PLAN-ROADMAP, ARCH-TECH-SELECTION, ARCH-TECHNICAL-ARCHITECTURE, CONTRACT-LATENCY-ANALYSIS-RESULT
Supersedes:

# 项目骨架与契约基线计划

## PLAN-SKELETON-001 工程骨架

- 需求：REQ-OVERVIEW、REQ-SCOPE。
- 上下文与职责：全部上下文基础设施。
- ADR：ADR-001、ADR-002、ADR-008。
- 目标：建立 Tauri + React + TypeScript + Rust 工程，能启动桌面窗口并调用一个最小 Rust command。
- 依赖：无。
- 文件/模块：`src/`、`src-tauri/`、`package.json`、`Cargo.toml`、Tauri 配置。
- 步骤：
  1. 初始化 Tauri + React + TypeScript 项目结构。
  2. 建立 Rust `commands/application/domain/infrastructure/dto` 目录。
  3. 建立 TypeScript `api/features/view-model/components` 目录。
  4. 添加最小健康检查 command。
  5. 写启动和最小 command 测试。
- 错误与回滚：初始化失败时不保留半成品依赖配置；恢复到上一提交。
- 测试：前端类型检查、Rust 编译、最小 Tauri command 调用测试。
- 完成证据：本地能启动应用，UI 能显示 Rust command 返回的版本或健康状态。

## PLAN-CONTRACT-001 Issue 契约

- 需求：REQ-ISSUES。
- 上下文与职责：RESP-ISSUE-HANDLE。
- ADR：ADR-002、ADR-006。
- 目标：定义 Rust `AppIssue/AppResult`、Tauri `CommandErrorDto` 和 TypeScript issue 类型。
- 依赖：PLAN-SKELETON-001。
- 文件/模块：`src-tauri/src/domain/issue/`、`src-tauri/src/dto/issue_dto.rs`、`src/api/dto.ts`。
- 契约变化：category、level、sourceResponsibility、location、details、messageKey、cause 内部保留。
- 步骤：
  1. 定义 Issue category 和 level 枚举。
  2. 定义 Rust 内部 Issue 与 command DTO。
  3. 定义 TypeScript 对应类型。
  4. 定义 EXCEPTION 到 command error 的转换。
  5. 添加 cause 不进入 UI DTO 的测试。
- 测试：Rust 单元测试、TypeScript 类型测试、示例序列化快照。
- 完成证据：TIP/WARNING/EXCEPTION 三类样例能从 Rust 转成 TypeScript 可读 DTO。

## PLAN-CONTRACT-002 分析结果契约

- 需求：REQ-REQUEST、REQ-LATENCY、REQ-VIEW、REQ-LATENCY-EXPORT。
- 上下文与职责：CTX-LATENCY-ANALYSIS、RESP-ANALYSIS-ASSEMBLE、RESP-LATENCY-VIEW-PROJECT、RESP-LATENCY-EXPORT-PROJECT。
- ADR：ADR-006、ADR-007。
- 目标：定义 `LatencyAnalysisResult`、`EffectiveRuleCatalog`、请求、命中、阶段、统计、ViewModel 和 CsvModel 的首批类型。
- 依赖：PLAN-CONTRACT-001。
- 文件/模块：`src-tauri/src/dto/analysis_dto.rs`、`src/api/dto.ts`、`src/view-model/latency-view-model.ts`。
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
- 文件/模块：测试资源目录、测试工具。
- 步骤：
  1. 建立测试资源目录。
  2. 复制或引用批准的 TOML 与 CSV 基线。
  3. 添加基线文件存在性和编码检查。
  4. 添加 CSV 表头和三段结构检查。
- 测试：Rust 集成测试。
- 完成证据：基线资源检查稳定通过。
