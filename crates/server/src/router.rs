#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::{body::Body, http::Request, http::StatusCode};
    use log_core::application::diagnostic_problem_service::DiagnosticProblemService;
    use log_core::application::log_workspace_service::LogWorkspaceService;
    use log_core::application::rule_set_service::RuleSetService;
    use log_core::infrastructure::file_storage::diagnostic_problem_store::DiagnosticProblemStore;
    use log_core::infrastructure::file_storage::rule_config_store::RuleConfigStore;
    use log_core::infrastructure::ripgrep_log_source::RipgrepLogSource;
    use tower::ServiceExt;

    use super::super::handlers::AppState;
    use super::router;

    #[tokio::test]
    async fn router_keeps_health_endpoint_available() {
        let state = AppState {
            service: Arc::new(LogWorkspaceService::new(RipgrepLogSource)),
            rule_service: Arc::new(RuleSetService::new(RuleConfigStore::new())),
            diagnostic_service: Arc::new(DiagnosticProblemService::new(
                DiagnosticProblemStore::new(),
            )),
        };

        let response = router(state)
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .expect("build health request"),
            )
            .await
            .expect("call health endpoint");

        assert_eq!(response.status(), StatusCode::OK);
    }
}
use std::time::Instant;

use axum::{
    extract::Request,
    http::{HeaderValue, Method},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

use super::handlers::{
    context, get_diagnostic_problems, get_rule_config, health, health_check, latency_analyze, open,
    put_diagnostic_problems, put_rule_config, run_diagnostic, search, AppState, RequestId,
};

const DEV_ORIGIN: &str = "http://localhost:1420";

pub(crate) fn router(state: AppState) -> Router {
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

fn failure_category(_error: &str) -> &'static str {
    "service_error"
}
