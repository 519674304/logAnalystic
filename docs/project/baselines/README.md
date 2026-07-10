Document ID: BASELINE-PRIMARY
Status: Approved
Approved by: 用户
Approved at: 2026-07-06
Depends on: REQ-RULESET, REQ-REQUEST, REQ-LATENCY, REQ-LATENCY-EXPORT, REQ-VIEW
Supersedes:

# 关键输入输出基线

Phase 1 以最终时延分析结果为目标，批准以下关键基线：

- `business-rules.example.toml`：业务规则关键输入，定义领域、应用、嵌套进程、并行子进程组、关键日志、进程关系、阶段、分析场景及业务流程。
- `latency-analysis-export.example.csv`：`SCENARIO-FULL` 下的关键输出，按关键日志时间戳、阶段时延明细、阶段统计三个区域展示。
- `../ui/latency-analysis-approved.svg`：时延分析页面的信息层级和交互关系基线。

稳定 ID 建立以下映射：

```text
analysis_scenario
  -> effective log_matchers and stages
  -> request recognition and latency result
  -> CSV rows and UI lanes
```

后续领域、职责、架构和计划设计不得绕开这些基线另建不兼容的数据结构。上游需求变化时，必须同步检查三类基线。
