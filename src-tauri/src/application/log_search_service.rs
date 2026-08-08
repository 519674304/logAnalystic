//! 日志搜索应用服务。
//!
//! 这个服务把搜索算法放在 Rust 里，方便桌面壳层从演示过滤平滑演进到
//! 真正的本地日志分析，同时不改前端契约。

use crate::dto::log_dto::{
    LogSearchHitDto, LogSearchModeDto, LogSearchRequestDto, LogSearchResponseDto,
};
use regex::Regex;

const SAMPLE_LOGS: &[&str] = &[
    "2026-06-12 10:39:38.257 [WARN] A00010 mainProcess dispatch wakeup request",
    "2026-06-12 10:39:39.014 [INFO] A00010 wakeup handler begin",
    "2026-06-12 10:39:40.002 [INFO] A00010 wakeup handler finished",
    "2026-06-12 10:40:02.120 [ERROR] A00011 health check timeout, retry later",
    "2026-06-12 10:40:03.088 [INFO] A00011 health check retry accepted",
    "2026-06-12 10:41:10.430 [INFO] A00010 dfx heartbeat normal",
    "2026-06-12 10:42:01.890 [ERROR] A00012 business flow node 2 exception in parser",
];

#[derive(Debug, Clone)]
struct ParsedLine {
    raw_line: String,
    timestamp: String,
    app: String,
    level: String,
}

impl ParsedLine {
    fn parse(raw_line: &str) -> Self {
        let mut parts = raw_line.splitn(4, ' ');
        let date = parts.next().unwrap_or_default();
        let time = parts.next().unwrap_or_default();
        let level = parts
            .next()
            .unwrap_or_default()
            .trim_start_matches('[')
            .trim_end_matches(']')
            .to_string();
        let app_and_message = parts.next().unwrap_or_default();
        let mut app_parts = app_and_message.splitn(2, ' ');
        let app = app_parts.next().unwrap_or_default().to_string();

        Self {
            raw_line: raw_line.to_string(),
            timestamp: format!("{date} {time}"),
            app,
            level,
        }
    }
}

pub fn search_logs(request: &LogSearchRequestDto) -> LogSearchResponseDto {
    let lines: Vec<ParsedLine> = SAMPLE_LOGS.iter().map(|line| ParsedLine::parse(line)).collect();
    let matcher = build_matcher(request);
    let mut hits = Vec::new();

    for (index, line) in lines.iter().enumerate() {
        if !matcher(&line.raw_line) {
            continue;
        }

        let start = index.saturating_sub(request.context_lines);
        let end = (index + request.context_lines + 1).min(lines.len());

        hits.push(LogSearchHitDto {
            line_number: index + 1,
            raw_line: line.raw_line.clone(),
            file_path: None,
            timestamp: line.timestamp.clone(),
            app: line.app.clone(),
            level: line.level.clone(),
            before: lines[start..index]
                .iter()
                .map(|item| item.raw_line.clone())
                .collect(),
            after: lines[index + 1..end]
                .iter()
                .map(|item| item.raw_line.clone())
                .collect(),
        });
    }

    LogSearchResponseDto {
        total_matches: hits.len(),
        hits,
    }
}

fn build_matcher(request: &LogSearchRequestDto) -> Box<dyn Fn(&str) -> bool + Send + Sync + 'static> {
    let case_sensitive = request.case_sensitive;

    match request.mode {
        LogSearchModeDto::Keyword => {
            let needle = if case_sensitive {
                request.query.clone()
            } else {
                request.query.to_lowercase()
            };

            Box::new(move |value: &str| {
                if case_sensitive {
                    value.contains(&needle)
                } else {
                    value.to_lowercase().contains(&needle)
                }
            })
        }
        LogSearchModeDto::Regex => {
            let pattern = request.query.clone();
            let regex = Regex::new(&pattern).ok();
            let regex_insensitive = if case_sensitive {
                None
            } else {
                Regex::new(&format!("(?i:{pattern})")).ok()
            };

            Box::new(move |value: &str| {
                if case_sensitive {
                    regex.as_ref().map(|compiled| compiled.is_match(value)).unwrap_or(false)
                } else {
                    regex_insensitive
                        .as_ref()
                        .map(|compiled| compiled.is_match(value))
                        .unwrap_or(false)
                }
            })
        }
    }
}
