# Health Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为导入的日志做一次健康体检，产出「系统异常（报错日志）」与「时延异常（慢阶段）」两类问题清单，通过新端点 `POST /api/health/check` 返回，前端「问题提示」页展示。

**Architecture:** 新增独立领域模块 `log-core/domain/health_check`，复用现有 `Marker`/`MarkerMatcher`（错误扫描）与 `SequentialStackSplitter` + `LatencyAnalyzer`（时延分析）。`HealthCheckAnalyzer::check` 读一次 entries，依次做错误扫描、时延分析、慢阈值判定，返回 `HealthReport`。server 新增端点与 DTO，前端新增 client、投影逻辑与面板组件。

**Tech Stack:** Rust 2021、serde（`rename_all = "camelCase"`）、axum 0.8、tracing、React + TypeScript（Vite）。

**Spec:** [2026-08-30-health-check-design.md](../specs/2026-08-30-health-check-design.md)

## Global Constraints

- 所有跨边界 DTO / 结果结构用 `#[serde(rename_all = "camelCase")]`；前端字段 camelCase，后端字段 snake_case。
- 复用现成类型，不重写时延算法：错误过滤器复用 `Marker`（`latency_analysis::spec::Marker`）；匹配复用 `MarkerMatcher::build(&Marker)`；请求拆分复用 `SequentialStackSplitter`；stage 分析复用 `LatencyAnalyzer::analyze(stages, requests)`。
- `LatencyAnalyzer` 与 `SequentialStackSplitter` 的现有语义不改动。
- 诊断日志安全边界：不落原始日志行、query、路径、rule JSON；handler 只记录安全摘要（count 值）。
- 错误过滤器为空 → `system_errors` 为空（不做默认 level 扫描）；stage 未配 `threshold_ms` → 不参与慢判定。
- 已核验的关键事实（实现者勿再猜）：
  - `LogcatParser` 单行格式：`<lineNo>,<date> <time> <pid> <tid> <level> <appPrefix>/<package>/<tag>: <message>`。
  - `SequentialStackSplitter` 的 `Request.id` = 请求起始条目的 `timestamp` 字符串。
  - `LatencyStageSpec`（前端）= `{ id, startMarkers: LogMarker[], endMarkers: LogMarker[] }`；`LogMarker` = `{ pattern, mode: 'keyword'|'regex' }`。
  - `LogWorkspaceService` 已有 `entries(dir, range)` 方法，`analyze` 已内联拆分+分析。
  - server 集成测试走公开 `server::app::app()`（`AppState` 与 `app_with_state` 为私有）。

---

## File Structure

- Create: `crates/log-core/src/domain/health_check/mod.rs`
- Create: `crates/log-core/src/domain/health_check/spec.rs`
- Create: `crates/log-core/src/domain/health_check/result.rs`
- Create: `crates/log-core/src/domain/health_check/analyzer.rs`
- Modify: `crates/log-core/src/domain/mod.rs`
- Modify: `crates/log-core/src/application/log_workspace_service.rs`
- Modify: `crates/server/src/main.rs`
- Test: `crates/server/tests/health_check_integration.rs`
- Modify: `src/api/dto.ts`
- Modify: `src/app/App.tsx`
- Create: `src/api/health-check-client.ts`
- Create: `src/features/health-check/HealthCheckPanel.tsx`

---

### Task 1: HealthCheck 领域模块（错误扫描 + 慢判定 + 汇总）

**Files:**
- Create: `crates/log-core/src/domain/health_check/mod.rs`
- Create: `crates/log-core/src/domain/health_check/spec.rs`
- Create: `crates/log-core/src/domain/health_check/result.rs`
- Create: `crates/log-core/src/domain/health_check/analyzer.rs`
- Modify: `crates/log-core/src/domain/mod.rs`

**Interfaces:**
- Consumes: `latency_analysis::spec::{Marker, MarkerMode, LatencyAnalysisSpec, StageSpec}`、`latency_analysis::marker::MarkerMatcher`、`latency_analysis::analyzer::LatencyAnalyzer`、`latency_analysis::result::RequestAnalysis`、`request_split::sequential_stack::SequentialStackSplitter`、`log_workspace::log_entry::LogEntry`、`log_workspace::log_extension::LogExtension`。
- Produces: `HealthCheckSpec`、`StageThreshold`、`HealthReport`、`HealthSummary`、`SystemError`、`SlowStage`、`SlowRequest`、`HealthCheckAnalyzer::check(spec: &HealthCheckSpec, entries: &[LogEntry]) -> Result<HealthReport, String>`。

- [ ] **Step 1: 写失败测试**

创建 `crates/log-core/src/domain/health_check/analyzer.rs`，先只写测试模块。测试构造 `LogEntry`（含 `ext: LogExtension::Edge`）与 `HealthCheckSpec`，调用 `HealthCheckAnalyzer::check` 断言三类行为。

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::latency_analysis::spec::{LatencyAnalysisSpec, Marker, MarkerMode, StageSpec};
    use crate::domain::log_workspace::log_entry::LogEntry;
    use crate::domain::log_workspace::log_extension::{EdgeExt, LogExtension};

    fn entry(line_no: u64, timestamp: &str, level: &str, tag: &str, msg: &str) -> LogEntry {
        LogEntry {
            line_no,
            timestamp: timestamp.to_string(),
            level: level.to_string(),
            message: msg.to_string(),
            raw: msg.to_string(),
            ext: LogExtension::Edge(EdgeExt {
                pid: 0,
                tid: 0,
                app_prefix: "A00010".to_string(),
                package_name: "com.demo.app".to_string(),
                tag: tag.to_string(),
            }),
        }
    }

    fn kw(pattern: &str) -> Marker {
        Marker { pattern: pattern.to_string(), mode: MarkerMode::Keyword }
    }

    fn stage(id: &str, start: &str, end: &str) -> StageSpec {
        StageSpec {
            id: id.to_string(),
            starts: vec![kw(start)],
            ends: vec![kw(end)],
        }
    }

    fn spec(error_filters: Vec<Marker>, thresholds: Vec<StageThreshold>) -> HealthCheckSpec {
        HealthCheckSpec {
            error_filters,
            latency: LatencyAnalysisSpec {
                request_starts: vec![kw("request started")],
                intercept_ends: vec![],
                process_stages: vec![stage("STAGE-A", "request started", "request completed")],
            },
            stage_thresholds: thresholds,
        }
    }

    fn entries_with_errors_and_latency() -> Vec<LogEntry> {
        vec![
            entry(1, "2026-07-05 10:00:00.000", "E", "Order", "fatal: out of memory"),
            entry(2, "2026-07-05 10:00:00.010", "I", "Order", "request started"),
            entry(3, "2026-07-05 10:00:00.400", "I", "Order", "request completed"),
            entry(4, "2026-07-05 10:00:00.500", "E", "Order", "another fatal: oom"),
        ]
    }

    #[test]
    fn check_scans_error_entries_and_sets_tag_level() {
        let entries = entries_with_errors_and_latency();
        let result = HealthCheckAnalyzer::check(&spec(vec![kw("fatal")], vec![]), &entries).unwrap();
        assert_eq!(result.system_errors.len(), 2);
        assert_eq!(result.system_errors[0].level, "E");
        assert_eq!(result.system_errors[0].tag, "Order");
        assert_eq!(result.system_errors[0].message, "fatal: out of memory");
    }

    #[test]
    fn check_empty_error_filters_yields_no_system_errors() {
        let result = HealthCheckAnalyzer::check(
            &spec(vec![], vec![]),
            &entries_with_errors_and_latency(),
        ).unwrap();
        assert_eq!(result.system_errors.len(), 0);
    }

    #[test]
    fn check_marks_slow_stage_and_aggregates_by_request() {
        let entries = vec![
            entry(1, "2026-07-05 10:00:00.000", "I", "Order", "request started"),
            entry(2, "2026-07-05 10:00:00.500", "I", "Order", "request completed"),
        ];
        let thresholds = vec![StageThreshold { stage_id: "STAGE-A".to_string(), threshold_ms: 300 }];
        let result = HealthCheckAnalyzer::check(&spec(vec![], thresholds), &entries).unwrap();
        assert_eq!(result.slow_requests.len(), 1);
        assert_eq!(result.slow_requests[0].request_id, "2026-07-05 10:00:00.000");
        assert_eq!(result.slow_requests[0].slow_stages.len(), 1);
        assert_eq!(result.slow_requests[0].slow_stages[0].stage_id, "STAGE-A");
        assert_eq!(result.slow_requests[0].slow_stages[0].duration_ms, 500);
    }

    #[test]
    fn check_stage_at_threshold_is_not_slow() {
        let entries = vec![
            entry(1, "2026-07-05 10:00:00.000", "I", "Order", "request started"),
            entry(2, "2026-07-05 10:00:00.300", "I", "Order", "request completed"),
        ];
        let thresholds = vec![StageThreshold { stage_id: "STAGE-A".to_string(), threshold_ms: 300 }];
        let result = HealthCheckAnalyzer::check(&spec(vec![], thresholds), &entries).unwrap();
        assert_eq!(result.slow_requests.len(), 0);
    }

    #[test]
    fn check_summary_counts() {
        let entries = vec![
            entry(1, "2026-07-05 10:00:00.000", "E", "Order", "fatal: oom"),
            entry(2, "2026-07-05 10:00:00.010", "I", "Order", "request started"),
            entry(3, "2026-07-05 10:00:00.500", "I", "Order", "request completed"),
        ];
        let thresholds = vec![StageThreshold { stage_id: "STAGE-A".to_string(), threshold_ms: 300 }];
        let result = HealthCheckAnalyzer::check(&spec(vec![kw("fatal")], thresholds), &entries).unwrap();
        assert_eq!(result.summary.error_count, 1);
        assert_eq!(result.summary.total_request_count, 1);
        assert_eq!(result.summary.slow_request_count, 1);
        assert_eq!(result.summary.slow_stage_count, 1);
    }
}
```

- [ ] **Step 2: 运行测试验证失败**

Run: `cargo test -p log-core health_check`
Expected: 编译失败——`health_check` 模块、`HealthCheckAnalyzer`、`HealthCheckSpec`、`StageThreshold` 等类型不存在。

- [ ] **Step 3: 写类型契约**

创建 `crates/log-core/src/domain/health_check/spec.rs`：

```rust
//! 健康体检输入契约：错误过滤器 + 时延分析输入 + 慢阈值。

use crate::domain::latency_analysis::spec::{LatencyAnalysisSpec, Marker};

/// 某个 stage 的慢阈值（毫秒）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StageThreshold {
    pub stage_id: String,
    pub threshold_ms: i64,
}

/// 一次健康体检的全部输入。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HealthCheckSpec {
    /// 错误过滤器：纯 pattern 匹配日志 raw 行，命中即系统异常。
    pub error_filters: Vec<Marker>,
    /// 复用的时延分析输入（请求拆分 + 拦截 + 阶段）。
    pub latency: LatencyAnalysisSpec,
    /// 慢阈值表；空向量 = 不判慢。
    pub stage_thresholds: Vec<StageThreshold>,
}
```

创建 `crates/log-core/src/domain/health_check/result.rs`：

```rust
//! 健康体检结果契约（camelCase 序列化，与前端对齐）。

use serde::Serialize;

/// 一条系统异常。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemError {
    pub timestamp: String,
    pub level: String,
    pub tag: String,
    pub message: String,
}

/// 一个慢阶段样本。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlowStage {
    pub stage_id: String,
    pub duration_ms: i64,
    pub threshold_ms: i64,
}

/// 一个含慢阶段的请求。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlowRequest {
    pub request_id: String,
    pub total_ms: i64,
    pub slow_stages: Vec<SlowStage>,
}

/// 汇总计数。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthSummary {
    pub error_count: usize,
    pub slow_request_count: usize,
    pub slow_stage_count: usize,
    pub total_request_count: usize,
}

/// 健康体检结果。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub summary: HealthSummary,
    pub system_errors: Vec<SystemError>,
    pub slow_requests: Vec<SlowRequest>,
}
```

创建 `crates/log-core/src/domain/health_check/mod.rs`：

```rust
//! 健康体检：一次性体检，产出系统异常与慢阶段清单。

pub mod analyzer;
pub mod result;
pub mod spec;
```

- [ ] **Step 4: 写分析器实现**

创建 `crates/log-core/src/domain/health_check/analyzer.rs`（在 Step 1 的测试模块之上补实现）：

```rust
//! 健康体检分析器：错误扫描 + 时延复用 + 慢阈值判定。

use crate::domain::health_check::result::{
    HealthReport, HealthSummary, SlowRequest, SlowStage, SystemError,
};
use crate::domain::health_check::spec::{HealthCheckSpec, StageThreshold};
use crate::domain::latency_analysis::analyzer::LatencyAnalyzer;
use crate::domain::latency_analysis::marker::MarkerMatcher;
use crate::domain::latency_analysis::result::RequestAnalysis;
use crate::domain::log_workspace::log_entry::LogEntry;
use crate::domain::log_workspace::log_extension::LogExtension;
use crate::domain::request_split::sequential_stack::SequentialStackSplitter;

fn clean_line(raw: &str) -> &str {
    raw.trim_end_matches(|c: char| c == '\n' || c == '\r')
}

fn tag_of(entry: &LogEntry) -> String {
    match &entry.ext {
        LogExtension::Edge(edge) => edge.tag.clone(),
    }
}

fn scan_errors(matchers: &[MarkerMatcher], entries: &[LogEntry]) -> Vec<SystemError> {
    let mut errors = Vec::new();
    for entry in entries {
        let line = clean_line(&entry.raw);
        if matchers.iter().any(|m| m.matches(line)) {
            errors.push(SystemError {
                timestamp: entry.timestamp.clone(),
                level: entry.level.clone(),
                tag: tag_of(entry),
                message: entry.message.clone(),
            });
        }
    }
    errors
}

fn judge_slow(requests: &[RequestAnalysis], thresholds: &[StageThreshold]) -> Vec<SlowRequest> {
    let threshold_by_stage: std::collections::HashMap<&str, i64> = thresholds
        .iter()
        .map(|t| (t.stage_id.as_str(), t.threshold_ms))
        .collect();

    requests
        .iter()
        .filter_map(|req| {
            let slow_stages: Vec<SlowStage> = req
                .samples
                .iter()
                .filter_map(|s| {
                    threshold_by_stage.get(s.stage_id.as_str()).and_then(|&t| {
                        if s.duration_ms > t {
                            Some(SlowStage {
                                stage_id: s.stage_id.clone(),
                                duration_ms: s.duration_ms,
                                threshold_ms: t,
                            })
                        } else {
                            None
                        }
                    })
                })
                .collect();
            if slow_stages.is_empty() {
                None
            } else {
                Some(SlowRequest {
                    request_id: req.id.clone(),
                    total_ms: req.total_ms,
                    slow_stages,
                })
            }
        })
        .collect()
}

pub struct HealthCheckAnalyzer;

impl HealthCheckAnalyzer {
    pub fn check(spec: &HealthCheckSpec, entries: &[LogEntry]) -> Result<HealthReport, String> {
        let error_matchers: Vec<MarkerMatcher> = spec
            .error_filters
            .iter()
            .map(MarkerMatcher::build)
            .collect::<Result<_, _>>()?;
        let system_errors = scan_errors(&error_matchers, entries);

        let splitter = SequentialStackSplitter::new(
            spec.latency.request_starts.clone(),
            spec.latency.intercept_ends.clone(),
        )?;
        let requests = splitter.split(entries);
        let latency = LatencyAnalyzer::analyze(&spec.latency.process_stages, &requests)?;

        let slow_requests = judge_slow(&latency.requests, &spec.stage_thresholds);

        let summary = HealthSummary {
            error_count: system_errors.len(),
            slow_request_count: slow_requests.len(),
            slow_stage_count: slow_requests.iter().map(|r| r.slow_stages.len()).sum(),
            total_request_count: latency.requests.len(),
        };

        Ok(HealthReport {
            summary,
            system_errors,
            slow_requests,
        })
    }
}
```

修改 `crates/log-core/src/domain/mod.rs`，在 `pub mod request_split;` 之后加：

```rust
pub mod health_check;
```

- [ ] **Step 5: 运行测试验证通过**

Run: `cargo test -p log-core health_check`
Expected: 5 个测试全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add crates/log-core/src/domain/health_check crates/log-core/src/domain/mod.rs
git commit -m "feat: 健康体检领域模块（错误扫描 + 慢阶段判定）"
```

---

### Task 2: 应用层编排 + server 端点 + 集成测试

**Files:**
- Modify: `crates/log-core/src/application/log_workspace_service.rs`
- Modify: `crates/server/src/main.rs`
- Test: `crates/server/tests/health_check_integration.rs`

**Interfaces:**
- Consumes: Task 1 的 `HealthCheckAnalyzer`、`HealthCheckSpec`、`HealthReport`、`StageThreshold`。
- Produces: `LogWorkspaceService::health_check(dir: &str, range: &TimeRange, spec: &HealthCheckSpec) -> Result<HealthReport, String>`；HTTP `POST /api/health/check`。

- [ ] **Step 1: 写应用层编排**

在 `crates/log-core/src/application/log_workspace_service.rs` 顶部 import 加：

```rust
use crate::domain::health_check::analyzer::HealthCheckAnalyzer;
use crate::domain::health_check::result::HealthReport;
use crate::domain::health_check::spec::HealthCheckSpec;
```

在 `analyze` 方法之后新增：

```rust
    /// 健康体检：读一次条目，复用拆分与时延分析，产出错误清单 + 慢请求清单。
    pub fn health_check(
        &self,
        dir: &str,
        range: &TimeRange,
        spec: &HealthCheckSpec,
    ) -> Result<HealthReport, String> {
        let entries = self.source.entries(dir, range)?;
        HealthCheckAnalyzer::check(spec, &entries)
    }
```

- [ ] **Step 2: 写集成测试（先失败）**

创建 `crates/server/tests/health_check_integration.rs`。测试用公开的 `server::app::app()`（默认 `AppState`，复用默认 `RipgrepLogSource`），写一个临时 `.log` 文件（含一条报错 + 一次慢请求），调用 `/api/health/check`，解析响应 JSON 断言。

```rust
use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::Value;
use server::app::app;
use tower::ServiceExt;

fn temporary_log_dir() -> std::path::PathBuf {
    std::env::temp_dir().join(format!("health-check-integration-{}", std::process::id()))
}

#[tokio::test]
async fn health_check_endpoint_returns_errors_and_slow_requests() {
    let dir = temporary_log_dir();
    std::fs::create_dir_all(&dir).expect("create temp log dir");
    // LogcatParser 格式：<lineNo>,<date> <time> <pid> <tid> <level> <appPrefix>/<package>/<tag>: <message>
    std::fs::write(
        dir.join("demo.log"),
        "1,2026-07-05 10:00:00.000 1 1 E A00010/com.demo.app/Order: fatal: oom\n\
         2,2026-07-05 10:00:00.100 1 1 I A00010/com.demo.app/Order: request started\n\
         3,2026-07-05 10:00:00.500 1 1 I A00010/com.demo.app/Order: request completed\n",
    )
    .expect("write log");

    let body = serde_json::json!({
        "path": dir.to_string_lossy(),
        "errorFilters": [{ "pattern": "fatal", "mode": "keyword" }],
        "requestStarts": [{ "pattern": "request started", "mode": "keyword" }],
        "interceptEnds": [],
        "processStages": [{
            "id": "STAGE-A",
            "startMarkers": [{ "pattern": "request started", "mode": "keyword" }],
            "endMarkers": [{ "pattern": "request completed", "mode": "keyword" }]
        }],
        "stageThresholds": [{ "stageId": "STAGE-A", "thresholdMs": 300 }]
    });

    let response = app()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/health/check")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .expect("build request"),
        )
        .await
        .expect("call endpoint");

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("read body");
    let report: Value = serde_json::from_slice(&bytes).expect("parse health report");

    assert_eq!(report["summary"]["errorCount"].as_u64(), Some(1));
    assert_eq!(report["summary"]["totalRequestCount"].as_u64(), Some(1));
    assert_eq!(report["summary"]["slowRequestCount"].as_u64(), Some(1));
    assert_eq!(report["summary"]["slowStageCount"].as_u64(), Some(1));
    assert_eq!(report["systemErrors"][0]["level"].as_str(), Some("E"));
    assert_eq!(report["systemErrors"][0]["tag"].as_str(), Some("Order"));
    assert_eq!(report["slowRequests"][0]["requestId"].as_str(), Some("2026-07-05 10:00:00.100"));
    assert_eq!(report["slowRequests"][0]["totalMs"].as_i64(), Some(400));
    assert_eq!(report["slowRequests"][0]["slowStages"][0]["stageId"].as_str(), Some("STAGE-A"));
    assert_eq!(report["slowRequests"][0]["slowStages"][0]["durationMs"].as_i64(), Some(400));

    std::fs::remove_dir_all(&dir).expect("clean temp dir");
}
```

（本步预期失败原因：`/api/health/check` 路由未注册，返回 404。）

- [ ] **Step 3: 运行测试验证失败**

Run: `cargo test -p server health_check_integration`
Expected: FAIL——`/api/health/check` 路由未注册（404），断言 `StatusCode::OK` 不满足。

- [ ] **Step 4: 加 server DTO 与 handler**

在 `crates/server/src/main.rs` 顶部 import 加：

```rust
use log_core::domain::health_check::result::HealthReport;
use log_core::domain::health_check::spec::{HealthCheckSpec, StageThreshold};
```

在 `AnalyzeRequest` 结构之后加：

```rust
/// 前端 `HealthCheckSpec` 形状。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HealthCheckRequest {
    path: String,
    #[serde(default)]
    start_time: Option<String>,
    #[serde(default)]
    end_time: Option<String>,
    #[serde(default)]
    error_filters: Vec<MarkerDto>,
    #[serde(default)]
    request_starts: Vec<MarkerDto>,
    #[serde(default)]
    intercept_ends: Vec<MarkerDto>,
    process_stages: Vec<StageSpecDto>,
    #[serde(default)]
    stage_thresholds: Vec<StageThresholdDto>,
}

/// 前端 `StageThreshold` 形状。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StageThresholdDto {
    stage_id: String,
    threshold_ms: i64,
}
```

在 `to_spec` 之后加投影函数：

```rust
fn to_health_spec(req: &HealthCheckRequest, request_id: &str) -> HealthCheckSpec {
    const OPERATION: &str = "health.check";
    HealthCheckSpec {
        error_filters: req
            .error_filters
            .iter()
            .map(|marker| to_marker(marker, request_id, OPERATION))
            .collect(),
        latency: LatencyAnalysisSpec {
            request_starts: req
                .request_starts
                .iter()
                .map(|marker| to_marker(marker, request_id, OPERATION))
                .collect(),
            intercept_ends: req
                .intercept_ends
                .iter()
                .map(|marker| to_marker(marker, request_id, OPERATION))
                .collect(),
            process_stages: req
                .process_stages
                .iter()
                .map(|s| StageSpec {
                    id: s.id.clone(),
                    starts: s
                        .start_markers
                        .iter()
                        .map(|marker| to_marker(marker, request_id, OPERATION))
                        .collect(),
                    ends: s
                        .end_markers
                        .iter()
                        .map(|marker| to_marker(marker, request_id, OPERATION))
                        .collect(),
                })
                .collect(),
        },
        stage_thresholds: req
            .stage_thresholds
            .iter()
            .map(|t| StageThreshold {
                stage_id: t.stage_id.clone(),
                threshold_ms: t.threshold_ms,
            })
            .collect(),
    }
}
```

在 `latency_analyze` handler 之后加：

```rust
async fn health_check(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(req): Json<HealthCheckRequest>,
) -> Result<Json<HealthReport>, ApiError> {
    let operation = "health.check";
    let spec = to_health_spec(&req, &request_id.0);
    let range = TimeRange {
        start: req.start_time,
        end: req.end_time,
    };
    match state.service.health_check(&req.path, &range, &spec) {
        Ok(report) => {
            tracing::info!(
                requestId = request_id.0,
                operation,
                errorFilterCount = spec.error_filters.len(),
                stageThresholdCount = spec.stage_thresholds.len(),
                errorCount = report.summary.error_count,
                slowRequestCount = report.summary.slow_request_count,
                "{operation}.response"
            );
            Ok(Json(report))
        }
        Err(error) => Err(ApiError(error)),
    }
}
```

在 `operation_for` 的 match（`/api/latency/analyze` 之后）加：

```rust
        (&Method::POST, "/api/health/check") => "health.check",
```

在 `app_with_state` 的 `Router::new()` 链里，`.route("/api/latency/analyze", post(latency_analyze))` 之后加：

```rust
        .route("/api/health/check", post(health_check))
```

- [ ] **Step 5: 运行测试验证通过**

Run: `cargo test -p server health_check_integration`
Expected: PASS。

- [ ] **Step 6: 全量后端验证 + Commit**

Run: `cargo test --workspace`
Expected: 全部 PASS（含既有时延分析测试，语义未变）。

```bash
git add crates/log-core/src/application/log_workspace_service.rs crates/server/src/main.rs crates/server/tests/health_check_integration.rs
git commit -m "feat: 健康体检端点 /api/health/check"
```

---

### Task 3: 前端规则集扩展（matcher_role + threshold_ms 投影）

**Files:**
- Modify: `src/api/dto.ts`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: 无（纯前端字段扩展）。
- Produces: `RuleRecordDto.matcherRole?: string`、`RuleRecordDto.thresholdMs?: number`；`projectRuleRecords` 把 `matcher_role` / `threshold_ms` 投影到这两个字段，供 Task 4 的 `runHealthCheck` 消费。

- [ ] **Step 1: 扩展 DTO 类型**

在 `src/api/dto.ts` 的 `RuleRecordDto` 里，`endMatcherIds?: string[]` 之后加两个可选字段：

```ts
  /** 健康体检：matcher_role === "error" 时该 matcher 是错误过滤器。 */
  matcherRole?: string
  /** 健康体检：该 stage 的慢阈值（毫秒）。 */
  thresholdMs?: number
```

- [ ] **Step 2: 投影新字段**

在 `src/app/App.tsx` 的 `projectRuleRecords` 中，matchers/stages 层投影返回对象里 `endMatcherIds` 之后加两行（`stringField` 已在该函数作用域内定义）：

```ts
        matcherRole: stringField(fields, 'matcher_role'),
        thresholdMs: typeof fields.threshold_ms === 'number' ? fields.threshold_ms : undefined,
```

- [ ] **Step 3: 运行类型检查与契约测试**

Run: `npm run build`
Expected: 通过（TypeScript 编译无错）。

Run: `npm run test:ui-contract`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/api/dto.ts src/app/App.tsx
git commit -m "feat: 规则集投影 matcher_role 与 threshold_ms"
```

---

### Task 4: 前端健康体检（client + 投影 + 面板）

**Files:**
- Create: `src/api/health-check-client.ts`
- Create: `src/features/health-check/HealthCheckPanel.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: Task 3 的 `RuleRecordDto.matcherRole` / `thresholdMs`；`latency-analysis-client.ts` 的 `LogMarker`、`LatencyStageSpec`。
- Produces: `analyzeHealthCheck(path, spec, timeRange) -> Promise<HealthReport>`；`HealthCheckPanel` 组件；`App.runHealthCheck`；共享投影函数 `buildLatencySpecProjection(rules: RuleRecordDto[]) -> { requestStarts, interceptEnds, stageSpecs }`。

- [ ] **Step 1: 写前端 client**

创建 `src/api/health-check-client.ts`：

```ts
import { postJson } from './http-client'
import type { LogMarker, LatencyStageSpec } from './latency-analysis-client'

export interface StageThreshold {
  stageId: string
  thresholdMs: number
}

export interface SystemError {
  timestamp: string
  level: string
  tag: string
  message: string
}

export interface SlowStage {
  stageId: string
  durationMs: number
  thresholdMs: number
}

export interface SlowRequest {
  requestId: string
  totalMs: number
  slowStages: SlowStage[]
}

export interface HealthSummary {
  errorCount: number
  slowRequestCount: number
  slowStageCount: number
  totalRequestCount: number
}

export interface HealthReport {
  summary: HealthSummary
  systemErrors: SystemError[]
  slowRequests: SlowRequest[]
}

export interface HealthCheckSpec {
  errorFilters: LogMarker[]
  requestStarts: LogMarker[]
  interceptEnds: LogMarker[]
  processStages: LatencyStageSpec[]
  stageThresholds: StageThreshold[]
}

export async function analyzeHealthCheck(
  path: string,
  spec: HealthCheckSpec,
  timeRange?: { startTime?: string; endTime?: string },
): Promise<HealthReport> {
  return postJson<HealthReport>('/api/health/check', {
    path,
    startTime: timeRange?.startTime,
    endTime: timeRange?.endTime,
    errorFilters: spec.errorFilters,
    requestStarts: spec.requestStarts,
    interceptEnds: spec.interceptEnds,
    processStages: spec.processStages,
    stageThresholds: spec.stageThresholds,
  })
}
```

- [ ] **Step 2: 抽取共享时延投影函数**

在 `src/app/App.tsx` 中，把 `runLatencyAnalysis` 里的投影逻辑抽取为模块级函数（放在 `filterRulesByScenario` 之后）。抽出后 `runLatencyAnalysis` 与后续 `runHealthCheck` 共用：

```ts
type LatencySpecProjection = {
  requestStarts: LogMarker[]
  interceptEnds: LogMarker[]
  stageSpecs: LatencyStageSpec[]
}

function buildLatencySpecProjection(rules: RuleRecordDto[]): LatencySpecProjection {
  const matchers = new Map(
    rules.filter((rule) => rule.recordType === 'matcher').map((rule) => [rule.id, rule] as const),
  )
  const enabledStages = rules.filter((rule) => rule.enabled && rule.recordType === 'stage')
  const toMarker = (id: string): LogMarker | undefined => {
    const matcher = matchers.get(id)
    return matcher?.pattern
      ? { pattern: matcher.pattern, mode: matcher.matchType === 'regex' ? 'regex' : 'keyword' }
      : undefined
  }

  // start/end 均支持多个 matcher：把单个 id（简写）与数组 id 合并去重。
  const startMatcherIdsOf = (stage: RuleRecordDto): string[] => {
    const ids: string[] = []
    if (stage.startMatcherId) ids.push(stage.startMatcherId)
    for (const id of stage.startMatcherIds ?? []) {
      if (id && !ids.includes(id)) ids.push(id)
    }
    return ids
  }
  const endMatcherIdsOf = (stage: RuleRecordDto): string[] => {
    const ids: string[] = []
    if (stage.endMatcherId) ids.push(stage.endMatcherId)
    for (const id of stage.endMatcherIds ?? []) {
      if (id && !ids.includes(id)) ids.push(id)
    }
    return ids
  }

  // 拆分点：flow 级 order=1 聚合分支（非拦截）的起点 matcher。
  const requestStartStage = enabledStages.find(
    (stage) => stage.flowId && stage.order === 1 && stage.kind !== 'intercept' && startMatcherIdsOf(stage).length > 0,
  )
  const requestStarts = requestStartStage
    ? startMatcherIdsOf(requestStartStage)
        .map(toMarker)
        .filter((marker): marker is LogMarker => marker !== undefined)
    : []

  // 拦截 ends：kind=intercept 的 end_matcher_ids 逐条展开。
  const interceptEnds: LogMarker[] = []
  for (const stage of enabledStages) {
    if (stage.kind !== 'intercept' || !stage.endMatcherIds) continue
    for (const id of stage.endMatcherIds) {
      const marker = toMarker(id)
      if (marker) interceptEnds.push(marker)
    }
  }

  // process 级 + flow 级 stage：产真实时延样本，每个 stage 只取第一对 start/end。
  const stageSpecs: LatencyStageSpec[] = []
  for (const stage of enabledStages) {
    if (stage.kind === 'intercept') continue
    if (!stage.processId && !stage.flowId) continue
    const startMarkers = startMatcherIdsOf(stage)
      .map(toMarker)
      .filter((marker): marker is LogMarker => marker !== undefined)
    if (startMarkers.length === 0) continue
    const endMarkers = endMatcherIdsOf(stage)
      .map(toMarker)
      .filter((marker): marker is LogMarker => marker !== undefined)
    if (endMarkers.length === 0) continue
    stageSpecs.push({ id: stage.id, startMarkers, endMarkers })
  }

  return { requestStarts, interceptEnds, stageSpecs }
}
```

将 `runLatencyAnalysis` 里的内联投影替换为：

```ts
    const { requestStarts, interceptEnds, stageSpecs } = buildLatencySpecProjection(scenarioRules)

    if (requestStarts.length === 0 || stageSpecs.length === 0) {
      setLatencyAnalysisMessage('未找到 flow 级请求拆分点或 stage 规则')
      return
    }

    setLatencyAnalysisMessage('正在分析…')
    try {
      const result = await analyzeLatencyStream(logFolderPath, { requestStarts, interceptEnds, processStages: stageSpecs })
      setLatencyAnalysis(result)
      setLatencyAnalysisRunId((value) => value + 1)
      setLatencyAnalysisMessage(`已分析 ${result.requests.length} 个请求 · ${result.stats.sampleCount} 个阶段样本`)
    } catch (error) {
      setLatencyAnalysisMessage(`分析失败：${error instanceof Error ? error.message : String(error)}`)
    }
```

（`LogMarker` / `LatencyStageSpec` 已从 `latency-analysis-client` import；`RuleRecordDto` 已从 `dto` import。）

- [ ] **Step 3: 写问题提示面板**

创建 `src/features/health-check/HealthCheckPanel.tsx`：

```tsx
import type { HealthReport } from '../../api/health-check-client'

interface Props {
  report: HealthReport | null
  message: string
  onCheck: () => void
}

export default function HealthCheckPanel({ report, message, onCheck }: Props) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <h2>问题提示</h2>
        <span>系统异常 · 时延异常</span>
        <button type="button" className="ghost-button" onClick={onCheck}>
          开始体检
        </button>
      </div>
      <p className="analysis-message">{message}</p>

      {report ? (
        <>
          <div className="health-summary">
            <div className="stat">系统异常 <strong>{report.summary.errorCount}</strong></div>
            <div className="stat">慢请求 <strong>{report.summary.slowRequestCount}</strong></div>
            <div className="stat">慢阶段 <strong>{report.summary.slowStageCount}</strong></div>
            <div className="stat">体检请求 <strong>{report.summary.totalRequestCount}</strong></div>
          </div>

          <h3>系统异常</h3>
          {report.systemErrors.length === 0 ? (
            <p>无</p>
          ) : (
            <div className="rule-list">
              {report.systemErrors.map((error, index) => (
                <div key={index} className="rule-item">
                  <div className="rule-head">
                    <strong>{error.timestamp}</strong>
                    <span className="severity exception">{error.level}</span>
                  </div>
                  <p>[{error.tag}] {error.message}</p>
                </div>
              ))}
            </div>
          )}

          <h3>时延异常（慢阶段）</h3>
          {report.slowRequests.length === 0 ? (
            <p>无</p>
          ) : (
            <div className="rule-list">
              {report.slowRequests.map((request) => (
                <div key={request.requestId} className="rule-item">
                  <div className="rule-head">
                    <strong>{request.requestId}</strong>
                    <span className="severity warning">总耗时 {request.totalMs}ms</span>
                  </div>
                  {request.slowStages.map((stage) => (
                    <p key={stage.stageId}>
                      {stage.stageId}：{stage.durationMs}ms（阈值 {stage.thresholdMs}ms）
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p>点击「开始体检」对当前日志做一次健康检查。</p>
      )}
    </section>
  )
}
```

- [ ] **Step 4: 接入 App 状态与投影**

在 `src/app/App.tsx` 中：

1. 改 import（移除 `issueRules`）：

```ts
import { latencyResult } from './app-state'
```

2. 加 import：

```ts
import HealthCheckPanel from '../features/health-check/HealthCheckPanel'
import { analyzeHealthCheck, type HealthReport } from '../api/health-check-client'
```

3. 新增状态（`latencyAnalysis` 附近）：

```ts
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null)
  const [healthMessage, setHealthMessage] = useState('等待体检')
```

4. 新增 `runHealthCheck`（在 `runLatencyAnalysis` 之后、`exportLatencyCsv` 之前）：

```ts
  const runHealthCheck = async () => {
    const activeExists =
      activeRuleVersion !== null &&
      rulePackages.some((item) => item.ruleSetId === activeRuleVersion.ruleSetId && item.version === activeRuleVersion.version)

    if (!activeExists) {
      setHealthMessage('请先在规则配置页设置生效版本')
      return
    }
    if (!logFolderPath.trim()) {
      setHealthMessage('请先选择日志文件夹')
      return
    }
    rememberFolder(logFolderPath)

    const { requestStarts, interceptEnds, stageSpecs } = buildLatencySpecProjection(scenarioRules)
    if (requestStarts.length === 0 || stageSpecs.length === 0) {
      setHealthMessage('未找到 flow 级请求拆分点或 stage 规则')
      return
    }

    const errorFilters: LogMarker[] = scenarioRules
      .filter((rule) => rule.recordType === 'matcher' && rule.matcherRole === 'error' && !!rule.pattern)
      .map((rule) => ({ pattern: rule.pattern, mode: rule.matchType === 'regex' ? 'regex' : 'keyword' }))
    const stageThresholds = scenarioRules
      .filter((rule) => rule.recordType === 'stage' && rule.thresholdMs != null)
      .map((rule) => ({ stageId: rule.id, thresholdMs: rule.thresholdMs as number }))

    const { startTime, endTime } = parseTimeRange(queryDraft.timeRange)
    setHealthMessage('正在体检…')
    try {
      const report = await analyzeHealthCheck(
        logFolderPath,
        { errorFilters, requestStarts, interceptEnds, processStages: stageSpecs, stageThresholds },
        { startTime, endTime },
      )
      setHealthReport(report)
      setHealthMessage(`体检完成：${report.summary.errorCount} 条异常 · ${report.summary.slowRequestCount} 个慢请求`)
    } catch (error) {
      setHealthMessage(`体检失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
```

5. 替换 `issue-tips` tab 的静态渲染块为：

```tsx
      {activeTabId === 'issue-tips' ? (
        <HealthCheckPanel report={healthReport} message={healthMessage} onCheck={() => void runHealthCheck()} />
      ) : null}
```

- [ ] **Step 5: 运行构建与契约测试**

Run: `npm run build`
Expected: 通过。

Run: `npm run test:ui-contract`
Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add src/api/health-check-client.ts src/features/health-check/HealthCheckPanel.tsx src/app/App.tsx
git commit -m "feat: 前端问题提示页接入健康体检"
```

---

## Plan Self-Review

- **Spec coverage**: Task 1 覆盖错误扫描 + 慢判定 + 汇总（spec 的 analyzer/result/spec 节）；Task 2 覆盖应用层编排 + 端点（spec 的应用层/端点节）+ 集成测试（验收标准）；Task 3 覆盖规则集扩展（matcher_role/threshold_ms 字段）；Task 4 覆盖前端 client + 投影 + 面板（spec 前端节）。日志丢失过滤明确排除（spec 已标注本期不做）。
- **Placeholder scan**: 无 TBD/TODO；每个实现步骤含完整代码；测试步骤含实际测试代码。
- **Type consistency**: 后端 `StageThreshold { stage_id, threshold_ms }` / `HealthCheckSpec { error_filters, latency, stage_thresholds }` / `HealthReport { summary, system_errors, slow_requests }` 在 Task 1、2、集成测试中命名一致；前端 camelCase `stageId` / `thresholdMs` / `errorFilters` / `requestStarts` / `processStages` / `stageThresholds` 在 Task 3、4 与 client DTO 一致；`LatencyStageSpec` 复用现有 `{ id, startMarkers, endMarkers }` 形状（已核验 `latency-analysis-client.ts`）。
- **接口核验**: 集成测试改用公开 `server::app::app()`（不再引用私有 `AppState`）；日志行采用 `LogcatParser` 实际格式；`SequentialStackSplitter` 的 `Request.id` = 起始时间戳（已核验）。
