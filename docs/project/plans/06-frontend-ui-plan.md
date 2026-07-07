Document ID: PLAN-FRONTEND-UI
Status: Approved
Approved by: 用户
Approved at: 2026-07-07
Depends on: PLAN-APPLICATION-SERVICES-STORAGE, UI-BASELINE, ARCH-TECHNICAL-ARCHITECTURE
Supersedes:

# 前端主流程 UI 计划

## PLAN-UI-001 应用框架和 API 客户端

- 需求：REQ-OVERVIEW。
- 职责：RESP-UI-RENDER。
- ADR：ADR-001、ADR-006。
- 目标：建立 React 应用布局、Tauri API 客户端、全局状态和 Issue 展示入口。
- 依赖：PLAN-APP-002。
- 文件/模块：`src/app/`、`src/api/`、`src/components/layout/`。
- 步骤：
  1. 建立主布局。
  2. 封装 Tauri command 调用。
  3. 建立 app state。
  4. 实现统一 Issue 提示和问题列表入口。
- 测试：API mock、Issue 展示、状态切换。
- 完成证据：页面能展示后端健康状态和统一错误提示。

## PLAN-UI-002 日志导入、搜索和上下文

- 需求：REQ-INGEST、REQ-SEARCH、REQ-SAVED-QUERY。
- 职责：RESP-LOG-LOAD、RESP-LOG-SEARCH、RESP-SAVED-QUERY、RESP-LOG-DRILLDOWN。
- ADR：ADR-002、ADR-004。
- 目标：完成日志选择、加载进度、搜索过滤、保存查询和上下文查看。
- 依赖：PLAN-LOG-004、PLAN-STORAGE-001、PLAN-UI-001。
- 文件/模块：`src/features/log-search/`。
- 步骤：
  1. 文件选择和加载摘要。
  2. 加载进度展示。
  3. 关键字/短语/正则/字段过滤控件。
  4. 搜索结果列表。
  5. 上下文面板。
  6. 保存查询创建、复用、编辑、删除。
- 测试：组件测试、搜索表单、正则错误、保存查询。
- 验收：常用搜索和上下文切换 P90 <= 1s。
- 完成证据：用户能从日志导入到搜索上下文闭环。

## PLAN-UI-003 规则管理

- 需求：REQ-RULESET。
- 职责：RESP-RULE-IMPORT、RESP-RULE-VALIDATE、RESP-RULE-MANAGE、RESP-RULE-EXPORT。
- ADR：ADR-003。
- 目标：支持 TOML 导入、编辑、校验、激活、导出和恢复上一版本。
- 依赖：PLAN-RULE-004、PLAN-STORAGE-002、PLAN-UI-001。
- 文件/模块：`src/features/rule-config/`。
- 步骤：
  1. TOML 文件选择和文本编辑。
  2. 校验结果展示。
  3. 激活确认。
  4. 导出当前规则。
  5. 恢复上一版本。
- 测试：校验失败不覆盖、成功激活、导出。
- 完成证据：基线 TOML 能从 UI 激活并供分析使用。

## PLAN-UI-004 请求列表和筛选

- 需求：REQ-REQUEST、REQ-VIEW。
- 职责：RESP-REQUEST-LIST-PROJECT。
- ADR：ADR-006。
- 目标：按业务流程、时间、结束结果、是否异常筛选请求列表。
- 依赖：PLAN-ANALYSIS-006、PLAN-UI-001。
- 文件/模块：`src/features/latency-analysis/request-list/`。
- 步骤：
  1. 分析条件面板。
  2. 请求列表 ViewModel。
  3. 请求筛选。
  4. 请求选中状态。
  5. STALE/EMPTY/FAILED 状态展示。
- 测试：筛选条件、空结果、过期结果、选中请求。
- 完成证据：用户能选择某次请求进入时延视图。

## PLAN-UI-005 时延泳道图

- 需求：REQ-VIEW、UI-BASELINE。
- 职责：RESP-LATENCY-VIEW-PROJECT、RESP-UI-RENDER。
- ADR：ADR-007。
- 目标：用 React + SVG 展示单次请求不同应用泳道、阶段块、RPC 连线和统计摘要。
- 依赖：PLAN-UI-004。
- 文件/模块：`src/features/latency-analysis/swimlane/`、`src/view-model/latency-layout-builder.ts`。
- 步骤：
  1. 从 LatencyAnalysisResult 生成 LatencyAnalysisViewModel。
  2. 生成泳道、阶段块、RPC 线、颜色和坐标。
  3. SVG 渲染组件只使用 ViewModel。
  4. 实现 hover、选中和 tooltip。
  5. 展示统计摘要。
- 测试：ViewModel 快照、SVG 渲染、hover/selected、移动和桌面视口。
- 完成证据：页面效果对齐已批准 SVG 基线，且业务计算不在 SVG 组件中。

## PLAN-UI-006 原始日志钻取和 CSV 导出

- 需求：REQ-VIEW、REQ-LATENCY-EXPORT。
- 职责：RESP-LOG-DRILLDOWN、RESP-LATENCY-EXPORT-PROJECT、RESP-CSV-WRITE。
- ADR：ADR-006。
- 目标：从阶段或 matcher 定位原始日志上下文，并导出当前筛选请求 CSV。
- 依赖：PLAN-UI-005、PLAN-APP-004。
- 文件/模块：`src/features/latency-analysis/raw-log/`、`src/features/latency-analysis/export/`。
- 步骤：
  1. 点击阶段边界读取上下文。
  2. 展示原始日志片段。
  3. 导出按钮按状态启用。
  4. 导出失败显示 Issue。
  5. STALE 结果不可导出。
- 测试：日志钻取、导出成功、导出失败、STALE 禁用。
- 完成证据：用户能从图形定位日志并导出基线结构 CSV。
