//! 端侧请求拆分：栈式三步——intercept 只 pop 边界、条目归最近存活边界、组内去重。
//!
//! 1. `surviving_starts`：按时间顺序扫描，request_start 压栈、intercept 弹栈，栈中即存活边界。
//! 2. `group_by_boundaries`：每条 entry 归「最近的前一个存活边界」，条目不丢。
//! 3. `dedup`：删重复 start 命中（保留最早存活锚点）与全部 intercept 命中。

use std::collections::HashSet;

use crate::domain::latency_analysis::marker::MarkerMatcher;
use crate::domain::latency_analysis::spec::Marker;
use crate::domain::latency_analysis::timestamp::timestamp_to_ms;
use crate::domain::log_workspace::log_entry::LogEntry;
use crate::domain::request_split::{
    group_by_boundaries, Boundary, Request, RequestSplitter,
};

fn clean_line(raw: &str) -> &str {
    raw.trim_end_matches(|c: char| c == '\n' || c == '\r')
}

pub struct SequentialStackSplitter {
    request_starts: Vec<MarkerMatcher>,
    intercept_ends: Vec<MarkerMatcher>,
}

impl SequentialStackSplitter {
    pub fn new(request_starts: Vec<Marker>, intercept_ends: Vec<Marker>) -> Result<Self, String> {
        let request_starts = request_starts
            .iter()
            .map(MarkerMatcher::build)
            .collect::<Result<Vec<_>, _>>()?;
        let intercept_ends = intercept_ends
            .iter()
            .map(MarkerMatcher::build)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            request_starts,
            intercept_ends,
        })
    }

    /// 栈式求存活 start 边界。intercept 只 pop 边界、不丢条目。
    pub fn surviving_starts(&self, entries: &[LogEntry]) -> Vec<Boundary> {
        let mut ordered: Vec<(i64, u64, &LogEntry)> = entries
            .iter()
            .filter_map(|e| timestamp_to_ms(&e.timestamp).map(|ts| (ts, e.line_no, e)))
            .collect();
        ordered.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

        let mut stack: Vec<Boundary> = Vec::new();
        for (ts_ms, line_no, entry) in ordered {
            let line = clean_line(&entry.raw);
            if self.intercept_ends.iter().any(|m| m.matches(line)) {
                stack.pop();
                continue;
            }
            if self.request_starts.iter().any(|m| m.matches(line)) {
                stack.push(Boundary {
                    ts_ms,
                    timestamp: entry.timestamp.clone(),
                    line_no,
                });
            }
        }
        stack
    }

    /// 组内去重：删全部 intercept 命中与「非存活锚点」的重复 start 命中，存活锚点保留。
    fn dedup(&self, requests: Vec<Request>, boundaries: &[Boundary]) -> Vec<Request> {
        let anchors: HashSet<(i64, u64)> = boundaries
            .iter()
            .map(|b| (b.ts_ms, b.line_no))
            .collect();
        requests
            .into_iter()
            .map(|req| {
                let entries = req
                    .entries
                    .into_iter()
                    .filter(|e| {
                        let line = clean_line(&e.raw);
                        if self.intercept_ends.iter().any(|m| m.matches(line)) {
                            return false;
                        }
                        if self.request_starts.iter().any(|m| m.matches(line)) {
                            return timestamp_to_ms(&e.timestamp)
                                .map(|ts| anchors.contains(&(ts, e.line_no)))
                                .unwrap_or(false);
                        }
                        true
                    })
                    .collect();
                Request {
                    id: req.id,
                    entries,
                }
            })
            .collect()
    }
}

impl RequestSplitter for SequentialStackSplitter {
    fn split(&self, entries: &[LogEntry]) -> Vec<Request> {
        let boundaries = self.surviving_starts(entries);
        let grouped = group_by_boundaries(entries, &boundaries);
        self.dedup(grouped, &boundaries)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::latency_analysis::spec::MarkerMode;
    use crate::domain::log_workspace::log_extension::{EdgeExt, LogExtension};

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

    fn kw(pattern: &str) -> Marker {
        Marker {
            pattern: pattern.to_string(),
            mode: MarkerMode::Keyword,
        }
    }

    #[test]
    fn splits_two_requests_by_start_marker() {
        let splitter = SequentialStackSplitter::new(vec![kw("request started")], vec![]).unwrap();
        let entries = vec![
            entry(1, "2026-07-05 10:00:00.000", "request started"),
            entry(2, "2026-07-05 10:00:00.040", "step begin"),
            entry(3, "2026-07-05 10:00:00.080", "step end"),
            entry(4, "2026-07-05 10:00:01.000", "request started"),
            entry(5, "2026-07-05 10:00:01.040", "step begin"),
        ];
        let requests = splitter.split(&entries);
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].id, "2026-07-05 10:00:00.000");
        assert_eq!(requests[0].entries.len(), 3);
        assert_eq!(requests[1].id, "2026-07-05 10:00:01.000");
        assert_eq!(requests[1].entries.len(), 2);
    }

    #[test]
    fn intercept_pops_first_boundary_and_its_entries_are_dropped() {
        let splitter =
            SequentialStackSplitter::new(vec![kw("request started")], vec![kw("timeout waiting")])
                .unwrap();
        let entries = vec![
            entry(1, "2026-07-05 10:00:00.000", "request started"),
            entry(2, "2026-07-05 10:00:00.040", "step begin"),
            entry(3, "2026-07-05 10:00:00.050", "timeout waiting"),
            entry(4, "2026-07-05 10:00:01.000", "request started"),
            entry(5, "2026-07-05 10:00:01.040", "step begin"),
        ];
        let requests = splitter.split(&entries);
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].id, "2026-07-05 10:00:01.000");
        let msgs: Vec<&str> = requests[0].entries.iter().map(|e| e.message.as_str()).collect();
        assert_eq!(msgs, vec!["request started", "step begin"]);
    }

    #[test]
    fn dedup_keeps_earliest_start_and_drops_nested_start_and_intercept() {
        // start1 → a → b → start2 → a → intercept → c → d → end
        // 去重后：start1 → a → b → a → c → d → end（删 start2 与 intercept，保留最早 start1）
        let splitter = SequentialStackSplitter::new(vec![kw("start")], vec![kw("intercept")]).unwrap();
        let entries = vec![
            entry(1, "2026-07-05 10:00:00.000", "start1"),
            entry(2, "2026-07-05 10:00:00.010", "a"),
            entry(3, "2026-07-05 10:00:00.020", "b"),
            entry(4, "2026-07-05 10:00:00.030", "start2"),
            entry(5, "2026-07-05 10:00:00.040", "a"),
            entry(6, "2026-07-05 10:00:00.050", "intercept"),
            entry(7, "2026-07-05 10:00:00.060", "c"),
            entry(8, "2026-07-05 10:00:00.070", "d"),
            entry(9, "2026-07-05 10:00:00.080", "end"),
        ];
        let requests = splitter.split(&entries);
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].id, "2026-07-05 10:00:00.000");
        let msgs: Vec<&str> = requests[0].entries.iter().map(|e| e.message.as_str()).collect();
        assert_eq!(msgs, vec!["start1", "a", "b", "a", "c", "d", "end"]);
    }

    #[test]
    fn nested_start_entries_flow_to_previous_start_when_intercepted() {
        let splitter =
            SequentialStackSplitter::new(vec![kw("request started")], vec![kw("timeout waiting")])
                .unwrap();
        let entries = vec![
            entry(1, "2026-07-05 10:00:00.000", "request started"),
            entry(2, "2026-07-05 10:00:00.010", "step x"),
            entry(3, "2026-07-05 10:00:00.020", "request started"),
            entry(4, "2026-07-05 10:00:00.030", "step y"),
            entry(5, "2026-07-05 10:00:00.040", "timeout waiting"),
            entry(6, "2026-07-05 10:00:00.050", "step z"),
            entry(7, "2026-07-05 10:00:00.060", "request completed"),
        ];
        let requests = splitter.split(&entries);
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].id, "2026-07-05 10:00:00.000");
        let msgs: Vec<&str> = requests[0].entries.iter().map(|e| e.message.as_str()).collect();
        assert_eq!(
            msgs,
            vec![
                "request started",
                "step x",
                "step y",
                "step z",
                "request completed"
            ]
        );
    }

    #[test]
    fn multiple_request_starts_any_hit_opens_request() {
        let splitter = SequentialStackSplitter::new(
            vec![kw("request started"), kw("request begin")],
            vec![],
        )
        .unwrap();
        let entries = vec![
            entry(1, "2026-07-05 10:00:00.000", "request begin"),
            entry(2, "2026-07-05 10:00:00.040", "step begin"),
            entry(3, "2026-07-05 10:00:01.000", "request started"),
            entry(4, "2026-07-05 10:00:01.040", "step begin"),
        ];
        let requests = splitter.split(&entries);
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].id, "2026-07-05 10:00:00.000");
        assert_eq!(requests[1].id, "2026-07-05 10:00:01.000");
    }
}
