//! 桌面壳层使用的日志搜索命令。

use crate::application::log_search_service::search_logs;
use crate::dto::log_dto::{LogSearchRequestDto, LogSearchResponseDto};

#[tauri::command(rename = "search_logs")]
pub fn search_logs_command(request: LogSearchRequestDto) -> LogSearchResponseDto {
    search_logs(&request)
}
