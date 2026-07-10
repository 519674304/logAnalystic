//! Tauri 后端库。
//!
//! 这个 crate 将命令边界、应用服务、领域规则和基础设施适配器分开，
//! 方便后端后续扩展，不会挤成一个文件。

pub mod application;
pub mod commands;
pub mod domain;
pub mod dto;
pub mod infrastructure;
