//! Tauri 命令处理器。
//!
//! 命令层只做薄入口：校验边界、调用应用服务，再把结果映射回前端。

pub mod health_commands;
pub mod rule_commands;
pub mod search_commands;
pub mod saved_query_commands;
