//! server：本机 Web 服务（axum）。
//!
//! 安全边界（见 `docs/project/architecture/04-technical-architecture.md`）：
//! 仅监听 127.0.0.1；开发期仅对 Vite dev（http://localhost:1420）开放 CORS。

pub mod diagnostics;

use std::{path::Path, sync::Arc, time::Instant};

use axum::{
    extract::{Extension, Request, State},
    http::{HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use log_core::application::diagnostic_problem_service::DiagnosticProblemService;
use log_core::application::log_workspace_service::LogWorkspaceService;
use log_core::application::rule_set_service::RuleSetService;
use log_core::domain::health_check::result::HealthReport;
use log_core::domain::health_check::spec::{HealthCheckSpec, StageThreshold};
use log_core::domain::latency_analysis::result::LatencyAnalysis;
use log_core::domain::latency_analysis::spec::{
    LatencyAnalysisSpec, Marker, MarkerMode, StageSpec,
};
use log_core::domain::specialist_diagnosis::result::DiagnosticReport;
use log_core::domain::specialist_diagnosis::spec::{
    Connector, DiagnosticJudgment, DiagnosticProblem, JudgmentType, ReturnMode, SearchRange,
};
use log_core::domain::log_workspace::port::{
    LogContextData, SearchCondition, SearchMode, SearchResult, TimeRange,
};
use log_core::domain::log_workspace::workspace::Workspace;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const DEV_ORIGIN: &str = "http://localhost:1420";
const LISTEN_ADDR: &str = "127.0.0.1:8080";

#[derive(Serialize)]
struct Health {
    status: &'static str,
    version: &'static str,
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

#[derive(Clone)]
struct AppState {
    service: Arc<LogWorkspaceService>,
    rule_service: Arc<RuleSetService>,
    diagnostic_service: Arc<DiagnosticProblemService>,
}

#[derive(Clone)]
struct RequestId(String);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenRequest {
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchRequest {
    path: String,
    query: String,
    #[serde(default)]
    mode: String,
    #[serde(default)]
    case_sensitive: bool,
    #[serde(default = "default_context_lines")]
    context_lines: usize,
    #[serde(default)]
    start_time: Option<String>,
    #[serde(default)]
    end_time: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContextRequest {
    file_path: String,
    line_number: u64,
    #[serde(default = "default_context_lines")]
    context_lines: usize,
}

fn default_context_lines() -> usize {
    1
}

/// 前端扁平 stage 形状：`{ id, startMarkers, endMarkers }`。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StageSpecDto {
    id: String,
    start_markers: Vec<MarkerDto>,
    end_markers: Vec<MarkerDto>,
}

/// 前端 marker 形状：`{ pattern, mode }`。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarkerDto {
    pattern: String,
    mode: String,
}

/// 前端 `LatencyAnalysisSpec` 形状。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeRequest {
    path: String,
    #[serde(default)]
    start_time: Option<String>,
    #[serde(default)]
    end_time: Option<String>,
    #[serde(default)]
    request_starts: Vec<MarkerDto>,
    #[serde(default)]
    intercept_ends: Vec<MarkerDto>,
    process_stages: Vec<StageSpecDto>,
}

/// 前端 `HealthCheckSpec` 形状。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HealthCheckRequest {
    path: String,
    #[serde(default)]
    start_time: Option<String>,
    #[serde(default)]
    end_time: Option<String>,
    #[serde(default)]
    error_filters: Vec<MarkerDto>,
    #[serde(default)]
    request_starts: Vec<MarkerDto>,
    #[serde(default)]
    intercept_ends: Vec<MarkerDto>,
    #[serde(default)]
    process_stages: Vec<StageSpecDto>,
    #[serde(default)]
    stage_thresholds: Vec<StageThresholdDto>,
}

/// 前端 `StageThreshold` 形状。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StageThresholdDto {
    stage_id: String,
    threshold_ms: i64,
}

/// 前端诊断运行请求形状：`problem` 已由前端把 matcherId/stageId 投影成 pattern。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticRunRequest {
    path: String,
    #[serde(default)]
    start_time: Option<String>,
    #[serde(default)]
    end_time: Option<String>,
    problem: DiagnosticProblemDto,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticProblemDto {
    name: String,
    hit_label: String,
    miss_label: String,
    #[serde(default)]
    judgments: Vec<DiagnosticJudgmentDto>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticJudgmentDto {
    /// 前端用 `type` 字段（matcher / stage）。
    #[serde(rename = "type")]
    judgment_type: String,
    #[serde(default)]
    marker: Option<MarkerDto>,
    #[serde(default)]
    stage: Option<StageSpecDto>,
    range: String,
    #[serde(default)]
    window_ms: Option<i64>,
    when: String,
    #[serde(default)]
    return_mode: String,
    #[serde(default)]
    conclusion: String,
    #[serde(default)]
    connector: String,
}

fn parse_mode_with_fallback(mode: &str) -> (MarkerMode, bool) {
    match mode {
        "regex" => (MarkerMode::Regex, false),
        "keyword" => (MarkerMode::Keyword, false),
        _ => (MarkerMode::Keyword, true),
    }
}

fn log_mode_fallback(request_id: &str, operation: &str, mode: &str) {
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

fn to_spec(req: &AnalyzeRequest, request_id: &str) -> LatencyAnalysisSpec {
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
            .map(|s| StageSpec {
                id: s.id.clone(),
                starts: s
                    .start_markers
                    .iter()
                    .map(|marker| to_marker(marker, request_id, OPERATION))
                    .collect(),
                ends: s
                    .end_markers
                    .iter()
                    .map(|marker| to_marker(marker, request_id, OPERATION))
                    .collect(),
            })
            .collect(),
    }
}

fn to_health_spec(req: &HealthCheckRequest, request_id: &str) -> HealthCheckSpec {
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
                .map(|s| StageSpec {
                    id: s.id.clone(),
                    starts: s
                        .start_markers
                        .iter()
                        .map(|marker| to_marker(marker, request_id, OPERATION))
                        .collect(),
                    ends: s
                        .end_markers
                        .iter()
                        .map(|marker| to_marker(marker, request_id, OPERATION))
                        .collect(),
                })
                .collect(),
        },
        stage_thresholds: req
            .stage_thresholds
            .iter()
            .map(|t| StageThreshold {
                stage_id: t.stage_id.clone(),
                threshold_ms: t.threshold_ms,
            })
            .collect(),
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

fn to_problem(dto: &DiagnosticProblemDto, request_id: &str) -> Result<DiagnosticProblem, String> {
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

fn failure_category(_error: &str) -> &'static str {
    "service_error"
}

fn log_started(request_id: &str, operation: &str) {
    tracing::info!(requestId = request_id, operation, "{operation}.started");
}

fn log_completed(request_id: &str, operation: &str, started_at: Instant) {
    tracing::info!(
        requestId = request_id,
        operation,
        durationMs = started_at.elapsed().as_millis() as u64,
        "{operation}.completed"
    );
}

fn log_failed_response(request_id: &str, operation: &str) {
    tracing::error!(
        requestId = request_id,
        operation,
        retryable = true,
        failureCategory = failure_category(""),
        "{operation}.failed"
    );
}

fn operation_for(method: &Method, path: &str) -> &'static str {
    match (method, path) {
        (&Method::GET, "/health") => "health",
        (&Method::POST, "/api/open") => "workspace.open",
        (&Method::POST, "/api/search") => "workspace.search",
        (&Method::POST, "/api/context") => "workspace.context",
        (&Method::POST, "/api/latency/analyze") => "latency.analyze",
        (&Method::POST, "/api/health/check") => "health.check",
        (&Method::POST, "/api/diagnostic/run") => "diagnostic.run",
        (&Method::GET, "/api/diagnostic-problems") => "diagnostic.list",
        (&Method::PUT, "/api/diagnostic-problems") => "diagnostic.save",
        (&Method::GET, "/api/rule-config") => "rule.list",
        (&Method::PUT, "/api/rule-config") => "rule.save",
        _ => "http.request",
    }
}

async fn request_diagnostics(mut request: Request, next: Next) -> Response {
    let request_id = RequestId(Uuid::new_v4().to_string());
    let operation = operation_for(request.method(), request.uri().path());
    let started_at = Instant::now();
    request.extensions_mut().insert(request_id.clone());
    log_started(&request_id.0, operation);

    let response = next.run(request).await;
    if response.status().is_client_error() || response.status().is_server_error() {
        log_failed_response(&request_id.0, operation);
    } else {
        log_completed(&request_id.0, operation, started_at);
    }
    response
}

async fn health(Extension(request_id): Extension<RequestId>) -> Json<Health> {
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

async fn open(
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

async fn search(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<SearchResult>, ApiError> {
    let operation = "workspace.search";
    let (marker_mode, fell_back) = parse_mode_with_fallback(&req.mode);
    if fell_back {
        log_mode_fallback(&request_id.0, operation, &req.mode);
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

async fn context(
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

async fn latency_analyze(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(req): Json<AnalyzeRequest>,
) -> Result<Json<LatencyAnalysis>, ApiError> {
    let operation = "latency.analyze";
    let spec = to_spec(&req, &request_id.0);
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

async fn health_check(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(req): Json<HealthCheckRequest>,
) -> Result<Json<HealthReport>, ApiError> {
    let operation = "health.check";
    let spec = to_health_spec(&req, &request_id.0);
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

async fn get_diagnostic_problems(
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

async fn put_diagnostic_problems(
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

async fn run_diagnostic(
    State(state): State<AppState>,
    Extension(request_id): Extension<RequestId>,
    Json(req): Json<DiagnosticRunRequest>,
) -> Result<Json<DiagnosticReport>, ApiError> {
    let operation = "diagnostic.run";
    let problem = to_problem(&req.problem, &request_id.0).map_err(ApiError)?;
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

async fn get_rule_config(
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

async fn put_rule_config(
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

fn app_with_state(state: AppState) -> Router {
    let dev_origin: HeaderValue = DEV_ORIGIN.parse().expect("valid dev origin");
    let cors = CorsLayer::new()
        .allow_origin(dev_origin)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/health", get(health))
        .route("/api/open", post(open))
        .route("/api/search", post(search))
        .route("/api/context", post(context))
        .route("/api/latency/analyze", post(latency_analyze))
        .route("/api/health/check", post(health_check))
        .route("/api/diagnostic/run", post(run_diagnostic))
        .route(
            "/api/diagnostic-problems",
            get(get_diagnostic_problems).put(put_diagnostic_problems),
        )
        .route(
            "/api/rule-config",
            get(get_rule_config).put(put_rule_config),
        )
        .layer(cors)
        .layer(middleware::from_fn(request_diagnostics))
        .with_state(state)
}

pub fn app() -> Router {
    app_with_state(AppState {
        service: Arc::new(LogWorkspaceService::new()),
        rule_service: Arc::new(RuleSetService::new()),
        diagnostic_service: Arc::new(DiagnosticProblemService::new()),
    })
}

struct ApiError(String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (StatusCode::BAD_REQUEST, Json(ErrorBody { error: self.0 })).into_response()
    }
}

#[tokio::main]
async fn main() {
    let log_dir = Path::new("app-data/logs");
    let _diagnostics_guard = diagnostics::init(log_dir).expect("initialize diagnostics");
    tracing::info!(listenAddress = LISTEN_ADDR, "server.started");

    let app = app();

    let listener = tokio::net::TcpListener::bind(LISTEN_ADDR)
        .await
        .expect("bind 127.0.0.1:8080");
    println!("server listening on http://{LISTEN_ADDR}");
    axum::serve(listener, app).await.expect("server run");
}

#[cfg(test)]
mod tests {
    use super::{failure_category, parse_mode_with_fallback};
    use log_core::domain::latency_analysis::spec::MarkerMode;

    #[test]
    fn request_event_regex_mode_does_not_fallback() {
        assert_eq!(
            parse_mode_with_fallback("regex"),
            (MarkerMode::Regex, false)
        );
    }

    #[test]
    fn request_event_unknown_mode_falls_back_to_keyword() {
        assert_eq!(
            parse_mode_with_fallback("unexpected-mode"),
            (MarkerMode::Keyword, true)
        );
    }

    #[test]
    fn request_event_failure_category_omits_sensitive_error_text() {
        assert_eq!(
            failure_category("token=DO_NOT_LOG path=C:\\secret query=needle"),
            "service_error"
        );
    }
}
