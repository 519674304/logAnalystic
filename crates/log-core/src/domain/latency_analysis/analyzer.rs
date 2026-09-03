//! 时延分析核心：在请求队列上做 stage 匹配与统计（与来源无关）。

use crate::domain::latency_analysis::marker::MarkerMatcher;
use crate::domain::latency_analysis::result::{
    LatencyAnalysis, LatencyStatistics, RequestAnalysis, StageSample,
};
use crate::domain::latency_analysis::spec::StageSpec;
use crate::domain::latency_analysis::timestamp::timestamp_to_ms;
use crate::domain::log_workspace::log_entry::LogEntry;
use crate::domain::request_split::Request;

fn clean_line(raw: &str) -> &str {
    raw.trim_end_matches(|c: char| c == '\n' || c == '\r')
}

struct StageRule {
    stage_id: String,
    starts: Vec<MarkerMatcher>,
    ends: Vec<MarkerMatcher>,
}

/// 数组顺序优先：依次检查 matchers，返回第一个有命中的 matcher 的首次命中位置。
/// 返回值包含请求内条目位置，以便结束边界只能选择开始边界之后的日志。
fn find_priority_match(
    matchers: &[MarkerMatcher],
    entries: &[LogEntry],
) -> Option<(usize, i64, String)> {
    for matcher in matchers {
        for (index, entry) in entries.iter().enumerate() {
            let line = clean_line(&entry.raw);
            if let Some(ts_ms) = timestamp_to_ms(&entry.timestamp) {
                if matcher.matches(line) {
                    return Some((index, ts_ms, entry.timestamp.clone()));
                }
            }
        }
    }
    None
}

/// 与 `find_priority_match` 相同的 matcher 优先级，但只接受开始边界之后、时间不早于开始的结束日志。
fn find_priority_match_after(
    matchers: &[MarkerMatcher],
    entries: &[LogEntry],
    start_index: usize,
    start_ts_ms: i64,
) -> Option<(i64, String)> {
    for matcher in matchers {
        for (index, entry) in entries.iter().enumerate() {
            if index <= start_index {
                continue;
            }
            let line = clean_line(&entry.raw);
            if let Some(ts_ms) = timestamp_to_ms(&entry.timestamp) {
                if ts_ms >= start_ts_ms && matcher.matches(line) {
                    return Some((ts_ms, entry.timestamp.clone()));
                }
            }
        }
    }
    None
}

fn analyze_request(rules: &[StageRule], req: &Request) -> RequestAnalysis {
    let mut samples: Vec<StageSample> = Vec::new();
    let mut timestamps: Vec<i64> = Vec::new();

    for rule in rules {
        let start_ts = find_priority_match(&rule.starts, &req.entries);
        if let Some(start) = start_ts {
            let end_ts = find_priority_match_after(&rule.ends, &req.entries, start.0, start.1);
            if let Some(end) = end_ts {
                let duration_ms = end.0 - start.1;
                samples.push(StageSample {
                    stage_id: rule.stage_id.clone(),
                    start_timestamp: start.2,
                    end_timestamp: end.1,
                    duration_ms,
                });
                timestamps.push(start.1);
                timestamps.push(end.0);
            }
        }
    }

    let total_ms = if timestamps.is_empty() {
        0
    } else {
        timestamps.iter().copied().max().unwrap() - timestamps.iter().copied().min().unwrap()
    };

    RequestAnalysis {
        id: req.id.clone(),
        total_ms,
        samples,
    }
}

fn compute_stats(durations: &[i64]) -> LatencyStatistics {
    if durations.is_empty() {
        return LatencyStatistics {
            sample_count: 0,
            average_ms: 0,
            p90_ms: 0,
            max_ms: 0,
        };
    }
    let mut sorted = durations.to_vec();
    sorted.sort_unstable();
    let n = durations.len();
    let sum: i64 = durations.iter().sum();
    let average_ms = (sum as f64 / n as f64).round() as i64;
    let p90_index = ((n * 9 + 9) / 10).saturating_sub(1).min(n - 1);
    LatencyStatistics {
        sample_count: n,
        average_ms,
        p90_ms: sorted[p90_index],
        max_ms: sorted[n - 1],
    }
}

pub struct LatencyAnalyzer;

impl LatencyAnalyzer {
    pub fn analyze(stages: &[StageSpec], requests: &[Request]) -> Result<LatencyAnalysis, String> {
        let rules: Vec<StageRule> = stages
            .iter()
            .map(|s| {
                let starts = s
                    .starts
                    .iter()
                    .map(MarkerMatcher::build)
                    .collect::<Result<Vec<_>, _>>()?;
                let ends = s
                    .ends
                    .iter()
                    .map(MarkerMatcher::build)
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(StageRule {
                    stage_id: s.id.clone(),
                    starts,
                    ends,
                })
            })
            .collect::<Result<Vec<_>, String>>()?;

        let requests: Vec<RequestAnalysis> = requests
            .iter()
            .map(|r| analyze_request(&rules, r))
            .collect();
        let durations: Vec<i64> = requests
            .iter()
            .flat_map(|r| r.samples.iter().map(|s| s.duration_ms))
            .collect();
        let stats = compute_stats(&durations);

        Ok(LatencyAnalysis { requests, stats })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::latency_analysis::spec::{Marker, MarkerMode, StageSpec};
    use crate::domain::log_workspace::log_entry::LogEntry;
    use crate::domain::log_workspace::log_extension::{EdgeExt, LogExtension};
    use crate::domain::request_split::Request;

    fn entry(line_no: u64, timestamp: &str, msg: &str) -> LogEntry {
        LogEntry {
            line_no,
            timestamp: timestamp.to_string(),
            level: "I".to_string(),
            message: msg.to_string(),
            raw: msg.to_string(),
            ext: LogExtension::Edge(EdgeExt {
                pid: 0,
                tid: 0,
                app_prefix: "A00010".to_string(),
                package_name: "com.demo.app".to_string(),
                tag: "Order".to_string(),
            }),
        }
    }

    fn req(id: &str, entries: Vec<LogEntry>) -> Request {
        Request {
            id: id.to_string(),
            entries,
        }
    }

    fn kw(pattern: &str) -> Marker {
        Marker {
            pattern: pattern.to_string(),
            mode: MarkerMode::Keyword,
        }
    }

    fn spec() -> Vec<StageSpec> {
        vec![
            StageSpec {
                id: "STAGE-A".to_string(),
                starts: vec![kw("request started")],
                ends: vec![kw("start parallel subprocesses")],
            },
            StageSpec {
                id: "STAGE-D".to_string(),
                starts: vec![kw("all subprocesses completed")],
                ends: vec![kw("request completed successfully")],
            },
        ]
    }

    #[test]
    fn computes_stage_latency_per_request() {
        let requests = vec![req(
            "2026-07-05 10:00:00.000",
            vec![
                entry(1, "2026-07-05 10:00:00.000", "request started"),
                entry(2, "2026-07-05 10:00:00.040", "start parallel subprocesses"),
                entry(3, "2026-07-05 10:00:00.085", "all subprocesses completed"),
                entry(
                    4,
                    "2026-07-05 10:00:00.095",
                    "request completed successfully",
                ),
            ],
        )];
        let result = LatencyAnalyzer::analyze(&spec(), &requests).unwrap();
        assert_eq!(result.requests.len(), 1);
        let r0 = &result.requests[0];
        assert_eq!(r0.id, "2026-07-05 10:00:00.000");
        assert_eq!(r0.total_ms, 95);
        let by_id: std::collections::HashMap<&str, i64> = r0
            .samples
            .iter()
            .map(|s| (s.stage_id.as_str(), s.duration_ms))
            .collect();
        assert_eq!(by_id.get("STAGE-A"), Some(&40));
        assert_eq!(by_id.get("STAGE-D"), Some(&10));
        assert_eq!(result.stats.sample_count, 2);
        assert_eq!(result.stats.max_ms, 40);
    }

    #[test]
    fn stage_takes_first_pair_only() {
        let requests = vec![req(
            "r1",
            vec![
                entry(1, "2026-07-05 10:00:00.000", "step begin"),
                entry(2, "2026-07-05 10:00:00.010", "step end"),
                entry(3, "2026-07-05 10:00:00.020", "step begin"),
                entry(4, "2026-07-05 10:00:00.050", "step end"),
            ],
        )];
        let stages = vec![StageSpec {
            id: "STAGE-X".to_string(),
            starts: vec![kw("step begin")],
            ends: vec![kw("step end")],
        }];
        let result = LatencyAnalyzer::analyze(&stages, &requests).unwrap();
        assert_eq!(result.requests[0].samples.len(), 1);
        assert_eq!(result.requests[0].samples[0].duration_ms, 10);
    }

    #[test]
    fn stage_multiple_ends_priority_order() {
        let requests = vec![req(
            "r1",
            vec![
                entry(1, "2026-07-05 10:00:00.000", "step begin"),
                entry(2, "2026-07-05 10:00:00.010", "alt end B"),
                entry(3, "2026-07-05 10:00:00.050", "alt end A"),
            ],
        )];
        // 数组顺序优先：end A 靠前，即使它在日志里更晚（50ms）也用它，而非更早的 B（10ms）。
        let stages = vec![StageSpec {
            id: "STAGE-X".to_string(),
            starts: vec![kw("step begin")],
            ends: vec![kw("alt end A"), kw("alt end B")],
        }];
        let result = LatencyAnalyzer::analyze(&stages, &requests).unwrap();
        assert_eq!(result.requests[0].samples.len(), 1);
        assert_eq!(result.requests[0].samples[0].duration_ms, 50);
    }

    #[test]
    fn stage_multiple_ends_hit_any_one() {
        let requests = vec![req(
            "r1",
            vec![
                entry(1, "2026-07-05 10:00:00.000", "step begin"),
                entry(2, "2026-07-05 10:00:00.040", "alt end B"),
            ],
        )];
        // 只有 end B 出现，end A 未出现；任一命中即结束。
        let stages = vec![StageSpec {
            id: "STAGE-X".to_string(),
            starts: vec![kw("step begin")],
            ends: vec![kw("alt end A"), kw("alt end B")],
        }];
        let result = LatencyAnalyzer::analyze(&stages, &requests).unwrap();
        assert_eq!(result.requests[0].samples.len(), 1);
        assert_eq!(result.requests[0].samples[0].duration_ms, 40);
    }

    #[test]
    fn stage_multiple_starts_priority_order() {
        let requests = vec![req(
            "r1",
            vec![
                entry(1, "2026-07-05 10:00:00.000", "step begin B"),
                entry(2, "2026-07-05 10:00:00.040", "step begin A"),
                entry(3, "2026-07-05 10:00:00.050", "step end"),
            ],
        )];
        // 数组顺序优先：start A 靠前，即使它在日志里更晚（40ms）也用它，而非更早的 B（0ms）。
        let stages = vec![StageSpec {
            id: "STAGE-X".to_string(),
            starts: vec![kw("step begin A"), kw("step begin B")],
            ends: vec![kw("step end")],
        }];
        let result = LatencyAnalyzer::analyze(&stages, &requests).unwrap();
        assert_eq!(result.requests[0].samples.len(), 1);
        assert_eq!(result.requests[0].samples[0].duration_ms, 10);
    }

    #[test]
    fn stage_start_fallback_when_first_missing() {
        let requests = vec![req(
            "r1",
            vec![
                entry(1, "2026-07-05 10:00:00.000", "step begin B"),
                entry(2, "2026-07-05 10:00:00.050", "step end"),
            ],
        )];
        // 首选 start A 未出现，fallback 到数组第二个 start B。
        let stages = vec![StageSpec {
            id: "STAGE-X".to_string(),
            starts: vec![kw("step begin A"), kw("step begin B")],
            ends: vec![kw("step end")],
        }];
        let result = LatencyAnalyzer::analyze(&stages, &requests).unwrap();
        assert_eq!(result.requests[0].samples.len(), 1);
        assert_eq!(result.requests[0].samples[0].duration_ms, 50);
    }

    #[test]
    fn stage_uses_first_end_after_its_start() {
        let requests = vec![req(
            "r1",
            vec![
                entry(1, "2026-07-05 10:00:00.000", "step end"),
                entry(2, "2026-07-05 10:00:00.010", "step begin"),
                entry(3, "2026-07-05 10:00:00.040", "step end"),
            ],
        )];
        let stages = vec![StageSpec {
            id: "STAGE-X".to_string(),
            starts: vec![kw("step begin")],
            ends: vec![kw("step end")],
        }];

        let result = LatencyAnalyzer::analyze(&stages, &requests).unwrap();

        assert_eq!(result.requests[0].samples.len(), 1);
        assert_eq!(result.requests[0].samples[0].duration_ms, 30);
    }

    #[test]
    fn stage_without_an_end_after_its_start_does_not_create_a_sample() {
        let requests = vec![req(
            "r1",
            vec![
                entry(1, "2026-07-05 10:00:00.000", "step end"),
                entry(2, "2026-07-05 10:00:00.010", "step begin"),
            ],
        )];
        let stages = vec![StageSpec {
            id: "STAGE-X".to_string(),
            starts: vec![kw("step begin")],
            ends: vec![kw("step end")],
        }];

        let result = LatencyAnalyzer::analyze(&stages, &requests).unwrap();

        assert!(result.requests[0].samples.is_empty());
        assert_eq!(result.stats.sample_count, 0);
    }

    #[test]
    fn compute_stats_p90_and_rounding() {
        let stats = compute_stats(&(1..=20).collect::<Vec<i64>>());
        assert_eq!(stats.sample_count, 20);
        assert_eq!(stats.average_ms, 11);
        assert_eq!(stats.p90_ms, 18);
        assert_eq!(stats.max_ms, 20);
    }

    #[test]
    fn compute_stats_small_n() {
        let stats = compute_stats(&[10, 20, 30, 40, 50]);
        assert_eq!(stats.average_ms, 30);
        assert_eq!(stats.p90_ms, 50);
        assert_eq!(stats.max_ms, 50);
    }

    #[test]
    fn compute_stats_empty() {
        let stats = compute_stats(&[]);
        assert_eq!(
            stats,
            LatencyStatistics {
                sample_count: 0,
                average_ms: 0,
                p90_ms: 0,
                max_ms: 0,
            }
        );
    }
}
