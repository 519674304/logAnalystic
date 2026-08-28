//! server：本机 Web 服务（axum）。
//!
//! 安全边界（见 `docs/project/architecture/04-technical-architecture.md`）：
//! 仅监听 127.0.0.1；开发期仅对 Vite dev（http://localhost:1420）开放 CORS。

use std::sync::Arc;

use axum::{
    extract::State,
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use log_core::application::log_workspace_service::LogWorkspaceService;
use log_core::application::rule_set_service::RuleSetService;
use log_core::domain::latency_analysis::result::LatencyAnalysis;
use log_core::domain::latency_analysis::spec::{LatencyAnalysisSpec, Marker, MarkerMode, StageSpec};
use log_core::domain::log_workspace::port::{
    LogContextData, SearchCondition, SearchMode, SearchResult, TimeRange,
};
use log_core::domain::log_workspace::workspace::Workspace;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tower_http::cors::{Any, CorsLayer};

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
}

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

/// 前端扁平 stage 形状：`{ id, startPattern, endPattern, startMode?, endMode? }`。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StageSpecDto {
    id: String,
    start_pattern: String,
    end_pattern: String,
    #[serde(default)]
    start_mode: Option<String>,
    #[serde(default)]
    end_mode: Option<String>,
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
    request_start: MarkerDto,
    #[serde(default)]
    intercept_ends: Vec<MarkerDto>,
    process_stages: Vec<StageSpecDto>,
}

fn parse_mode(mode: &str) -> MarkerMode {
    match mode {
        "regex" => MarkerMode::Regex,
        _ => MarkerMode::Keyword,
    }
}

fn to_marker(dto: &MarkerDto) -> Marker {
    Marker {
        pattern: dto.pattern.clone(),
        mode: parse_mode(&dto.mode),
    }
}

fn to_spec(req: &AnalyzeRequest) -> LatencyAnalysisSpec {
    LatencyAnalysisSpec {
        request_start: to_marker(&req.request_start),
        intercept_ends: req.intercept_ends.iter().map(to_marker).collect(),
        process_stages: req
            .process_stages
            .iter()
            .map(|s| StageSpec {
                id: s.id.clone(),
                start: Marker {
                    pattern: s.start_pattern.clone(),
                    mode: parse_mode(s.start_mode.as_deref().unwrap_or("keyword")),
                },
                end: Marker {
                    pattern: s.end_pattern.clone(),
                    mode: parse_mode(s.end_mode.as_deref().unwrap_or("keyword")),
                },
            })
            .collect(),
    }
}

async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        version: VERSION,
    })
}

async fn open(
    State(state): State<AppState>,
    Json(req): Json<OpenRequest>,
) -> Result<Json<Workspace>, ApiError> {
    state.service.open(&req.path).map(Json).map_err(ApiError)
}

async fn search(
    State(state): State<AppState>,
    Json(req): Json<SearchRequest>,
) -> Result<Json<SearchResult>, ApiError> {
    let mode = match req.mode.as_str() {
        "regex" => SearchMode::Regex,
        _ => SearchMode::Keyword,
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
    state
        .service
        .search(&req.path, &cond, &range, req.context_lines)
        .map(Json)
        .map_err(ApiError)
}

async fn context(
    State(state): State<AppState>,
    Json(req): Json<ContextRequest>,
) -> Result<Json<LogContextData>, ApiError> {
    state
        .service
        .read_context(&req.file_path, req.line_number, req.context_lines)
        .map(Json)
        .map_err(ApiError)
}

async fn latency_analyze(
    State(state): State<AppState>,
    Json(req): Json<AnalyzeRequest>,
) -> Result<Json<LatencyAnalysis>, ApiError> {
    let spec = to_spec(&req);
    let range = TimeRange {
        start: req.start_time,
        end: req.end_time,
    };
    state
        .service
        .analyze(&req.path, &range, &spec)
        .map(Json)
        .map_err(ApiError)
}

async fn get_rule_config(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    state.rule_service.list().map(Json).map_err(ApiError)
}

async fn put_rule_config(
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    state.rule_service.save(&body).map(|_| Json(body)).map_err(ApiError)
}

struct ApiError(String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorBody { error: self.0 }),
        )
            .into_response()
    }
}

#[tokio::main]
async fn main() {
    let dev_origin: HeaderValue = DEV_ORIGIN.parse().expect("valid dev origin");
    let cors = CorsLayer::new()
        .allow_origin(dev_origin)
        .allow_methods(Any)
        .allow_headers(Any);

    let state = AppState {
        service: Arc::new(LogWorkspaceService::new()),
        rule_service: Arc::new(RuleSetService::new()),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/open", post(open))
        .route("/api/search", post(search))
        .route("/api/context", post(context))
        .route("/api/latency/analyze", post(latency_analyze))
        .route("/api/rule-config", get(get_rule_config).put(put_rule_config))
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(LISTEN_ADDR)
        .await
        .expect("bind 127.0.0.1:8080");
    println!("server listening on http://{LISTEN_ADDR}");
    axum::serve(listener, app).await.expect("server run");
}
