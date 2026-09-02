//! 专科诊断输入契约：一个诊断问题 = 多个判断依据 + 两句话术。
//!
//! 每条判断依据是一条「在某个时间窗内找 marker/stage 是否命中」的搜索，配「且/或」连接符与短结论。
//! 复用时延分析的 `Marker` / `StageSpec` 作为搜索目标（由前端把 matcherId/stageId 投影成 pattern）。

use crate::domain::latency_analysis::spec::{Marker, StageSpec};
use crate::domain::latency_analysis::timestamp::{ms_to_timestamp, timestamp_to_ms};
use crate::domain::log_workspace::port::TimeRange;

/// 搜索范围（三种下界，相对 `t0`、从 `t1` 往回）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchRange {
    /// 仅时间窗 `[t0, t1]`。
    Window,
    /// 有界回溯 `[t0 − W, t1]`，`W` 建规则时配（毫秒）。
    BoundedBacktrack { window_ms: i64 },
    /// 无界回溯 `(−∞, t1]`。
    Unbounded,
}

/// 判断依据之间的逻辑连接符。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Connector {
    And,
    Or,
}

/// 命中返回：只取首个命中，还是列出全部命中。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReturnMode {
    First,
    All,
}

/// 判断依据的搜索目标：matcher（单个 marker）或 stage（start/end 配对）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JudgmentType {
    Matcher { marker: Marker },
    Stage { stage: StageSpec },
}

/// 一条判断依据。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagnosticJudgment {
    /// 搜索目标。
    pub judgment_type: JudgmentType,
    /// 搜索范围（三种下界之一）。
    pub range: SearchRange,
    /// 触发结论的结果条件：matcher 为 `hit` / `miss`，stage 为 `closed` / `unclosed` / `missing`。
    pub when: String,
    /// 命中返回：首个命中 / 全部命中。
    pub return_mode: ReturnMode,
    /// 短结论（命中时拼接进最终结论）。
    pub conclusion: String,
    /// 与上一条判断依据的「且/或」连接（首条忽略）。
    pub connector: Connector,
}

/// 一个诊断问题。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiagnosticProblem {
    pub name: String,
    /// 命中时结论。
    pub hit_label: String,
    /// 未命中时结论。
    pub miss_label: String,
    pub judgments: Vec<DiagnosticJudgment>,
}

/// 把「三种下界」折算成实际读取日志用的 `TimeRange`（都从 `t1` 往回）。
///
/// - `Window` → `[t0, t1]`
/// - `BoundedBacktrack { window_ms }` → `[t0 − W, t1]`
/// - `Unbounded` → `(−∞, t1]`
pub fn effective_range(range: &SearchRange, t0: Option<&str>, t1: Option<&str>) -> TimeRange {
    match range {
        SearchRange::Window => TimeRange {
            start: t0.map(str::to_string),
            end: t1.map(str::to_string),
        },
        SearchRange::Unbounded => TimeRange {
            start: None,
            end: t1.map(str::to_string),
        },
        SearchRange::BoundedBacktrack { window_ms } => {
            let start = t0
                .and_then(timestamp_to_ms)
                .map(|ms| ms_to_timestamp(ms - window_ms));
            TimeRange {
                start,
                end: t1.map(str::to_string),
            }
        }
    }
}
