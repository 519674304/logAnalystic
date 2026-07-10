//! 保存查询命令处理器。

use crate::application::saved_query_service::{
    delete_saved_query, list_saved_queries, upsert_saved_query,
};
use crate::dto::command_dto::SavedQueryRecordDto;
use crate::infrastructure::file_storage::saved_query_store::SavedQueryRecord;

fn from_dto(dto: SavedQueryRecordDto) -> SavedQueryRecord {
    SavedQueryRecord {
        id: dto.id,
        name: dto.name,
        description: dto.description,
        group: dto.group,
        tags: dto.tags,
        query: dto.query,
        mode: dto.mode,
        case_sensitive: dto.case_sensitive,
        time_range: dto.time_range,
    }
}

#[tauri::command(rename = "list_saved_queries")]
pub fn list_saved_queries_command() -> Result<Vec<SavedQueryRecordDto>, String> {
    list_saved_queries()
        .map(|items| {
            items
                .into_iter()
                .map(|item| SavedQueryRecordDto {
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    group: item.group,
                    tags: item.tags,
                    query: item.query,
                    mode: item.mode,
                    case_sensitive: item.case_sensitive,
                    time_range: item.time_range,
                })
                .collect()
        })
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "upsert_saved_query")]
pub fn upsert_saved_query_command(query: SavedQueryRecordDto) -> Result<Vec<SavedQueryRecordDto>, String> {
    upsert_saved_query(from_dto(query))
        .map(|items| {
            items
                .into_iter()
                .map(|item| SavedQueryRecordDto {
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    group: item.group,
                    tags: item.tags,
                    query: item.query,
                    mode: item.mode,
                    case_sensitive: item.case_sensitive,
                    time_range: item.time_range,
                })
                .collect()
        })
        .map_err(|error| error.to_string())
}

#[tauri::command(rename = "delete_saved_query")]
pub fn delete_saved_query_command(query_id: String) -> Result<Vec<SavedQueryRecordDto>, String> {
    delete_saved_query(&query_id)
        .map(|items| {
            items
                .into_iter()
                .map(|item| SavedQueryRecordDto {
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    group: item.group,
                    tags: item.tags,
                    query: item.query,
                    mode: item.mode,
                    case_sensitive: item.case_sensitive,
                    time_range: item.time_range,
                })
                .collect()
        })
        .map_err(|error| error.to_string())
}
