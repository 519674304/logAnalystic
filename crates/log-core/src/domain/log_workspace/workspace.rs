use serde::Serialize;

/// 工作区内的单个候选日志文件。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRef {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub file_count: usize,
    pub total_size_bytes: u64,
}

/// 日志工作区：目录 + 候选文件清单 + 摘要，不整体载入日志正文。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub directory: String,
    pub files: Vec<FileRef>,
    pub summary: WorkspaceSummary,
}
