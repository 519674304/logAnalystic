# Rule Package Import Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a downloadable Chinese Markdown guide that explains how to prepare and import a complete rule package.

**Architecture:** Maintain the guide source in `docs/project/templates/` and copy it to `public/templates/` with the existing template build script. The rule page links to the resulting static Markdown; no modal, backend command, or import behavior changes.

**Tech Stack:** Markdown, PowerShell, Vite public assets, React, existing Node static UI contract.

---

### Task 1: Guide Source And Build Publication

**Files:**
- Create: `docs/project/templates/rule-package-import-guide.md`
- Modify: `scripts/build-rule-package-template.ps1`
- Create: `public/templates/rule-package-import-guide.md`
- Test: `scripts/check-rule-package-ui.js`

- [x] **Step 1: Write the failing guide-artifact contract**

```js
const guidePath = path.join(root, 'public/templates/rule-package-import-guide.md')
assert(fs.existsSync(guidePath), 'Downloadable rule package import guide must exist.')
const guide = fs.readFileSync(guidePath, 'utf8')
assert(guide.includes('同版本号会覆盖'), 'Guide must explain same-version replacement.')
assert(guide.includes('六层'), 'Guide must explain the six rule layers.')
```

- [x] **Step 2: Run the contract to verify it fails**

Run: `npm run test:rule-package-ui`

Expected: FAIL with `Downloadable rule package import guide must exist.`

- [x] **Step 3: Write the Chinese Markdown guide**

Create the headings `导入前检查`, `最短导入步骤`, `版本规则`, `六层文件说明`, `ID 与引用规则`, `节点编辑与注释`, `外部 AI 检查边界`, and `常见失败原因`. Explain ZIP root-file requirements, `rule_set.id`, `package.version`, every layer, `id`/`*_id`/`*_ids`, comment preservation, and the user-owned external AI boundary.

- [x] **Step 4: Publish the guide during template build**

Add this to `scripts/build-rule-package-template.ps1` after template source validation:

```powershell
$guideSource = Join-Path $PSScriptRoot '..\docs\project\templates\rule-package-import-guide.md'
$guideOutput = Join-Path $templateDirectory 'rule-package-import-guide.md'
if (-not (Test-Path -LiteralPath $guideSource -PathType Leaf)) {
    throw "规则包导入说明源文件不存在：$guideSource"
}
Copy-Item -LiteralPath $guideSource -Destination $guideOutput -Force
```

- [x] **Step 5: Generate and verify the artifact**

Run:

```text
npm run build:rule-package-template
npm run test:rule-package-ui
```

Expected: PASS and `public/templates/rule-package-import-guide.md` exists.

### Task 2: Rule Page Download Link

**Files:**
- Modify: `src/features/rule-config/RuleCatalogPanel.tsx`
- Modify: `scripts/check-rule-package-ui.js`
- Test: `scripts/check-rule-package-ui.js`

- [x] **Step 1: Write the failing download-link assertion**

```js
assert(panel.includes('下载导入说明'), 'Rule page must expose a downloadable import guide.')
assert(panel.includes('/templates/rule-package-import-guide.md'), 'Guide download must target the static Markdown asset.')
```

- [x] **Step 2: Run the contract to verify it fails**

Run: `npm run test:rule-package-ui`

Expected: FAIL with `Rule page must expose a downloadable import guide.`

- [x] **Step 3: Add the static Markdown link**

Add this before the existing template and import controls:

```tsx
<a
  className="ghost-button rule-template-download"
  href="/templates/rule-package-import-guide.md"
  download
>
  下载导入说明
</a>
```

- [x] **Step 4: Verify UI contract and production output**

Run:

```text
npm run test:rule-package-ui
npm run build
Test-Path dist/templates/rule-package-import-guide.md
```

Expected: all commands succeed and the guide exists in `dist/templates/`.

### Task 3: Documentation And Final Verification

**Files:**
- Modify: `docs/project/plans/08-rule-package-fast-path-checklist.md`
- Modify: `docs/superpowers/specs/2026-08-24-rule-package-import-guide-design.md`

- [x] **Step 1: Record the completed guide behavior**

Add the downloadable Markdown explanation to the fast-path checklist and mark the design document as implemented.

- [x] **Step 2: Run final verification**

Run:

```text
npm run build
npm run test:rule-package-ui
npm run check:baselines
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

Expected: all commands PASS.
