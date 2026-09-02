use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::Value;
use server::app::app;
use tower::ServiceExt;

fn temporary_log_dir() -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
        "specialist-diagnosis-integration-{}",
        std::process::id()
    ))
}

#[tokio::test]
async fn run_diagnostic_returns_folded_conclusion() {
    let dir = temporary_log_dir();
    std::fs::create_dir_all(&dir).expect("create temp log dir");
    // LogcatParser 格式：<lineNo>,<date> <time> <pid> <tid> <level> <appPrefix>/<package>/<tag>: <message>
    // audio init 落在时间窗 t0=10:00 之前，但处于有界回溯 [10:00-10min, 10:05] 内 → 收音未闭合。
    std::fs::write(
        dir.join("demo.log"),
        "1,2026-07-05 09:50:00.000 1 1 I A00010/com.demo.app/Order: audio init\n\
         2,2026-07-05 10:03:00.000 1 1 I A00010/com.demo.app/Order: wake attempt\n",
    )
    .expect("write log");

    let body = serde_json::json!({
        "path": dir.to_string_lossy(),
        "startTime": "2026-07-05 10:00:00.000",
        "endTime": "2026-07-05 10:05:00.000",
        "problem": {
            "name": "唤不醒",
            "hitLabel": "唤不醒",
            "missLabel": "唤醒正常",
            "judgments": [
                {
                    "type": "matcher",
                    "marker": { "pattern": "唤醒开关开启", "mode": "keyword" },
                    "range": "unbounded",
                    "when": "miss",
                    "returnMode": "all",
                    "conclusion": "唤醒开关未打开",
                    "connector": "and"
                },
                {
                    "type": "stage",
                    "stage": {
                        "id": "audio",
                        "startMarkers": [{ "pattern": "audio init", "mode": "keyword" }],
                        "endMarkers": [{ "pattern": "audio ready", "mode": "keyword" }]
                    },
                    "range": "boundedBacktrack",
                    "windowMs": 600000,
                    "when": "unclosed",
                    "returnMode": "all",
                    "conclusion": "设备正在收音",
                    "connector": "and"
                }
            ]
        }
    });

    let response = app()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/diagnostic/run")
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
    let report: Value = serde_json::from_slice(&bytes).expect("parse diagnostic report");

    assert_eq!(report["name"].as_str(), Some("唤不醒"));
    assert_eq!(report["hit"].as_bool(), Some(true));
    assert_eq!(
        report["conclusion"].as_str(),
        Some("唤醒开关未打开；设备正在收音；唤不醒")
    );
    assert_eq!(report["judgments"][0]["state"].as_str(), Some("miss"));
    assert_eq!(report["judgments"][0]["satisfied"].as_bool(), Some(true));
    assert_eq!(report["judgments"][1]["state"].as_str(), Some("unclosed"));
    assert_eq!(report["judgments"][1]["satisfied"].as_bool(), Some(true));
    // 收音 stage 的证据应包含 09:50 的 audio init（有界回溯命中了 t0 之前的 start）。
    assert_eq!(
        report["judgments"][1]["evidence"][0]["role"].as_str(),
        Some("start")
    );
    assert_eq!(
        report["judgments"][1]["evidence"][0]["timestamp"].as_str(),
        Some("2026-07-05 09:50:00.000")
    );

    std::fs::remove_dir_all(&dir).expect("clean temp dir");
}
