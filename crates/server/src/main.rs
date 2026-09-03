//! server：本机 Web 服务（axum）。
//!
//! 安全边界（见 `docs/project/architecture/04-technical-architecture.md`）：
//! 仅监听 127.0.0.1；开发期仅对 Vite dev（http://localhost:1420）开放 CORS。

pub mod diagnostics;
pub mod dto;
pub mod handlers;
pub mod mapping;
pub mod router;

use std::{path::Path, sync::Arc};

use axum::Router;
use log_core::application::diagnostic_problem_service::DiagnosticProblemService;
use log_core::application::log_workspace_service::LogWorkspaceService;
use log_core::application::rule_set_service::RuleSetService;
use log_core::infrastructure::file_storage::diagnostic_problem_store::DiagnosticProblemStore;
use log_core::infrastructure::file_storage::rule_config_store::RuleConfigStore;
use log_core::infrastructure::ripgrep_log_source::RipgrepLogSource;

use handlers::AppState;

const LISTEN_ADDR: &str = "127.0.0.1:8080";

pub fn app() -> Router {
    router::router(AppState {
        service: Arc::new(LogWorkspaceService::new(RipgrepLogSource)),
        rule_service: Arc::new(RuleSetService::new(RuleConfigStore::new())),
        diagnostic_service: Arc::new(DiagnosticProblemService::new(DiagnosticProblemStore::new())),
    })
}

#[tokio::main]
async fn main() {
    let log_dir = Path::new("app-data/logs");
    let _diagnostics_guard = diagnostics::init(log_dir).expect("initialize diagnostics");
    tracing::info!(listenAddress = LISTEN_ADDR, "server.started");

    let listener = tokio::net::TcpListener::bind(LISTEN_ADDR)
        .await
        .expect("bind 127.0.0.1:8080");
    println!("server listening on http://{LISTEN_ADDR}");
    axum::serve(listener, app()).await.expect("server run");
}
