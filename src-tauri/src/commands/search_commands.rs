//! Log search command used by the desktop shell.

use crate::application::log_search_service::search_logs;
use crate::dto::log_dto::{LogSearchRequestDto, LogSearchResponseDto};

#[tauri::command]
pub fn search_logs_command(request: LogSearchRequestDto) -> LogSearchResponseDto {
    search_logs(&request)
}
