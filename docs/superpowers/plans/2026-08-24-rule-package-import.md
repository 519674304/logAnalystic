# Rule Package Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat rule catalog with complete ZIP rule packages that are stored by declared version, displayed as a tree, and edited without losing TOML comments.

**Architecture:** Rust owns ZIP parsing, structural validation, lossless TOML document updates, and version-directory replacement. The React app only consumes version-tree DTOs and submits ZIP bytes or a node edit; it never parses TOML locally.

**Tech Stack:** Tauri 1, Rust, `zip`, `toml`, `toml_edit`, React 18, TypeScript, Vite.

---

## Baseline

- `cargo test` passes with 6 tests before this work.
- `npm run check:baselines` passes before this work.
- `npm run test:ui-contract` already fails on the unrelated latency interval-start assertion. Do not modify or use that assertion as evidence for this feature.

### Task 1: Package Model And ZIP Reader

**Files:**
- Create: `src-tauri/src/domain/rule_package.rs`
- Modify: `src-tauri/src/domain/mod.rs`
- Modify: `src-tauri/Cargo.toml`
- Test: `src-tauri/src/domain/rule_package.rs`

- [x] Add a failing test that builds a ZIP in memory containing root `manifest.toml` and all six mapped files, then expects `RulePackage::from_zip_bytes` to expose `RULESET-A-PARALLEL`, `1.1.0`, and six layers.
- [x] Run `cargo test domain::rule_package` and verify the test fails because the package module does not exist.
- [x] Add `zip` and `toml_edit`; define `RulePackage`, `RulePackageManifest`, `RuleLayer`, and ZIP root-path checks.
- [x] Run `cargo test domain::rule_package` and verify the test passes.

### Task 2: Validation, Lossless Edit, And Version Storage

**Files:**
- Create: `src-tauri/src/application/rule_package_service.rs`
- Create: `src-tauri/src/infrastructure/file_storage/rule_package_store.rs`
- Modify: `src-tauri/src/application/mod.rs`
- Modify: `src-tauri/src/infrastructure/file_storage/mod.rs`
- Test: `src-tauri/src/application/rule_package_service.rs`
- Test: `src-tauri/src/infrastructure/file_storage/rule_package_store.rs`

- [x] Add failing tests for new-version creation, same-version replacement, invalid manifest rejection without changing stored content, and a matcher edit retaining its surrounding TOML comment.
- [x] Run the two targeted Rust test modules and verify the missing service/store failures.
- [x] Implement minimal manifest mapping, required-layer, unique-ID, and key-reference validation; store each accepted package under `rule-packages/<rule_set_id>/<version>/` using a temporary directory before replacement.
- [x] Update a target TOML table through `toml_edit::DocumentMut`, leaving non-target files untouched.
- [x] Run the targeted tests and then `cargo test`.

### Task 3: Tauri And TypeScript Package Contracts

**Files:**
- Modify: `src-tauri/src/dto/command_dto.rs`
- Modify: `src-tauri/src/commands/rule_commands.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src/api/commands.ts`
- Modify: `src/api/dto.ts`
- Modify: `src/api/tauri-client.ts`
- Test: `src-tauri/src/commands/rule_commands.rs`

- [x] Add a failing command-layer test for importing ZIP bytes and receiving `operation = "created"` plus a version tree.
- [x] Run the command test and verify it fails because package commands and DTOs are absent.
- [x] Replace `list/import/upsert/delete_rule_catalog` with package listing, ZIP import, node detail, and node update commands; remove browser TOML parsing fallback.
- [x] Run the command test and `cargo test`.

### Task 4: Rule Package Tree And Editing UI

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/features/rule-config/RuleCatalogPanel.tsx`
- Modify: `src/index.css`
- Modify: `scripts/check-ui-contract.js`
- Test: `scripts/check-ui-contract.js`

- [x] Add failing UI-contract assertions for `.zip`-only import, a version/layer/node tree, no delete or activate control, and a double-click detail modal.
- [x] Run `npm run test:ui-contract` and record the new rule-package assertion failures separately from the pre-existing latency assertion.
- [x] Replace flat rule state with package tree state; pass ZIP bytes to Tauri; render compact version tree and node summary; save the modal through the package node-update command.
- [x] Add focused CSS for a compact tree and modal without changing latency-page selectors.
- [x] Run `npm run build`, `npm run check:baselines`, and the rule-package UI assertions. Report the known latency assertion separately if it remains.

## Final Verification

- [x] `cargo test`
- [x] `npm run build`
- [x] `npm run check:baselines`
- [ ] Import the baseline ZIP, confirm version creation, re-import to confirm replacement, edit a commented matcher, and confirm the comment remains.

Desktop note: Tauri compiled and launched, and the rule page was visually verified. The native file-picker smoke was interrupted by external desktop input; the same create/replace/edit/comment-preservation flow is covered by Rust integration tests.
