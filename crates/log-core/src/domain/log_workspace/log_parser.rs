use crate::domain::log_workspace::log_entry::LogEntry;

/// 解析固定格式单行日志：
///
/// ```text
/// <lineNo>,<date> <time> <pid> <tid> <level> <appPrefix>/<package>/<tag>: <message>
/// 20675,2026-07-05 10:00:00.100 32033 32033 I A00010/com.demo.app/Order: request started
/// ```
///
/// 解析失败返回 `None`（失败行不参与搜索，由上层统计）。
pub fn parse_line(raw: &str) -> Option<LogEntry> {
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
        pid,
        tid,
        level,
        app_prefix,
        package_name,
        tag,
        message,
        raw: raw.to_string(),
    })
}
