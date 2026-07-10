Document ID: PLAN-RUST-LATENCY-ANALYSIS
Status: Approved
Approved by: 用户
Approved at: 2026-07-07
Depends on: PLAN-RUST-LOG-WORKSPACE, PLAN-RUST-RULE-CONFIGURATION, RESP-LATENCY-PIPELINE-DESIGN, CONTRACT-LATENCY-ANALYSIS-RESULT
Supersedes:

# Rust 时延分析核心计划

## PLAN-ANALYSIS-001 分析范围和场景解析

- 需求：REQ-REQUEST、REQ-LATENCY。
- 职责：RESP-ANALYSIS-SCOPE、RESP-SCENARIO-RESOLVE。
- ADR：ADR-002。
- 目标：固定时间范围、场景、数据集版本和规则快照，生成有效分析规则。
- 依赖：PLAN-LOG-003、PLAN-RULE-003。
- 文件/模块：`domain/latency_analysis/analysis_scope.rs`、`effective_rule_resolver.rs`。
- 步骤：
  1. 生成 AnalysisScope。
  2. 校验 scenarioId。
  3. 边界 matcher 始终生效。
  4. 普通 matcher/stage 按 enabled 和 applicable_scenario_ids 过滤。
  5. 保留 export_enabled 到结果目录。
- 测试：FULL/CORE 场景、无效场景、边界规则不受场景影响。
- 完成证据：同一数据集在不同场景生成不同有效规则，但请求边界一致。

## PLAN-ANALYSIS-002 请求识别

- 需求：REQ-REQUEST。
- 职责：RESP-REQUEST-RECOGNIZE。
- ADR：ADR-002、ADR-004。
- 目标：根据全局开始日志识别请求，请求结束取结束日志或下一次开始日志之前。
- 依赖：PLAN-ANALYSIS-001。
- 文件/模块：`domain/latency_analysis/request_recognizer.rs`。
- 步骤：
  1. 在用户选择时间范围内寻找开始日志。
  2. 仅开始日志时间位于范围内的请求进入分析。
  3. 请求处理到结束日志或下一次开始日志之前。
  4. 没有开始日志不生成请求。
  5. 生成非空 systemRequestId 和 displayStartTimestamp。
- 测试：正常结束、缺失结束、最后一个无结束、范围前日志不属于请求、同一应用多次进入。
- 完成证据：请求列表和边界符合批准规则。

## PLAN-ANALYSIS-003 log_matcher 命中

- 需求：REQ-LATENCY。
- 职责：RESP-LOG-MATCH。
- ADR：ARCH-EXTENSION-PATTERNS、ADR-004。
- 目标：在每次请求范围内执行有效 matcher，生成 MatcherHit。
- 依赖：PLAN-ANALYSIS-002、PLAN-LOG-004。
- 文件/模块：`domain/latency_analysis/request_log_matcher.rs`、`domain/latency_analysis/matcher_strategy.rs`。
- 步骤：
  1. 实现 keyword/regex/structured-field 内部策略。
  2. 只在 RecognizedRequest 范围内匹配普通 matcher。
  3. 未命中的普通日志不进入分析结果。
  4. 重复命中按规则取第一条并输出提示。
  5. 保存日志引用、原始时间戳、可比较时间和 systemRequestId。
- 测试：三类 matcher、重复命中、未命中、跨应用请求范围、regex 编译失败。
- 完成证据：基线请求内 matcher 命中与规则顺序一致。

## PLAN-ANALYSIS-004 阶段时延计算

- 需求：REQ-LATENCY。
- 职责：RESP-STAGE-CALCULATE。
- ADR：ARCH-EXTENSION-PATTERNS。
- 目标：按 start_matcher_id 和 end_matcher_id 计算阶段时延，支持 internal/business/rpc 层。
- 依赖：PLAN-ANALYSIS-003。
- 文件/模块：`domain/latency_analysis/stage_latency_calculator.rs`。
- 步骤：
  1. 查找同一请求内起止 MatcherHit。
  2. 计算 durationMs。
  3. RPC 阶段允许跨应用和进程。
  4. 阶段缺失不生成零值样本。
  5. 时间顺序异常进入 Issue。
- 测试：应用内部阶段、应用间 RPC、跨进程、缺失起点、缺失终点、时间倒序。
- 完成证据：所有基线阶段时延与预期 CSV 一致。

## PLAN-ANALYSIS-005 并行子进程组

- 需求：REQ-LATENCY。
- 职责：RESP-STAGE-CALCULATE、RESP-ANALYSIS-ASSEMBLE。
- ADR：ARCH-LIFECYCLE-STATE、ARCH-EXTENSION-PATTERNS。
- 目标：表达主流程进入并行子进程组、子进程独立分析、主流程 join matcher 汇总。
- 依赖：PLAN-ANALYSIS-004。
- 文件/模块：`domain/latency_analysis/subprocess_group_result.rs`。
- 步骤：
  1. 根据 trigger stage 进入并行组。
  2. 各子进程阶段独立计算。
  3. join matcher 命中代表组整体完成。
  4. 计算组总等待时延。
  5. 主流程后续阶段只能从 join 或其后日志开始。
- 测试：B/C 并行组、子进程顺序不同、join 缺失、主流程后续阶段。
- 完成证据：无需为每个子进程建模返回主流程日志，仍能生成组结果。

## PLAN-ANALYSIS-006 统计与结果组装

- 需求：REQ-LATENCY、REQ-VIEW、REQ-LATENCY-EXPORT。
- 职责：RESP-LATENCY-STATISTICS、RESP-ANALYSIS-ASSEMBLE、RESP-ANALYSIS-COORDINATE。
- ADR：ADR-006。
- 目标：生成不可变 LatencyAnalysisResult，包括 EffectiveRuleCatalog、请求、命中、阶段、统计。
- 依赖：PLAN-ANALYSIS-005。
- 文件/模块：`domain/latency_analysis/statistics.rs`、`analysis_assembler.rs`。
- 步骤：
  1. 按 stage ID 汇总样本。
  2. 计算样本数、平均、P90、最大值。
  3. 组装 EffectiveRuleCatalog。
  4. 生成 LatencyAnalysisResult。
  5. 任一 EXCEPTION 不发布新结果。
- 测试：统计样本、缺失阶段不计入、P90、结果不可变、异常不发布。
- 完成证据：基线输入能生成与 CSV 基线一致的分析结果。
