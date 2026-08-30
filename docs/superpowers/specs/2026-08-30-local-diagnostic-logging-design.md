# Local Diagnostic Logging Design

## Goal

Persist safe, structured diagnostics for the local Rust service so failures and slow operations can be investigated without copying user log content into the tool's own logs.

## Storage and Format

Initialize `tracing` at server startup and write JSON Lines to `app-data/logs/`. Each record is a standalone JSON object. Rotate files daily, remove files older than seven days during startup, and retain the non-blocking writer guard for the server lifetime. Terminal output remains a concise development aid, not the diagnostic source of record.

## Events and Data Boundaries

Each HTTP request receives a generated `requestId`, attached to all events for that request. Handlers emit sparse `INFO` events only for server startup and material operation start/completion. They include operation name, request ID, duration, result count or other safe summary.

`WARN` records a deliberate, recoverable fallback such as an unrecognized mode defaulting to keyword matching. `ERROR` records failed open, search, context, analysis, and rule-configuration operations with a safe error string and retryability. No record may include original log lines, search terms, complete filesystem paths, rule-config JSON, credentials, or tokens.

## Acceptance

Automated tests prove JSONL persistence, request ID propagation, sparse `INFO`, traceable `WARN` and `ERROR`, and exclusion of a sentinel secret/query/path value. `cargo test --workspace` and `cargo check` remain clean.
