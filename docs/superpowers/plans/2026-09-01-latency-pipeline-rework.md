# 时延分析流水线重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `SequentialStackSplitter` 从「单槽 + intercept 连条目一起丢」重构为栈式三步——intercept 只 pop 边界、条目归到「最近的前一个存活边界」的组里、组内去重（删重复 start 命中与 intercept 命中）。

**Architecture:** `SequentialStackSplitter` 收窄为三步：`surviving_starts`（栈式定存活边界）→ `group_by_boundaries`（分组，条目不丢）→ `dedup`（删非锚点 start + 全部 intercept，保留存活锚点 start）。`split() -> Vec<Request>` 契约不变，`LatencyAnalyzer::analyze` 与所有现有调用方零改动。

**Tech Stack:** Rust 2021，`log-core` 库。仅用现有依赖（`regex`、`serde`），不新增。

**Spec:** [../specs/2026-08-31-diagnostic-workflow-design.md](../specs/2026-08-31-diagnostic-workflow-design.md)（落地 step 3 + step 5 + step 6；step 7 `diagnose` **不在本轮**）

## Global Constraints

- `analyze` 输出契约 `LatencyAnalysis { requests, stats }` 不变；前端与健康体检零改动。
- `intercept` 语义 = 只 pop start 边界，**绝不丢条目**；被 pop 边界下的条目流到「最近的前一个存活边界」的组里。
- 拆分依据只有 `start`（`end` 是普通条目，不参与拆分）。
- **去重规则**：删重复的 start 命中（保留时间最早的存活锚点）＋删全部 intercept 命中；其余条目（含存活锚点 start）保留。存活锚点 start 留在 `Request.entries` 里，可被 flow 与 process 重复消费。
- stage 的「取首次命中」由既有 `find_priority_match` 负责。
- 无前驱边界（早于首个存活边界）的条目丢弃。

---

## File Structure

- `crates/log-core/src/domain/request_split/mod.rs` — 新增 `Boundary` 类型 + `group_by_boundaries` 自由函数。
- `crates/log-core/src/domain/request_split/sequential_stack.rs` — 新增 `surviving_starts` 与 `dedup`，重写 `split` = 存活边界 → 分组 → 去重。
- 现有调用方 `log_workspace_service.rs`、`health_check/analyzer.rs`、`server/main.rs` **不改**。

---

### Task 1: 栈式拆分器 —— intercept 只丢边界、组内去重

**Files:**
- Modify: `crates/log-core/src/domain/request_split/mod.rs`
- Modify: `crates/log-core/src/domain/request_split/sequential_stack.rs`
- Test: `crates/log-core/src/domain/request_split/sequential_stack.rs`（模块内 `#[cfg(test)]`）

**Interfaces:**
- Consumes: `LogEntry`（`line_no: u64`, `timestamp: String`, `raw: String`, `message: String`）、`timestamp_to_ms(&str) -> Option<i64>`、`MarkerMatcher::matches(&str) -> bool`、现有 `Request { id, entries }`。
- Produces:
  - `pub struct Boundary { pub ts_ms: i64, pub timestamp: String, pub line_no: u64 }`
  - `pub fn group_by_boundaries(entries: &[LogEntry], boundaries: &[Boundary]) -> Vec<Request>`
  - `SequentialStackSplitter::surviving_starts(&self, entries: &[LogEntry]) -> Vec<Boundary>`
  - `SequentialStackSplitter::split` 保持 `RequestSplitter` trait 的 `fn split(&self, &[LogEntry]) -> Vec<Request>` 签名不变。

- [ ] **Step 1: 写失败测试**

在 `crates/log-core/src/domain/request_split/sequential_stack.rs` 的 `mod tests` 里，替换现有 `intercept_drops_current_request` 测试为下面三个测试：

```rust
#[test]
fn intercept_pops_first_boundary_and_its_entries_are_dropped() {
    let splitter =
        SequentialStackSplitter::new(vec![kw("request started")], vec![kw("timeout waiting")])
            .unwrap();
    let entries = vec![
        entry(1, "2026-07-05 10:00:00.000", "request started"),
        entry(2, "2026-07-05 10:00:00.040", "step begin"),
        entry(3, "2026-07-05 10:00:00.050", "timeout waiting"),
        entry(4, "2026-07-05 10:00:01.000", "request started"),
        entry(5, "2026-07-05 10:00:01.040", "step begin"),
    ];
    let requests = splitter.split(&entries);
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].id, "2026-07-05 10:00:01.000");
    let msgs: Vec<&str> = requests[0].entries.iter().map(|e| e.message.as_str()).collect();
    assert_eq!(msgs, vec!["request started", "step begin"]);
}

#[test]
fn dedup_keeps_earliest_start_and_drops_nested_start_and_intercept() {
    // 规范贯穿示例：start1 → a → b → start2 → a → intercept → c → d → end
    // 去重后：start1 → a → b → a → c → d → end（删 start2 与 intercept，保留最早 start1）
    let splitter = SequentialStackSplitter::new(vec![kw("start")], vec![kw("intercept")]).unwrap();
    let entries = vec![
        entry(1, "2026-07-05 10:00:00.000", "start1"),
        entry(2, "2026-07-05 10:00:00.010", "a"),
        entry(3, "2026-07-05 10:00:00.020", "b"),
        entry(4, "2026-07-05 10:00:00.030", "start2"),
        entry(5, "2026-07-05 10:00:00.040", "a"),
        entry(6, "2026-07-05 10:00:00.050", "intercept"),
        entry(7, "2026-07-05 10:00:00.060", "c"),
        entry(8, "2026-07-05 10:00:00.070", "d"),
        entry(9, "2026-07-05 10:00:00.080", "end"),
    ];
    let requests = splitter.split(&entries);
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].id, "2026-07-05 10:00:00.000");
    let msgs: Vec<&str> = requests[0].entries.iter().map(|e| e.message.as_str()).collect();
    assert_eq!(msgs, vec!["start1", "a", "b", "a", "c", "d", "end"]);
}

#[test]
fn nested_start_entries_flow_to_previous_start_when_intercepted() {
    let splitter =
        SequentialStackSplitter::new(vec![kw("request started")], vec![kw("timeout waiting")])
            .unwrap();
    let entries = vec![
        entry(1, "2026-07-05 10:00:00.000", "request started"),
        entry(2, "2026-07-05 10:00:00.010", "step x"),
        entry(3, "2026-07-05 10:00:00.020", "request started"),
        entry(4, "2026-07-05 10:00:00.030", "step y"),
        entry(5, "2026-07-05 10:00:00.040", "timeout waiting"),
        entry(6, "2026-07-05 10:00:00.050", "step z"),
        entry(7, "2026-07-05 10:00:00.060", "request completed"),
    ];
    let requests = splitter.split(&entries);
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].id, "2026-07-05 10:00:00.000");
    let msgs: Vec<&str> = requests[0].entries.iter().map(|e| e.message.as_str()).collect();
    assert_eq!(
        msgs,
        vec!["request started", "step x", "step y", "step z", "request completed"]
    );
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test -p log-core sequential_stack`
Expected: FAIL（`group_by_boundaries`、`Boundary`、`surviving_starts`、`dedup` 尚未定义，或旧 `split` 返回错误结果）。

- [ ] **Step 3: 在 `mod.rs` 加 `Boundary` 与 `group_by_boundaries`**

在 `crates/log-core/src/domain/request_split/mod.rs` 顶部加 import：

```rust
use crate::domain::latency_analysis::timestamp::timestamp_to_ms;
```

在 `Request` 结构定义之后追加：

```rust
/// 存活 start 边界：一个未被拦截 pop 的请求起点。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Boundary {
    /// 边界时间戳（距 Unix 纪元毫秒）。
    pub ts_ms: i64,
    /// 原始时间戳字符串，作为 `Request.id`。
    pub timestamp: String,
    /// 触发边界的条目行号，分组时用于同时间戳稳定排序。
    pub line_no: u64,
}

/// step 5：每条 entry 归「最近的前一个存活边界」；早于首个存活边界的条目丢弃。
/// 只分组、不删条目；start/intercept 命中的条目照常保留，由下游 `dedup` 处理。
pub fn group_by_boundaries(entries: &[LogEntry], boundaries: &[Boundary]) -> Vec<Request> {
    let mut ordered: Vec<(i64, u64, &LogEntry)> = entries
        .iter()
        .filter_map(|e| timestamp_to_ms(&e.timestamp).map(|ts| (ts, e.line_no, e)))
        .collect();
    ordered.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

    let mut requests: Vec<Request> = Vec::new();
    let mut b = 0usize;
    for (ts_ms, line_no, entry) in ordered {
        while b + 1 < boundaries.len()
            && (boundaries[b + 1].ts_ms, boundaries[b + 1].line_no) <= (ts_ms, line_no)
        {
            b += 1;
        }
        if b < boundaries.len()
            && (boundaries[b].ts_ms, boundaries[b].line_no) <= (ts_ms, line_no)
        {
            if requests.last().map(|r| r.id.as_str()) != Some(boundaries[b].timestamp.as_str()) {
                requests.push(Request {
                    id: boundaries[b].timestamp.clone(),
                    entries: Vec::new(),
                });
            }
            requests.last_mut().expect("pushed above").entries.push(entry.clone());
        }
    }
    requests
}
```

- [ ] **Step 4: 重写 `sequential_stack.rs` 的 `split` 为三步**

替换 `crates/log-core/src/domain/request_split/sequential_stack.rs`：

顶部 import 改为（新增 `HashSet` 与 `Boundary`、`group_by_boundaries`）：

```rust
use std::collections::HashSet;

use crate::domain::latency_analysis::marker::MarkerMatcher;
use crate::domain::latency_analysis::spec::Marker;
use crate::domain::latency_analysis::timestamp::timestamp_to_ms;
use crate::domain::log_workspace::log_entry::LogEntry;
use crate::domain::request_split::{group_by_boundaries, Boundary, Request, RequestSplitter};
```

`impl SequentialStackSplitter` 里 `new` 保持不变，追加两个方法（放在 `new` 之后）：

```rust
    /// step 3：栈式求存活 start 边界。intercept 只 pop 边界、不丢条目。
    pub fn surviving_starts(&self, entries: &[LogEntry]) -> Vec<Boundary> {
        let mut ordered: Vec<(i64, u64, &LogEntry)> = entries
            .iter()
            .filter_map(|e| timestamp_to_ms(&e.timestamp).map(|ts| (ts, e.line_no, e)))
            .collect();
        ordered.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

        let mut stack: Vec<Boundary> = Vec::new();
        for (ts_ms, line_no, entry) in ordered {
            let line = clean_line(&entry.raw);
            if self.intercept_ends.iter().any(|m| m.matches(line)) {
                stack.pop();
                continue;
            }
            if self.request_starts.iter().any(|m| m.matches(line)) {
                stack.push(Boundary {
                    ts_ms,
                    timestamp: entry.timestamp.clone(),
                    line_no,
                });
            }
        }
        stack
    }

    /// step 6：组内去重——删全部 intercept 命中与「非存活锚点」的重复 start 命中，存活锚点保留。
    fn dedup(&self, requests: Vec<Request>, boundaries: &[Boundary]) -> Vec<Request> {
        let anchors: HashSet<(i64, u64)> =
            boundaries.iter().map(|b| (b.ts_ms, b.line_no)).collect();
        requests
            .into_iter()
            .map(|req| {
                let entries = req
                    .entries
                    .into_iter()
                    .filter(|e| {
                        let line = clean_line(&e.raw);
                        if self.intercept_ends.iter().any(|m| m.matches(line)) {
                            return false;
                        }
                        if self.request_starts.iter().any(|m| m.matches(line)) {
                            return timestamp_to_ms(&e.timestamp)
                                .map(|ts| anchors.contains(&(ts, e.line_no)))
                                .unwrap_or(false);
                        }
                        true
                    })
                    .collect();
                Request {
                    id: req.id,
                    entries,
                }
            })
            .collect()
    }
```

把 `impl RequestSplitter for SequentialStackSplitter` 里的 `split` 整体替换为：

```rust
    fn split(&self, entries: &[LogEntry]) -> Vec<Request> {
        let boundaries = self.surviving_starts(entries);
        let grouped = group_by_boundaries(entries, &boundaries);
        self.dedup(grouped, &boundaries)
    }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cargo test -p log-core sequential_stack`
Expected: PASS（2 个既有测试 + 3 个新测试全绿）。

- [ ] **Step 6: 全量编译 + 既有回归**

Run: `cargo test -p log-core`
Expected: PASS（含 `health_check::analyzer` 测试；`split` 契约未变，不回归）。

- [ ] **Step 7: 提交**

```bash
git add crates/log-core/src/domain/request_split/mod.rs crates/log-core/src/domain/request_split/sequential_stack.rs
git commit -m "refactor: 栈式拆分——intercept 只丢边界、组内去重"
```

---

## Self-Review

**Spec coverage（08-31 文档，按澄清后范围）:**
- step 3（start 有效处理，栈式只定边界）→ `surviving_starts`。✅
- step 5（start 分组，`group_by_boundaries`，条目不丢）→ `group_by_boundaries`。✅
- step 6（去重：删重复 start + intercept，保留最早存活锚点）→ `dedup`。✅
- step 7（`diagnose`）→ 按用户澄清**不在本轮**。✅

**Placeholder scan:** 无 TBD/TODO；每个代码步骤都有完整代码与断言。

**Type consistency:**
- `Boundary { ts_ms, timestamp, line_no }` 在 Task 1 定义，`group_by_boundaries`、`surviving_starts`、`dedup` 一致使用 `(ts_ms, line_no)` 比较。✅
