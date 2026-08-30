//! 端侧请求拆分：按时间顺序扫描，request_start 开新请求，intercept 丢弃当前请求。
//!
//! 端侧日志为串行：请求依次完成、无跨请求嵌套，故按「连续区间」拆分即可。
//! 「拦截→放弃上一次拆分」属本拆分器职责，与云端拆分无关。

use crate::domain::latency_analysis::marker::MarkerMatcher;
use crate::domain::latency_analysis::spec::Marker;
use crate::domain::latency_analysis::timestamp::timestamp_to_ms;
use crate::domain::log_workspace::log_entry::LogEntry;
use crate::domain::request_split::{Request, RequestSplitter};

fn clean_line(raw: &str) -> &str {
    raw.trim_end_matches(|c: char| c == '\n' || c == '\r')
}

pub struct SequentialStackSplitter {
    request_start: MarkerMatcher,
    intercept_ends: Vec<MarkerMatcher>,
}

impl SequentialStackSplitter {
    pub fn new(request_start: Marker, intercept_ends: Vec<Marker>) -> Result<Self, String> {
        let request_start = MarkerMatcher::build(&request_start)?;
        let intercept_ends = intercept_ends
            .iter()
            .map(MarkerMatcher::build)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            request_start,
            intercept_ends,
        })
    }
}

impl RequestSplitter for SequentialStackSplitter {
    fn split(&self, entries: &[LogEntry]) -> Vec<Request> {
        // 1. 只保留时间戳可解析的条目，按 (ts_ms, line_no) 稳定排序。
        let mut ordered: Vec<(i64, u64, &LogEntry)> = entries
            .iter()
            .filter_map(|e| timestamp_to_ms(&e.timestamp).map(|ts| (ts, e.line_no, e)))
            .collect();
        ordered.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

        // 2. 顺序扫描：request_start 开新请求，intercept 丢弃当前请求（拦截优先）。
        let mut requests: Vec<Request> = Vec::new();
        let mut current: Option<(String, Vec<LogEntry>)> = None;

        for (_, _, entry) in &ordered {
            let line = clean_line(&entry.raw);
            let is_intercept = self.intercept_ends.iter().any(|m| m.matches(line));
            if is_intercept {
                current = None;
                continue;
            }
            if self.request_start.matches(line) {
                if let Some((id, entries)) = current.take() {
                    requests.push(Request { id, entries });
                }
                current = Some((entry.timestamp.clone(), vec![(*entry).clone()]));
            } else if let Some((_, entries)) = current.as_mut() {
                entries.push((*entry).clone());
            }
        }
        if let Some((id, entries)) = current.take() {
            requests.push(Request { id, entries });
        }

        requests
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
        let splitter = SequentialStackSplitter::new(kw("request started"), vec![]).unwrap();
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
    fn intercept_drops_current_request() {
        let splitter =
            SequentialStackSplitter::new(kw("request started"), vec![kw("timeout waiting")])
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
    }
}
