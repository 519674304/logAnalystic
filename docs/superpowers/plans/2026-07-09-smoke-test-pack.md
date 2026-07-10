# Smoke Test Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local smoke-test package with sample files and a short execution guide so testers can verify the app's main flow end to end.

**Architecture:** Keep the smoke package fully documentation-driven. Store the instructions, sample log, sample rule set, sample export, and expected checks in `docs/project/smoke/`. Reuse the existing baseline artifacts where possible, but make the smoke package self-contained so a tester can run the basic flow without reading the larger spec set.

**Tech Stack:** Markdown, plain text fixtures, TOML, CSV, sample JSON.

---

### Task 1: Create the smoke-test folder and execution guide

**Files:**
- Create: `docs/project/smoke/README.md`

- [ ] **Step 1: Write the smoke-test guide**

```md
# Smoke Test Pack

This folder contains the minimum files needed to smoke test the app locally.

## What to verify

1. Start the app locally.
2. Open the log search page.
3. Load the sample log file.
4. Pick the bundled rule set.
5. Run a keyword search and a regex search.
6. Open a saved query from the query list.
7. Switch to latency analysis.
8. Select a sample request and inspect the swimlane, step tree, and interval stats.
9. Export the latency result as CSV.

## Expected results

- Log search returns visible matches.
- The query list can be hidden and reopened.
- Saved queries can be selected and opened in a detail dialog.
- Latency analysis shows the request swimlane and step tree.
- CSV export produces a file that opens correctly in spreadsheet tools.
```

- [ ] **Step 2: Save the file and spot-check it**

Run: `Get-Content docs\project\smoke\README.md`
Expected: The guide is readable and references only files that exist in this folder or the shared baseline folders.

### Task 2: Add a small sample log file

**Files:**
- Create: `docs/project/smoke/sample-log-small.txt`

- [ ] **Step 1: Write the sample log**

```txt
20675,2026-07-05 10:00:00.100 32033 32033 I A00010/com.demo.app/Order: request started
20676,2026-07-05 10:00:00.500 32033 32033 I A00010/com.demo.app/Order: start parallel subprocesses
20677,2026-07-05 10:00:00.680 33001 33001 I B00020/com.demo.app/BWorker: B subprocess received, sequence=1
20678,2026-07-05 10:00:00.800 33001 33001 I B00020/com.demo.app/BWorker: B preparation completed
20679,2026-07-05 10:00:01.100 33001 33001 I B00020/com.demo.app/BWorker: B subprocess completed
20680,2026-07-05 10:00:00.700 34001 34001 I C00030/com.demo.app/CWorker: C subprocess received, sequence=1
20681,2026-07-05 10:00:01.250 34001 34001 I C00030/com.demo.app/CWorker: C subprocess completed
20682,2026-07-05 10:00:01.350 32033 32033 I A00010/com.demo.app/Order: all subprocesses completed
20683,2026-07-05 10:00:01.450 32033 32033 I A00010/com.demo.app/Order: request completed successfully
```

- [ ] **Step 2: Verify the file is plain text and small**

Run: `Get-Item docs\project\smoke\sample-log-small.txt | Select-Object Name,Length`
Expected: The file exists and is easy to open in an editor.

### Task 3: Add a bundle-sized rule-set sample

**Files:**
- Create: `docs/project/smoke/sample-business-rules.toml`

- [ ] **Step 1: Copy a compact rule-set sample**

```toml
[rule_set]
id = "SMOKE-RULESET"
name = "Smoke test rules"
schema_version = "1.0"
business_version = "1.0.0"

[[analysis_scenarios]]
id = "SCENARIO-SMOKE"
name = "Smoke scenario"
description = "Use the bundled sample log to verify search, request recognition, latency analysis, and CSV export."

[[applications]]
id = "APP-A"
name = "A app"
domain_id = "DOMAIN-SMOKE"
log_prefix = "A00010"

[[applications]]
id = "APP-B"
name = "B app"
domain_id = "DOMAIN-SMOKE"
log_prefix = "B00020"

[[applications]]
id = "APP-C"
name = "C app"
domain_id = "DOMAIN-SMOKE"
log_prefix = "C00030"

[[log_matchers]]
id = "LOG-REQUEST-START"
name = "Request start"
business_meaning = "Global request start marker"
enabled = true
export_enabled = true
applicable_scenario_ids = ["SCENARIO-SMOKE"]
process_id = "PROCESS-A-MAIN"
application_id = "APP-A"
type = "keyword"
pattern = "request started"

[[log_matchers]]
id = "LOG-A-PARALLEL-START"
name = "Start parallel subprocesses"
business_meaning = "A starts the parallel work"
enabled = true
export_enabled = true
applicable_scenario_ids = ["SCENARIO-SMOKE"]
process_id = "PROCESS-A-MAIN"
application_id = "APP-A"
type = "keyword"
pattern = "start parallel subprocesses"

[[log_matchers]]
id = "LOG-B-RECEIVED"
name = "B received"
business_meaning = "B subprocess received the request"
enabled = true
export_enabled = true
applicable_scenario_ids = ["SCENARIO-SMOKE"]
process_id = "PROCESS-B-HANDLE"
application_id = "APP-B"
type = "regex"
pattern = 'B subprocess received, sequence=[0-9]+'

[[log_matchers]]
id = "LOG-C-RECEIVED"
name = "C received"
business_meaning = "C subprocess received the request"
enabled = true
export_enabled = true
applicable_scenario_ids = ["SCENARIO-SMOKE"]
process_id = "PROCESS-C-HANDLE"
application_id = "APP-C"
type = "regex"
pattern = 'C subprocess received, sequence=[0-9]+'

[[log_matchers]]
id = "LOG-REQUEST-SUCCESS"
name = "Request success"
business_meaning = "Global request completed successfully"
enabled = true
export_enabled = true
applicable_scenario_ids = ["SCENARIO-SMOKE"]
process_id = "PROCESS-A-MAIN"
application_id = "APP-A"
type = "keyword"
pattern = "request completed successfully"
```

- [ ] **Step 2: Confirm the sample matches the smoke log**

Run: `Get-Content docs\project\smoke\sample-business-rules.toml`
Expected: The matcher patterns line up with the sample log file text.

### Task 4: Add a latency export sample

**Files:**
- Create: `docs/project/smoke/sample-latency-export.csv`
- Create: `docs/project/smoke/sample-latency-result.json`

- [ ] **Step 1: Write the export sample**

```csv
业务含义,REQ-0001(start=2026-07-05 10:00:00.100)
request started,2026-07-05 10:00:00.100
Start parallel subprocesses,2026-07-05 10:00:00.500
B received,2026-07-05 10:00:00.680
C received,2026-07-05 10:00:00.700
B preparation completed,2026-07-05 10:00:00.800
B subprocess completed,2026-07-05 10:00:01.100
C subprocess completed,2026-07-05 10:00:01.250
Request success,2026-07-05 10:00:01.450

业务含义,样本数,平均值(ms),P90(ms),最大值(ms)
Request start,1,0,0,0
A to B RPC latency,1,180,180,180
A to C RPC latency,1,200,200,200
B processing stage,1,420,420,420
C processing stage,1,550,550,550
```

```json
{
  "id": "smoke-request-1",
  "request_id": "REQ-0001",
  "hits": [
    {
      "id": "hit-1",
      "application_id": "APP-A",
      "process_id": "PROCESS-A-MAIN",
      "stages": [
        { "id": "DEF-A-PREPARE", "name": "A preparation stage" },
        { "id": "DEF-A-TO-B-RPC", "name": "A to B RPC latency" }
      ]
    }
  ],
  "stats": {
    "request_count": 1,
    "slow_count": 0
  }
}
```

- [ ] **Step 2: Verify the samples are consistent**

Run: `Get-Content docs\project\smoke\sample-latency-export.csv`
Expected: The CSV has a key-log section and a stage-statistics section, both aligned to the same smoke request.

### Task 5: Register the smoke pack in the project index

**Files:**
- Modify: `docs/project/00-index.md`

- [ ] **Step 1: Add smoke-pack entries**

```md
| smoke/README.md | 冒烟测试执行说明 | Draft |
| smoke/sample-log-small.txt | 冒烟日志样例 | Draft |
| smoke/sample-business-rules.toml | 冒烟规则样例 | Draft |
| smoke/sample-latency-export.csv | 冒烟导出样例 | Draft |
| smoke/sample-latency-result.json | 冒烟时延结果样例 | Draft |
```

- [ ] **Step 2: Verify the index still reads cleanly**

Run: `Get-Content docs\project\00-index.md`
Expected: The new smoke files appear in the document map without breaking the existing table.

