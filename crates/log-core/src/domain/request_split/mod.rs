//! 请求拆分：把扁平 LogEntry 分组为请求队列。
//!
//! 多实现：端侧按时间顺序 + 拦截丢弃；云端以后按 traceId 分组。

pub mod sequential_stack;

use serde::Serialize;

use crate::domain::latency_analysis::timestamp::timestamp_to_ms;
use crate::domain::log_workspace::log_entry::LogEntry;

/// 一次请求：关联键 id + 该请求的时间升序条目。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    /// 有 traceId 用 traceId，否则用请求起始时间戳（决策④）。
    pub id: String,
    /// 时间升序。
    pub entries: Vec<LogEntry>,
}

/// 存活 start 边界：一个未被拦截 pop 的请求起点。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Boundary {
    /// 边界时间戳（距 Unix 纪元毫秒）。
    pub ts_ms: i64,
    /// 原始时间戳字符串，作为 `Request.id`。
    pub timestamp: String,
    /// 触发边界的条目行号，分组时用于同时间戳稳定排序。
    pub line_no: u64,
}

/// 每条 entry 归「最近的前一个存活边界」；早于首个存活边界的条目丢弃。
/// 只分组、不删条目；start/intercept 命中的条目照常保留，由下游 `dedup` 处理。
pub fn group_by_boundaries(entries: &[LogEntry], boundaries: &[Boundary]) -> Vec<Request> {
    let mut ordered: Vec<(i64, u64, &LogEntry)> = entries
        .iter()
        .filter_map(|e| timestamp_to_ms(&e.timestamp).map(|ts| (ts, e.line_no, e)))
        .collect();
    ordered.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    let mut requests: Vec<Request> = Vec::new();
    let mut b = 0usize;
    for (ts_ms, line_no, entry) in ordered {
        while b + 1 < boundaries.len()
            && (boundaries[b + 1].ts_ms, boundaries[b + 1].line_no) <= (ts_ms, line_no)
        {
            b += 1;
        }
        if b < boundaries.len()
            && (boundaries[b].ts_ms, boundaries[b].line_no) <= (ts_ms, line_no)
        {
            if requests.last().map(|r| r.id.as_str()) != Some(boundaries[b].timestamp.as_str()) {
                requests.push(Request {
                    id: boundaries[b].timestamp.clone(),
                    entries: Vec::new(),
                });
            }
            requests
                .last_mut()
                .expect("pushed above")
                .entries
                .push(entry.clone());
        }
    }
    requests
}

/// 请求拆分端口。
pub trait RequestSplitter {
    /// 拆分为请求队列；每个 `Request.entries` 必须时间升序。
    fn split(&self, entries: &[LogEntry]) -> Vec<Request>;
}
