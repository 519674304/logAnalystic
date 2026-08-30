//! 健康体检输入契约：错误过滤器 + 时延分析输入 + 慢阈值。

use crate::domain::latency_analysis::spec::{LatencyAnalysisSpec, Marker};

/// 某个 stage 的慢阈值（毫秒）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StageThreshold {
    pub stage_id: String,
    pub threshold_ms: i64,
}

/// 一次健康体检的全部输入。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HealthCheckSpec {
    /// 错误过滤器：纯 pattern 匹配日志 raw 行，命中即系统异常。
    pub error_filters: Vec<Marker>,
    /// 复用的时延分析输入（请求拆分 + 拦截 + 阶段）。
    pub latency: LatencyAnalysisSpec,
    /// 慢阈值表；空向量 = 不判慢。
    pub stage_thresholds: Vec<StageThreshold>,
}
