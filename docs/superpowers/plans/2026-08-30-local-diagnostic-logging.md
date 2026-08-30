# Local Diagnostic Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist safe JSONL diagnostics for the local Rust service, with sparse `INFO` events and traceable `WARN`/`ERROR` events.

**Architecture:** `crates/server` owns diagnostics because it owns HTTP request identity and the local process lifetime. A focused diagnostics module initializes `tracing` file output; route handlers emit safe operation summaries and reuse an operation-scoped request ID. Domain and `log-core` code remain free of logging-framework types.

**Tech Stack:** Rust 2021, `tracing`, `tracing-subscriber` JSON formatter, `tracing-appender` daily rolling writer, `uuid`, Axum 0.8, Tokio.

---

## File Structure

- Create `crates/server/src/diagnostics.rs`: local JSONL initialization, seven-day cleanup, safe event helpers, and unit tests.
- Modify `crates/server/Cargo.toml`: add tracing, JSON formatting, rolling-file, and UUID dependencies.
- Modify `crates/server/src/main.rs`: initialize diagnostics, generate request IDs, and log safe lifecycle, completion, fallback, and failure events.
- Modify `README-SETUP.md`: document `app-data/logs/`, JSONL inspection, retention, and data exclusions.

### Task 1: Add a testable local JSONL sink

**Files:**
- Create: `crates/server/src/diagnostics.rs`
- Modify: `crates/server/Cargo.toml`
- Modify: `crates/server/src/main.rs`

- [ ] **Step 1: Write the failing diagnostics tests**

Add unit tests in `diagnostics.rs` that create a unique directory below `std::env::temp_dir()`, write one `INFO` and one `ERROR` event through a test-only JSON writer, then assert the output is newline-delimited JSON and contains `level`, `timestamp`, `requestId`, and `operation`. Add a cleanup test that creates `log-analystic.2000-01-01.jsonl` and confirms the retention helper removes it while preserving a current file.

- [ ] **Step 2: Run the failing tests**

Run: `cargo test -p server diagnostics`

Expected: compilation fails because `diagnostics` and its sink/cleanup functions do not exist.

- [ ] **Step 3: Write minimal sink implementation**

Add these dependencies to `crates/server/Cargo.toml`:

```toml
tracing = "0.1"
tracing-appender = "0.2"
tracing-subscriber = { version = "0.3", features = ["env-filter", "json"] }
uuid = { version = "1", features = ["v4"] }
```

Implement `diagnostics::init(log_dir: &Path) -> Result<WorkerGuard, io::Error>` to create the directory, delete `log-analystic.*.jsonl` files older than seven days, configure a daily `tracing_appender::rolling::daily` writer with prefix `log-analystic` and suffix `jsonl`, and install a JSON subscriber with `with_current_span(true)`. Keep a small test-only `write_json_event` helper so tests do not attempt to install the process-global subscriber repeatedly. Declare `mod diagnostics;` in `main.rs`.

- [ ] **Step 4: Run diagnostics tests**

Run: `cargo test -p server diagnostics`

Expected: PASS; the JSONL and retention tests pass.

- [ ] **Step 5: Commit the focused sink**

```bash
git add crates/server/Cargo.toml crates/server/src/diagnostics.rs crates/server/src/main.rs Cargo.lock
git commit -m "feat: add local diagnostic log sink"
```

### Task 2: Attach request IDs and safe operation events

**Files:**
- Modify: `crates/server/src/main.rs`
- Test: `crates/server/src/main.rs` unit-test module

- [ ] **Step 1: Write failing request-event tests**

Extract `parse_mode` into `parse_mode_with_fallback(mode: &str) -> (MarkerMode, bool)`. Add tests proving `"regex"` returns `(Regex, false)` and `"unexpected-mode"` returns `(Keyword, true)`. Add a test for `failure_category(error: &str) -> &'static str` that passes `"token=DO_NOT_LOG path=C:\\secret query=needle"` and asserts the returned category is `"service_error"`, rather than any part of the input.

- [ ] **Step 2: Run the failing tests**

Run: `cargo test -p server request_event`

Expected: FAIL because the fallback parser and failure-category helper do not exist.

- [ ] **Step 3: Implement request-scoped events**

At startup, call `diagnostics::init(Path::new("app-data/logs"))`, retain its `WorkerGuard` in `main`, and emit `INFO server.started` with the listen address and log directory. Generate `Uuid::new_v4()` in every route handler and use its string form as `request_id`.

Before and after `health`, `open`, `search`, `context`, `latency_analyze`, `get_rule_config`, and `put_rule_config`, emit `INFO` events named `<operation>.started` and `<operation>.completed`. Record only safe summaries: `requestId`, operation, duration in milliseconds, search mode, `queryLength`, context-line count, result count, workspace file count, or latency request count. Do not include `path`, `query`, raw context, rule JSON, or marker patterns.

When `parse_mode_with_fallback` returns `true`, emit `WARN request.mode_fallback` with `requestId`, operation, supplied mode length, and `recovery="keyword"`. Replace the old `parse_mode` calls with this helper. Wrap each service failure before conversion to `ApiError`: emit `ERROR <operation>.failed` with `requestId`, operation, `retryable=true`, and the fixed `failure_category` value `service_error`; do not serialize the service string because it may include a user path.

- [ ] **Step 4: Run request-event tests**

Run: `cargo test -p server request_event`

Expected: PASS; valid modes do not trigger fallback, unknown modes do, and sentinel values are reduced to a fixed safe error category.

- [ ] **Step 5: Commit request event coverage**

```bash
git add crates/server/src/main.rs
git commit -m "feat: trace local service operations"
```

### Task 3: Verify real server persistence and document operations

**Files:**
- Modify: `crates/server/src/main.rs`
- Modify: `README-SETUP.md`
- Test: `crates/server/tests/diagnostics_integration.rs`

- [ ] **Step 1: Write a failing persistence test**

Add an integration test that starts the router with a temporary diagnostics directory, calls `/health` and one invalid-mode search request, flushes the worker, reads the generated `.jsonl` file, and asserts: every non-empty line parses as `serde_json::Value`; at least one `INFO` start/completion pair shares one `requestId`; at least one `WARN` has `recovery="keyword"`; and no line contains the sentinel query `DO_NOT_LOG` or sentinel path `C:\\secret`.

- [ ] **Step 2: Run the failing test**

Run: `cargo test -p server diagnostics_integration`

Expected: FAIL until the router accepts injected diagnostics state and flushes its worker for tests.

- [ ] **Step 3: Make router construction injectable and document operations**

Extract the current router construction into `fn app(state: AppState) -> Router`. Add a diagnostics factory accepting an explicit log directory for tests, and expose a test-only flush or drop boundary so the test can read final JSONL output. Keep production startup fixed at `app-data/logs/`.

Extend `README-SETUP.md` with:

```powershell
Get-Content .\app-data\logs\*.jsonl
Get-Content .\app-data\logs\*.jsonl | Select-String '"level":"ERROR"'
```

State that files rotate daily, startup removes entries older than seven days, and entries intentionally omit raw imported logs, query text, full paths, rule documents, credentials, and tokens.

- [ ] **Step 4: Run the complete validation set**

Run:

```powershell
cargo test --workspace
cargo check
npm run test:ui-contract
npm run test:rule-package-ui
npm run check:baselines
```

Expected: every command exits 0. Confirm `app-data/logs/` is untracked with `git status --short` after a local server run.

- [ ] **Step 5: Commit the integration test and documentation**

```bash
git add crates/server/src/main.rs crates/server/tests/diagnostics_integration.rs README-SETUP.md
git commit -m "test: verify persisted diagnostic logs"
```

## Plan Self-Review

- Spec coverage: Tasks 1–3 cover local JSONL persistence, daily rotation/seven-day cleanup, sparse info events, traceable warning/error events, request IDs, sensitive-data exclusion, documentation, and full regression validation.
- Placeholder scan: no deferred implementation steps or unspecified validation remain.
- Type consistency: emitted JSON uses `requestId`; Rust implementation names `operation`, `diagnostics::init`, `parse_mode_with_fallback`, `failure_category`, and `WorkerGuard` consistently throughout the plan.
