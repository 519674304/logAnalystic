Document ID: IDX-000
Status: Draft
Approved by:
Approved at:
Depends on:
Supersedes: docs/vscode/specs/requirements.md, docs/superpowers/specs/2026-06-17-log-analysis-design.md, 日志分析软件需求.md

# 项目启动文档索引

## 项目目标

建设一个本地日志分析软件，面向测试人员和开发人员在本机使用。软件优先解决两类核心问题：

1. 基础能力：导入固定格式日志后，完成解析、搜索、上下文查看和常用查询复用。
2. 进阶能力：基于业务规则识别一次请求，计算请求内跨应用、应用内部和应用间传递的时延，并以单次请求为主视图展示。

规则包版本导入方向已变更，当前正在重新确认需求与关键基线。受影响的领域、职责、架构和实施计划不得作为实现依据，待后续阶段重审。

## 当前阶段

个人项目快速路径：规则包导入需求、低保真原型和最小实施清单待统一审批。

本项目为单人本地工具，已选择 `Project Inception` 的个人项目快速路径。范围仅覆盖完整规则包的本地校验、新增或整包覆盖、树状浏览、节点弹窗编辑和冒烟验证；用户可在导入前自行使用外部 AI 检查文件，项目不接入该能力。版本历史、备份恢复、启用状态、迁移和企业级异常处理明确不在本轮范围内。

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
| requirements/02-log-ingestion-and-quality-requirements.md | 日志导入、固定格式解析、数据质量 | Approved |
| requirements/03-log-search-and-context-requirements.md | 关键字、正则、结构化过滤、上下文查看 | Approved |
| requirements/04-saved-query-requirements.md | 保存查询的创建、复用、编辑、删除 | Approved |
| requirements/05-rule-set-management-requirements.md | 规则包版本导入、树、节点弹窗和整包覆盖 | Draft |
| requirements/06-request-recognition-requirements.md | 根据规则识别一次请求及请求列表筛选 | Approved |
| requirements/07-latency-analysis-requirements.md | 阶段定义、时延计算、分支、统计 | Approved |
| requirements/08-request-analysis-view-requirements.md | 单次请求分析视图、统计视图、日志钻取 | Approved |
| requirements/09-latency-export-requirements.md | 关键日志时间戳、阶段时延和阶段统计 CSV 导出 | Approved |
| requirements/99-issue-table.md | 暂不逐条确认的异常、校验与边界问题清单 | Draft |
| baselines/README.md | 关键输入输出基线及映射 | Draft |
| baselines/business-rules.example.toml | 业务规则关键输入基线 | Approved |
| baselines/business-rules-split/ | 分层业务规则 TOML 样例 | Draft |
| baselines/rule-package-import-result.example.json | 规则包导入版本结果基线 | Draft |
| baselines/latency-analysis-export.example.csv | 时延分析 CSV 关键输出基线 | Approved |
| ui/README.md | 时延分析页面视觉基线说明 | Approved |
| ui/latency-analysis-approved.svg | 已确认的单次请求应用泳道页面 | Approved |
| ui/log-search-workbench-wireframe.png | 日志搜索与查询管理页原型图 | Approved |
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
| responsibilities/00-responsibility-map.md | 全部职责、依赖和需求追踪 | Needs revision |
| responsibilities/01-log-search-and-context-design.md | 日志搜索与上下文复杂职责 | Approved |
| responsibilities/02-rule-set-lifecycle-design.md | 规则包读取、本地校验、整包覆盖与树投影职责 | Draft |
| responsibilities/03-request-recognition-design.md | 请求识别复杂职责 | Needs revision |
| responsibilities/04-latency-analysis-pipeline-design.md | 时延分析流水线复杂职责 | Needs revision |
| responsibilities/05-result-projection-and-delivery-design.md | 页面与 CSV 投影交付职责 | Approved |
| responsibilities/06-issue-handling-design.md | 统一问题分类与处理职责 | Approved |
| architecture/00-lifecycle-and-extension-overview.md | 生命周期与扩展点设计总览 | Needs revision |
| architecture/01-lifecycle-state-model.md | 日志、规则、分析运行状态模型 | Needs revision |
| architecture/02-extension-pattern-decisions.md | 扩展点与设计模式采用或拒绝决策 | Needs revision |
| architecture/03-technology-selection-adrs.md | 技术选型与 ADR | Approved |
| architecture/04-technical-architecture.md | 运行组件、分层、数据流和安全边界 | Needs revision |
| architecture/05-performance-testing-and-operations.md | 性能、测试与本地运维边界 | Approved |
| architecture/06-package-structure.md | Rust 与 TypeScript 包结构、依赖方向和注释规范 | Approved |
| plans/00-roadmap.md | 实施路线图、里程碑和集成顺序 | Needs revision |
| plans/01-project-skeleton-and-contracts-plan.md | 项目骨架与契约基线计划 | Approved |
| plans/02-rust-log-workspace-plan.md | Rust 日志工作区计划 | Approved |
| plans/03-rust-rule-configuration-plan.md | Rust 规则配置计划 | Needs revision |
| plans/04-rust-latency-analysis-plan.md | Rust 时延分析核心计划 | Needs revision |
| plans/05-application-services-and-storage-plan.md | 应用服务与本地存储计划 | Needs revision |
| plans/06-frontend-ui-plan.md | 前端主流程 UI 计划 | Needs revision |
| plans/08-rule-package-fast-path-checklist.md | 规则包导入与规则页最小实施清单 | Draft |
| plans/07-testing-performance-packaging-plan.md | 测试、性能与打包计划 | Approved |
| plans/99-final-audit.md | 最终安全网审计与追踪矩阵 | Approved |

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

- 审批规则包版本导入需求、关键基线与冒烟验收。
- 审批规则页低保真原型后，补充最小职责边界与文件级实施清单。
