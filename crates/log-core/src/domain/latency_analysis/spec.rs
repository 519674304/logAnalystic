//! 时延分析输入契约：已投影的分析规则（由规则配置层投影，本模块不读 TOML）。

/// marker 匹配方式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarkerMode {
    Keyword,
    Regex,
}

/// 单个日志标记：pattern + 匹配方式（大小写不敏感，与前端一致）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Marker {
    pub pattern: String,
    pub mode: MarkerMode,
}

/// process 级 stage：产真实时延样本，每个 stage 只取第一对 start/end。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StageSpec {
    pub id: String,
    pub start: Marker,
    pub end: Marker,
}

/// 一次时延分析的全部输入：请求拆分、拦截与产样本的 process 级 stage。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LatencyAnalysisSpec {
    /// 请求拆分点（flow 级 order=1 非拦截聚合起点），命中即压栈开新请求。
    pub request_start: Marker,
    /// 拦截 stage（kind=intercept）的结束 matcher 集合，任一命中即弹出栈顶请求并整体丢弃。
    pub intercept_ends: Vec<Marker>,
    /// process 级 stage，产时延样本。
    pub process_stages: Vec<StageSpec>,
}
