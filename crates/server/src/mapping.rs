use log_core::domain::health_check::spec::{HealthCheckSpec, StageThreshold};
use log_core::domain::latency_analysis::spec::{
    LatencyAnalysisSpec, Marker, MarkerMode, StageSpec,
};
use log_core::domain::specialist_diagnosis::spec::{
    Connector, DiagnosticJudgment, DiagnosticProblem, JudgmentType, ReturnMode, SearchRange,
};

use super::dto::{
    AnalyzeRequest, DiagnosticJudgmentDto, DiagnosticProblemDto, HealthCheckRequest, MarkerDto,
    StageSpecDto,
};

pub fn parse_mode_with_fallback(mode: &str) -> (MarkerMode, bool) {
    match mode {
        "regex" => (MarkerMode::Regex, false),
        "keyword" => (MarkerMode::Keyword, false),
        _ => (MarkerMode::Keyword, true),
    }
}

pub fn log_mode_fallback(request_id: &str, operation: &str, mode: &str) {
    tracing::warn!(
        requestId = request_id,
        operation,
        suppliedModeLength = mode.len(),
        recovery = "keyword",
        "request.mode_fallback"
    );
}

fn to_marker(dto: &MarkerDto, request_id: &str, operation: &str) -> Marker {
    let (mode, fell_back) = parse_mode_with_fallback(&dto.mode);
    if fell_back {
        log_mode_fallback(request_id, operation, &dto.mode);
    }
    Marker {
        pattern: dto.pattern.clone(),
        mode,
    }
}

fn to_stage_spec(dto: &StageSpecDto, request_id: &str, operation: &str) -> StageSpec {
    StageSpec {
        id: dto.id.clone(),
        starts: dto
            .start_markers
            .iter()
            .map(|marker| to_marker(marker, request_id, operation))
            .collect(),
        ends: dto
            .end_markers
            .iter()
            .map(|marker| to_marker(marker, request_id, operation))
            .collect(),
    }
}

pub fn to_spec(req: &AnalyzeRequest, request_id: &str) -> LatencyAnalysisSpec {
    const OPERATION: &str = "latency.analyze";
    LatencyAnalysisSpec {
        request_starts: req
            .request_starts
            .iter()
            .map(|marker| to_marker(marker, request_id, OPERATION))
            .collect(),
        intercept_ends: req
            .intercept_ends
            .iter()
            .map(|marker| to_marker(marker, request_id, OPERATION))
            .collect(),
        process_stages: req
            .process_stages
            .iter()
            .map(|stage| to_stage_spec(stage, request_id, OPERATION))
            .collect(),
    }
}

pub fn to_health_spec(req: &HealthCheckRequest, request_id: &str) -> HealthCheckSpec {
    const OPERATION: &str = "health.check";
    HealthCheckSpec {
        error_filters: req
            .error_filters
            .iter()
            .map(|marker| to_marker(marker, request_id, OPERATION))
            .collect(),
        latency: LatencyAnalysisSpec {
            request_starts: req
                .request_starts
                .iter()
                .map(|marker| to_marker(marker, request_id, OPERATION))
                .collect(),
            intercept_ends: req
                .intercept_ends
                .iter()
                .map(|marker| to_marker(marker, request_id, OPERATION))
                .collect(),
            process_stages: req
                .process_stages
                .iter()
                .map(|stage| to_stage_spec(stage, request_id, OPERATION))
                .collect(),
        },
        stage_thresholds: req
            .stage_thresholds
            .iter()
            .map(|threshold| StageThreshold {
                stage_id: threshold.stage_id.clone(),
                threshold_ms: threshold.threshold_ms,
            })
            .collect(),
    }
}

fn to_search_range(dto: &DiagnosticJudgmentDto) -> Result<SearchRange, String> {
    match dto.range.as_str() {
        "window" => Ok(SearchRange::Window),
        "boundedBacktrack" => Ok(SearchRange::BoundedBacktrack {
            window_ms: dto.window_ms.unwrap_or(0),
        }),
        "unbounded" => Ok(SearchRange::Unbounded),
        other => Err(format!("未知搜索范围: {other}")),
    }
}

fn to_return_mode(value: &str) -> ReturnMode {
    match value {
        "first" => ReturnMode::First,
        _ => ReturnMode::All,
    }
}

fn to_connector(value: &str) -> Connector {
    match value {
        "or" => Connector::Or,
        _ => Connector::And,
    }
}

pub fn to_problem(
    dto: &DiagnosticProblemDto,
    request_id: &str,
) -> Result<DiagnosticProblem, String> {
    const OPERATION: &str = "diagnostic.run";
    let mut judgments = Vec::with_capacity(dto.judgments.len());
    for judgment in &dto.judgments {
        let judgment_type = match judgment.judgment_type.as_str() {
            "matcher" => {
                let marker = judgment
                    .marker
                    .as_ref()
                    .ok_or_else(|| "matcher 判断缺 marker".to_string())?;
                JudgmentType::Matcher {
                    marker: to_marker(marker, request_id, OPERATION),
                }
            }
            "stage" => {
                let stage = judgment
                    .stage
                    .as_ref()
                    .ok_or_else(|| "stage 判断缺 stage".to_string())?;
                JudgmentType::Stage {
                    stage: to_stage_spec(stage, request_id, OPERATION),
                }
            }
            other => return Err(format!("未知判断类型: {other}")),
        };
        judgments.push(DiagnosticJudgment {
            judgment_type,
            range: to_search_range(judgment)?,
            when: judgment.when.clone(),
            return_mode: to_return_mode(&judgment.return_mode),
            conclusion: judgment.conclusion.clone(),
            connector: to_connector(&judgment.connector),
        });
    }
    Ok(DiagnosticProblem {
        name: dto.name.clone(),
        hit_label: dto.hit_label.clone(),
        miss_label: dto.miss_label.clone(),
        judgments,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_mode_with_fallback;
    use log_core::domain::latency_analysis::spec::MarkerMode;

    #[test]
    fn unknown_marker_mode_falls_back_to_keyword() {
        assert_eq!(
            parse_mode_with_fallback("unexpected-mode"),
            (MarkerMode::Keyword, true)
        );
    }
}
