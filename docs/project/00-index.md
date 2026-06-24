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

当前阶段只重拆需求，不进入领域设计、技术架构或实施计划。

## 当前阶段

Phase 1: Requirements

## 阶段批准状态

| 阶段 | 内容 | 状态 | 批准人 | 批准时间 |
| --- | --- | --- | --- | --- |
| Phase 0 | 现有文档和上下文盘点 | Done | 用户会话确认 | 2026-06-24 |
| Phase 1 | 需求拆解 | Draft |  |  |
| Phase 2 | DDD 领域与职责拆分 | Pending |  |  |
| Phase 3 | 生命周期与扩展点设计 | Pending |  |  |
| Phase 4 | 技术选型与架构设计 | Pending |  |  |
| Phase 5 | 解耦实施计划 | Pending |  |  |

## 文档目录

| 文档 | 说明 | 状态 |
| --- | --- | --- |
| requirements/00-overview.md | 目标、用户、能力地图、交付阶段、术语 | Draft |
| requirements/01-scope-and-constraints.md | 范围、约束、性能、数据生命周期 | Draft |
| requirements/02-log-ingestion-and-quality-requirements.md | 日志导入、固定格式解析、数据质量 | Draft |
| requirements/03-log-search-and-context-requirements.md | 关键字、正则、结构化过滤、上下文查看 | Draft |
| requirements/04-saved-query-requirements.md | 保存查询的创建、复用、编辑、删除 | Draft |
| requirements/05-rule-set-management-requirements.md | 业务规则集导入、编辑、导出、备份、校验 | Draft |
| requirements/06-request-recognition-requirements.md | 根据规则识别一次请求及请求列表筛选 | Draft |
| requirements/07-latency-analysis-requirements.md | 阶段定义、时延计算、分支、统计 | Draft |
| requirements/08-request-analysis-view-requirements.md | 单次请求分析视图、统计视图、日志钻取 | Draft |
| requirements/99-issue-table.md | 暂不逐条确认的异常、校验与边界问题清单 | Draft |

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
  -> 99-issue-table
```

## 待后续阶段处理

- 领域模型、限界上下文、聚合和值对象。
- 数据、加工、展示三层解耦方式。
- 插件、拦截器、监听器、工厂、策略等设计模式是否需要，以及使用位置。
- 技术选型、中间件选择、运行形态、存储形态。
- 实施计划和任务级拆分。

