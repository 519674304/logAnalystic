# Rule Package Download Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a downloadable, Chinese-annotated complete ZIP rule package that users can read, edit, and import directly.

**Architecture:** Keep seven readable TOML source files under `docs/project/templates/rule-package-template/`. A PowerShell build helper copies them into a root-level ZIP at `public/templates/rule-package-template.zip`; Vite then publishes it unchanged. The React rule page links to that static asset, while an existing Rust package parser validates the generated ZIP in tests.

**Tech Stack:** TOML, PowerShell `Compress-Archive`, Vite public assets, React, Rust `zip` and existing `RulePackage` parser.

---

### Task 1: Complete Chinese Template Source

**Files:**
- Create: `docs/project/templates/rule-package-template/manifest.toml`
- Create: `docs/project/templates/rule-package-template/scenarios.toml`
- Create: `docs/project/templates/rule-package-template/topology.toml`
- Create: `docs/project/templates/rule-package-template/matchers.toml`
- Create: `docs/project/templates/rule-package-template/relations.toml`
- Create: `docs/project/templates/rule-package-template/stages.toml`
- Create: `docs/project/templates/rule-package-template/flow.toml`
- Test: `src-tauri/src/domain/rule_package.rs`

- [x] **Step 1: Write the failing parser test**

```rust
#[test]
fn reads_the_downloadable_chinese_template() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../public/templates/rule-package-template.zip");
    let package = RulePackage::from_zip_bytes(&std::fs::read(path).unwrap()).unwrap();

    assert_eq!(package.manifest.rule_set_id, "RULESET-TEMPLATE");
    assert_eq!(package.manifest.version, "1.0.0");
    assert!(package.files["manifest.toml"].contains("同版本号会覆盖"));
    assert!(package.layers.values().all(|content| content.contains("#")));
}
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib reads_the_downloadable_chinese_template`

Expected: FAIL because `public/templates/rule-package-template.zip` does not exist.

- [x] **Step 3: Write the seven valid TOML files**

Use `RULESET-TEMPLATE`, `package.version = "1.0.0"`, and a valid reference chain:

```toml
# 模板入口：同版本号会覆盖已导入的完整规则包；新版本号会新增版本目录。
[rule_set]
id = "RULESET-TEMPLATE"

[package]
version = "1.0.0"

[package.layers]
scenarios = "scenarios.toml"
topology = "topology.toml"
matchers = "matchers.toml"
relations = "relations.toml"
stages = "stages.toml"
flow = "flow.toml"
```

Create one scenario, two applications, one process relation, two matchers, one stage, and one business flow. Every file begins with Chinese comments explaining its role; every reference field has an adjacent Chinese comment naming its target type.

### Task 2: Template ZIP Builder And Parser Verification

**Files:**
- Create: `scripts/build-rule-package-template.ps1`
- Create: `public/templates/rule-package-template.zip`
- Modify: `package.json`
- Test: `src-tauri/src/domain/rule_package.rs`

- [x] **Step 1: Write the failing static-template contract**

Add this assertion to `scripts/check-rule-package-ui.js`:

```js
assert(fs.existsSync(path.join(root, 'public/templates/rule-package-template.zip')),
  'Downloadable rule package template ZIP must exist.')
```

- [x] **Step 2: Run the contract to verify it fails**

Run: `npm run test:rule-package-ui`

Expected: FAIL with `Downloadable rule package template ZIP must exist.`

- [x] **Step 3: Add the deterministic PowerShell builder**

```powershell
$source = Join-Path $PSScriptRoot '..\docs\project\templates\rule-package-template'
$destinationDirectory = Join-Path $PSScriptRoot '..\public\templates'
$destination = Join-Path $destinationDirectory 'rule-package-template.zip'

New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
Compress-Archive -Path (Join-Path $source '*') -DestinationPath $destination -CompressionLevel Optimal
```

Add `build:rule-package-template` and prepend it to `build`:

```json
"build:rule-package-template": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-rule-package-template.ps1",
"build": "npm run build:rule-package-template && vite build"
```

- [x] **Step 4: Generate the ZIP and run validation**

Run:

```text
npm run build:rule-package-template
cargo test --manifest-path src-tauri/Cargo.toml --lib reads_the_downloadable_chinese_template
npm run test:rule-package-ui
```

Expected: parser test and UI contract PASS.

### Task 3: Rule Page Download Entry

**Files:**
- Modify: `src/features/rule-config/RuleCatalogPanel.tsx`
- Modify: `src/index.css`
- Modify: `scripts/check-rule-package-ui.js`
- Test: `scripts/check-rule-package-ui.js`

- [x] **Step 1: Write the failing UI assertion**

```js
assert(panel.includes('下载导入模板'), 'Rule page must expose a downloadable import template.')
assert(panel.includes('/templates/rule-package-template.zip'), 'Template download must target the static ZIP asset.')
```

- [x] **Step 2: Run the contract to verify it fails**

Run: `npm run test:rule-package-ui`

Expected: FAIL with `Rule page must expose a downloadable import template.`

- [x] **Step 3: Add the toolbar link**

```tsx
<a className="secondary-button rule-template-download" href="/templates/rule-package-template.zip" download>
  下载导入模板
</a>
```

Place it before the existing import button. Add a compact secondary-button style that preserves the established toolbar layout on narrow screens.

- [x] **Step 4: Run the UI checks and production build**

Run:

```text
npm run test:rule-package-ui
npm run build
Test-Path dist/templates/rule-package-template.zip
```

Expected: all commands succeed and the built static ZIP exists.

### Task 4: Final Verification And Documentation

**Files:**
- Modify: `docs/project/plans/08-rule-package-fast-path-checklist.md`
- Modify: `docs/superpowers/specs/2026-08-24-rule-package-download-template-design.md`

- [x] **Step 1: Record implemented template behavior**

Add the download template source, generated ZIP, and parser verification to the fast-path checklist. Mark the template design as implemented.

- [x] **Step 2: Run final verification**

Run:

```text
npm run build
npm run test:rule-package-ui
npm run check:baselines
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Expected: all commands PASS.

- [ ] **Step 3: Commit the implementation**

```bash
git add docs/project/templates public/templates scripts/build-rule-package-template.ps1 scripts/check-rule-package-ui.js package.json src/features/rule-config/RuleCatalogPanel.tsx src/index.css src-tauri/src/domain/rule_package.rs docs/project/plans/08-rule-package-fast-path-checklist.md docs/superpowers/specs/2026-08-24-rule-package-download-template-design.md docs/superpowers/plans/2026-08-24-rule-package-download-template.md
git commit -m "feat: add downloadable rule package template"
```
