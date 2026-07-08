//! Application service for saved query management.
//!
//! The service keeps orchestration separate from file storage so later Tauri
//! commands can stay thin.

use crate::infrastructure::file_storage::saved_query_store::{
    load_saved_queries, save_saved_queries, SavedQueryRecord,
};
use std::io;
use std::path::Path;

pub fn list_saved_queries(base_dir: impl AsRef<Path>) -> io::Result<Vec<SavedQueryRecord>> {
    load_saved_queries(base_dir)
}

pub fn replace_saved_queries(
    base_dir: impl AsRef<Path>,
    queries: &[SavedQueryRecord],
) -> io::Result<()> {
    save_saved_queries(base_dir, queries)
}
