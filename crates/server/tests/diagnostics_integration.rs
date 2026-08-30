use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{body::Body, http::Request};
use serde_json::Value;
use server::app::{app, diagnostics};
use tower::ServiceExt;

fn temporary_log_dir() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock after Unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("log-analystic-diagnostics-integration-{nonce}"))
}

#[tokio::test]
async fn diagnostics_integration_persists_safe_router_events_as_jsonl() {
    let log_dir = temporary_log_dir();
    let guard = diagnostics::init_for_test(&log_dir).expect("initialize temporary diagnostics");

    let health_response = app()
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .expect("health request"),
        )
        .await
        .expect("health response");
    assert!(health_response.status().is_success());

    let search_response = app()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/search")
                .header("content-type", "application/json")
                .body(Body::from(
                    r#"{"path":"C:\\secret","query":"DO_NOT_LOG","mode":"unknown-mode"}"#,
                ))
                .expect("search request"),
        )
        .await
        .expect("search response");
    assert_eq!(
        search_response.status(),
        axum::http::StatusCode::BAD_REQUEST
    );

    let malformed_search_response = app()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/search")
                .header("content-type", "application/json")
                .body(Body::from("{"))
                .expect("malformed search request"),
        )
        .await
        .expect("malformed search response");
    assert_eq!(
        malformed_search_response.status(),
        axum::http::StatusCode::BAD_REQUEST
    );

    diagnostics::flush(guard);

    let log_file = fs::read_dir(&log_dir)
        .expect("read diagnostics directory")
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| {
            path.extension()
                .is_some_and(|extension| extension == "jsonl")
        })
        .expect("daily JSONL diagnostic log");
    let contents = fs::read_to_string(&log_file).expect("read JSONL diagnostics");
    let events: Vec<Value> = contents
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| serde_json::from_str(line).expect("each diagnostic line is JSON"))
        .collect();

    let health_started_request_id = events
        .iter()
        .find(|event| event["level"] == "INFO" && event["fields"]["message"] == "health.started")
        .and_then(|event| event["fields"]["requestId"].as_str());
    assert!(health_started_request_id.is_some_and(|request_id| {
        events.iter().any(|event| {
            event["level"] == "INFO"
                && event["fields"]["message"] == "health.completed"
                && event["fields"]["requestId"].as_str() == Some(request_id)
        })
    }));
    assert!(events
        .iter()
        .any(|event| { event["level"] == "WARN" && event["fields"]["recovery"] == "keyword" }));
    let search_request_id = events
        .iter()
        .find(|event| {
            event["level"] == "WARN"
                && event["fields"]["message"] == "request.mode_fallback"
                && event["fields"]["operation"] == "workspace.search"
        })
        .and_then(|event| event["fields"]["requestId"].as_str())
        .expect("invalid-mode search request id");
    assert!(events.iter().any(|event| {
        event["level"] == "ERROR"
            && event["fields"]["message"] == "workspace.search.failed"
            && event["fields"]["requestId"].as_str() == Some(search_request_id)
            && event["fields"]["retryable"] == true
            && event["fields"]["failureCategory"] == "service_error"
    }));
    assert!(events.iter().any(|event| {
        event["level"] == "ERROR"
            && event["fields"]["message"] == "workspace.search.failed"
            && event["fields"]["requestId"]
                .as_str()
                .is_some_and(|request_id| request_id != search_request_id)
            && event["fields"]["retryable"] == true
            && event["fields"]["failureCategory"] == "service_error"
    }));
    assert!(!contents.contains("DO_NOT_LOG"));
    assert!(!contents.contains(r"C:\secret"));

    fs::remove_dir_all(log_dir).expect("remove temporary diagnostics directory");
}
