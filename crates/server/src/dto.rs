use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRequest {
    pub path: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub path: String,
    pub query: String,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default = "default_context_lines")]
    pub context_lines: usize,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextRequest {
    pub file_path: String,
    pub line_number: u64,
    #[serde(default = "default_context_lines")]
    pub context_lines: usize,
}
pub fn default_context_lines() -> usize {
    1
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSpecDto {
    pub id: String,
    pub start_markers: Vec<MarkerDto>,
    pub end_markers: Vec<MarkerDto>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkerDto {
    pub pattern: String,
    pub mode: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeRequest {
    pub path: String,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    #[serde(default)]
    pub request_starts: Vec<MarkerDto>,
    #[serde(default)]
    pub intercept_ends: Vec<MarkerDto>,
    pub process_stages: Vec<StageSpecDto>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckRequest {
    pub path: String,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    #[serde(default)]
    pub error_filters: Vec<MarkerDto>,
    #[serde(default)]
    pub request_starts: Vec<MarkerDto>,
    #[serde(default)]
    pub intercept_ends: Vec<MarkerDto>,
    #[serde(default)]
    pub process_stages: Vec<StageSpecDto>,
    #[serde(default)]
    pub stage_thresholds: Vec<StageThresholdDto>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageThresholdDto {
    pub stage_id: String,
    pub threshold_ms: i64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticRunRequest {
    pub path: String,
    #[serde(default)]
    pub start_time: Option<String>,
    #[serde(default)]
    pub end_time: Option<String>,
    pub problem: DiagnosticProblemDto,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticProblemDto {
    pub name: String,
    pub hit_label: String,
    pub miss_label: String,
    #[serde(default)]
    pub judgments: Vec<DiagnosticJudgmentDto>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticJudgmentDto {
    #[serde(rename = "type")]
    pub judgment_type: String,
    #[serde(default)]
    pub marker: Option<MarkerDto>,
    #[serde(default)]
    pub stage: Option<StageSpecDto>,
    pub range: String,
    #[serde(default)]
    pub window_ms: Option<i64>,
    pub when: String,
    #[serde(default)]
    pub return_mode: String,
    #[serde(default)]
    pub conclusion: String,
    #[serde(default)]
    pub connector: String,
}
