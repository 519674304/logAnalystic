//! Application services orchestrate use-cases.
//!
//! The initial M0 only needs the skeleton, but this module is where workflow
//! coordination will live when log analysis, rule loading, and latency export
//! are implemented.

pub mod log_search_service;
pub mod saved_query_service;
