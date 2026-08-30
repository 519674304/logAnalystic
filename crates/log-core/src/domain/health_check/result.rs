//! 健康体检结果契约（camelCase 序列化，与前端对齐）。

use serde::Serialize;

/// 一条系统异常。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemError {
    pub timestamp: String,
    pub level: String,
    pub tag: String,
    pub message: String,
}

/// 一个慢阶段样本。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlowStage {
    pub stage_id: String,
    pub duration_ms: i64,
    pub threshold_ms: i64,
}

/// 一个含慢阶段的请求。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlowRequest {
    pub request_id: String,
    pub total_ms: i64,
    pub slow_stages: Vec<SlowStage>,
}

/// 汇总计数。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthSummary {
    pub error_count: usize,
    pub slow_request_count: usize,
    pub slow_stage_count: usize,
    pub total_request_count: usize,
}

/// 健康体检结果。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub summary: HealthSummary,
    pub system_errors: Vec<SystemError>,
    pub slow_requests: Vec<SlowRequest>,
}
