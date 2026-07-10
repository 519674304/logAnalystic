//! Issue category values for rule and analysis feedback.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IssueCategory {
    Tip,
    Warning,
    Exception,
}
