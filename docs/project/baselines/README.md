Document ID: BASELINE-PRIMARY
Status: Draft
Approved by:
Approved at:
Depends on: REQ-RULESET, REQ-REQUEST, REQ-LATENCY, REQ-LATENCY-EXPORT, REQ-VIEW
Supersedes:

# 关键输入输出基线

本次 Phase 1 修订以规则包版本导入和最终时延分析结果为目标，使用以下关键基线：

- `business-rules.example.toml`：旧版单文件兼容参考；不再是规则包导入主流程的输入。
- `business-rules-split/`：完整 `.zip` 规则包解压后的根目录内容。`manifest.toml` 声明版本和层级文件映射；所有层级文件一起校验、导入和覆盖。
- `rule-package-import-result.example.json`：导入 `business-rules-split/` 后新增版本的预期结果。
- `latency-analysis-export.example.csv`：`SCENARIO-FULL` 下的关键输出，按关键日志时间戳、阶段时延明细、阶段统计三个区域展示。
- `../ui/latency-analysis-approved.svg`：时延分析页面的信息层级和交互关系基线。

稳定 ID 建立以下映射：

```text
manifest.version
  -> target rule package version
  -> complete RuleSet validation
  -> version create or replacement
  -> effective log_matchers and stages
  -> request recognition and latency result
  -> CSV rows and UI lanes
```

后续领域、职责、架构和计划设计不得绕开这些基线另建不兼容的数据结构。上游需求变化时，必须同步检查三类基线。
