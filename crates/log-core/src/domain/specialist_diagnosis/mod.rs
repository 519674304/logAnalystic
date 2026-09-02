//! 专科诊断：一个诊断问题由多个判断依据（matcher/stage 搜索 + 三种下界 + 命中条件）组合，
//! 按「且/或」折叠出最终结论。与「时延分析」解耦，只做「在时间窗内找 marker/stage 是否命中」。

pub mod analyzer;
pub mod result;
pub mod spec;
