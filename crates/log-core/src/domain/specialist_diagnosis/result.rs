//! 专科诊断结果契约（camelCase 序列化，与前端对齐）。

use serde::Serialize;

/// 一条命中证据：marker 命中或 stage 的 start/end 命中。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HitEvidence {
    /// `marker`（matcher 命中）、`start` / `end`（stage 命中）。
    pub role: String,
    pub timestamp: String,
    pub message: String,
}

/// 一条判断依据的判定结果。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgmentResult {
    /// 短结论。
    pub conclusion: String,
    /// 是否满足 `when`（命中）。
    pub satisfied: bool,
    /// 实际状态：`hit` / `miss`（matcher），`closed` / `unclosed` / `missing`（stage）。
    pub state: String,
    /// 命中证据。
    pub evidence: Vec<HitEvidence>,
}

/// 一次诊断的最终结论。
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    /// 问题名。
    pub name: String,
    /// 最终命中（各判断依据按「且/或」折叠的结果）。
    pub hit: bool,
    /// 最终结论话术。
    pub conclusion: String,
    /// 各判断依据的判定明细。
    pub judgments: Vec<JudgmentResult>,
}
