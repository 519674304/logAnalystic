//! Issue DTOs mirrored to TypeScript.

#[derive(Debug, Clone)]
pub struct IssueDto {
    pub category: String,
    pub level: String,
    pub message: String,
}
