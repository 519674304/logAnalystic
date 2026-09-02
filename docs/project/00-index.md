Document ID: IDX-000
Status: Draft
Approved by:
Approved at:
Depends on:
Supersedes: docs/vscode/specs/requirements.md, docs/superpowers/specs/2026-06-17-log-analysis-design.md, 日志分析软件需求.md

# 项目启动文档索引

## 项目目标

建设一个本地日志分析软件，面向测试人员和开发人员在本机使用。软件优先解决两类核心问题：

1. 基础能力：导入固定格式日志后，完成解析、搜索、上下文查看和常用查询条件复用。
2. 进阶能力：基于业务规则识别一次请求，计算请求内跨应用、应用内部和应用间传递的时延，并以单次请求为主视图展示。

规则包版本导入方向已变更，当前正在重新确认需求与关键基线。受影响的领域、职责、架构和实施计划不得作为实现依据，待后续阶段重审。

## 当前阶段

Web 后端与流式日志处理重构：Tauri → 本机 Web 服务（axum）、整体载入内存 → 流式读取。Phase 1 需求已批准（2026-08-25），Phase 2 原型已确认（2026-08-25），Phase 3 领域分解已批准（统一 `LogSource` 端口，2026-08-25），Phase 4/5/6 合并收尾已批准（2026-08-25）。下一步：writing-plans 生成详细实施计划。

本项目为单人本地工具，已选择 `Project Inception` 的个人项目快速路径：保留需求 / 领域 / 职责 / 架构 / 计划的解耦与可追溯，裁剪企业级错误分类、重试矩阵、回滚模型与 P90 性能门槛。规则包导入的快速路径（plans/08）仍在并行推进。

## 阶段批准状态

| 阶段 | 内容 | 状态 | 批准人 | 批准时间 |
| --- | --- | --- | --- | --- |
| Phase 0 | 现有文档和上下文盘点 | Done | 用户会话确认 | 2026-06-24 |
| 快速路径 1 | 主流程、规则包基线与冒烟验收 | Draft | 用户会话已确认方向，待文档审批 | 2026-08-21 |
| 快速路径 2 | 规则页低保真原型 | Draft |  |  |
| 快速路径 3 | 最小职责边界与文件级实施清单 | Pending |  |  |

## 文档目录

| 文档 | 说明 | 状态 |
| --- | --- | --- |
| requirements/00-overview.md | 目标、用户、能力地图、交付阶段、术语 | Approved |
| requirements/01-scope-and-constraints.md | 范围、约束、性能、数据生命周期 | Approved |
| requirements/02-log-ingestion-and-quality-requirements.md | 目录工作区、流式读取、固定格式解析、数据质量 | Approved |
| requirements/03-log-search-and-context-requirements.md | 快速单查询搜索、加载态、上下文查看、保存查询条件 | Approved |
| requirements/10-web-backend-and-streaming-requirements.md | 本机 Web 后端、快速单查询、有界内存 | Approved |
| requirements/04-saved-query-requirements.md | 保存查询管理（已废止，合并为保存查询条件） | Superseded |
| requirements/05-rule-set-management-requirements.md | 规则包版本导入、树、节点弹窗和整包覆盖 | Draft |
| requirements/06-request-recognition-requirements.md | 根据规则识别一次请求及请求列表筛选 | Approved |
| requirements/07-latency-analysis-requirements.md | 阶段定义、时延计算、分支、统计 | Approved |
| requirements/08-request-analysis-view-requirements.md | 单次请求分析视图、统计视图、日志钻取 | Approved |
| requirements/09-latency-export-requirements.md | 关键日志时间戳、阶段时延和阶段统计 CSV 导出 | Approved |
| requirements/99-issue-table.md | 冒烟阻塞异常与冒烟场景清单 | Approved |
| baselines/README.md | 关键输入输出基线及映射 | Draft |
| baselines/business-rules.example.toml | 业务规则关键输入基线 | Approved |
| baselines/business-rules-split/ | 分层业务规则 TOML 样例 | Draft |
| baselines/rule-package-import-result.example.json | 规则包导入版本结果基线 | Draft |
| baselines/latency-analysis-export.example.csv | 时延分析 CSV 关键输出基线 | Approved |
| ui/README.md | 页面视觉基线说明（日志搜索页已重定为快速单查询 + 加载态） | Approved |
| ui/latency-analysis-approved.svg | 已确认的单次请求应用泳道页面 | Approved |
| ui/log-search-workbench-wireframe.png | 日志搜索与查询管理页原型图（已废止） | Superseded |
| smoke/README.md | 冒烟测试执行说明 | Draft |
| smoke/sample-log-small.txt | 冒烟日志样例 | Draft |
| smoke/sample-business-rules.toml | 冒烟规则样例 | Draft |
| smoke/sample-saved-queries.json | 冒烟保存查询样例 | Draft |
| smoke/sample-latency-export.csv | 冒烟导出样例 | Draft |
| smoke/sample-latency-result.json | 冒烟时延结果样例 | Draft |
| domain/00-domain-map.md | DDD 深度、子域和限界上下文关系 | Approved |
| domain/01-log-workspace-context.md | 日志工作区上下文设计 | Approved |
| domain/02-rule-configuration-context.md | 规则配置上下文设计 | Needs revision |
| domain/03-latency-analysis-context.md | 时延分析核心上下文设计 | Needs revision |
| domain/04-analysis-result-contract.md | 数据加工层最终时延分析结果契约 | Approved |
| domain/05-rule-set-data-relationships.md | 规则集子元素分类、归属和引用关系 | Draft |
| responsibilities/00-responsibility-map.md | 全部职责、依赖和需求追踪 | Approved |
| responsibilities/01-log-search-and-context-design.md | 日志搜索与上下文复杂职责 | Approved |
| responsibilities/02-rule-set-lifecycle-design.md | 规则包读取、本地校验、整包覆盖与树投影职责 | Draft |
| responsibilities/03-request-recognition-design.md | 请求识别复杂职责 | Needs revision |
| responsibilities/04-latency-analysis-pipeline-design.md | 时延分析流水线复杂职责 | Needs revision |
| responsibilities/05-result-projection-and-delivery-design.md | 页面与 CSV 投影交付职责 | Approved |
| responsibilities/06-issue-handling-design.md | 统一问题分类与处理职责 | Approved |
| architecture/00-lifecycle-and-extension-overview.md | 生命周期与扩展点设计总览 | Needs revision |
| architecture/01-lifecycle-state-model.md | 日志、规则、分析运行状态模型 | Needs revision |
| architecture/02-extension-pattern-decisions.md | 扩展点与设计模式采用或拒绝决策 | Needs revision |
| architecture/03-technology-selection-adrs.md | 技术选型与 ADR（本机 Web 服务 + LogSource 端口） | Approved |
| architecture/04-technical-architecture.md | 运行组件、分层、数据流和安全边界 | Approved |
| architecture/05-performance-testing-and-operations.md | 性能、测试与本地运维边界 | Approved |
| architecture/06-package-structure.md | Rust 与 TypeScript 包结构、依赖方向和注释规范 | Approved |
| plans/00-roadmap.md | 实施路线图、里程碑和集成顺序 | Approved |
| plans/01-project-skeleton-and-contracts-plan.md | 项目骨架与契约基线计划（本机 Web 服务重构版） | Draft |
| plans/02-rust-log-workspace-plan.md | Rust 日志工作区计划（LogSource + ripgrep 流式版） | Draft |
| plans/03-rust-rule-configuration-plan.md | Rust 规则配置计划 | Needs revision |
| plans/04-rust-latency-analysis-plan.md | Rust 时延分析核心计划 | Needs revision |
| plans/05-application-services-and-storage-plan.md | 应用服务与本地存储计划 | Needs revision |
| plans/06-frontend-ui-plan.md | 前端主流程 UI 计划 | Needs revision |
| plans/08-rule-package-fast-path-checklist.md | 规则包导入与规则页最小实施清单 | Draft |
| plans/07-testing-performance-packaging-plan.md | 测试、性能与打包计划 | Approved |
| plans/99-final-audit.md | 最终安全网审计与追踪矩阵 | Approved |
| code-review-findings.md | 代码架构评审：职责不清与架构债（App.tsx 超级组件 / application 构造具体类型 / main.rs 职责过重） | Draft |

## 依赖关系

```text
00-overview
  -> 01-scope-and-constraints
  -> 02-log-ingestion-and-quality
  -> 03-log-search-and-context
  -> 04-saved-query
  -> 05-rule-set-management
  -> 06-request-recognition
  -> 07-latency-analysis
  -> 08-request-analysis-view
  -> 09-latency-export
  -> 99-issue-table

DOMAIN-MAP
  -> CTX-LOG-WORKSPACE
  -> CTX-RULE-CONFIG
  -> CTX-LATENCY-ANALYSIS
  -> RESP-MAP
  -> complex responsibility designs
  -> ARCH-LIFECYCLE-OVERVIEW
  -> ARCH-LIFECYCLE-STATE
  -> ARCH-EXTENSION-PATTERNS
  -> ARCH-TECH-SELECTION
  -> ARCH-TECHNICAL-ARCHITECTURE
  -> ARCH-PERFORMANCE-TESTING
  -> PLAN-ROADMAP
  -> implementation plans
```

## 待后续阶段处理

- 最终批准后进入 writing-plans：按路线图与领域/职责/架构文档重新生成详细实施计划（旧的 Tauri / 内存索引 / 后台任务语义不作为实现依据）。
- 审批规则包版本导入需求、关键基线与冒烟验收。
- 审批规则页低保真原型后，补充最小职责边界与文件级实施清单。
- 「问题提示」首批不实现，作为 `LogSource` 后续下游保留。
