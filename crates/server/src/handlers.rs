use std::sync::Arc;

use axum::{
    extract::{Extension, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use log_core::application::diagnostic_problem_service::DiagnosticProblemService;
use log_core::application::log_workspace_service::LogWorkspaceService;
use log_core::application::rule_set_service::RuleSetService;
use log_core::domain::health_check::result::HealthReport;
use log_core::domain::latency_analysis::result::LatencyAnalysis;
use log_core::domain::latency_analysis::spec::MarkerMode;
use log_core::domain::log_workspace::port::{
    LogContextData, SearchCondition, SearchMode, SearchResult, TimeRange,
};
use log_core::domain::log_workspace::workspace::Workspace;
use log_core::domain::specialist_diagnosis::result::DiagnosticReport;
use serde::Serialize;
use serde_json::Value;

use super::dto::*;
use super::mapping;

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Serialize)]
pub(crate) struct Health {
    status: &'static str,
    version: &'static str,
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) service: Arc<LogWorkspaceService>,
    pub(crate) rule_service: Arc<RuleSetService>,
    pub(crate) diagnostic_service: Arc<DiagnosticProblemService>,
}

#[derive(Clone)]
pub(crate) struct RequestId(pub(crate) String);

pub(crate) struct ApiError(pub(crate) String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (StatusCode::BAD_REQUEST, Json(ErrorBody { error: self.0 })).into_response()
    }
}

pub(crate) async fn health(Extension(request_id): Extension<RequestId>) -> Json<Health> {
    tracing::info!(
        requestId = request_id.0,
        operation = "health",
        "health.response"
    );
    Json(Health {
        status: "ok",
        version: VERSION,
    })
}

pub(crate) async fn open(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(req): Json<OpenRequest>,
) -> Result<Json<Workspace>, ApiError> {
    let operation = "workspace.open";
    match state.service.open(&req.path) {
        Ok(workspace) => {
            tracing::info!(
                requestId = request_id.0,
                operation,
                workspaceFileCount = workspace.summary.file_count,
                "{operation}.response"
            );
            Ok(Json(workspace))
        }
        Err(error) => Err(ApiError(error)),
    }
}

pub(crate) async fn search(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<SearchResult>, ApiError> {
    let operation = "workspace.search";
    let (marker_mode, fell_back) = mapping::parse_mode_with_fallback(&req.mode);
    if fell_back {
        mapping::log_mode_fallback(&request_id.0, operation, &req.mode);
    }
    let mode = match marker_mode {
        MarkerMode::Regex => SearchMode::Regex,
        MarkerMode::Keyword => SearchMode::Keyword,
    };
    let cond = SearchCondition {
        query: req.query,
        mode,
        case_sensitive: req.case_sensitive,
    };
    let range = TimeRange {
        start: req.start_time,
        end: req.end_time,
    };
    match state
        .service
        .search(&req.path, &cond, &range, req.context_lines)
    {
        Ok(result) => {
            tracing::info!(
                requestId = request_id.0,
                operation,
                searchMode = ?mode,
                queryLength = cond.query.len(),
                contextLineCount = req.context_lines,
                resultCount = result.total_matches,
                "{operation}.response"
            );
            Ok(Json(result))
        }
        Err(error) => Err(ApiError(error)),
    }
}

pub(crate) async fn context(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(req): Json<ContextRequest>,
) -> Result<Json<LogContextData>, ApiError> {
    let operation = "workspace.context";
    match state
        .service
        .read_context(&req.file_path, req.line_number, req.context_lines)
    {
        Ok(context) => {
            tracing::info!(
                requestId = request_id.0,
                operation,
                contextLineCount = req.context_lines,
                "{operation}.response"
            );
            Ok(Json(context))
        }
        Err(error) => Err(ApiError(error)),
    }
}

pub(crate) async fn latency_analyze(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(req): Json<AnalyzeRequest>,
) -> Result<Json<LatencyAnalysis>, ApiError> {
    let operation = "latency.analyze";
    let spec = mapping::to_spec(&req, &request_id.0);
    let range = TimeRange {
        start: req.start_time,
        end: req.end_time,
    };
    match state.service.analyze(&req.path, &range, &spec) {
        Ok(analysis) => {
            tracing::info!(
                requestId = request_id.0,
                operation,
                latencyRequestCount = analysis.requests.len(),
                "{operation}.response"
            );
            Ok(Json(analysis))
        }
        Err(error) => Err(ApiError(error)),
    }
}

pub(crate) async fn health_check(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(req): Json<HealthCheckRequest>,
) -> Result<Json<HealthReport>, ApiError> {
    let operation = "health.check";
    let spec = mapping::to_health_spec(&req, &request_id.0);
    let range = TimeRange {
        start: req.start_time,
        end: req.end_time,
    };
    match state.service.health_check(&req.path, &range, &spec) {
        Ok(report) => {
            tracing::info!(
                requestId = request_id.0,
                operation,
                errorFilterCount = spec.error_filters.len(),
                stageThresholdCount = spec.stage_thresholds.len(),
                errorCount = report.summary.error_count,
                slowRequestCount = report.summary.slow_request_count,
                "{operation}.response"
            );
            Ok(Json(report))
        }
        Err(error) => Err(ApiError(error)),
    }
}

pub(crate) async fn get_diagnostic_problems(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
) -> Result<Json<Value>, ApiError> {
    let operation = "diagnostic.list";
    match state.diagnostic_service.list() {
        Ok(problems) => {
            tracing::info!(
                requestId = request_id.0,
                operation,
                problemCount = value_count(&problems["problems"]),
                "{operation}.response"
            );
            Ok(Json(problems))
        }
        Err(error) => Err(ApiError(error)),
    }
}

pub(crate) async fn put_diagnostic_problems(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let operation = "diagnostic.save";
    match state.diagnostic_service.save(&body) {
        Ok(()) => {
            tracing::info!(requestId = request_id.0, operation, "{operation}.response");
            Ok(Json(body))
        }
        Err(error) => Err(ApiError(error)),
    }
}

pub(crate) async fn run_diagnostic(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(req): Json<DiagnosticRunRequest>,
) -> Result<Json<DiagnosticReport>, ApiError> {
    let operation = "diagnostic.run";
    let problem = mapping::to_problem(&req.problem, &request_id.0).map_err(ApiError)?;
    let range = TimeRange {
        start: req.start_time,
        end: req.end_time,
    };
    match state.service.run_diagnostic(&req.path, &range, &problem) {
        Ok(report) => {
            tracing::info!(
                requestId = request_id.0,
                operation,
                judgmentCount = problem.judgments.len(),
                hit = report.hit,
                "{operation}.response"
            );
            Ok(Json(report))
        }
        Err(error) => Err(ApiError(error)),
    }
}

pub(crate) async fn get_rule_config(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
) -> Result<Json<Value>, ApiError> {
    let operation = "rule.list";
    match state.rule_service.list() {
        Ok(rules) => {
            tracing::info!(
                requestId = request_id.0,
                operation,
                ruleCount = value_count(&rules),
                "{operation}.response"
            );
            Ok(Json(rules))
        }
        Err(error) => Err(ApiError(error)),
    }
}

pub(crate) async fn put_rule_config(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let operation = "rule.save";
    match state.rule_service.save(&body) {
        Ok(()) => {
            tracing::info!(requestId = request_id.0, operation, "{operation}.response");
            Ok(Json(body))
        }
        Err(error) => Err(ApiError(error)),
    }
}

fn value_count(value: &Value) -> usize {
    match value {
        Value::Array(items) => items.len(),
        Value::Object(items) => items.len(),
        _ => 0,
    }
}
