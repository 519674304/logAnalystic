use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::Value;
use server::app::app;
use tower::ServiceExt;

fn temporary_log_dir() -> std::path::PathBuf {
    std::env::temp_dir().join(format!("health-check-integration-{}", std::process::id()))
}

#[tokio::test]
async fn health_check_endpoint_returns_errors_and_slow_requests() {
    let dir = temporary_log_dir();
    std::fs::create_dir_all(&dir).expect("create temp log dir");
    // LogcatParser 格式：<lineNo>,<date> <time> <pid> <tid> <level> <appPrefix>/<package>/<tag>: <message>
    std::fs::write(
        dir.join("demo.log"),
        "1,2026-07-05 10:00:00.000 1 1 E A00010/com.demo.app/Order: fatal: oom\n\
         2,2026-07-05 10:00:00.100 1 1 I A00010/com.demo.app/Order: request started\n\
         3,2026-07-05 10:00:00.500 1 1 I A00010/com.demo.app/Order: request completed\n",
    )
    .expect("write log");

    let body = serde_json::json!({
        "path": dir.to_string_lossy(),
        "errorFilters": [{ "pattern": "fatal", "mode": "keyword" }],
        "requestStarts": [{ "pattern": "request started", "mode": "keyword" }],
        "interceptEnds": [],
        "processStages": [{
            "id": "STAGE-A",
            "startMarkers": [{ "pattern": "request started", "mode": "keyword" }],
            "endMarkers": [{ "pattern": "request completed", "mode": "keyword" }]
        }],
        "stageThresholds": [{ "stageId": "STAGE-A", "thresholdMs": 300 }]
    });

    let response = app()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/health/check")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .expect("build request"),
        )
        .await
        .expect("call endpoint");

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("read body");
    let report: Value = serde_json::from_slice(&bytes).expect("parse health report");

    assert_eq!(report["summary"]["errorCount"].as_u64(), Some(1));
    assert_eq!(report["summary"]["totalRequestCount"].as_u64(), Some(1));
    assert_eq!(report["summary"]["slowRequestCount"].as_u64(), Some(1));
    assert_eq!(report["summary"]["slowStageCount"].as_u64(), Some(1));
    assert_eq!(report["systemErrors"][0]["level"].as_str(), Some("E"));
    assert_eq!(report["systemErrors"][0]["tag"].as_str(), Some("Order"));
    assert_eq!(report["slowRequests"][0]["requestId"].as_str(), Some("2026-07-05 10:00:00.100"));
    assert_eq!(report["slowRequests"][0]["totalMs"].as_i64(), Some(400));
    assert_eq!(report["slowRequests"][0]["slowStages"][0]["stageId"].as_str(), Some("STAGE-A"));
    assert_eq!(report["slowRequests"][0]["slowStages"][0]["durationMs"].as_i64(), Some(400));

    std::fs::remove_dir_all(&dir).expect("clean temp dir");
}
