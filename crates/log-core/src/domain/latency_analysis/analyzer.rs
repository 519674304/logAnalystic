//! 端侧栈式时延分析核心算法。
//!
//! 算法镜像前端 TS 原型 `analyzeLatencyStream`：
//! 1. 逐条匹配 marker 收集命中，固定顺序（请求拆分 → 拦截 → process stage 起止）后稳定排序。
//! 2. 栈式拆分：`start` 压栈、`intercept` 弹栈（整请求丢弃）、stage 事件累积到栈顶请求。
//! 3. 结算：每个 stage 只取第一对 start/end 算时延，重复命中丢弃。
//! 4. 汇总所有样本统计 sample_count / average_ms / p90_ms / max_ms。

use regex::Regex;

use crate::domain::latency_analysis::result::{
    LatencyAnalysis, LatencyStatistics, RequestAnalysis, StageSample,
};
use crate::domain::latency_analysis::spec::{LatencyAnalysisSpec, Marker, MarkerMode};
use crate::domain::latency_analysis::timestamp::timestamp_to_ms;
use crate::domain::log_workspace::log_entry::LogEntry;

/// 匹配器：keyword（大小写不敏感包含）或 regex，case_sensitive 恒为 false（与前端一致）。
enum MarkerMatcher {
    Keyword { needle_lower: String },
    Regex(Regex),
}

impl MarkerMatcher {
    fn build(marker: &Marker) -> Result<Self, String> {
        match marker.mode {
            MarkerMode::Keyword => Ok(MarkerMatcher::Keyword {
                needle_lower: marker.pattern.to_lowercase(),
            }),
            MarkerMode::Regex => Regex::new(&marker.pattern)
                .map(MarkerMatcher::Regex)
                .map_err(|e| format!("正则表达式无效: {e}")),
        }
    }

    fn matches(&self, line: &str) -> bool {
        match self {
            MarkerMatcher::Keyword { needle_lower } => {
                line.to_lowercase().contains(needle_lower.as_str())
            }
            MarkerMatcher::Regex(re) => re.is_match(line),
        }
    }
}

/// 命中角色。
#[derive(Debug, Clone)]
enum HitRole {
    Start,
    Intercept,
    StageStart { stage_id: String },
    StageEnd { stage_id: String },
}

/// 一条命中：可比较时间 + 行号 + 原始时间戳 + 角色。
#[derive(Debug, Clone)]
struct TimedHit {
    ts_ms: i64,
    line_no: u64,
    raw_ts: String,
    role: HitRole,
}

/// 一条匹配规则：matcher + 命中角色，收集顺序即 TS `collect` 顺序。
struct Rule {
    matcher: MarkerMatcher,
    role: HitRole,
}

struct StageEvents {
    stage_id: String,
    starts: Vec<(i64, String)>,
    ends: Vec<(i64, String)>,
}

struct OpenRequest {
    start_raw: String,
    stage_events: Vec<StageEvents>,
}

fn clean_line(raw: &str) -> &str {
    raw.trim_end_matches(|c: char| c == '\n' || c == '\r')
}

fn events_mut<'a>(req: &'a mut OpenRequest, stage_id: &str) -> &'a mut StageEvents {
    if let Some(pos) = req.stage_events.iter().position(|e| e.stage_id == stage_id) {
        &mut req.stage_events[pos]
    } else {
        req.stage_events.push(StageEvents {
            stage_id: stage_id.to_string(),
            starts: Vec::new(),
            ends: Vec::new(),
        });
        req.stage_events.last_mut().expect("just pushed")
    }
}

fn finalize(req: &OpenRequest) -> RequestAnalysis {
    let mut samples: Vec<StageSample> = Vec::new();
    let mut timestamps: Vec<i64> = Vec::new();
    for events in &req.stage_events {
        // 每个 stage 只取第一对 start/end，重复命中丢弃。
        if let (Some(start), Some(end)) = (events.starts.first(), events.ends.first()) {
            let duration_ms = (end.0 - start.0).max(0);
            samples.push(StageSample {
                stage_id: events.stage_id.clone(),
                start_timestamp: start.1.clone(),
                end_timestamp: end.1.clone(),
                duration_ms,
            });
            timestamps.push(start.0);
            timestamps.push(end.0);
        }
    }
    let total_ms = if timestamps.is_empty() {
        0
    } else {
        let min = timestamps.iter().copied().min().expect("non-empty");
        let max = timestamps.iter().copied().max().expect("non-empty");
        max - min
    };
    RequestAnalysis {
        id: req.start_raw.clone(),
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
    // P90 索引 = ceil(n * 0.9) - 1，与 TS `computeStats` 一致。
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
    pub fn analyze(
        spec: &LatencyAnalysisSpec,
        entries: &[LogEntry],
    ) -> Result<LatencyAnalysis, String> {
        // 1. 组装规则，顺序 = 请求拆分 → 拦截 → process stage 起止。
        let mut rules: Vec<Rule> = Vec::new();
        rules.push(Rule {
            matcher: MarkerMatcher::build(&spec.request_start)?,
            role: HitRole::Start,
        });
        for marker in &spec.intercept_ends {
            rules.push(Rule {
                matcher: MarkerMatcher::build(marker)?,
                role: HitRole::Intercept,
            });
        }
        for stage in &spec.process_stages {
            rules.push(Rule {
                matcher: MarkerMatcher::build(&stage.start)?,
                role: HitRole::StageStart {
                    stage_id: stage.id.clone(),
                },
            });
            rules.push(Rule {
                matcher: MarkerMatcher::build(&stage.end)?,
                role: HitRole::StageEnd {
                    stage_id: stage.id.clone(),
                },
            });
        }

        // 2. 逐条匹配收集命中，再稳定排序（等价 TS 的 ts / line 排序）。
        let mut hits: Vec<TimedHit> = Vec::new();
        for entry in entries {
            let line = clean_line(&entry.raw);
            let Some(ts_ms) = timestamp_to_ms(&entry.timestamp) else {
                continue;
            };
            for rule in &rules {
                if rule.matcher.matches(line) {
                    hits.push(TimedHit {
                        ts_ms,
                        line_no: entry.line_no,
                        raw_ts: entry.timestamp.clone(),
                        role: rule.role.clone(),
                    });
                }
            }
        }
        hits.sort_by(|a, b| a.ts_ms.cmp(&b.ts_ms).then_with(|| a.line_no.cmp(&b.line_no)));

        // 3. 栈式拆分：start 压栈、intercept 弹栈（拦截优先）、stage 事件累积到栈顶。
        let mut stack: Vec<OpenRequest> = Vec::new();
        for hit in &hits {
            match &hit.role {
                HitRole::Start => stack.push(OpenRequest {
                    start_raw: hit.raw_ts.clone(),
                    stage_events: Vec::new(),
                }),
                HitRole::Intercept => {
                    stack.pop();
                }
                HitRole::StageStart { stage_id } => {
                    if let Some(req) = stack.last_mut() {
                        events_mut(req, stage_id).starts.push((hit.ts_ms, hit.raw_ts.clone()));
                    }
                }
                HitRole::StageEnd { stage_id } => {
                    if let Some(req) = stack.last_mut() {
                        events_mut(req, stage_id).ends.push((hit.ts_ms, hit.raw_ts.clone()));
                    }
                }
            }
        }

        // 4. 结算栈中剩余请求 + 汇总统计。
        let requests: Vec<RequestAnalysis> = stack.iter().map(finalize).collect();
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
    use std::collections::HashMap;

    use super::*;
    use crate::domain::latency_analysis::spec::StageSpec;

    fn entry(line_no: u64, timestamp: &str, msg: &str) -> LogEntry {
        LogEntry {
            line_no,
            timestamp: timestamp.to_string(),
            pid: 0,
            tid: 0,
            level: "I".to_string(),
            app_prefix: "A00010".to_string(),
            package_name: "com.demo.app".to_string(),
            tag: "Order".to_string(),
            message: msg.to_string(),
            raw: msg.to_string(),
        }
    }

    fn kw(pattern: &str) -> Marker {
        Marker {
            pattern: pattern.to_string(),
            mode: MarkerMode::Keyword,
        }
    }

    fn smoke_spec() -> LatencyAnalysisSpec {
        LatencyAnalysisSpec {
            request_start: kw("request started"),
            intercept_ends: vec![],
            process_stages: vec![
                StageSpec {
                    id: "STAGE-A".to_string(),
                    start: kw("request started"),
                    end: kw("start parallel subprocesses"),
                },
                StageSpec {
                    id: "STAGE-P".to_string(),
                    start: kw("start parallel subprocesses"),
                    end: kw("all subprocesses completed"),
                },
                StageSpec {
                    id: "STAGE-B".to_string(),
                    start: Marker {
                        pattern: "subprocess received, sequence=[0-9]+".to_string(),
                        mode: MarkerMode::Regex,
                    },
                    end: kw("subprocess completed"),
                },
                StageSpec {
                    id: "STAGE-D".to_string(),
                    start: kw("all subprocesses completed"),
                    end: kw("request completed successfully"),
                },
            ],
        }
    }

    const MSGS: [&str; 7] = [
        "request started",
        "start parallel subprocesses",
        "subprocess received, sequence=0",
        "preparation completed",
        "subprocess completed",
        "all subprocesses completed",
        "request completed successfully",
    ];

    fn build_request(sec: i64, offsets: [i64; 7]) -> Vec<LogEntry> {
        offsets
            .iter()
            .enumerate()
            .map(|(i, off)| {
                let ts = format!("2026-07-05 10:00:{sec:02}.{off:03}");
                entry(sec as u64 * 10 + i as u64, &ts, MSGS[i])
            })
            .collect()
    }

    #[test]
    fn smoke_five_requests_stats() {
        let spec = smoke_spec();
        let offsets = [
            [0, 40, 50, 59, 80, 85, 95],
            [0, 55, 80, 104, 160, 172, 192],
            [0, 50, 170, 188, 230, 245, 270],
            [0, 45, 75, 150, 325, 345, 375],
            [0, 60, 100, 127, 190, 208, 230],
        ];
        let mut entries = Vec::new();
        for (sec, offs) in offsets.iter().enumerate() {
            entries.extend(build_request(sec as i64, *offs));
        }

        let result = LatencyAnalyzer::analyze(&spec, &entries).unwrap();
        assert_eq!(result.requests.len(), 5);
        assert_eq!(result.stats.sample_count, 20);

        let r0 = &result.requests[0];
        assert_eq!(r0.id, "2026-07-05 10:00:00.000");
        assert_eq!(r0.total_ms, 95);
        let by_id: HashMap<&str, i64> = r0
            .samples
            .iter()
            .map(|s| (s.stage_id.as_str(), s.duration_ms))
            .collect();
        assert_eq!(by_id.get("STAGE-A"), Some(&40));
        assert_eq!(by_id.get("STAGE-P"), Some(&45));
        assert_eq!(by_id.get("STAGE-B"), Some(&30));
        assert_eq!(by_id.get("STAGE-D"), Some(&10));
    }

    #[test]
    fn intercept_drops_request() {
        let spec = LatencyAnalysisSpec {
            request_start: kw("request started"),
            intercept_ends: vec![kw("timeout waiting for subprocess")],
            process_stages: vec![StageSpec {
                id: "STAGE-A".to_string(),
                start: kw("request started"),
                end: kw("start parallel subprocesses"),
            }],
        };
        let entries = vec![
            entry(1, "2026-07-05 10:00:00.000", "request started"),
            entry(2, "2026-07-05 10:00:00.040", "start parallel subprocesses"),
            entry(3, "2026-07-05 10:00:00.050", "timeout waiting for subprocess"),
            entry(4, "2026-07-05 10:00:01.000", "request started"),
            entry(5, "2026-07-05 10:00:01.040", "start parallel subprocesses"),
        ];
        let result = LatencyAnalyzer::analyze(&spec, &entries).unwrap();
        assert_eq!(result.requests.len(), 1);
        assert_eq!(result.requests[0].id, "2026-07-05 10:00:01.000");
        assert_eq!(result.stats.sample_count, 1);
    }

    #[test]
    fn stage_takes_first_pair_only() {
        let spec = LatencyAnalysisSpec {
            request_start: kw("request started"),
            intercept_ends: vec![],
            process_stages: vec![StageSpec {
                id: "STAGE-X".to_string(),
                start: kw("step begin"),
                end: kw("step end"),
            }],
        };
        let entries = vec![
            entry(1, "2026-07-05 10:00:00.000", "request started"),
            entry(2, "2026-07-05 10:00:00.010", "step begin"),
            entry(3, "2026-07-05 10:00:00.020", "step end"),
            entry(4, "2026-07-05 10:00:00.030", "step begin"),
            entry(5, "2026-07-05 10:00:00.050", "step end"),
        ];
        let result = LatencyAnalyzer::analyze(&spec, &entries).unwrap();
        assert_eq!(result.requests.len(), 1);
        assert_eq!(result.requests[0].samples.len(), 1);
        assert_eq!(result.requests[0].samples[0].duration_ms, 10);
    }

    #[test]
    fn compute_stats_p90_and_rounding() {
        let stats = compute_stats(&(1..=20).collect::<Vec<i64>>());
        assert_eq!(stats.sample_count, 20);
        assert_eq!(stats.average_ms, 11); // 210/20 = 10.5 → 11
        assert_eq!(stats.p90_ms, 18); // ceil(18)-1 = 17 → sorted[17] = 18
        assert_eq!(stats.max_ms, 20);
    }

    #[test]
    fn compute_stats_small_n() {
        let stats = compute_stats(&[10, 20, 30, 40, 50]);
        assert_eq!(stats.sample_count, 5);
        assert_eq!(stats.average_ms, 30);
        assert_eq!(stats.p90_ms, 50); // ceil(4.5)-1 = 4 → sorted[4] = 50
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
