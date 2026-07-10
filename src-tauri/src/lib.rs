//! Tauri backend library.
//!
//! This crate keeps the command boundary, application services, domain rules,
//! and infrastructure adapters in separate modules so the backend can grow
//! without collapsing into one file.

pub mod application;
pub mod commands;
pub mod domain;
pub mod dto;
pub mod infrastructure;
