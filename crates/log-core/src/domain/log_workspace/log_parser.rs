use crate::domain::log_workspace::log_entry::LogEntry;
use crate::domain::log_workspace::log_extension::{EdgeExt, LogExtension};

/// 日志解析端口：不同来源格式 → 统一 LogEntry。
/// 云端解析器（CloudJsonParser）以后作为新 impl 接入。
pub trait LogParser {
    fn parse_line(&self, raw: &str) -> Option<LogEntry>;
}

/// 端侧 logcat 单行解析。
///
/// ```text
/// <lineNo>,<date> <time> <pid> <tid> <level> <appPrefix>/<package>/<tag>: <message>
/// ```
pub struct LogcatParser;

impl LogParser for LogcatParser {
    fn parse_line(&self, raw: &str) -> Option<LogEntry> {
        let (line_no_str, rest) = raw.split_once(',')?;
        let line_no: u64 = line_no_str.trim().parse().ok()?;

        let mut tokens = rest.split_whitespace();
        let date = tokens.next()?;
        let time = tokens.next()?;
        let pid: u32 = tokens.next()?.parse().ok()?;
        let tid: u32 = tokens.next()?.parse().ok()?;
        let level = tokens.next()?.to_string();

        let app_field = tokens.next()?;
        let app_field = app_field.strip_suffix(':').unwrap_or(app_field);
        let mut parts = app_field.split('/');
        let app_prefix = parts.next()?.to_string();
        let package_name = parts.next()?.to_string();
        let tag = parts.next()?.to_string();

        let message = tokens.collect::<Vec<_>>().join(" ");

        Some(LogEntry {
            line_no,
            timestamp: format!("{date} {time}"),
            level,
            message,
            raw: raw.to_string(),
            ext: LogExtension::Edge(EdgeExt {
                pid,
                tid,
                app_prefix,
                package_name,
                tag,
            }),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_edge_logcat_line() {
        let raw = "20675,2026-07-05 10:00:00.100 32033 32033 I A00010/com.demo.app/Order: request started";
        let entry = LogcatParser.parse_line(raw).expect("parse");
        assert_eq!(entry.line_no, 20675);
        assert_eq!(entry.timestamp, "2026-07-05 10:00:00.100");
        assert_eq!(entry.level, "I");
        assert_eq!(entry.message, "request started");
        assert_eq!(entry.app(), Some("A00010"));
        assert_eq!(entry.trace_id(), None);
    }
}
