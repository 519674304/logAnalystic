//! 本地文件存储适配器。
//!
//! 桌面应用把用户相关数据落到磁盘，这样保存的查询和偏好在重启后还能保留，
//! 也不需要服务端。

pub mod app_data_dir;
pub mod saved_query_store;
pub mod rule_catalog_store;
