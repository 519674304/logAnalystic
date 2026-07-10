//! 规则与分析反馈使用的问题分类值。

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IssueCategory {
    Tip,
    Warning,
    Exception,
}
