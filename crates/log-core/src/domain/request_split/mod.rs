//! 请求拆分：把扁平 LogEntry 分组为请求队列。
//!
//! 多实现：端侧按时间顺序 + 拦截丢弃；云端以后按 traceId 分组。

pub mod sequential_stack;

use serde::Serialize;

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

/// 请求拆分端口。
pub trait RequestSplitter {
    /// 拆分为请求队列；每个 `Request.entries` 必须时间升序。
    fn split(&self, entries: &[LogEntry]) -> Vec<Request>;
}
