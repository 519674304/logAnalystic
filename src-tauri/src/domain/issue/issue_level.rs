//! Issue severity values exposed to the UI.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IssueLevel {
    Tip,
    Warning,
    Exception,
}
