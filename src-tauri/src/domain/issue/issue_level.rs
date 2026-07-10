//! 暴露给界面的问题严重级别。

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IssueLevel {
    Tip,
    Warning,
    Exception,
}
