# Repository Guidelines

## Project Structure & Module Organization

This repository combines a React/Vite client with a Rust HTTP service. Frontend entry points and shared styling live in `src/`; feature screens are grouped under `src/features/`, API adapters under `src/api/`, and presentation models under `src/view-model/`. The Rust workspace is declared in `Cargo.toml`: core domain and application code belongs in `crates/log-core/src/`, while the Axum server lives in `crates/server/src/main.rs`.

Keep rule-package fixtures, baselines, and smoke samples in `docs/project/`; public downloadable templates belong in `public/templates/`. Maintenance and validation scripts are in `scripts/`.

## Build, Test, and Development Commands

- `npm install` installs frontend tooling.
- `npm run dev` starts Vite on port 1420.
- `cargo run -p server` starts the backend on `127.0.0.1:8080`.
- `./scripts/start-dev.ps1` starts both services on Windows.
- `npm run build` regenerates the rule-package template and builds the frontend bundle.
- `cargo check` validates all Rust workspace crates.
- `npm run test:ui-contract`, `npm run test:rule-package-ui`, and `npm run check:baselines` run the repository’s Node-based regression checks.

## Coding Style & Naming Conventions

Match nearby code. TypeScript uses two-space indentation, single quotes, semicolons, `PascalCase` React components (for example, `LatencyAnalysisPanel.tsx`), and `camelCase` functions and fields. Use `type` imports where appropriate. Rust follows `rustfmt` conventions: four-space indentation, `snake_case` modules/functions, and `PascalCase` types. Keep domain logic in `log-core`; keep HTTP wiring in `server`.

## Testing Guidelines

Add or update fixture-driven checks when changing UI contracts, rule-package formats, or analysis results. Name new check scripts `check-<area>.js` and keep representative inputs near the relevant `docs/project` baseline or example. Run the targeted Node check plus `cargo check` before submitting changes.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit prefixes, commonly `feat:`, `fix:`, `refactor:`, and `docs:`; use a short, imperative summary, such as `fix: preserve matcher selection`. Keep commits focused. Pull requests should explain the user-visible behavior, list verification commands, link the relevant issue or design document, and include screenshots for UI changes. Do not commit generated `dist/`, `target/`, or local `app-data/` changes unless the change explicitly requires them.
