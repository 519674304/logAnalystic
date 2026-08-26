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
}

impl Default for LogWorkspaceService {
    fn default() -> Self {
        Self::new()
    }
}
