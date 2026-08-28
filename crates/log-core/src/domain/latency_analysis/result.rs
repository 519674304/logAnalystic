//! 时延分析结果契约（与前端 `LatencyAnalysis` 对齐，camelCase 序列化）。

use serde::Serialize;

/// 单个 process 级 stage 的时延样本。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSample {
    pub stage_id: String,
    pub start_timestamp: String,
    pub end_timestamp: String,
    pub duration_ms: i64,
}

/// 一次请求的时延分析结果。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequestAnalysis {
    pub id: String,
    pub total_ms: i64,
    pub samples: Vec<StageSample>,
}

/// 全局统计：只统计成功生成的阶段样本。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatencyStatistics {
    pub sample_count: usize,
    pub average_ms: i64,
    pub p90_ms: i64,
    pub max_ms: i64,
}

/// 时延分析结果。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatencyAnalysis {
    pub requests: Vec<RequestAnalysis>,
    pub stats: LatencyStatistics,
}
