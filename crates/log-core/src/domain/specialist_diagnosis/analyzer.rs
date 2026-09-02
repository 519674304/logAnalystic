//! 专科诊断分析器：逐判断依据做「搜索 → 命中/配对 → 判定」，再按「且/或」折叠出最终结论。

use crate::domain::latency_analysis::marker::MarkerMatcher;
use crate::domain::latency_analysis::spec::{Marker, StageSpec};
use crate::domain::latency_analysis::timestamp::timestamp_to_ms;
use crate::domain::log_workspace::log_entry::LogEntry;
use crate::domain::specialist_diagnosis::result::{
    DiagnosticReport, HitEvidence, JudgmentResult,
};
use crate::domain::specialist_diagnosis::spec::{
    Connector, DiagnosticJudgment, DiagnosticProblem, JudgmentType, ReturnMode,
};

/// 单条判断依据的证据上限，避免响应过大。
const MAX_EVIDENCE: usize = 200;

fn clean_line(raw: &str) -> &str {
    raw.trim_end_matches(|c: char| c == '\n' || c == '\r')
}

fn build_matchers(markers: &[Marker]) -> Result<Vec<MarkerMatcher>, String> {
    markers.iter().map(MarkerMatcher::build).collect()
}

fn truncate(evidence: &mut Vec<HitEvidence>, return_mode: ReturnMode) {
    let cap = match return_mode {
        ReturnMode::First => 1,
        ReturnMode::All => MAX_EVIDENCE,
    };
    evidence.truncate(cap);
}

/// matcher 判断：命中 → `hit`，未命中 → `miss`。
fn evaluate_matcher(
    marker: &Marker,
    return_mode: ReturnMode,
    entries: &[LogEntry],
) -> Result<(String, Vec<HitEvidence>), String> {
    let matcher = MarkerMatcher::build(marker)?;
    let mut hits = Vec::new();
    for entry in entries {
        if matcher.matches(clean_line(&entry.raw)) {
            hits.push(HitEvidence {
                role: "marker".to_string(),
                timestamp: entry.timestamp.clone(),
                message: entry.message.clone(),
            });
        }
    }
    let state = if hits.is_empty() { "miss" } else { "hit" };
    truncate(&mut hits, return_mode);
    Ok((state.to_string(), hits))
}

/// stage 判断：start/end 命中后配对成 `closed` / `unclosed` / `missing`。
///
/// 用「最近一次 start 与最近一次 end」比较来判定当前状态：
/// 无 start → `missing`；有 start 但无晚于它的 end → `unclosed`；否则 `closed`。
fn evaluate_stage(
    stage: &StageSpec,
    return_mode: ReturnMode,
    entries: &[LogEntry],
) -> Result<(String, Vec<HitEvidence>), String> {
    let starts = build_matchers(&stage.starts)?;
    let ends = build_matchers(&stage.ends)?;

    let mut start_hits: Vec<&LogEntry> = Vec::new();
    let mut end_hits: Vec<&LogEntry> = Vec::new();
    for entry in entries {
        let line = clean_line(&entry.raw);
        if starts.iter().any(|m| m.matches(line)) {
            start_hits.push(entry);
        }
        if ends.iter().any(|m| m.matches(line)) {
            end_hits.push(entry);
        }
    }

    let last_start = start_hits
        .iter()
        .filter_map(|e| timestamp_to_ms(&e.timestamp))
        .max();
    let last_end = end_hits
        .iter()
        .filter_map(|e| timestamp_to_ms(&e.timestamp))
        .max();
    let state = match (last_start, last_end) {
        (None, _) => "missing",
        (Some(_), None) => "unclosed",
        (Some(start), Some(end)) => {
            if start > end {
                "unclosed"
            } else {
                "closed"
            }
        }
    };

    let mut evidence = Vec::new();
    for entry in start_hits {
        evidence.push(HitEvidence {
            role: "start".to_string(),
            timestamp: entry.timestamp.clone(),
            message: entry.message.clone(),
        });
    }
    for entry in end_hits {
        evidence.push(HitEvidence {
            role: "end".to_string(),
            timestamp: entry.timestamp.clone(),
            message: entry.message.clone(),
        });
    }
    evidence.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    if return_mode == ReturnMode::First {
        let first_start = evidence.iter().find(|h| h.role == "start").cloned();
        let first_end = evidence.iter().find(|h| h.role == "end").cloned();
        evidence = first_start.into_iter().chain(first_end.into_iter()).collect();
    } else {
        evidence.truncate(MAX_EVIDENCE);
    }

    Ok((state.to_string(), evidence))
}

fn evaluate_judgment(
    judgment: &DiagnosticJudgment,
    entries: &[LogEntry],
) -> Result<JudgmentResult, String> {
    let (state, evidence) = match &judgment.judgment_type {
        JudgmentType::Matcher { marker } => evaluate_matcher(marker, judgment.return_mode, entries)?,
        JudgmentType::Stage { stage } => evaluate_stage(stage, judgment.return_mode, entries)?,
    };
    Ok(JudgmentResult {
        conclusion: judgment.conclusion.clone(),
        satisfied: state == judgment.when,
        state,
        evidence,
    })
}

fn fold(results: &[JudgmentResult], judgments: &[DiagnosticJudgment]) -> bool {
    let mut acc: Option<bool> = None;
    for (judgment, result) in judgments.iter().zip(results) {
        acc = Some(match acc {
            None => result.satisfied,
            Some(prev) => match judgment.connector {
                Connector::And => prev && result.satisfied,
                Connector::Or => prev || result.satisfied,
            },
        });
    }
    acc.unwrap_or(false)
}

fn compose_conclusion(hit: bool, results: &[JudgmentResult], problem: &DiagnosticProblem) -> String {
    if !hit {
        return problem.miss_label.clone();
    }
    let triggered: Vec<&str> = results
        .iter()
        .filter(|r| r.satisfied)
        .map(|r| r.conclusion.as_str())
        .collect();
    if triggered.is_empty() {
        problem.hit_label.clone()
    } else {
        format!("{}；{}", triggered.join("；"), problem.hit_label)
    }
}

pub struct DiagnosticAnalyzer;

impl DiagnosticAnalyzer {
    /// 执行一次诊断：`scoped_entries` 与 `problem.judgments` 一一对应（已按各判断依据的搜索范围过滤）。
    pub fn run(
        problem: &DiagnosticProblem,
        scoped_entries: &[Vec<LogEntry>],
    ) -> Result<DiagnosticReport, String> {
        if scoped_entries.len() != problem.judgments.len() {
            return Err("诊断判断依据与搜索条目数量不一致".to_string());
        }

        let results: Vec<JudgmentResult> = problem
            .judgments
            .iter()
            .zip(scoped_entries)
            .map(|(judgment, entries)| evaluate_judgment(judgment, entries))
            .collect::<Result<_, _>>()?;

        let hit = fold(&results, &problem.judgments);
        let conclusion = compose_conclusion(hit, &results, problem);

        Ok(DiagnosticReport {
            name: problem.name.clone(),
            hit,
            conclusion,
            judgments: results,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::latency_analysis::spec::{MarkerMode, StageSpec};
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

    fn matcher_judgment(pattern: &str, when: &str, conclusion: &str) -> DiagnosticJudgment {
        DiagnosticJudgment {
            judgment_type: JudgmentType::Matcher {
                marker: kw(pattern),
            },
            range: crate::domain::specialist_diagnosis::spec::SearchRange::Window,
            when: when.to_string(),
            return_mode: ReturnMode::All,
            conclusion: conclusion.to_string(),
            connector: Connector::And,
        }
    }

    fn stage_judgment(id: &str, start: &str, end: &str, when: &str, conclusion: &str) -> DiagnosticJudgment {
        DiagnosticJudgment {
            judgment_type: JudgmentType::Stage {
                stage: StageSpec {
                    id: id.to_string(),
                    starts: vec![kw(start)],
                    ends: vec![kw(end)],
                },
            },
            range: crate::domain::specialist_diagnosis::spec::SearchRange::Window,
            when: when.to_string(),
            return_mode: ReturnMode::All,
            conclusion: conclusion.to_string(),
            connector: Connector::And,
        }
    }

    #[test]
    fn matcher_miss_satisfies_when_miss() {
        let problem = DiagnosticProblem {
            name: "开关未打开".to_string(),
            hit_label: "唤不醒".to_string(),
            miss_label: "唤醒正常".to_string(),
            judgments: vec![matcher_judgment("唤醒开关开启", "miss", "唤醒开关未打开")],
        };
        let entries = vec![entry(1, "2026-07-05 10:00:00.000", "idle heartbeat")];
        let report = DiagnosticAnalyzer::run(&problem, &[entries]).unwrap();
        assert!(report.judgments[0].satisfied);
        assert_eq!(report.judgments[0].state, "miss");
        assert!(report.hit);
        assert_eq!(report.conclusion, "唤醒开关未打开；唤不醒");
    }

    #[test]
    fn matcher_hit_does_not_satisfy_when_miss() {
        let problem = DiagnosticProblem {
            name: "开关未打开".to_string(),
            hit_label: "唤不醒".to_string(),
            miss_label: "唤醒正常".to_string(),
            judgments: vec![matcher_judgment("唤醒开关开启", "miss", "唤醒开关未打开")],
        };
        let entries = vec![entry(1, "2026-07-05 10:00:00.000", "唤醒开关开启")];
        let report = DiagnosticAnalyzer::run(&problem, &[entries]).unwrap();
        assert!(!report.judgments[0].satisfied);
        assert_eq!(report.judgments[0].state, "hit");
        assert!(!report.hit);
        assert_eq!(report.conclusion, "唤醒正常");
    }

    #[test]
    fn stage_unclosed_when_no_end() {
        let problem = DiagnosticProblem {
            name: "收音中".to_string(),
            hit_label: "唤不醒".to_string(),
            miss_label: "唤醒正常".to_string(),
            judgments: vec![stage_judgment("audio", "audio init", "audio ready", "unclosed", "设备正在收音")],
        };
        let entries = vec![entry(1, "2026-07-05 10:00:00.000", "audio init")];
        let report = DiagnosticAnalyzer::run(&problem, &[entries]).unwrap();
        assert_eq!(report.judgments[0].state, "unclosed");
        assert!(report.judgments[0].satisfied);
        assert!(report.hit);
        assert_eq!(report.conclusion, "设备正在收音；唤不醒");
    }

    #[test]
    fn stage_closed_when_end_after_start() {
        let problem = DiagnosticProblem {
            name: "收音中".to_string(),
            hit_label: "唤不醒".to_string(),
            miss_label: "唤醒正常".to_string(),
            judgments: vec![stage_judgment("audio", "audio init", "audio ready", "unclosed", "设备正在收音")],
        };
        let entries = vec![
            entry(1, "2026-07-05 10:00:00.000", "audio init"),
            entry(2, "2026-07-05 10:00:01.000", "audio ready"),
        ];
        let report = DiagnosticAnalyzer::run(&problem, &[entries]).unwrap();
        assert_eq!(report.judgments[0].state, "closed");
        assert!(!report.judgments[0].satisfied);
        assert!(!report.hit);
    }

    #[test]
    fn stage_missing_when_no_start() {
        let problem = DiagnosticProblem {
            name: "收音中".to_string(),
            hit_label: "唤不醒".to_string(),
            miss_label: "唤醒正常".to_string(),
            judgments: vec![stage_judgment("audio", "audio init", "audio ready", "missing", "未进入收音")],
        };
        let entries = vec![entry(1, "2026-07-05 10:00:00.000", "idle heartbeat")];
        let report = DiagnosticAnalyzer::run(&problem, &[entries]).unwrap();
        assert_eq!(report.judgments[0].state, "missing");
        assert!(report.judgments[0].satisfied);
        assert!(report.hit);
    }

    #[test]
    fn stage_latest_start_wins_when_repeated() {
        // 两段收音：第一段已闭合，第二段未闭合 → 当前仍在收音。
        let problem = DiagnosticProblem {
            name: "收音中".to_string(),
            hit_label: "唤不醒".to_string(),
            miss_label: "唤醒正常".to_string(),
            judgments: vec![stage_judgment("audio", "audio init", "audio ready", "unclosed", "设备正在收音")],
        };
        let entries = vec![
            entry(1, "2026-07-05 09:50:00.000", "audio init"),
            entry(2, "2026-07-05 09:50:05.000", "audio ready"),
            entry(3, "2026-07-05 10:02:00.000", "audio init"),
        ];
        let report = DiagnosticAnalyzer::run(&problem, &[entries]).unwrap();
        assert_eq!(report.judgments[0].state, "unclosed");
        assert!(report.judgments[0].satisfied);
    }

    #[test]
    fn and_connector_requires_all_satisfied() {
        let mut j1 = matcher_judgment("唤醒开关开启", "miss", "开关未打开");
        let mut j2 = stage_judgment("audio", "audio init", "audio ready", "unclosed", "设备正在收音");
        j1.connector = Connector::And;
        j2.connector = Connector::And;
        let problem = DiagnosticProblem {
            name: "唤不醒".to_string(),
            hit_label: "唤不醒".to_string(),
            miss_label: "唤醒正常".to_string(),
            judgments: vec![j1, j2],
        };
        // j1 命中（开关未开），j2 未命中（无收音）→ 且 折叠为 false。
        let entries1 = vec![entry(1, "2026-07-05 10:00:00.000", "idle")];
        let entries2 = vec![entry(2, "2026-07-05 10:00:01.000", "idle")];
        let report = DiagnosticAnalyzer::run(&problem, &[entries1, entries2]).unwrap();
        assert!(!report.hit);
        assert_eq!(report.conclusion, "唤醒正常");
    }

    #[test]
    fn or_connector_satisfies_when_any_hit() {
        let mut j1 = matcher_judgment("唤醒开关开启", "miss", "开关未打开");
        let mut j2 = matcher_judgment("唤醒请求", "hit", "未收到唤醒请求");
        j1.connector = Connector::And;
        j2.connector = Connector::Or;
        let problem = DiagnosticProblem {
            name: "唤不醒".to_string(),
            hit_label: "唤不醒".to_string(),
            miss_label: "唤醒正常".to_string(),
            judgments: vec![j1, j2],
        };
        // j1 未命中（开关开着），j2 命中（有请求）→ or 折叠为 true（j1 false || j2 true）。
        let entries1 = vec![entry(1, "2026-07-05 10:00:00.000", "唤醒开关开启")];
        let entries2 = vec![entry(2, "2026-07-05 10:00:01.000", "唤醒请求")];
        let report = DiagnosticAnalyzer::run(&problem, &[entries1, entries2]).unwrap();
        assert!(report.hit);
        assert_eq!(report.conclusion, "未收到唤醒请求；唤不醒");
    }
}
