use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::Value;
use server::app::app;
use tower::ServiceExt;

fn temporary_log_dir() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock after Unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("log-analystic-latency-integration-{nonce}"))
}

#[tokio::test]
async fn latency_analysis_excludes_requests_outside_the_selected_time_range() {
    let dir = temporary_log_dir();
    fs::create_dir_all(&dir).expect("create temporary log directory");
    fs::write(
        dir.join("demo.log"),
        "1,2026-07-05 10:00:00.000 1 1 I A00010/com.demo.app/Order: request started\n\
         2,2026-07-05 10:00:00.100 1 1 I A00010/com.demo.app/Order: request completed\n\
         3,2026-07-05 10:01:00.000 1 1 I A00010/com.demo.app/Order: request started\n\
         4,2026-07-05 10:01:00.400 1 1 I A00010/com.demo.app/Order: request completed\n\
         5,2026-07-05 10:02:00.000 1 1 I A00010/com.demo.app/Order: request started\n\
         6,2026-07-05 10:02:00.300 1 1 I A00010/com.demo.app/Order: request completed\n",
    )
    .expect("write log fixture");

    let body = serde_json::json!({
        "path": dir.to_string_lossy(),
        "startTime": "2026-07-05 10:01:00.000",
        "endTime": "2026-07-05 10:01:59.999",
        "requestStarts": [{ "pattern": "request started", "mode": "keyword" }],
        "interceptEnds": [],
        "processStages": [{
            "id": "STAGE-A",
            "startMarkers": [{ "pattern": "request started", "mode": "keyword" }],
            "endMarkers": [{ "pattern": "request completed", "mode": "keyword" }]
        }]
    });

    let response = app()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/latency/analyze")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .expect("build request"),
        )
        .await
        .expect("call endpoint");

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("read response body");
    let analysis: Value = serde_json::from_slice(&bytes).expect("parse analysis response");

    assert_eq!(analysis["requests"].as_array().map(Vec::len), Some(1));
    assert_eq!(
        analysis["requests"][0]["id"].as_str(),
        Some("2026-07-05 10:01:00.000")
    );
    assert_eq!(
        analysis["requests"][0]["samples"].as_array().map(Vec::len),
        Some(1)
    );
    assert_eq!(
        analysis["requests"][0]["samples"][0]["durationMs"].as_i64(),
        Some(400)
    );

    fs::remove_dir_all(dir).expect("remove temporary log directory");
}
