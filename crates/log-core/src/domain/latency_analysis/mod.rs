//! 时延分析：端侧栈式时延分析核心。
//!
//! 请求按栈（LIFO）划分：`request_starts`（任一）命中即压栈开新请求；拦截 end matcher 命中弹出
//! 栈顶请求并整体丢弃（拦截优先）；process 级 stage 的 start/end 累积到栈顶请求，每个
//! stage 的多个 start/end matcher 按数组顺序优先取首个命中算时延；最后汇总统计。无 result 闭合、无并行子进程建模。
//!
//! 输入为已投影的 [`spec::LatencyAnalysisSpec`]，由规则配置层投影；本模块不读 TOML。

pub mod analyzer;
pub mod marker;
pub mod result;
pub mod spec;
pub mod timestamp;
