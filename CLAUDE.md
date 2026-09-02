# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Frontend (root npm package — React 18 + Vite 5 + TypeScript 5):
- `npm run dev` — Vite dev server on http://localhost:1420
- `npm run build` — regenerate the rule-package template, then `vite build`
- `npm run test:ui-contract` / `npm run test:rule-package-ui` / `npm run check:baselines` — Node regression checks (whole-file assertions; there is no unit-test runner)

Backend (Rust workspace — `crates/log-core` + `crates/server`):
- `cargo run -p server` — axum server on 127.0.0.1:8080
- `cargo check --workspace` / `cargo build`
- `cargo test -p log-core <substring>` / `cargo test -p server <substring>` — run one test by substring (e.g. `cargo test -p log-core sequential_stack`)

One-click dev (Windows PowerShell): `.\scripts\start-dev.ps1` (starts both services); `.\scripts\setup-dev.ps1` (toolchain check + install).

There is no lint or typecheck script — `vite build` does not type-check and there is no ESLint config.

## Architecture

Local log-analysis tool for testers/developers: a Vite + React + TypeScript frontend (`src/`) talks over plain HTTP to a Rust axum server (`crates/server`), which delegates all domain logic to a pure-Rust `crates/log-core`. No database — persistence is local JSON under `app-data/`. "Streaming" means bounded-memory file reading inside the Rust reader, not SSE/WebSocket: every endpoint is a synchronous JSON POST/GET.

HTTP surface (defined in `crates/server/src/main.rs`): `GET /health`, `POST /api/open`, `/api/search`, `/api/context`, `/api/latency/analyze`, `/api/health/check`, `/api/diagnostic/run`, and `GET/PUT /api/diagnostic-problems` and `/api/rule-config`.

Three analysis pipelines share one shape (`spec` → `analyzer` → `result`), all under `crates/log-core/src/domain/`:
1. 时延分析 latency — `latency_analysis/`: `SequentialStackSplitter` recognizes requests; `LatencyAnalyzer` computes per-stage duration and stats.
2. 健康体检 health check — `health_check/`: reuses the splitter + latency analyzer, adds error scanning and slow-request judging.
3. 专科诊断 specialist diagnosis — `specialist_diagnosis/`: `DiagnosticAnalyzer` evaluates judgments (matcher/stage hits over time ranges, And/Or connectors) into conclusions.

Concepts that recur across the code:
- `LogSource` (domain trait in `domain/log_workspace/port.rs`) → `RipgrepLogSource` impl. It is the ONLY log-access path; downstream code never touches files or the search engine directly.
- `Marker { pattern, mode }` (keyword/regex) is reused for latency markers, request splitting, health-check error filters, and diagnosis judgments.
- Projection pattern: the frontend projects rule ids (matcherId/stageId) down to concrete `pattern`+`mode` before every API call; the Rust backend never reads TOML/ZIP — it only maps DTO → domain spec.
- Rule package = a ZIP of three TOML layers (`manifest.toml`, `definitions.toml`, `matchers.toml`, `stages.toml`), parsed entirely client-side (`src/api/local-rule-package.ts`). The backend stores the whole config as opaque `serde_json::Value` in `app-data/rule-config.json` (atomic write; missing/corrupt file degrades to an empty default). `diagnostic-problems.json` follows the same pattern.

Dependency-direction rules (hard):
- `log-core` domain: no axum / React / filesystem / HTTP / UI types.
- `crates/server`: no log parsing, rule validation, request recognition, latency math, or CSV assembly.
- Frontend `view-model/`: no HTTP calls, no recognition/calculation — presentational mapping only (sorting / colors / coordinates).

## Conventions and docs

- `AGENTS.md` holds style, testing, and commit conventions (Conventional Commits: `feat:` / `fix:` / `refactor:` / `docs:`). Follow it; this file does not duplicate it.
- Rust modules use a mandatory doc-comment template (`模块职责` / `不负责` / `输入` / `输出` / `依赖` / `主要失败情况`). Core logic must not live in `manager` / `helper` / `util` / `common` / `misc` / `processor`.
- Authoritative docs: `docs/project/00-index.md`. Only docs marked **Approved** are implementation authority. Several `domain/` and `architecture/` docs are **Draft / "Needs revision"** (rule-config, latency-analysis, rule-set-data-relationships, responsibilities 03/04, architecture 00/01/02) — treat them as historical, not final. Docs also describe a target `web/src/` layout; the actual code still lives in root `src/`.
- Backend diagnostic logs are privacy-scrubbed JSONL under `app-data/logs/` (daily rotation, 7-day retention).
