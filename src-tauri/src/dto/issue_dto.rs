//! 与 TypeScript 侧保持一致的 Issue DTO。

#[derive(Debug, Clone)]
pub struct IssueDto {
    pub category: String,
    pub level: String,
    pub message: String,
}
