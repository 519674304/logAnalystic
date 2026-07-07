//! Issue domain.
//!
//! The issue subsystem classifies warnings, exceptions, and informational
//! prompts so the frontend can render them consistently.

pub mod issue_category;
pub mod issue_level;

pub use issue_category::IssueCategory;
pub use issue_level::IssueLevel;
