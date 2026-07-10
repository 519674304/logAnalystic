//! 问题领域模块。
//!
//! 这个子系统负责把告警、异常和提示分类，方便前端统一展示。

pub mod issue_category;
pub mod issue_level;

pub use issue_category::IssueCategory;
pub use issue_level::IssueLevel;
