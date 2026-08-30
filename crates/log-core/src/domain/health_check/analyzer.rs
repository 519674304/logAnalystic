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
use crate::domain::request_split::RequestSplitter;

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
