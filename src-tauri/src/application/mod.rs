//! 应用服务层负责编排用例。
//!
//! 当前 M0 先保留骨架，等日志分析、规则加载和时延导出实现后，
//! 流程协调都放在这里。

pub mod log_search_service;
pub mod rule_catalog_service;
pub mod saved_query_service;
