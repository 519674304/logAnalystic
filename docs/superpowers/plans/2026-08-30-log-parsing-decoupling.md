# 日志解析与请求拆分解耦 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「日志解析」和「请求拆分」各做成多实现（trait），下游时延分析只依赖「统一结构 `LogEntry` + 请求队列 `Vec<Request>`」两个固定接口，使后续接入带 `traceId` 的云端日志无需改动时延结算逻辑。**本次只做拓展准备：不实现任何云端解析/拆分，云端变体以后以新增 impl 接入。**

**Architecture:** 两层多实现 + 一层单实现。`LogParser`（多实现：`LogcatParser` 现在、云端以后）把不同格式的原始行解析成统一 `LogEntry`（core + 强类型 ext）。`RequestSplitter`（多实现：`SequentialStackSplitter` 端侧现在、云端以后）把扁平条目拆成请求队列。`LatencyAnalyzer`（单实现）在请求队列上做 stage 匹配与统计，与来源无关。

**Tech Stack:** Rust（log-core crate，edition 2021）；`regex` 1、`serde` 1（derive）、`serde_json` 1。无 chrono / axum / tokio。

**Spec:** 本计划实现「日志解析与请求拆分解耦」设计，需求来源为口头确认的四点决策与一句补充，非独立 spec 文件。决策：① `trace_id` 放 ext、ext 多实现强类型；② ext 强类型（枚举）；③ splitter 显式选择（当前仅一个实现，云端接入时再引入显式选择）；④ `Request.id` 统一为「有 traceId 用 traceId，否则用请求起始时间戳」；补充：「拦截→放弃上一次拆分」属端侧拆分器职责。范围：只做拓展准备，云端实现（`CloudJsonParser` / `TraceIdSplitter` / `Cloud` ext 变体）本次不实现。

## Global Constraints

- log-core crate 名 `log-core`，lib 名 `log_core`；不引入新依赖。
- 外部 HTTP 契约 `LatencyAnalysis`（camelCase）**不得改变**：`requests: RequestAnalysis{ id, totalMs, samples: StageSample{ stageId, startTimestamp, endTimestamp, durationMs }[] }[]` + `stats:{ sampleCount, averageMs, p90Ms, maxMs }`。前端契约见 `src/api/latency-analysis-client.ts:18-32`。
- `LogEntry` 仅 log-core 内部使用（HTTP 不暴露），形状可自由改。
- marker 匹配语义恒为大小写不敏感：keyword = 包含、regex = 正则匹配（`case_sensitive` 恒 false）。
- 端侧日志为**串行**：请求按时间顺序逐个完成，不存在跨请求嵌套。拦截 = 丢弃「上一次拆分」（当前请求）。
- 测试命令：`cargo test -p log-core`（在仓库根目录执行）。

---

## File Structure

- `crates/log-core/src/domain/log_workspace/log_extension.rs`（新建）：`LogExtension` 枚举 + `EdgeExt` + `trace_id()`/`app()` 访问器（云端变体以后在此新增）。
- `crates/log-core/src/domain/log_workspace/log_entry.rs`（改）：`LogEntry` = core 字段 + `ext: LogExtension`。
- `crates/log-core/src/domain/log_workspace/log_parser.rs`（改）：`LogParser` trait + `LogcatParser` 实现（吸收现有 `parse_line`）。
- `crates/log-core/src/domain/latency_analysis/marker.rs`（新建）：`MarkerMatcher`（从 analyzer.rs 抽出，供 splitter 与 analyzer 共用）。
- `crates/log-core/src/domain/request_split/mod.rs`（新建）：`Request` 结构 + `RequestSplitter` trait。
- `crates/log-core/src/domain/request_split/sequential_stack.rs`（新建）：`SequentialStackSplitter`（端侧，唯一当前实现）。
- `crates/log-core/src/domain/latency_analysis/analyzer.rs`（改）：删掉拆分逻辑，改为消费 `Vec<Request>`。
- `crates/log-core/src/domain/mod.rs`、`log_workspace/mod.rs`、`latency_analysis/mod.rs`（改）：模块声明。
- `crates/log-core/src/infrastructure/ripgrep_log_source.rs`（改）：改用 `LogcatParser`；`app` 经 `ext.app()` 取。
- `crates/log-core/src/application/log_workspace_service.rs`（改）：`analyze` 内用 `SequentialStackSplitter` 拆分后交 `LatencyAnalyzer`。

---

### Task 1: `LogExtension` 枚举 + `LogEntry` 拆成 core/ext

**Files:**
- Create: `crates/log-core/src/domain/log_workspace/log_extension.rs`
- Modify: `crates/log-core/src/domain/log_workspace/log_entry.rs`
- Modify: `crates/log-core/src/domain/log_workspace/log_parser.rs:1-43`
- Modify: `crates/log-core/src/infrastructure/ripgrep_log_source.rs:254-279`
- Modify: `crates/log-core/src/domain/latency_analysis/analyzer.rs:260-273`（测试辅助 `entry()`）
- Modify: `crates/log-core/src/domain/log_workspace/mod.rs`

**Interfaces:**
- Produces: `LogExtension { Edge(EdgeExt) }`，`LogExtension::trace_id() -> Option<&str>`（当前恒 None，云端接入后返回 Some），`LogExtension::app() -> Option<&str>`；`LogEntry { line_no, timestamp, level, message, raw, ext }`，`LogEntry::trace_id()`，`LogEntry::app()`。

- [ ] **Step 1: 写 `log_extension.rs` + 单元测试**

`crates/log-core/src/domain/log_workspace/log_extension.rs`：

```rust
use serde::Serialize;

/// 日志条目扩展数据：按来源分型（强类型多实现）。
/// 当前只有端侧 Edge；云端 Cloud 变体接入时在此新增，无需改动 core 字段。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "source", rename_all = "camelCase")]
pub enum LogExtension {
    Edge(EdgeExt),
}

/// 端侧 logcat 扩展字段。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EdgeExt {
    pub pid: u32,
    pub tid: u32,
    pub app_prefix: String,
    pub package_name: String,
    pub tag: String,
}

impl LogExtension {
    /// 关联键：云端接入后返回 Some(traceId)；端侧恒为 None。
    /// 这是决策④「有 traceId 用 traceId，否则用请求起始时间戳」的统一取键缝。
    pub fn trace_id(&self) -> Option<&str> {
        match self {
            LogExtension::Edge(_) => None,
        }
    }

    /// 应用标识：端侧为 app_prefix。
    pub fn app(&self) -> Option<&str> {
        match self {
            LogExtension::Edge(e) => Some(&e.app_prefix),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edge_has_app_and_no_trace_id() {
        let ext = LogExtension::Edge(EdgeExt {
            pid: 32033,
            tid: 32033,
            app_prefix: "A00010".to_string(),
            package_name: "com.demo.app".to_string(),
            tag: "Order".to_string(),
        });
        assert_eq!(ext.trace_id(), None);
        assert_eq!(ext.app(), Some("A00010"));
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test -p log-core log_extension`
Expected: FAIL（模块未声明，无法编译）

- [ ] **Step 3: 声明模块并重写 `LogEntry`**

`crates/log-core/src/domain/log_workspace/mod.rs` 改为：

```rust
pub mod log_entry;
pub mod log_extension;
pub mod log_parser;
pub mod port;
pub mod workspace;
```

`crates/log-core/src/domain/log_workspace/log_entry.rs` 整体替换为：

```rust
use serde::Serialize;

use crate::domain::log_workspace::log_extension::LogExtension;

/// 统一日志条目：core 为所有来源必有字段，ext 按来源分型。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub line_no: u64,
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub raw: String,
    pub ext: LogExtension,
}

impl LogEntry {
    pub fn trace_id(&self) -> Option<&str> {
        self.ext.trace_id()
    }

    pub fn app(&self) -> Option<&str> {
        self.ext.app()
    }
}
```

- [ ] **Step 4: 改 `parse_line` 产出 `EdgeExt`**

`crates/log-core/src/domain/log_workspace/log_parser.rs`：在文件顶部 `use crate::domain::log_workspace::log_entry::LogEntry;` 之后加 `use crate::domain::log_workspace::log_extension::{EdgeExt, LogExtension};`，并把函数体的 `Some(LogEntry { ... })` 改为：

```rust
    Some(LogEntry {
        line_no,
        timestamp: format!("{date} {time}"),
        level,
        message,
        raw: raw.to_string(),
        ext: LogExtension::Edge(EdgeExt {
            pid,
            tid,
            app_prefix,
            package_name,
            tag,
        }),
    })
```

（删除原来 `LogEntry` 结构体里散落的 `pid, tid, app_prefix, package_name, tag` 字段。）

- [ ] **Step 5: 改 `ripgrep_log_source.rs` 的 `app` 取值**

`crates/log-core/src/infrastructure/ripgrep_log_source.rs:272-275`，把：

```rust
app: entry
    .as_ref()
    .map(|e| e.app_prefix.clone())
    .unwrap_or_default(),
```

改为：

```rust
app: entry
    .as_ref()
    .and_then(|e| e.app())
    .map(String::from)
    .unwrap_or_default(),
```

- [ ] **Step 6: 改 `analyzer.rs` 测试辅助 `entry()`**

`crates/log-core/src/domain/latency_analysis/analyzer.rs:260-273`，把 `entry()` 里构造 `LogEntry` 的字段改为新形状：

```rust
    fn entry(line_no: u64, timestamp: &str, msg: &str) -> LogEntry {
        LogEntry {
            line_no,
            timestamp: timestamp.to_string(),
            level: "I".to_string(),
            message: msg.to_string(),
            raw: msg.to_string(),
            ext: LogExtension::Edge(EdgeExt {
                pid: 0,
                tid: 0,
                app_prefix: "A00010".to_string(),
                package_name: "com.demo.app".to_string(),
                tag: "Order".to_string(),
            }),
        }
    }
```

并在测试模块 `use super::*;` 之外加 `use crate::domain::log_workspace::log_extension::{EdgeExt, LogExtension};`（若 `super::*` 未覆盖到）。

- [ ] **Step 7: 全量测试**

Run: `cargo test -p log-core`
Expected: 全部 PASS（现有 analyzer 测试因 `entry()` 形状修正后继续通过）

- [ ] **Step 8: Commit**

```bash
git add crates/log-core/src/domain/log_workspace/
git commit -m "refactor: split LogEntry into core + typed LogExtension"
```

---

### Task 2: `LogParser` trait + `LogcatParser`

**Files:**
- Modify: `crates/log-core/src/domain/log_workspace/log_parser.rs`
- Modify: `crates/log-core/src/infrastructure/ripgrep_log_source.rs:7, 254, 325, 367`

**Interfaces:**
- Produces: `trait LogParser { fn parse_line(&self, raw: &str) -> Option<LogEntry>; }`；`pub struct LogcatParser;` 实现之。

- [ ] **Step 1: 定义 trait 并把自由函数改成实现**

`crates/log-core/src/domain/log_workspace/log_parser.rs`：保留现有 `parse_line` 的函数体逻辑，改为 trait + 单元结构体实现。文件内容变为：

```rust
use crate::domain::log_workspace::log_entry::LogEntry;
use crate::domain::log_workspace::log_extension::{EdgeExt, LogExtension};

/// 日志解析端口：不同来源格式 → 统一 LogEntry。
/// 云端解析器（CloudJsonParser）以后作为新 impl 接入。
pub trait LogParser {
    fn parse_line(&self, raw: &str) -> Option<LogEntry>;
}

/// 端侧 logcat 单行解析。
///
/// ```text
/// <lineNo>,<date> <time> <pid> <tid> <level> <appPrefix>/<package>/<tag>: <message>
/// ```
pub struct LogcatParser;

impl LogParser for LogcatParser {
    fn parse_line(&self, raw: &str) -> Option<LogEntry> {
        let (line_no_str, rest) = raw.split_once(',')?;
        let line_no: u64 = line_no_str.trim().parse().ok()?;

        let mut tokens = rest.split_whitespace();
        let date = tokens.next()?;
        let time = tokens.next()?;
        let pid: u32 = tokens.next()?.parse().ok()?;
        let tid: u32 = tokens.next()?.parse().ok()?;
        let level = tokens.next()?.to_string();

        let app_field = tokens.next()?;
        let app_field = app_field.strip_suffix(':').unwrap_or(app_field);
        let mut parts = app_field.split('/');
        let app_prefix = parts.next()?.to_string();
        let package_name = parts.next()?.to_string();
        let tag = parts.next()?.to_string();

        let message = tokens.collect::<Vec<_>>().join(" ");

        Some(LogEntry {
            line_no,
            timestamp: format!("{date} {time}"),
            level,
            message,
            raw: raw.to_string(),
            ext: LogExtension::Edge(EdgeExt {
                pid,
                tid,
                app_prefix,
                package_name,
                tag,
            }),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_edge_logcat_line() {
        let raw = "20675,2026-07-05 10:00:00.100 32033 32033 I A00010/com.demo.app/Order: request started";
        let entry = LogcatParser.parse_line(raw).expect("parse");
        assert_eq!(entry.line_no, 20675);
        assert_eq!(entry.timestamp, "2026-07-05 10:00:00.100");
        assert_eq!(entry.level, "I");
        assert_eq!(entry.message, "request started");
        assert_eq!(entry.app(), Some("A00010"));
        assert_eq!(entry.trace_id(), None);
    }
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cargo test -p log-core log_parser`
Expected: FAIL（`LogcatParser` 未定义）

- [ ] **Step 3: 让 `RipgrepLogSource` 用 `LogcatParser`**

`crates/log-core/src/infrastructure/ripgrep_log_source.rs`：
- 顶部把 `use crate::domain::log_workspace::log_parser::parse_line;` 改为 `use crate::domain::log_workspace::log_parser::LogcatParser;`。
- 三处 `parse_line(&line)` 改为 `LogcatParser.parse_line(&line)`（分别在 search 约 254 行、read_context 约 325 行、entries 约 367 行）。

- [ ] **Step 4: 全量测试**

Run: `cargo test -p log-core`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add crates/log-core/src/domain/log_workspace/log_parser.rs crates/log-core/src/infrastructure/ripgrep_log_source.rs
git commit -m "refactor: extract LogParser trait with LogcatParser impl"
```

---

### Task 3: 抽出 `MarkerMatcher` 到共享模块

**Files:**
- Create: `crates/log-core/src/domain/latency_analysis/marker.rs`
- Modify: `crates/log-core/src/domain/latency_analysis/analyzer.rs:18-44`（删除本地的 `MarkerMatcher`，改 import）
- Modify: `crates/log-core/src/domain/latency_analysis/mod.rs`

**Interfaces:**
- Produces: `pub enum MarkerMatcher { Keyword{..}, Regex(..) }`，`pub fn build(marker: &Marker) -> Result<Self, String>`，`pub fn matches(&self, line: &str) -> bool`。

- [ ] **Step 1: 新建 `marker.rs`**

`crates/log-core/src/domain/latency_analysis/marker.rs`：

```rust
//! marker 匹配器：keyword（大小写不敏感包含）或 regex。

use regex::Regex;

use crate::domain::latency_analysis::spec::{Marker, MarkerMode};

pub enum MarkerMatcher {
    Keyword { needle_lower: String },
    Regex(Regex),
}

impl MarkerMatcher {
    pub fn build(marker: &Marker) -> Result<Self, String> {
        match marker.mode {
            MarkerMode::Keyword => Ok(MarkerMatcher::Keyword {
                needle_lower: marker.pattern.to_lowercase(),
            }),
            MarkerMode::Regex => Regex::new(&marker.pattern)
                .map(MarkerMatcher::Regex)
                .map_err(|e| format!("正则表达式无效: {e}")),
        }
    }

    pub fn matches(&self, line: &str) -> bool {
        match self {
            MarkerMatcher::Keyword { needle_lower } => {
                line.to_lowercase().contains(needle_lower.as_str())
            }
            MarkerMatcher::Regex(re) => re.is_match(line),
        }
    }
}
```

- [ ] **Step 2: 声明模块**

`crates/log-core/src/domain/latency_analysis/mod.rs` 加一行 `pub mod marker;`。

- [ ] **Step 3: 从 `analyzer.rs` 删除本地定义并 import**

`crates/log-core/src/domain/latency_analysis/analyzer.rs`：
- 删除 18-44 行的 `enum MarkerMatcher` 及其 `impl`。
- 删除 `use regex::Regex;`（若仅被 MarkerMatcher 使用）。
- 加 `use crate::domain::latency_analysis::marker::MarkerMatcher;`。
- 其余用到 `MarkerMatcher` 的地方（`build`/`matches`）不变。

- [ ] **Step 4: 全量测试**

Run: `cargo test -p log-core`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add crates/log-core/src/domain/latency_analysis/
git commit -m "refactor: extract MarkerMatcher to shared module"
```

---

### Task 4: `Request` + `RequestSplitter` trait + `SequentialStackSplitter`

**Files:**
- Create: `crates/log-core/src/domain/request_split/mod.rs`
- Create: `crates/log-core/src/domain/request_split/sequential_stack.rs`
- Modify: `crates/log-core/src/domain/mod.rs`

**Interfaces:**
- Consumes: `Marker`（`spec`）、`MarkerMatcher`（`marker`）、`timestamp_to_ms`（`timestamp`）、`LogEntry`。
- Produces: `pub struct Request { pub id: String, pub entries: Vec<LogEntry> }`；`pub trait RequestSplitter { fn split(&self, entries: &[LogEntry]) -> Vec<Request>; }`；`SequentialStackSplitter::new(Marker, Vec<Marker>) -> Result<Self, String>`。

**Invariant（写进 trait doc）：** 每个 splitter 产出的 `Request.entries` 必须按时间升序排列。云端 `TraceIdSplitter` 以后作为新 impl 接入。

- [ ] **Step 1: 新建 `request_split/mod.rs`**

`crates/log-core/src/domain/request_split/mod.rs`：

```rust
//! 请求拆分：把扁平 LogEntry 分组为请求队列。
//!
//! 多实现：端侧按时间顺序 + 拦截丢弃；云端以后按 traceId 分组。

pub mod sequential_stack;

use serde::Serialize;

use crate::domain::log_workspace::log_entry::LogEntry;

/// 一次请求：关联键 id + 该请求的时间升序条目。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    /// 有 traceId 用 traceId，否则用请求起始时间戳（决策④）。
    pub id: String,
    /// 时间升序。
    pub entries: Vec<LogEntry>,
}

/// 请求拆分端口。
pub trait RequestSplitter {
    /// 拆分为请求队列；每个 `Request.entries` 必须时间升序。
    fn split(&self, entries: &[LogEntry]) -> Vec<Request>;
}
```

- [ ] **Step 2: 新建 `sequential_stack.rs`（端侧，含拦截丢弃）**

`crates/log-core/src/domain/request_split/sequential_stack.rs`：

```rust
//! 端侧请求拆分：按时间顺序扫描，request_start 开新请求，intercept 丢弃当前请求。
//!
//! 端侧日志为串行：请求依次完成、无跨请求嵌套，故按「连续区间」拆分即可。
//! 「拦截→放弃上一次拆分」属本拆分器职责，与云端拆分无关。

use crate::domain::latency_analysis::marker::MarkerMatcher;
use crate::domain::latency_analysis::spec::Marker;
use crate::domain::latency_analysis::timestamp::timestamp_to_ms;
use crate::domain::log_workspace::log_entry::LogEntry;
use crate::domain::request_split::{Request, RequestSplitter};

fn clean_line(raw: &str) -> &str {
    raw.trim_end_matches(|c: char| c == '\n' || c == '\r')
}

pub struct SequentialStackSplitter {
    request_start: MarkerMatcher,
    intercept_ends: Vec<MarkerMatcher>,
}

impl SequentialStackSplitter {
    pub fn new(request_start: Marker, intercept_ends: Vec<Marker>) -> Result<Self, String> {
        let request_start = MarkerMatcher::build(&request_start)?;
        let intercept_ends = intercept_ends
            .iter()
            .map(MarkerMatcher::build)
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            request_start,
            intercept_ends,
        })
    }
}

impl RequestSplitter for SequentialStackSplitter {
    fn split(&self, entries: &[LogEntry]) -> Vec<Request> {
        // 1. 只保留时间戳可解析的条目，按 (ts_ms, line_no) 稳定排序。
        let mut ordered: Vec<(i64, u64, &LogEntry)> = entries
            .iter()
            .filter_map(|e| timestamp_to_ms(&e.timestamp).map(|ts| (ts, e.line_no, e)))
            .collect();
        ordered.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));

        // 2. 顺序扫描：request_start 开新请求，intercept 丢弃当前请求（拦截优先）。
        let mut requests: Vec<Request> = Vec::new();
        let mut current: Option<(String, Vec<LogEntry>)> = None;

        for (_, _, entry) in &ordered {
            let line = clean_line(&entry.raw);
            let is_intercept = self.intercept_ends.iter().any(|m| m.matches(line));
            if is_intercept {
                current = None;
                continue;
            }
            if self.request_start.matches(line) {
                if let Some((id, entries)) = current.take() {
                    requests.push(Request { id, entries });
                }
                current = Some((entry.timestamp.clone(), vec![(*entry).clone()]));
            } else if let Some((_, entries)) = current.as_mut() {
                entries.push((*entry).clone());
            }
        }
        if let Some((id, entries)) = current.take() {
            requests.push(Request { id, entries });
        }

        requests
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::latency_analysis::spec::MarkerMode;
    use crate::domain::log_workspace::log_extension::{EdgeExt, LogExtension};

    fn entry(line_no: u64, timestamp: &str, msg: &str) -> LogEntry {
        LogEntry {
            line_no,
            timestamp: timestamp.to_string(),
            level: "I".to_string(),
            message: msg.to_string(),
            raw: msg.to_string(),
            ext: LogExtension::Edge(EdgeExt {
                pid: 0,
                tid: 0,
                app_prefix: "A00010".to_string(),
                package_name: "com.demo.app".to_string(),
                tag: "Order".to_string(),
            }),
        }
    }

    fn kw(pattern: &str) -> Marker {
        Marker {
            pattern: pattern.to_string(),
            mode: MarkerMode::Keyword,
        }
    }

    #[test]
    fn splits_two_requests_by_start_marker() {
        let splitter = SequentialStackSplitter::new(kw("request started"), vec![]).unwrap();
        let entries = vec![
            entry(1, "2026-07-05 10:00:00.000", "request started"),
            entry(2, "2026-07-05 10:00:00.040", "step begin"),
            entry(3, "2026-07-05 10:00:00.080", "step end"),
            entry(4, "2026-07-05 10:00:01.000", "request started"),
            entry(5, "2026-07-05 10:00:01.040", "step begin"),
        ];
        let requests = splitter.split(&entries);
        assert_eq!(requests.len(), 2);
        assert_eq!(requests[0].id, "2026-07-05 10:00:00.000");
        assert_eq!(requests[0].entries.len(), 3);
        assert_eq!(requests[1].id, "2026-07-05 10:00:01.000");
        assert_eq!(requests[1].entries.len(), 2);
    }

    #[test]
    fn intercept_drops_current_request() {
        let splitter =
            SequentialStackSplitter::new(kw("request started"), vec![kw("timeout waiting")])
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
    }
}
```

- [ ] **Step 3: 声明模块并跑测试**

`crates/log-core/src/domain/mod.rs` 改为：

```rust
pub mod latency_analysis;
pub mod log_workspace;
pub mod request_split;
```

Run: `cargo test -p log-core request_split`
Expected: 2 个 splitter 测试 PASS

- [ ] **Step 4: Commit**

```bash
git add crates/log-core/src/domain/request_split/ crates/log-core/src/domain/mod.rs
git commit -m "feat: add RequestSplitter trait with sequential-stack impl"
```

---

### Task 5: `LatencyAnalyzer` 改为消费 `Vec<Request>`

**Files:**
- Modify: `crates/log-core/src/domain/latency_analysis/analyzer.rs`（整体重写）

**Interfaces:**
- Consumes: `MarkerMatcher`、`StageSpec`、`timestamp_to_ms`、`Request`。
- Produces: `LatencyAnalyzer::analyze(stages: &[StageSpec], requests: &[Request]) -> Result<LatencyAnalysis, String>`。

- [ ] **Step 1: 重写 `analyzer.rs`**

将 `crates/log-core/src/domain/latency_analysis/analyzer.rs` 整体替换为（删除拆分相关的 `HitRole`/`TimedHit`/`Rule`/`StageEvents`/`OpenRequest`/`events_mut`/`finalize`，保留 `clean_line`/`compute_stats`）：

```rust
//! 时延分析核心：在请求队列上做 stage 匹配与统计（与来源无关）。

use crate::domain::latency_analysis::marker::MarkerMatcher;
use crate::domain::latency_analysis::result::{
    LatencyAnalysis, LatencyStatistics, RequestAnalysis, StageSample,
};
use crate::domain::latency_analysis::spec::StageSpec;
use crate::domain::latency_analysis::timestamp::timestamp_to_ms;
use crate::domain::request_split::Request;

fn clean_line(raw: &str) -> &str {
    raw.trim_end_matches(|c: char| c == '\n' || c == '\r')
}

struct StageRule {
    stage_id: String,
    start: MarkerMatcher,
    ends: Vec<MarkerMatcher>,
}

fn analyze_request(rules: &[StageRule], req: &Request) -> RequestAnalysis {
    let mut samples: Vec<StageSample> = Vec::new();
    let mut timestamps: Vec<i64> = Vec::new();

    for rule in rules {
        let mut start_ts: Option<(i64, String)> = None;
        let mut end_ts: Option<(i64, String)> = None;
        for entry in &req.entries {
            let line = clean_line(&entry.raw);
            let Some(ts_ms) = timestamp_to_ms(&entry.timestamp) else {
                continue;
            };
            if start_ts.is_none() && rule.start.matches(line) {
                start_ts = Some((ts_ms, entry.timestamp.clone()));
            }
            if end_ts.is_none() && rule.ends.iter().any(|m| m.matches(line)) {
                end_ts = Some((ts_ms, entry.timestamp.clone()));
            }
            if start_ts.is_some() && end_ts.is_some() {
                break;
            }
        }
        if let (Some(start), Some(end)) = (start_ts, end_ts) {
            let duration_ms = (end.0 - start.0).max(0);
            samples.push(StageSample {
                stage_id: rule.stage_id.clone(),
                start_timestamp: start.1,
                end_timestamp: end.1,
                duration_ms,
            });
            timestamps.push(start.0);
            timestamps.push(end.0);
        }
    }

    let total_ms = if timestamps.is_empty() {
        0
    } else {
        timestamps.iter().copied().max().unwrap() - timestamps.iter().copied().min().unwrap()
    };

    RequestAnalysis {
        id: req.id.clone(),
        total_ms,
        samples,
    }
}

fn compute_stats(durations: &[i64]) -> LatencyStatistics {
    if durations.is_empty() {
        return LatencyStatistics {
            sample_count: 0,
            average_ms: 0,
            p90_ms: 0,
            max_ms: 0,
        };
    }
    let mut sorted = durations.to_vec();
    sorted.sort_unstable();
    let n = durations.len();
    let sum: i64 = durations.iter().sum();
    let average_ms = (sum as f64 / n as f64).round() as i64;
    let p90_index = ((n * 9 + 9) / 10).saturating_sub(1).min(n - 1);
    LatencyStatistics {
        sample_count: n,
        average_ms,
        p90_ms: sorted[p90_index],
        max_ms: sorted[n - 1],
    }
}

pub struct LatencyAnalyzer;

impl LatencyAnalyzer {
    pub fn analyze(
        stages: &[StageSpec],
        requests: &[Request],
    ) -> Result<LatencyAnalysis, String> {
        let rules: Vec<StageRule> = stages
            .iter()
            .map(|s| {
                let start = MarkerMatcher::build(&s.start)?;
                let ends = s
                    .ends
                    .iter()
                    .map(MarkerMatcher::build)
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(StageRule {
                    stage_id: s.id.clone(),
                    start,
                    ends,
                })
            })
            .collect::<Result<Vec<_>, String>>()?;

        let requests: Vec<RequestAnalysis> = requests
            .iter()
            .map(|r| analyze_request(&rules, r))
            .collect();
        let durations: Vec<i64> = requests
            .iter()
            .flat_map(|r| r.samples.iter().map(|s| s.duration_ms))
            .collect();
        let stats = compute_stats(&durations);

        Ok(LatencyAnalysis { requests, stats })
    }
}
```

- [ ] **Step 2: 重写测试为「在 `Request` 上」的单元测试**

把 `analyzer.rs` 底部 `#[cfg(test)] mod tests` 整体替换为以下内容（保留 `compute_stats` 三个测试 + 改为 `Request` 输入的分析测试）：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::latency_analysis::spec::{Marker, MarkerMode, StageSpec};
    use crate::domain::log_workspace::log_entry::LogEntry;
    use crate::domain::log_workspace::log_extension::{EdgeExt, LogExtension};
    use crate::domain::request_split::Request;

    fn entry(line_no: u64, timestamp: &str, msg: &str) -> LogEntry {
        LogEntry {
            line_no,
            timestamp: timestamp.to_string(),
            level: "I".to_string(),
            message: msg.to_string(),
            raw: msg.to_string(),
            ext: LogExtension::Edge(EdgeExt {
                pid: 0,
                tid: 0,
                app_prefix: "A00010".to_string(),
                package_name: "com.demo.app".to_string(),
                tag: "Order".to_string(),
            }),
        }
    }

    fn req(id: &str, entries: Vec<LogEntry>) -> Request {
        Request {
            id: id.to_string(),
            entries,
        }
    }

    fn kw(pattern: &str) -> Marker {
        Marker {
            pattern: pattern.to_string(),
            mode: MarkerMode::Keyword,
        }
    }

    fn spec() -> Vec<StageSpec> {
        vec![
            StageSpec {
                id: "STAGE-A".to_string(),
                start: kw("request started"),
                ends: vec![kw("start parallel subprocesses")],
            },
            StageSpec {
                id: "STAGE-D".to_string(),
                start: kw("all subprocesses completed"),
                ends: vec![kw("request completed successfully")],
            },
        ]
    }

    #[test]
    fn computes_stage_latency_per_request() {
        let requests = vec![req(
            "2026-07-05 10:00:00.000",
            vec![
                entry(1, "2026-07-05 10:00:00.000", "request started"),
                entry(2, "2026-07-05 10:00:00.040", "start parallel subprocesses"),
                entry(3, "2026-07-05 10:00:00.085", "all subprocesses completed"),
                entry(4, "2026-07-05 10:00:00.095", "request completed successfully"),
            ],
        )];
        let result = LatencyAnalyzer::analyze(&spec(), &requests).unwrap();
        assert_eq!(result.requests.len(), 1);
        let r0 = &result.requests[0];
        assert_eq!(r0.id, "2026-07-05 10:00:00.000");
        assert_eq!(r0.total_ms, 95);
        let by_id: std::collections::HashMap<&str, i64> = r0
            .samples
            .iter()
            .map(|s| (s.stage_id.as_str(), s.duration_ms))
            .collect();
        assert_eq!(by_id.get("STAGE-A"), Some(&40));
        assert_eq!(by_id.get("STAGE-D"), Some(&10));
        assert_eq!(result.stats.sample_count, 2);
        assert_eq!(result.stats.max_ms, 40);
    }

    #[test]
    fn stage_takes_first_pair_only() {
        let requests = vec![req(
            "r1",
            vec![
                entry(1, "2026-07-05 10:00:00.000", "step begin"),
                entry(2, "2026-07-05 10:00:00.010", "step end"),
                entry(3, "2026-07-05 10:00:00.020", "step begin"),
                entry(4, "2026-07-05 10:00:00.050", "step end"),
            ],
        )];
        let stages = vec![StageSpec {
            id: "STAGE-X".to_string(),
            start: kw("step begin"),
            ends: vec![kw("step end")],
        }];
        let result = LatencyAnalyzer::analyze(&stages, &requests).unwrap();
        assert_eq!(result.requests[0].samples.len(), 1);
        assert_eq!(result.requests[0].samples[0].duration_ms, 10);
    }

    #[test]
    fn compute_stats_p90_and_rounding() {
        let stats = compute_stats(&(1..=20).collect::<Vec<i64>>());
        assert_eq!(stats.sample_count, 20);
        assert_eq!(stats.average_ms, 11);
        assert_eq!(stats.p90_ms, 18);
        assert_eq!(stats.max_ms, 20);
    }

    #[test]
    fn compute_stats_small_n() {
        let stats = compute_stats(&[10, 20, 30, 40, 50]);
        assert_eq!(stats.average_ms, 30);
        assert_eq!(stats.p90_ms, 50);
        assert_eq!(stats.max_ms, 50);
    }

    #[test]
    fn compute_stats_empty() {
        let stats = compute_stats(&[]);
        assert_eq!(
            stats,
            LatencyStatistics {
                sample_count: 0,
                average_ms: 0,
                p90_ms: 0,
                max_ms: 0,
            }
        );
    }
}
```

- [ ] **Step 3: 全量测试**

Run: `cargo test -p log-core`
Expected: 全部 PASS（旧的 `smoke_five_requests_stats` 等端到端用例已由 Task 4 的 splitter 测试 + 本 Task 的 analyzer 测试覆盖，删除即可；若仍引用旧 `analyze(spec, entries)` 签名会编译失败，必须删净）

- [ ] **Step 4: Commit**

```bash
git add crates/log-core/src/domain/latency_analysis/analyzer.rs
git commit -m "refactor: LatencyAnalyzer consumes request queue instead of raw entries"
```

---

### Task 6: 服务层接通 splitter + analyzer

**Files:**
- Modify: `crates/log-core/src/application/log_workspace_service.rs`

**Interfaces:**
- Consumes: `SequentialStackSplitter`、`RequestSplitter`、`LatencyAnalyzer`。
- Produces: `LogWorkspaceService::analyze(&self, dir, range, spec)`（签名不变，内部改为「拆分 → 结算」两步）。

- [ ] **Step 1: 改 `log_workspace_service.rs` 的 `analyze` 方法体**

`crates/log-core/src/application/log_workspace_service.rs`：import 区加：

```rust
use crate::domain::request_split::sequential_stack::SequentialStackSplitter;
use crate::domain::request_split::RequestSplitter;
```

把现有 `analyze` 方法体（`crates/log-core/src/application/log_workspace_service.rs:52-60`）替换为：

```rust
    /// 时延分析：解析条目 → 端侧拆分请求队列 → 请求队列上做 stage 匹配与统计。
    pub fn analyze(
        &self,
        dir: &str,
        range: &TimeRange,
        spec: &LatencyAnalysisSpec,
    ) -> Result<LatencyAnalysis, String> {
        let entries = self.source.entries(dir, range)?;
        let splitter = SequentialStackSplitter::new(
            spec.request_start.clone(),
            spec.intercept_ends.clone(),
        )?;
        let requests = splitter.split(&entries);
        LatencyAnalyzer::analyze(&spec.process_stages, &requests)
    }
```

（签名不变，`server/src/main.rs` 无需改动。云端接入时，在此按来源构造 `TraceIdSplitter` 并引入显式选择即可，`LatencyAnalyzer` 与前端契约不动。）

- [ ] **Step 2: 全量测试 + 编译 server**

Run: `cargo test -p log-core` 然后 `cargo build -p server`
Expected: log-core 全部 PASS；server 编译通过。

- [ ] **Step 3: Commit**

```bash
git add crates/log-core/src/application/log_workspace_service.rs
git commit -m "refactor: wire splitter + analyzer in workspace service"
```

---

## Self-Review

- **Spec coverage**：① trace_id 入 ext、ext 多实现强类型 → Task 1（`LogExtension` 枚举 + `trace_id()` 访问器，Cloud 变体留待新增）；② 强类型 → Task 1；③ splitter 显式选择 → Task 6 注释说明云端接入时引入（当前仅一个实现，无需选择）；④ id 统一 traceId/startTs → Task 4（`Request.id` 语义写入 doc，当前端侧用起始时间戳，`trace_id()` 缝已留）；补充「拦截属端侧拆分」→ Task 4（`SequentialStackSplitter` 内拦截丢弃）。
- **Placeholder scan**：无 TBD/TODO；每个代码步骤给出完整实现。
- **Type consistency**：`LogEntry::trace_id()`/`app()` 在 Task 1 定义，Task 1 的 `ripgrep` 使用 `e.app()`、Task 2 测试使用 `entry.app()`/`entry.trace_id()`；`MarkerMatcher` 在 Task 3 定义，Task 4/5 使用；`Request`/`RequestSplitter` 在 Task 4 定义，Task 5/6 使用；`LatencyAnalyzer::analyze(stages, requests)` 在 Task 5 定义，Task 6 调用。签名一致。

## Execution Handoff

计划已保存。两种执行方式：**1. Subagent-Driven（推荐）** 每任务派新 subagent、任务间审查；**2. Inline** 本会话按 executing-plans 批量执行、带检查点。选哪种？
