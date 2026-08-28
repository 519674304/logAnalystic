use crate::domain::latency_analysis::analyzer::LatencyAnalyzer;
use crate::domain::latency_analysis::result::LatencyAnalysis;
use crate::domain::latency_analysis::spec::LatencyAnalysisSpec;
use crate::domain::log_workspace::log_entry::LogEntry;
use crate::domain::log_workspace::port::{
    LogContextData, LogSource, SearchCondition, SearchResult, TimeRange,
};
use crate::domain::log_workspace::workspace::Workspace;
use crate::infrastructure::ripgrep_log_source::RipgrepLogSource;

/// 日志工作区应用服务：编排 open / search / read_context，对外暴露统一入口。
pub struct LogWorkspaceService {
    source: RipgrepLogSource,
}

impl LogWorkspaceService {
    pub fn new() -> Self {
        Self {
            source: RipgrepLogSource,
        }
    }

    pub fn open(&self, dir: &str) -> Result<Workspace, String> {
        self.source.open(dir)
    }

    pub fn search(
        &self,
        dir: &str,
        cond: &SearchCondition,
        range: &TimeRange,
        context_lines: usize,
    ) -> Result<SearchResult, String> {
        self.source.search(dir, cond, range, context_lines)
    }

    pub fn read_context(
        &self,
        file_path: &str,
        line_number: u64,
        context_lines: usize,
    ) -> Result<LogContextData, String> {
        self.source.read_context(file_path, line_number, context_lines)
    }

    pub fn entries(&self, dir: &str, range: &TimeRange) -> Result<Vec<LogEntry>, String> {
        self.source.entries(dir, range)
    }

    /// 时延分析：单遍解析条目 + 栈式拆分，返回请求样本与全局统计。
    pub fn analyze(
        &self,
        dir: &str,
        range: &TimeRange,
        spec: &LatencyAnalysisSpec,
    ) -> Result<LatencyAnalysis, String> {
        let entries = self.source.entries(dir, range)?;
        LatencyAnalyzer::analyze(spec, &entries)
    }
}

impl Default for LogWorkspaceService {
    fn default() -> Self {
        Self::new()
    }
}
