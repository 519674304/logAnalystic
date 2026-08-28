Document ID: PLAN-RUST-LATENCY-ANALYSIS
Status: Approved
Approved by: 用户（下一步落地清单）
Approved at: 2026-08-28
Depends on: PLAN-RUST-LOG-WORKSPACE, PLAN-RUST-RULE-CONFIGURATION, RESP-LATENCY-PIPELINE-DESIGN
Supersedes: PLAN-RUST-LATENCY-ANALYSIS（旧版：result 闭合、并行子进程）

# Rust 时延分析核心计划

> 因「栈式拆分 + 拦截丢弃」新建模修订：去掉 result 分支闭合与并行子进程（`sub_process_ids`）建模。
> 请求识别改为纯栈式——`request_start` 命中即压栈开新请求；拦截 end matcher 命中弹栈、整个请求丢弃；
> process 级 stage 取第一对起止算时延。算法镜像前端 TS 原型 `analyzeLatencyStream`（已用冒烟场景验证）。

## PLAN-ANALYSIS-001 输入契约

- 需求：REQ-LATENCY。
- 职责：RESP-ANALYSIS-SCOPE。
- 目标：把规则投影为 `LatencyAnalysisSpec`，作为核心的纯输入（本模块不读 TOML）。
- 依赖：PLAN-RULE-003。
- 文件/模块：`domain/latency_analysis/spec.rs`。
- 步骤：
  1. `Marker { pattern, mode }`：keyword / regex，大小写不敏感。
  2. `request_start`：flow 级 `order=1` 非拦截 stage 的 start matcher。
  3. `intercept_ends`：`kind="intercept"` 的 `end_matcher_ids` 逐个展开。
  4. `process_stages`：process 级 stage（有 `process_id` + start/end matcher）。
- 测试：投影契约与 `App.tsx` 的 `runLatencyAnalysis` 一致。
- 完成证据：`LatencyAnalysisSpec` 覆盖拆分点、拦截 ends、process stage。

## PLAN-ANALYSIS-002 日志条目获取

- 需求：REQ-LATENCY。
- 职责：RESP-LOG-MATCH。
- 目标：单遍解析目录内时间范围内的全部日志条目，供核心流式消费。
- 依赖：PLAN-LOG-003。
- 文件/模块：`domain/latency_analysis/analyzer.rs`（消费）、`log_workspace/port.rs` + `infrastructure/ripgrep_log_source.rs`（`LogSource::entries`）。
- 步骤：
  1. `LogSource::entries(dir, range)` 逐文件 `LineReader` 读行、`parse_line`、`in_range` 过滤。
  2. 解析失败行不参与（`parse_line` 返回 `None` 已跳过）。
- 测试：范围内条目被收集、范围外/解析失败行被排除。
- 完成证据：`entries` 返回的条目与工作区日志一致。

## PLAN-ANALYSIS-003 匹配与排序

- 需求：REQ-LATENCY。
- 职责：RESP-LOG-MATCH。
- 目标：对每条日志匹配 marker，收集 `TimedHit` 后稳定排序，等价 TS 的 `ts / line` 排序。
- 依赖：PLAN-ANALYSIS-001、PLAN-ANALYSIS-002。
- 文件/模块：`domain/latency_analysis/analyzer.rs`。
- 步骤：
  1. 组装规则，固定顺序 = request_start → intercept_ends → process stage（start/end）。
  2. 对每条 entry 逐规则匹配，命中产出 `TimedHit { ts_ms, line_no, raw_ts, role }`。
  3. 稳定排序 `by (ts_ms, line_no)`。
- 测试：keyword / regex 匹配、同一行命中多 marker 的角色顺序、时间戳非法行被跳过。
- 完成证据：命中顺序与前端一致。

## PLAN-ANALYSIS-004 栈式请求识别与拦截丢弃

- 需求：REQ-REQUEST、REQ-LATENCY。
- 职责：RESP-REQUEST-RECOGNIZE、RESP-STAGE-CALCULATE。
- 目标：按栈（LIFO）划分请求；拦截命中优先级最高，整请求丢弃。
- 依赖：PLAN-ANALYSIS-003。
- 文件/模块：`domain/latency_analysis/analyzer.rs`。
- 步骤：
  1. `start` 命中压栈开新请求。
  2. `intercept` 命中弹栈（栈顶请求及其 stage 事件一并丢弃，不产样本、不进统计）。
  3. `stage` start/end 命中累积到栈顶请求（栈空则忽略）。
  4. 日志结束后统一结算栈中剩余请求（无 result 闭合）。
- 测试：正常栈、拦截丢弃、无 start 不生成请求、栈空时 stage 事件被忽略。
- 完成证据：请求边界与拦截丢弃行为符合新建模。

## PLAN-ANALYSIS-005 process 级 stage 时延与统计

- 需求：REQ-LATENCY、REQ-VIEW、REQ-LATENCY-EXPORT。
- 职责：RESP-STAGE-CALCULATE、RESP-LATENCY-STATISTICS。
- 目标：每个 stage 取第一对起止算时延，汇总样本统计。
- 依赖：PLAN-ANALYSIS-004。
- 文件/模块：`domain/latency_analysis/analyzer.rs`、`result.rs`。
- 步骤：
  1. 每 stage 只取第一对 start/end，`duration_ms = max(0, end - start)`；重复命中丢弃。
  2. `total_ms = max(全部样本起止) - min(全部样本起止)`；无样本为 0。
  3. 汇总所有请求样本 → `sample_count / average_ms / p90_ms / max_ms`（P90 索引 `ceil(n*0.9)-1`）。
  4. 生成不可变 `LatencyAnalysis`。
- 测试：第一对、缺失起/止不产样本、P90 取整、空样本统计为 0。
- 完成证据：冒烟 fixture（5 请求 × 4 stage = 20 样本）输出与前端一致。
