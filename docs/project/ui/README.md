Document ID: UI-BASELINE
Status: Approved
Approved by: 用户
Approved at: 2026-07-05
Depends on: REQ-VIEW, REQ-LATENCY
Supersedes: docs/vscode/specs/latency-selected-request-app-lanes.svg

# 时延分析页面视觉基线

`latency-analysis-approved.svg` 保存此前确认的时延分析页面方向，后续领域设计、展示模型设计、技术架构和实施计划必须引用该基线。

## 已确认的页面关系

- 用户主动选择某一次请求作为主视图。
- 选中请求中的不同应用分泳道展示。
- 不同阶段使用可区分颜色展示，并直接体现阶段耗时。
- 其它同类请求只展示统计摘要，不在主图中逐个展开。
- 用户选择阶段后可以查看阶段边界、耗时对比和原始日志入口。

## 使用边界

- 该 SVG 约束信息层级、区域关系和主要交互，不定义领域数据结构。
- 图中的应用编号、阶段字母、时间、统计值和颜色均为演示数据。
- 实际页面由时延分析输出模型驱动，业务含义、应用、进程、阶段和分析场景以已批准的数据契约为准。
- UI 改版不得要求日志解析、请求识别或时延计算逻辑随之重写。
