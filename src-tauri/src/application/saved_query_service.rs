//! 保存查询管理的应用服务。
//!
//! 这里把编排逻辑和文件存储分开，命令层可以一直保持很薄，
//! 后续替换持久化方式也不用碰 UI 契约。

use crate::infrastructure::file_storage::app_data_dir::resolve_data_dir;
use crate::infrastructure::file_storage::saved_query_store::{
    load_saved_queries, save_saved_queries, saved_query_store_path, SavedQueryRecord,
};
use std::io;

fn default_saved_queries() -> Vec<SavedQueryRecord> {
    vec![
        SavedQueryRecord {
            id: String::from("q1"),
            name: String::from("唤醒请求"),
            description: String::from("定位 wakeup 相关关键日志"),
            group: String::from("core"),
            tags: vec![String::from("wakeup"), String::from("core")],
            query: String::from("wakeup"),
            mode: String::from("keyword"),
            case_sensitive: false,
            time_range: String::from("2026-06-12 10:30 ~ 10:45"),
        },
        SavedQueryRecord {
            id: String::from("q2"),
            name: String::from("健康检查失败"),
            description: String::from("查看流程中的健康检查异常日志"),
            group: String::from("ops"),
            tags: vec![String::from("health"), String::from("timeout")],
            query: String::from("health check"),
            mode: String::from("keyword"),
            case_sensitive: false,
            time_range: String::from("2026-06-12 10:30 ~ 10:40"),
        },
    ]
}

pub fn list_saved_queries() -> io::Result<Vec<SavedQueryRecord>> {
    let base_dir = resolve_data_dir()?;
    let path = saved_query_store_path(&base_dir);

    if !path.exists() {
        let defaults = default_saved_queries();
        save_saved_queries(&base_dir, &defaults)?;
        return Ok(defaults);
    }

    load_saved_queries(base_dir)
}

pub fn upsert_saved_query(query: SavedQueryRecord) -> io::Result<Vec<SavedQueryRecord>> {
    let base_dir = resolve_data_dir()?;
    let mut queries = list_saved_queries()?;

    match queries.iter().position(|item| item.id == query.id) {
        Some(index) => queries[index] = query,
        None => queries.push(query),
    }

    save_saved_queries(&base_dir, &queries)?;
    Ok(queries)
}

pub fn delete_saved_query(query_id: &str) -> io::Result<Vec<SavedQueryRecord>> {
    let base_dir = resolve_data_dir()?;
    let mut queries = list_saved_queries()?;
    queries.retain(|item| item.id != query_id);
    save_saved_queries(&base_dir, &queries)?;
    Ok(queries)
}
