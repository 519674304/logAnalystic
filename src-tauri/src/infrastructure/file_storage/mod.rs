//! Local file-backed storage adapters.
//!
//! The desktop app keeps user-specific data on disk so saved searches and
//! preferences survive restarts without requiring a server.

pub mod saved_query_store;
