# Web 后端与流式日志处理 实现计划（里程碑 1：流式搜索纵切面）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个独立的本机 Rust Web 服务，让 React 页面通过 HTTP 流式搜索真实日志目录，脱离 Tauri。

**Architecture:** 把现有 Rust 分层（domain / application / dto / infrastructure）抽到共享库 `log-core`，在其上新增 `streaming`（流式读取与搜索引擎）与 `workspace`（目录工作区）模块；新增 `log-web` 二进制用 axum 暴露 HTTP API；`src-tauri` 保留为薄壳。React 端用 `fetch` 替换 Tauri `invoke`。

**Tech Stack:** Rust（axum + tokio + tower-http）、现有 serde / regex / toml / toml_edit / zip、新增 csv + thiserror；React / TypeScript / Vite（原生 fetch）。

**Spec:** [2026-08-25-web-backend-streaming-log-processing-design.md](../specs/2026-08-25-web-backend-streaming-log-processing-design.md)

## Global Constraints

- 服务只绑定 `127.0.0.1`；默认端口 `8790`，可用环境变量 `LOG_ANALYSTIC_WEB_PORT` 覆盖。
- 日志读取、搜索、导出全部流式；内存不随日志总大小线性增长（固定缓冲区 + 有界结果集）。
- 默认可展示命中上限 `max_display_hits = 1000`；超过后 `truncated = true`，但继续统计 `total_matches`。
- 只访问用户显式提供的目录；不主动扫描磁盘。
- 单个文件不可读/格式异常时不中断任务，记录到 `skipped_files`。
- 单行日志超过 `8 MiB`（`DEFAULT_MAX_LINE_BYTES`）时报格式错误。
- 前端在无 Tauri 环境下可完成完整搜索流程（目录输入 → 搜索 → 进度 → 取消 → 分页结果）。
- 里程碑 1 范围：**流式搜索纵切面**。时延分析（`/api/analyses/latency`）与 CSV 导出（`/api/exports`）在里程碑 2 单独计划（当前 Rust 侧尚无任何时延分析代码，属独立子系统）。
- 保留既有 Tauri command 为兼容入口；Web API 与 Tauri 不互相依赖。

---

## 文件结构

### 新 crate：`crates/log-core`（库）

把现有 `src-tauri/src/{domain,application,dto,infrastructure}` 原样迁入，并新增流式能力：

```
crates/log-core/
  Cargo.toml
  src/lib.rs                         # pub mod application; domain; dto; infrastructure; streaming; workspace;
  src/domain/…                       # 迁移：issue/、rule_package.rs、mod.rs
  src/application/…                  # 迁移：log_search_service.rs、rule_catalog_service.rs、rule_package_service.rs、saved_query_service.rs、mod.rs
  src/dto/…                          # 迁移：command_dto.rs、issue_dto.rs、log_dto.rs、mod.rs
  src/infrastructure/…               # 迁移：file_storage/（app_data_dir、rule_catalog_store、rule_package_store、saved_query_store）、mod.rs
  src/streaming/                     # 新增：流式日志引擎
    mod.rs
    line_splitter.rs                 # LineSplitter：跨块拼接 + 超长行保护
    line_parser.rs                   # parse_line：时间戳/应用/级别/消息
    file_discovery.rs                # discover_log_files：递归发现 + 排序
    search_engine.rs                 # SearchEngine：流式匹配 + 有界结果 + 进度 + 取消
  src/workspace/                     # 新增：目录工作区
    mod.rs
    workspace_service.rs             # Workspace / WorkspaceError / WorkspaceRegistry
```

### 新 crate：`crates/log-web`（二进制）

```
crates/log-web/
  Cargo.toml
  src/main.rs                        # axum 路由 + 绑定 127.0.0.1 + 后台过期清理
  src/app_state.rs                   # AppState（工作区 + 搜索任务 + ID 计数器）
  src/error.rs                       # ApiError / ErrorDto + IntoResponse
  src/dto.rs                         # HTTP 请求/响应 DTO
  src/routes/
    mod.rs
    health.rs                        # GET /api/health
    workspaces.rs                    # POST /api/workspaces、GET /api/workspaces/:id
    searches.rs                      # POST/GET/DELETE /api/searches[/:id]
    saved_queries.rs                 # GET/POST/PUT/DELETE /api/saved-queries
    rule_packages.rs                 # GET /api/rule-packages、POST /api/rule-packages、PUT /api/rule-packages/:ruleSetId/versions/:version/nodes/:nodeId
```

### 修改：`src-tauri`（薄壳）

- `src-tauri/Cargo.toml`：移除已迁移依赖，增加 `log_core` 路径依赖。
- `src-tauri/src/lib.rs`：只保留 `pub mod commands;`。
- `src-tauri/src/commands/*`：把 `crate::…` 引用改为 `log_core::…`。
- `src-tauri/src/main.rs`：不变。

### 修改：React 前端

- 新增 `src/api/http-client.ts`：`fetch` 客户端，含工作区/搜索任务/进度轮询/取消。
- 修改 `src/app/App.tsx`：`runSearch` 改为「创建工作区 → 创建搜索任务 → 轮询进度」，接入目录输入与取消。

---

## Task 1: 抽取 `log-core` 库 crate（机械迁移）

把现有分层代码迁入共享库，`src-tauri` 变为薄壳。用现有测试作为迁移正确性的安全网。

**Files:**
- Create: `crates/log-core/Cargo.toml`
- Create: `crates/log-core/src/lib.rs`
- Move: `src-tauri/src/domain/` → `crates/log-core/src/domain/`
- Move: `src-tauri/src/application/` → `crates/log-core/src/application/`
- Move: `src-tauri/src/dto/` → `crates/log-core/src/dto/`
- Move: `src-tauri/src/infrastructure/` → `crates/log-core/src/infrastructure/`
- Modify: `Cargo.toml`（workspace members）
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands/*.rs`（`crate::` → `log_core::`）

**Interfaces:**
- Produces: `log_core` 库 crate，公开 `application`、`domain`、`dto`、`infrastructure` 模块，供后续 Task 与 `src-tauri`、`log-web` 使用。

- [ ] **Step 1: 更新工作区 manifest**

根 `Cargo.toml` 改为：

```toml
[workspace]
members = ["crates/log-core", "crates/log-web", "src-tauri"]
resolver = "2"
```

（`crates/log-web` 目录在 Task 6 才创建，先让 members 指向它；用 `cargo metadata` 前需至少有一个占位 `crates/log-web/Cargo.toml`，见 Step 2 的说明。若 `cargo` 因缺失成员报错，先创建 Task 6 的空 crate 骨架或暂时注释掉该成员。）

- [ ] **Step 2: 创建 `crates/log-core/Cargo.toml`**

```toml
[package]
name = "log-core"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1.0", features = ["derive"] }
serde_json = "1"
regex = "1"
toml = "0.8"
toml_edit = "0.25.13"
zip = "8.6.0"
csv = "1.3"
thiserror = "1.0"
```

- [ ] **Step 3: 创建 `crates/log-core/src/lib.rs`**

```rust
pub mod application;
pub mod domain;
pub mod dto;
pub mod infrastructure;
pub mod streaming;
pub mod workspace;
```

（`streaming`、`workspace` 目录在后续 Task 创建；此时先注释掉这两行，避免编译失败。）

- [ ] **Step 4: 迁移文件并修正模块路径**

用 `git mv` 把四个目录移到 `crates/log-core/src/` 下（保留 git 历史）。随后在 `src-tauri/src/commands/*.rs` 中把 `crate::application::…`、`crate::dto::…`、`crate::domain::…`、`crate::infrastructure::…` 全部改为 `log_core::…`。例如 `rule_commands.rs` 顶部的 `use crate::application::rule_package_service::{…}` 改为 `use log_core::application::rule_package_service::{…}`。

- [ ] **Step 5: 精简 `src-tauri/Cargo.toml` 与 `lib.rs`**

`src-tauri/Cargo.toml`：

```toml
[package]
name = "log_analystic_tauri"
version = "0.1.0"
edition = "2021"
build = "build.rs"

[dependencies]
tauri = { version = "1", features = ["dialog-open"] }
log_core = { path = "../crates/log-core" }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1"

[build-dependencies]
tauri-build = { version = "1", features = [] }
```

`src-tauri/src/lib.rs`：

```rust
pub mod commands;
```

- [ ] **Step 6: 运行测试验证迁移未破坏行为**

Run: `cargo test -p log-core`
Expected: 现有测试（`rule_package_service`、`rule_catalog_service`、`rule_commands`）全部 PASS。

Run: `cargo check -p log_analystic_tauri`
Expected: 无编译错误。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract log-core library crate"
```

---

## Task 2: 流式行读取器与行解析器（TDD）

实现跨缓冲区边界的行拼接、超长行保护，以及单行日志的字段解析。

**Files:**
- Create: `crates/log-core/src/streaming/mod.rs`
- Create: `crates/log-core/src/streaming/line_splitter.rs`
- Test: `crates/log-core/src/streaming/line_splitter.rs`（内联 `#[cfg(test)]`）
- Create: `crates/log-core/src/streaming/line_parser.rs`
- Test: `crates/log-core/src/streaming/line_parser.rs`（内联）
- Modify: `crates/log-core/src/lib.rs`（启用 `pub mod streaming;`）

**Interfaces:**
- Produces:
  - `LineSplitter::new(reader: R, buffer_size: usize, max_line_bytes: usize) -> Self`
  - `LineSplitter::next_line(&mut self) -> io::Result<Option<String>>`（`Ok(None)` 表示 EOF）
  - 常量 `DEFAULT_BUFFER_SIZE: usize = 1024 * 1024`、`DEFAULT_MAX_LINE_BYTES: usize = 8 * 1024 * 1024`
  - `parse_line(raw: &str) -> ParsedLine`，`ParsedLine { timestamp: String, app: String, level: String, message: String }`

- [ ] **Step 1: 写失败测试**

在 `line_splitter.rs` 内写：

```rust
#[cfg(test)]
mod tests {
    use std::io::Cursor;
    use super::LineSplitter;

    #[test]
    fn stitches_lines_split_across_buffer_boundary() {
        let text = "aaa\nbbb\nccc\n";
        // buffer_size=3 强制每行都被拆到不同块
        let mut reader = LineSplitter::new(Cursor::new(text.as_bytes()), 3, 1024);
        assert_eq!(reader.next_line().unwrap().as_deref(), Some("aaa"));
        assert_eq!(reader.next_line().unwrap().as_deref(), Some("bbb"));
        assert_eq!(reader.next_line().unwrap().as_deref(), Some("ccc"));
        assert_eq!(reader.next_line().unwrap(), None);
    }

    #[test]
    fn handles_final_line_without_trailing_newline() {
        let text = "first\nlast";
        let mut reader = LineSplitter::new(Cursor::new(text.as_bytes()), 1024, 1024);
        assert_eq!(reader.next_line().unwrap().as_deref(), Some("first"));
        assert_eq!(reader.next_line().unwrap().as_deref(), Some("last"));
        assert_eq!(reader.next_line().unwrap(), None);
    }

    #[test]
    fn rejects_over_long_line() {
        let text = "a".repeat(100) + "\n";
        let mut reader = LineSplitter::new(Cursor::new(text.as_bytes()), 1024, 64);
        assert!(reader.next_line().is_err());
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p log-core line_splitter`
Expected: 编译失败（`LineSplitter` 未定义）。

- [ ] **Step 3: 实现 `line_splitter.rs`**

```rust
//! 把字节流按行切分，拼接跨缓冲区边界的残行，并防止超长行无限占用内存。

use std::io::{self, Read};

pub const DEFAULT_BUFFER_SIZE: usize = 1024 * 1024; // 1 MiB
pub const DEFAULT_MAX_LINE_BYTES: usize = 8 * 1024 * 1024; // 8 MiB

pub struct LineSplitter<R: Read> {
    inner: R,
    buffer_size: usize,
    max_line_bytes: usize,
    carry: Vec<u8>,
    eof: bool,
    line_number: usize,
}

impl<R: Read> LineSplitter<R> {
    pub fn new(inner: R, buffer_size: usize, max_line_bytes: usize) -> Self {
        Self {
            inner,
            buffer_size,
            max_line_bytes,
            carry: Vec::new(),
            eof: false,
            line_number: 0,
        }
    }

    /// 返回下一条完整行（不含换行符）；文件结束时返回 `Ok(None)`。
    /// 单行超过 `max_line_bytes` 时返回 `ErrorKind::InvalidData` 错误。
    pub fn next_line(&mut self) -> io::Result<Option<String>> {
        let mut buf = vec![0u8; self.buffer_size];
        loop {
            if let Some(pos) = self.carry.iter().position(|&b| b == b'\n') {
                return Ok(Some(self.extract_line(Some(pos))));
            }

            if self.eof {
                if self.carry.is_empty() {
                    return Ok(None);
                }
                return Ok(Some(self.extract_line(None)));
            }

            let read = self.inner.read(&mut buf)?;
            if read == 0 {
                self.eof = true;
                continue;
            }

            self.carry.extend_from_slice(&buf[..read]);
            if self.carry.len() > self.max_line_bytes {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    format!("日志行超过 {} 字节上限，疑似缺少换行", self.max_line_bytes),
                ));
            }
        }
    }

    fn extract_line(&mut self, newline_pos: Option<usize>) -> String {
        let mut line_bytes: Vec<u8> = match newline_pos {
            Some(pos) => self.carry.drain(..=pos).collect(),
            None => std::mem::take(&mut self.carry),
        };
        if line_bytes.last() == Some(&b'\n') {
            line_bytes.pop();
        }
        if line_bytes.last() == Some(&b'\r') {
            line_bytes.pop();
        }
        self.line_number += 1;
        String::from_utf8_lossy(&line_bytes).into_owned()
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p log-core line_splitter`
Expected: 3 个测试 PASS。

- [ ] **Step 5: 实现 `line_parser.rs` 与测试**

`line_parser.rs`（由现有 `log_search_service::ParsedLine::parse` 派生，补充 message 字段）：

```rust
//! 解析单行日志的时间戳、应用、级别和消息。

pub struct ParsedLine {
    pub timestamp: String,
    pub app: String,
    pub level: String,
    pub message: String,
}

pub fn parse_line(raw: &str) -> ParsedLine {
    let mut parts = raw.splitn(4, ' ');
    let date = parts.next().unwrap_or_default();
    let time = parts.next().unwrap_or_default();
    let level = parts
        .next()
        .unwrap_or_default()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_string();
    let rest = parts.next().unwrap_or_default();
    let mut app_parts = rest.splitn(2, ' ');
    let app = app_parts.next().unwrap_or_default().to_string();
    let message = app_parts.next().unwrap_or_default().to_string();
    ParsedLine {
        timestamp: format!("{date} {time}"),
        app,
        level,
        message,
    }
}

#[cfg(test)]
mod tests {
    use super::parse_line;

    #[test]
    fn parses_standard_log_line() {
        let parsed = parse_line("2026-06-12 10:39:38.257 [WARN] A00010 mainProcess dispatch");
        assert_eq!(parsed.timestamp, "2026-06-12 10:39:38.257");
        assert_eq!(parsed.level, "WARN");
        assert_eq!(parsed.app, "A00010");
        assert_eq!(parsed.message, "mainProcess dispatch");
    }
}
```

- [ ] **Step 6: 启用模块并运行全部测试**

`lib.rs` 取消注释 `pub mod streaming;`，`streaming/mod.rs` 写：

```rust
pub mod line_splitter;
pub mod line_parser;
```

Run: `cargo test -p log-core`
Expected: 全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add streaming line splitter and parser"
```

---

## Task 3: 文件发现（TDD）

从目录递归发现候选日志文件，计算大小并排序。

**Files:**
- Create: `crates/log-core/src/streaming/file_discovery.rs`
- Modify: `crates/log-core/src/streaming/mod.rs`（加 `pub mod file_discovery;`）

**Interfaces:**
- Produces:
  - `LogFile { path: PathBuf, size: u64 }`（`Debug, Clone, PartialEq, Eq`）
  - `discover_log_files(dir: &Path) -> io::Result<Vec<LogFile>>`（按 `path` 排序）

- [ ] **Step 1: 写失败测试**

```rust
#[cfg(test)]
mod tests {
    use std::fs;
    use super::discover_log_files;

    #[test]
    fn discovers_log_files_recursively_sorted_by_path() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("log_analystic_discovery_{stamp}"));
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::write(dir.join("b.log"), "bb").unwrap();
        fs::write(dir.join("a.log"), "aaaa").unwrap();
        fs::write(dir.join("sub/c.log"), "c").unwrap();
        fs::write(dir.join("notes.md"), "ignore me").unwrap();

        let files = discover_log_files(&dir).unwrap();

        let names: Vec<String> = files
            .iter()
            .map(|f| f.path.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["a.log", "b.log", "c.log"]);
        assert_eq!(files[0].size, 4);
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p log-core file_discovery`
Expected: 编译失败。

- [ ] **Step 3: 实现 `file_discovery.rs`**

```rust
//! 从目录递归发现候选日志文件。

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const LOG_EXTENSIONS: &[&str] = &["log", "txt", "out"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogFile {
    pub path: PathBuf,
    pub size: u64,
}

pub fn discover_log_files(dir: &Path) -> io::Result<Vec<LogFile>> {
    let mut files = Vec::new();
    collect_log_files(dir, &mut files)?;
    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(files)
}

fn collect_log_files(dir: &Path, out: &mut Vec<LogFile>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            collect_log_files(&path, out)?;
        } else if file_type.is_file() && is_log_extension(&path) {
            let size = entry.metadata()?.len();
            out.push(LogFile { path, size });
        }
    }
    Ok(())
}

fn is_log_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| LOG_EXTENSIONS.iter().any(|known| known.eq_ignore_ascii_case(ext)))
        .unwrap_or(false)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p log-core file_discovery`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add log file discovery"
```

---

## Task 4: 流式搜索引擎（TDD）

这是里程碑 1 的核心。实现关键字/正则流式匹配、有界结果集、前文/后文上下文窗口、进度统计与取消。

**Files:**
- Create: `crates/log-core/src/streaming/search_engine.rs`
- Modify: `crates/log-core/src/streaming/mod.rs`（加 `pub mod search_engine;`）

**Interfaces:**
- Produces（类型全部 `Debug, Clone`，并按需 `Serialize`，serde 用 `camelCase`）：
  - `enum SearchMode { Keyword, Regex }`
  - `struct SearchConfig { query: String, mode: SearchMode, case_sensitive: bool, context_lines: usize, max_display_hits: usize }`（`Default` 中 `max_display_hits = 1000`）
  - `enum TaskStatus { Running, Completed, Cancelled }`
  - `struct SearchHit { line_number: usize, file_path: Option<String>, raw_line: String, timestamp: String, app: String, level: String, before: Vec<String>, after: Vec<String> }`
  - `struct SkippedFile { path: String, reason: String }`
  - `struct SearchProgress { status: TaskStatus, total_bytes: u64, scanned_bytes: u64, files_total: usize, files_scanned: usize, total_matches: usize, hits: Vec<SearchHit>, skipped_files: Vec<SkippedFile>, truncated: bool }`
  - `SearchEngine::new(files: Vec<LogFile>, config: SearchConfig) -> Result<Self, String>`（无效正则在 `new` 时返回 `Err`）
  - `SearchEngine::run(&self)`（阻塞；执行期间更新内部进度）
  - `SearchEngine::cancel(&self)`
  - `SearchEngine::snapshot(&self) -> SearchProgress`

- [ ] **Step 1: 写失败测试（关键字 + 上下文 + 有界）**

```rust
#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use super::*;
    use crate::streaming::file_discovery::LogFile;

    fn temp_file(name: &str, content: &str) -> LogFile {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("log_analystic_search_{stamp}_{name}"));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        fs::write(&path, content).unwrap();
        LogFile { path, size: content.len() as u64 }
    }

    fn config(query: &str) -> SearchConfig {
        SearchConfig {
            query: query.to_owned(),
            mode: SearchMode::Keyword,
            case_sensitive: false,
            context_lines: 1,
            max_display_hits: 1000,
        }
    }

    #[test]
    fn matches_keyword_with_context_and_counts_total() {
        let file = temp_file(
            "a.log",
            "2026-06-12 10:39:38 [INFO] A00010 wakeup begin\n\
             2026-06-12 10:39:39 [INFO] A00010 wakeup middle\n\
             2026-06-12 10:39:40 [INFO] A00010 wakeup end\n",
        );
        let engine = SearchEngine::new(vec![file], config("middle")).unwrap();
        engine.run();
        let progress = engine.snapshot();

        assert_eq!(progress.status, TaskStatus::Completed);
        assert_eq!(progress.total_matches, 1);
        assert_eq!(progress.hits.len(), 1);
        assert_eq!(progress.hits[0].before, vec!["2026-06-12 10:39:38 [INFO] A00010 wakeup begin"]);
        assert_eq!(progress.hits[0].after, vec!["2026-06-12 10:39:40 [INFO] A00010 wakeup end"]);
    }

    #[test]
    fn bounds_display_hits_and_sets_truncated() {
        let mut content = String::new();
        for i in 0..10 {
            content.push_str(&format!("2026-06-12 10:39:{i:02} [INFO] A hit here\n"));
        }
        let file = temp_file("b.log", &content);
        let mut cfg = config("hit");
        cfg.max_display_hits = 3;
        let engine = SearchEngine::new(vec![file], cfg).unwrap();
        engine.run();
        let progress = engine.snapshot();

        assert_eq!(progress.total_matches, 10);
        assert_eq!(progress.hits.len(), 3);
        assert!(progress.truncated);
    }

    #[test]
    fn invalid_regex_is_rejected() {
        let file = temp_file("c.log", "line\n");
        let mut cfg = config("[");
        cfg.mode = SearchMode::Regex;
        assert!(SearchEngine::new(vec![file], cfg).is_err());
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p log-core search_engine`
Expected: 编译失败（`SearchEngine` 未定义）。

- [ ] **Step 3: 实现 `search_engine.rs`**

```rust
//! 流式日志搜索引擎：逐文件逐块读取，命中时匹配，维护有限上下文，保留有界结果。

use std::collections::VecDeque;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use regex::Regex;
use serde::Serialize;

use super::file_discovery::LogFile;
use super::line_parser::parse_line;
use super::line_splitter::{LineSplitter, DEFAULT_BUFFER_SIZE, DEFAULT_MAX_LINE_BYTES};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchMode {
    Keyword,
    Regex,
}

#[derive(Debug, Clone)]
pub struct SearchConfig {
    pub query: String,
    pub mode: SearchMode,
    pub case_sensitive: bool,
    pub context_lines: usize,
    pub max_display_hits: usize,
}

impl Default for SearchConfig {
    fn default() -> Self {
        Self {
            query: String::new(),
            mode: SearchMode::Keyword,
            case_sensitive: false,
            context_lines: 0,
            max_display_hits: 1000,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Running,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub line_number: usize,
    pub file_path: Option<String>,
    pub raw_line: String,
    pub timestamp: String,
    pub app: String,
    pub level: String,
    pub before: Vec<String>,
    pub after: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchProgress {
    pub status: TaskStatus,
    pub total_bytes: u64,
    pub scanned_bytes: u64,
    pub files_total: usize,
    pub files_scanned: usize,
    pub total_matches: usize,
    pub hits: Vec<SearchHit>,
    pub skipped_files: Vec<SkippedFile>,
    pub truncated: bool,
}

pub struct SearchEngine {
    files: Vec<LogFile>,
    config: SearchConfig,
    matcher: Matcher,
    progress: Arc<Mutex<SearchProgress>>,
    cancel: Arc<AtomicBool>,
}

struct Matcher {
    needle: String,
    needle_lower: String,
    case_sensitive: bool,
    regex: Option<Regex>,
}

impl Matcher {
    fn new(config: &SearchConfig) -> Result<Self, String> {
        let needle = config.query.clone();
        let needle_lower = config.query.to_lowercase();
        let regex = match config.mode {
            SearchMode::Regex => {
                let pattern = if config.case_sensitive {
                    config.query.clone()
                } else {
                    format!("(?i:{})", config.query)
                };
                Some(Regex::new(&pattern).map_err(|error| error.to_string())?)
            }
            SearchMode::Keyword => None,
        };
        Ok(Self {
            needle,
            needle_lower,
            case_sensitive: config.case_sensitive,
            regex,
        })
    }

    fn is_match(&self, value: &str) -> bool {
        if let Some(regex) = &self.regex {
            return regex.is_match(value);
        }
        if self.case_sensitive {
            value.contains(&self.needle)
        } else {
            value.to_lowercase().contains(&self.needle_lower)
        }
    }
}

impl SearchEngine {
    pub fn new(files: Vec<LogFile>, config: SearchConfig) -> Result<Self, String> {
        let matcher = Matcher::new(&config)?;
        let total_bytes = files.iter().map(|file| file.size).sum();
        let files_total = files.len();
        let progress = Arc::new(Mutex::new(SearchProgress {
            status: TaskStatus::Running,
            total_bytes,
            scanned_bytes: 0,
            files_total,
            files_scanned: 0,
            total_matches: 0,
            hits: Vec::new(),
            skipped_files: Vec::new(),
            truncated: false,
        }));
        Ok(Self {
            files,
            config,
            matcher,
            progress,
            cancel: Arc::new(AtomicBool::new(false)),
        })
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn snapshot(&self) -> SearchProgress {
        self.progress.lock().unwrap().clone()
    }

    pub fn run(&self) {
        for file in &self.files {
            if self.cancel.load(Ordering::SeqCst) {
                break;
            }
            self.scan_file(file);
            self.progress.lock().unwrap().files_scanned += 1;
        }
        let mut progress = self.progress.lock().unwrap();
        progress.status = if self.cancel.load(Ordering::SeqCst) {
            TaskStatus::Cancelled
        } else {
            TaskStatus::Completed
        };
    }

    fn scan_file(&self, file: &LogFile) {
        let file_handle = match File::open(&file.path) {
            Ok(handle) => handle,
            Err(error) => {
                self.progress.lock().unwrap().skipped_files.push(SkippedFile {
                    path: file.path.display().to_string(),
                    reason: format!("无法打开: {error}"),
                });
                return;
            }
        };

        let mut reader = LineSplitter::new(
            BufReader::new(file_handle),
            DEFAULT_BUFFER_SIZE,
            DEFAULT_MAX_LINE_BYTES,
        );

        let mut before: VecDeque<String> = VecDeque::new();
        let mut line_number: usize = 0;
        let mut pending_afters: VecDeque<(usize, usize)> = VecDeque::new();

        loop {
            if self.cancel.load(Ordering::SeqCst) {
                return;
            }

            let raw = match reader.next_line() {
                Ok(Some(line)) => line,
                Ok(None) => break,
                Err(error) => {
                    self.progress.lock().unwrap().skipped_files.push(SkippedFile {
                        path: file.path.display().to_string(),
                        reason: format!("格式问题: {error}"),
                    });
                    break;
                }
            };
            line_number += 1;

            {
                let mut progress = self.progress.lock().unwrap();
                progress.scanned_bytes += (raw.len() + 1) as u64;

                let mut i = 0;
                while i < pending_afters.len() {
                    let (hit_index, remaining) = pending_afters[i];
                    if remaining > 0 {
                        progress.hits[hit_index].after.push(raw.clone());
                        pending_afters[i] = (hit_index, remaining - 1);
                        i += 1;
                    } else {
                        pending_afters.remove(i);
                    }
                }
            }

            if self.matcher.is_match(&raw) {
                let parsed = parse_line(&raw);
                let mut progress = self.progress.lock().unwrap();
                progress.total_matches += 1;
                let before_lines: Vec<String> = before.iter().cloned().collect();
                if progress.hits.len() < self.config.max_display_hits {
                    progress.hits.push(SearchHit {
                        line_number,
                        file_path: Some(file.path.display().to_string()),
                        raw_line: raw.clone(),
                        timestamp: parsed.timestamp,
                        app: parsed.app,
                        level: parsed.level,
                        before: before_lines,
                        after: Vec::new(),
                    });
                    let hit_index = progress.hits.len() - 1;
                    if self.config.context_lines > 0 {
                        pending_afters.push_back((hit_index, self.config.context_lines));
                    }
                } else {
                    progress.truncated = true;
                }
            }

            if self.config.context_lines > 0 {
                if before.len() == self.config.context_lines {
                    before.pop_front();
                }
                before.push_back(raw);
            }
        }
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p log-core search_engine`
Expected: 3 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add streaming search engine"
```

---

## Task 5: 工作区服务（TDD）

校验目录、发现文件、维护工作区摘要与过期清理。

**Files:**
- Create: `crates/log-core/src/workspace/mod.rs`
- Create: `crates/log-core/src/workspace/workspace_service.rs`
- Modify: `crates/log-core/src/lib.rs`（启用 `pub mod workspace;`）

**Interfaces:**
- Produces:
  - `struct Workspace { id: String, dir: PathBuf, files: Vec<LogFile>, total_bytes: u64, created_at: u64 }`（`Serialize` camelCase）
  - `enum WorkspaceError { DirectoryNotFound(PathBuf), NotADirectory(PathBuf), Io(std::io::Error) }`（用 `thiserror` 派生 `Display`/`Error`）
  - `WorkspaceRegistry::new() -> Self`
  - `WorkspaceRegistry::create(&self, dir: PathBuf) -> Result<Workspace, WorkspaceError>`
  - `WorkspaceRegistry::get(&self, id: &str) -> Option<Workspace>`
  - `WorkspaceRegistry::remove_expired(&self, ttl_secs: u64)`

- [ ] **Step 1: 写失败测试**

```rust
#[cfg(test)]
mod tests {
    use std::fs;
    use super::WorkspaceRegistry;

    #[test]
    fn creates_workspace_with_summary() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("log_analystic_ws_{stamp}"));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.log"), "aaaa\nbbbb\n").unwrap();

        let registry = WorkspaceRegistry::new();
        let workspace = registry.create(dir.clone()).unwrap();

        assert!(workspace.id.starts_with("ws-"));
        assert_eq!(workspace.files.len(), 1);
        assert_eq!(workspace.total_bytes, 10);
        assert_eq!(registry.get(&workspace.id).unwrap().dir, dir);
    }

    #[test]
    fn rejects_missing_directory() {
        let registry = WorkspaceRegistry::new();
        let result = registry.create(std::path::PathBuf::from("Z:/does/not/exist"));
        assert!(matches!(result, Err(super::WorkspaceError::DirectoryNotFound(_))));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p log-core workspace`
Expected: 编译失败。

- [ ] **Step 3: 实现 `workspace_service.rs`**

```rust
//! 工作区管理：校验目录、发现文件、维护摘要与过期清理。

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::streaming::file_discovery::{discover_log_files, LogFile};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub dir: PathBuf,
    pub files: Vec<LogFile>,
    pub total_bytes: u64,
    pub created_at: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum WorkspaceError {
    #[error("目录不存在: {0}")]
    DirectoryNotFound(PathBuf),
    #[error("路径不是目录: {0}")]
    NotADirectory(PathBuf),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub struct WorkspaceRegistry {
    inner: Arc<Mutex<HashMap<String, Workspace>>>,
    next_id: AtomicU64,
}

impl WorkspaceRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(1),
        }
    }

    pub fn create(&self, dir: PathBuf) -> Result<Workspace, WorkspaceError> {
        if !dir.exists() {
            return Err(WorkspaceError::DirectoryNotFound(dir));
        }
        if !dir.is_dir() {
            return Err(WorkspaceError::NotADirectory(dir));
        }
        let files = discover_log_files(&dir)?;
        let total_bytes = files.iter().map(|file| file.size).sum();
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or_default();
        let id = format!("ws-{}", self.next_id.fetch_add(1, Ordering::SeqCst));
        let workspace = Workspace {
            id: id.clone(),
            dir,
            files,
            total_bytes,
            created_at,
        };
        self.inner.lock().unwrap().insert(id, workspace.clone());
        Ok(workspace)
    }

    pub fn get(&self, id: &str) -> Option<Workspace> {
        self.inner.lock().unwrap().get(id).cloned()
    }

    pub fn remove_expired(&self, ttl_secs: u64) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or_default();
        self.inner
            .lock()
            .unwrap()
            .retain(|_, workspace| now.saturating_sub(workspace.created_at) < ttl_secs);
    }
}
```

`workspace/mod.rs`：

```rust
pub mod workspace_service;
```

`lib.rs` 取消注释 `pub mod workspace;`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p log-core workspace`
Expected: 2 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add workspace service"
```

---

## Task 6: Web API 与 axum 服务（健康、工作区、搜索）

创建 `log-web` 二进制，暴露健康、工作区、搜索端点，搜索任务在 `spawn_blocking` 中运行并支持进度轮询与取消。

**Files:**
- Create: `crates/log-web/Cargo.toml`
- Create: `crates/log-web/src/main.rs`
- Create: `crates/log-web/src/app_state.rs`
- Create: `crates/log-web/src/error.rs`
- Create: `crates/log-web/src/dto.rs`
- Create: `crates/log-web/src/routes/mod.rs`
- Create: `crates/log-web/src/routes/health.rs`
- Create: `crates/log-web/src/routes/workspaces.rs`
- Create: `crates/log-web/src/routes/searches.rs`
- Modify: 根 `Cargo.toml`（若 Task 1 已注释 `crates/log-web`，现在启用）

**Interfaces:**
- Consumes: `log_core::streaming::search_engine::{SearchEngine, SearchConfig, SearchMode, SearchProgress}`、`log_core::workspace::workspace_service::{WorkspaceRegistry, Workspace, WorkspaceError}`
- Produces: HTTP 端点（见 Global Constraints 的 API 表）与 `ApiError` 类型。

- [ ] **Step 1: 写 `Cargo.toml`**

```toml
[package]
name = "log-web"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "log-web"
path = "src/main.rs"

[dependencies]
log_core = { path = "../log-core" }
axum = "0.7"
tokio = { version = "1", features = ["full"] }
tower-http = { version = "0.5", features = ["cors"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: 写 `error.rs`**

```rust
//! 统一 API 错误与结构化错误 DTO。

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use log_core::workspace::workspace_service::WorkspaceError;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorDto {
    pub code: String,
    pub message: String,
}

pub struct ApiError {
    pub status: StatusCode,
    pub code: String,
    pub message: String,
}

impl ApiError {
    pub fn invalid_input(message: String) -> Self {
        Self { status: StatusCode::BAD_REQUEST, code: "invalid_input".into(), message }
    }
    pub fn not_found(message: String) -> Self {
        Self { status: StatusCode::NOT_FOUND, code: "not_found".into(), message }
    }
    pub fn internal(message: String) -> Self {
        Self { status: StatusCode::INTERNAL_SERVER_ERROR, code: "internal".into(), message }
    }
}

impl From<WorkspaceError> for ApiError {
    fn from(error: WorkspaceError) -> Self {
        match error {
            WorkspaceError::DirectoryNotFound(_) => ApiError::invalid_input(error.to_string()),
            WorkspaceError::NotADirectory(_) => ApiError::invalid_input(error.to_string()),
            WorkspaceError::Io(_) => ApiError::invalid_input(error.to_string()),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(ErrorDto { code: self.code, message: self.message })).into_response()
    }
}
```

- [ ] **Step 3: 写 `app_state.rs` 与 `dto.rs`**

`app_state.rs`：

```rust
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use log_core::streaming::search_engine::SearchEngine;
use log_core::workspace::workspace_service::WorkspaceRegistry;

pub struct AppState {
    pub workspaces: WorkspaceRegistry,
    pub searches: Mutex<HashMap<String, Arc<SearchEngine>>>,
    search_counter: AtomicU64,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            workspaces: WorkspaceRegistry::new(),
            searches: Mutex::new(HashMap::new()),
            search_counter: AtomicU64::new(1),
        }
    }

    pub fn new_search_id(&self) -> String {
        format!("search-{}", self.search_counter.fetch_add(1, Ordering::SeqCst))
    }
}
```

`dto.rs`：

```rust
use log_core::streaming::search_engine::{SearchMode, SearchProgress};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceRequest {
    pub dir: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSearchRequest {
    pub workspace_id: String,
    pub query: String,
    pub mode: String,
    pub case_sensitive: bool,
    pub context_lines: usize,
}

impl CreateSearchRequest {
    pub fn to_config(&self) -> SearchConfig {
        SearchConfig {
            query: self.query.clone(),
            mode: if self.mode == "regex" { SearchMode::Regex } else { SearchMode::Keyword },
            case_sensitive: self.case_sensitive,
            context_lines: self.context_lines,
            max_display_hits: 1000,
        }
    }
}

use log_core::streaming::search_engine::SearchConfig;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceResponse {
    pub id: String,
    pub dir: String,
    pub files: usize,
    pub total_bytes: u64,
}

impl From<log_core::workspace::workspace_service::Workspace> for WorkspaceResponse {
    fn from(workspace: log_core::workspace::workspace_service::Workspace) -> Self {
        Self {
            id: workspace.id,
            dir: workspace.dir.display().to_string(),
            files: workspace.files.len(),
            total_bytes: workspace.total_bytes,
        }
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub id: String,
    pub progress: SearchProgress,
}
```

- [ ] **Step 4: 写路由处理器**

`routes/health.rs`：

```rust
use axum::Json;
use serde::Serialize;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
}

pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok".into() })
}
```

`routes/workspaces.rs`：

```rust
use std::path::PathBuf;

use axum::extract::{Path, State};
use axum::Json;

use crate::app_state::AppState;
use crate::dto::{CreateWorkspaceRequest, WorkspaceResponse};
use crate::error::ApiError;

pub async fn create_workspace(
    State(state): State<AppState>,
    Json(request): Json<CreateWorkspaceRequest>,
) -> Result<Json<WorkspaceResponse>, ApiError> {
    let workspace = state.workspaces.create(PathBuf::from(request.dir))?;
    Ok(Json(WorkspaceResponse::from(workspace)))
}

pub async fn get_workspace(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<WorkspaceResponse>, ApiError> {
    let workspace = state.workspaces.get(&id).ok_or_else(|| ApiError::not_found("工作区不存在".into()))?;
    Ok(Json(WorkspaceResponse::from(workspace)))
}
```

`routes/searches.rs`：

```rust
use std::sync::Arc;

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;

use log_core::streaming::search_engine::SearchEngine;

use crate::app_state::AppState;
use crate::dto::{CreateSearchRequest, SearchResponse};
use crate::error::ApiError;

pub async fn create_search(
    State(state): State<AppState>,
    Json(request): Json<CreateSearchRequest>,
) -> Result<Json<SearchResponse>, ApiError> {
    let workspace = state
        .workspaces
        .get(&request.workspace_id)
        .ok_or_else(|| ApiError::not_found("工作区不存在".into()))?;

    let engine = Arc::new(
        SearchEngine::new(workspace.files, request.to_config())
            .map_err(ApiError::invalid_input)?,
    );
    let id = state.new_search_id();
    state.searches.lock().unwrap().insert(id.clone(), engine.clone());

    let engine_for_task = engine.clone();
    tokio::task::spawn_blocking(move || engine_for_task.run());

    Ok(Json(SearchResponse { id, progress: engine.snapshot() }))
}

pub async fn get_search(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<SearchResponse>, ApiError> {
    let engine = state
        .searches
        .lock()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("搜索任务不存在".into()))?;
    Ok(Json(SearchResponse { id, progress: engine.snapshot() }))
}

pub async fn cancel_search(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    let engine = state
        .searches
        .lock()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| ApiError::not_found("搜索任务不存在".into()))?;
    engine.cancel();
    Ok(StatusCode::NO_CONTENT)
}
```

`routes/mod.rs`：

```rust
pub mod health;
pub mod workspaces;
pub mod searches;
```

- [ ] **Step 5: 写 `main.rs` 组装路由**

```rust
use std::net::SocketAddr;
use std::sync::Arc;

use axum::routing::{delete, get, post};
use axum::Router;
use tower_http::cors::{Any, CorsLayer};

use crate::app_state::AppState;

mod app_state;
mod dto;
mod error;
mod routes;

const DEFAULT_PORT: u16 = 8790;

#[tokio::main]
async fn main() {
    let state = AppState::new();

    // 后台定期清理过期工作区（默认 1 小时）
    let cleanup_state = Arc::new(state);
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(300));
        loop {
            interval.tick().await;
            cleanup_state.workspaces.remove_expired(3600);
        }
    });

    let cors = CorsLayer::new()
        .allow_origin(["http://localhost:1420".parse().unwrap()])
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/health", get(routes::health::health))
        .route("/api/workspaces", post(routes::workspaces::create_workspace))
        .route("/api/workspaces/:id", get(routes::workspaces::get_workspace))
        .route("/api/searches", post(routes::searches::create_search))
        .route("/api/searches/:id", get(routes::searches::get_search))
        .route("/api/searches/:id", delete(routes::searches::cancel_search))
        .layer(cors)
        .with_state(state);

    let port = std::env::var("LOG_ANALYSTIC_WEB_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(DEFAULT_PORT);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind 127.0.0.1 failed");
    axum::serve(listener, app).await.expect("web server failed");
}
```

- [ ] **Step 6: 编译并冒烟测试**

Run: `cargo build -p log-web`
Expected: 编译通过。

Run（后台启动）：`cargo run -p log-web`
Expected: 监听 `127.0.0.1:8790`。

用 `curl`（或 PowerShell `Invoke-RestMethod`）验证：

```bash
curl http://127.0.0.1:8790/api/health
```

Expected: `{"status":"ok"}`。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add axum web server with workspace and search endpoints"
```

---

## Task 7: 保存查询与规则包 HTTP 端点

复用现有应用服务，暴露保存查询与规则包端点。

**Files:**
- Create: `crates/log-web/src/routes/saved_queries.rs`
- Create: `crates/log-web/src/routes/rule_packages.rs`
- Modify: `crates/log-web/src/routes/mod.rs`
- Modify: `crates/log-web/src/main.rs`（注册新路由）
- Modify: `crates/log-web/src/dto.rs`（新增规则包导入 DTO）

**Interfaces:**
- Consumes:
  - `log_core::application::saved_query_service::{list_saved_queries, upsert_saved_query, delete_saved_query}`
  - `log_core::application::rule_package_service::{import_rule_package, list_rule_package_tree, update_rule_package_node, RulePackageVersionTree, RulePackageLayerTree, RulePackageNode}`
  - `log_core::infrastructure::file_storage::saved_query_store::SavedQueryRecord`
- Produces: HTTP 端点 `/api/saved-queries`（GET/POST/PUT/DELETE）与 `/api/rule-packages`（GET/POST）及节点更新。

- [ ] **Step 1: 写 `saved_queries.rs`**

```rust
use axum::extract::{Path, State};
use axum::Json;

use log_core::application::saved_query_service::{
    delete_saved_query, list_saved_queries, upsert_saved_query,
};
use log_core::infrastructure::file_storage::saved_query_store::SavedQueryRecord;

use crate::app_state::AppState;
use crate::error::ApiError;

pub async fn list(State(_state): State<AppState>) -> Result<Json<Vec<SavedQueryRecord>>, ApiError> {
    Ok(Json(list_saved_queries().map_err(|error| ApiError::internal(error.to_string()))?))
}

pub async fn create(
    State(_state): State<AppState>,
    Json(record): Json<SavedQueryRecord>,
) -> Result<Json<Vec<SavedQueryRecord>>, ApiError> {
    Ok(Json(upsert_saved_query(record).map_err(|error| ApiError::internal(error.to_string()))?))
}

pub async fn update(
    State(_state): State<AppState>,
    Json(record): Json<SavedQueryRecord>,
) -> Result<Json<Vec<SavedQueryRecord>>, ApiError> {
    Ok(Json(upsert_saved_query(record).map_err(|error| ApiError::internal(error.to_string()))?))
}

pub async fn remove(
    State(_state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<SavedQueryRecord>>, ApiError> {
    Ok(Json(delete_saved_query(&id).map_err(|error| ApiError::internal(error.to_string()))?))
}
```

- [ ] **Step 2: 写 `rule_packages.rs`**

```rust
use std::collections::BTreeMap;

use axum::extract::{Path, State};
use axum::Json;
use serde::Deserialize;

use log_core::application::rule_package_service::{
    import_rule_package, list_rule_package_tree, update_rule_package_node, RulePackageLayerTree,
    RulePackageNode, RulePackageVersionTree,
};

use crate::app_state::AppState;
use crate::error::ApiError;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePackageImportRequest {
    pub source_name: String,
    pub bytes: Vec<u8>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePackageImportResponse {
    pub operation: String,
    pub rule_set_id: String,
    pub version: String,
    pub versions: Vec<RulePackageVersionResponse>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePackageVersionResponse {
    pub rule_set_id: String,
    pub version: String,
    pub layers: Vec<RulePackageLayerResponse>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePackageLayerResponse {
    pub id: String,
    pub label: String,
    pub file_name: String,
    pub nodes: Vec<RulePackageNodeResponse>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePackageNodeResponse {
    pub id: String,
    pub name: String,
    pub node_type: String,
    pub table_path: String,
    pub fields: BTreeMap<String, serde_json::Value>,
}

fn to_version_response(version: RulePackageVersionTree) -> RulePackageVersionResponse {
    RulePackageVersionResponse {
        rule_set_id: version.rule_set_id,
        version: version.version,
        layers: version.layers.into_iter().map(to_layer_response).collect(),
    }
}

fn to_layer_response(layer: RulePackageLayerTree) -> RulePackageLayerResponse {
    RulePackageLayerResponse {
        id: layer.id,
        label: layer.label,
        file_name: layer.file_name,
        nodes: layer.nodes.into_iter().map(to_node_response).collect(),
    }
}

fn to_node_response(node: RulePackageNode) -> RulePackageNodeResponse {
    RulePackageNodeResponse {
        id: node.id,
        name: node.name,
        node_type: node.node_type,
        table_path: node.table_path,
        fields: node.fields,
    }
}

pub async fn list(State(_state): State<AppState>) -> Result<Json<Vec<RulePackageVersionResponse>>, ApiError> {
    let versions = list_rule_package_tree().map_err(|error| ApiError::internal(error.to_string()))?;
    Ok(Json(versions.into_iter().map(to_version_response).collect()))
}

pub async fn import_package(
    State(_state): State<AppState>,
    Json(request): Json<RulePackageImportRequest>,
) -> Result<Json<RulePackageImportResponse>, ApiError> {
    let _ = request.source_name;
    let result = import_rule_package(&request.bytes)
        .map_err(|error| ApiError::invalid_input(error.to_string()))?;
    let versions = list_rule_package_tree().map_err(|error| ApiError::internal(error.to_string()))?;
    Ok(Json(RulePackageImportResponse {
        operation: result.operation,
        rule_set_id: result.rule_set_id,
        version: result.version,
        versions: versions.into_iter().map(to_version_response).collect(),
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePackageNodeUpdateRequest {
    pub rule_set_id: String,
    pub version: String,
    pub layer_id: String,
    pub table_path: String,
    pub node_id: String,
    pub fields: BTreeMap<String, serde_json::Value>,
}

pub async fn update_node(
    State(_state): State<AppState>,
    Json(request): Json<RulePackageNodeUpdateRequest>,
) -> Result<Json<Vec<RulePackageVersionResponse>>, ApiError> {
    let versions = update_rule_package_node(
        &request.rule_set_id,
        &request.version,
        &request.layer_id,
        &request.table_path,
        &request.node_id,
        &request.fields,
    )
    .map_err(|error| ApiError::invalid_input(error.to_string()))?;
    Ok(Json(versions.into_iter().map(to_version_response).collect()))
}
```

- [ ] **Step 3: 注册路由**

`routes/mod.rs` 加 `pub mod saved_queries; pub mod rule_packages;`。`main.rs` 的 `Router` 追加：

```rust
.route("/api/saved-queries", get(routes::saved_queries::list).post(routes::saved_queries::create))
.route("/api/saved-queries/:id", axum::routing::put(routes::saved_queries::update).delete(routes::saved_queries::remove))
.route("/api/rule-packages", get(routes::rule_packages::list).post(routes::rule_packages::import_package))
.route(
    "/api/rule-packages/:rule_set_id/versions/:version/nodes/:node_id",
    axum::routing::put(routes::rule_packages::update_node),
)
```

（`main.rs` 需补充 `use axum::routing::put;`。）

- [ ] **Step 4: 编译**

Run: `cargo build -p log-web`
Expected: 编译通过（`SavedQueryRecord` 需要 `Serialize`/`Deserialize`；若现有 `saved_query_store.rs` 未派生 `Deserialize`，为该结构体补 `#[derive(serde::Serialize, serde::Deserialize)]` 与 `#[serde(rename_all = "camelCase")]`）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add saved query and rule package HTTP endpoints"
```

---

## Task 8: React 前端 fetch 迁移（搜索流程）

用 `fetch` 客户端替换 Tauri 调用，搜索改为「创建工作区 → 创建搜索任务 → 轮询进度」，接入目录输入与取消。

**Files:**
- Create: `src/api/http-client.ts`
- Modify: `src/api/dto.ts`（新增工作区/搜索任务 DTO）
- Modify: `src/app/App.tsx`（`runSearch` 与 `pickLogFolder` 改走 HTTP）
- Modify: `src/app/app-actions.ts`（如需要，暴露目录校验 helper）

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/...`（Task 6/7 定义）。
- Produces: `src/api/http-client.ts` 导出的 `createWorkspace`、`createSearch`、`getSearch`、`cancelSearch`、`listSavedQueries`、`upsertSavedQuery`、`deleteSavedQuery`、`listRulePackages`、`importRulePackage`、`updateRulePackageNode`。

- [ ] **Step 1: 扩展 `dto.ts`**

在 `src/api/dto.ts` 末尾追加：

```ts
export interface WorkspaceResponse {
  id: string
  dir: string
  files: number
  totalBytes: number
}

export type TaskStatus = 'running' | 'completed' | 'cancelled'

export interface SkippedFileDto {
  path: string
  reason: string
}

export interface SearchProgressDto {
  status: TaskStatus
  totalBytes: number
  scannedBytes: number
  filesTotal: number
  filesScanned: number
  totalMatches: number
  hits: LogSearchHitDto[]
  skippedFiles: SkippedFileDto[]
  truncated: boolean
}

export interface SearchResponse {
  id: string
  progress: SearchProgressDto
}
```

- [ ] **Step 2: 写 `src/api/http-client.ts`**

```ts
import type {
  LogSearchResponseDto,
  RulePackageImportDto,
  RulePackageImportResultDto,
  RulePackageNodeUpdateDto,
  RulePackageVersionDto,
  SavedQueryDto,
  SearchResponse,
  WorkspaceResponse,
} from './dto'

const BASE_URL = 'http://127.0.0.1:8790'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as { message?: string }
      if (body.message) message = body.message
    } catch {
      // 忽略非 JSON 错误体
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function createWorkspace(dir: string): Promise<WorkspaceResponse> {
  return request<WorkspaceResponse>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify({ dir }),
  })
}

export function createSearch(requestBody: {
  workspaceId: string
  query: string
  mode: string
  caseSensitive: boolean
  contextLines: number
}): Promise<SearchResponse> {
  return request<SearchResponse>('/api/searches', {
    method: 'POST',
    body: JSON.stringify(requestBody),
  })
}

export function getSearch(searchId: string): Promise<SearchResponse> {
  return request<SearchResponse>(`/api/searches/${searchId}`)
}

export function cancelSearch(searchId: string): Promise<void> {
  return request<void>(`/api/searches/${searchId}`, { method: 'DELETE' })
}

export function listSavedQueries(): Promise<SavedQueryDto[]> {
  return request<SavedQueryDto[]>('/api/saved-queries')
}

export function upsertSavedQuery(query: SavedQueryDto): Promise<SavedQueryDto[]> {
  return request<SavedQueryDto[]>('/api/saved-queries', {
    method: 'POST',
    body: JSON.stringify(query),
  })
}

export function deleteSavedQuery(queryId: string): Promise<SavedQueryDto[]> {
  return request<SavedQueryDto[]>(`/api/saved-queries/${queryId}`, { method: 'DELETE' })
}

export function listRulePackages(): Promise<RulePackageVersionDto[]> {
  return request<RulePackageVersionDto[]>('/api/rule-packages')
}

export function importRulePackage(payload: RulePackageImportDto): Promise<RulePackageImportResultDto> {
  return request<RulePackageImportResultDto>('/api/rule-packages', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateRulePackageNode(payload: RulePackageNodeUpdateDto): Promise<RulePackageVersionDto[]> {
  return request<RulePackageVersionDto[]>(
    `/api/rule-packages/${payload.ruleSetId}/versions/${payload.version}/nodes/${payload.nodeId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  )
}

// 由旧 LogSearchResponseDto 形状适配：供兼容期保留
export function toLogSearchResponse(progress: SearchResponse['progress']): LogSearchResponseDto {
  return { totalMatches: progress.totalMatches, hits: progress.hits }
}
```

- [ ] **Step 3: 修改 `App.tsx` 的搜索流程**

将 `App.tsx` 顶部 import 从 `../api/tauri-client` 改为 `../api/http-client`，并新增工作区/搜索状态：

```ts
import {
  cancelSearch,
  createSearch,
  createWorkspace,
  deleteSavedQuery,
  getSearch,
  importRulePackage,
  listRulePackages,
  listSavedQueries,
  updateRulePackageNode,
  upsertSavedQuery,
} from '../api/http-client'
```

新增状态与取消引用：

```ts
const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null)
const [searchProgress, setSearchProgress] = useState<SearchProgressDto | null>(null)
const activeSearchIdRef = useRef<string | null>(null)
```

重写 `runSearch`（先确保工作区，再创建任务并轮询）：

```ts
const runSearch = async (record?: SavedQueryDto) => {
  const source = record ?? queryDraft
  const trimmedDir = logFolderPath.trim()
  if (!trimmedDir) {
    setErrorMessage('请先选择或输入日志文件夹路径')
    return
  }

  setIsSearching(true)
  setErrorMessage(null)
  setResult(null)

  try {
    let activeWorkspace = workspace
    if (!activeWorkspace || activeWorkspace.dir !== trimmedDir) {
      activeWorkspace = await createWorkspace(trimmedDir)
      setWorkspace(activeWorkspace)
    }

    const created = await createSearch({
      workspaceId: activeWorkspace.id,
      query: source.query,
      mode: source.mode,
      caseSensitive: source.caseSensitive,
      contextLines: 1,
    })
    activeSearchIdRef.current = created.id

    let current = created
    while (current.progress.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 300))
      current = await getSearch(created.id)
      if (activeSearchIdRef.current !== created.id) {
        return // 已被新搜索取代
      }
      setSearchProgress(current.progress)
    }

    setSearchProgress(current.progress)
    setResult(mapLogSearchToViewModel({ totalMatches: current.progress.totalMatches, hits: current.progress.hits }))
  } catch (error) {
    setErrorMessage(error instanceof Error ? error.message : '搜索失败')
  } finally {
    setIsSearching(false)
  }
}
```

新增取消函数：

```ts
const cancelCurrentSearch = async () => {
  if (activeSearchIdRef.current) {
    await cancelSearch(activeSearchIdRef.current)
    activeSearchIdRef.current = null
    setIsSearching(false)
  }
}
```

将「搜索」按钮区新增「取消」按钮（`LogSearchPanel` 需新增 `onCancelSearch` prop，并在 `isSearching` 时显示）。同时把进度信息（`searchProgress.scannedBytes` / `totalBytes`、`filesScanned` / `filesTotal`、`totalMatches`）传给 `LogSearchPanel` 展示，并显示 `truncated` 提示与 `skippedFiles` 列表。

`pickLogFolder` 里删除 Tauri dialog 分支，统一用 `loadFolderPathFromBrowser`（`window.prompt`），或保留 Tauri dialog 作为可选增强（`__TAURI__` 存在时用目录选择，否则回退 prompt）。

- [ ] **Step 4: 类型检查与构建**

Run: `npx tsc --noEmit`
Expected: 无类型错误。

Run: `npm run build`
Expected: 构建通过。

- [ ] **Step 5: 手动验证**

1. 启动后端：`cargo run -p log-web`。
2. 启动前端：`npm run dev`（端口 1420）。
3. 浏览器打开 `http://localhost:1420`，在「日志文件夹」输入一个含 `.log` 文件的目录，执行搜索。
4. 验证：出现进度、结果分页、可取消、无 Tauri 环境也能完成搜索。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: migrate frontend search to fetch with workspace and progress polling"
```

---

## 里程碑 2（后续单独计划，不在本计划内）

- **时延分析**（`POST/GET/DELETE /api/analyses/latency`）：当前 Rust 侧无任何时延分析实现，需先依据 `docs/project/responsibilities/04-latency-analysis-pipeline-design.md` 与 `07-latency-export-requirements.md` 建设请求识别、阶段时延计算与聚合，再暴露 HTTP。属独立子系统，单独开 spec → plan 流程。
- **CSV 导出**（`POST /api/exports`）：基于流式搜索/时延结果用 `csv` crate 迭代器逐行写临时文件并返回下载。

---

## 自检记录

- **Spec 覆盖**：设计文档中「读取策略 / 搜索策略 / 工作区与 API（workspaces、searches、saved-queries、rule-packages）/ 错误处理 / 前端行为（fetch、目录输入、轮询、取消、分页）」均由 Task 2–8 覆盖。时延分析与 CSV 导出明确记为里程碑 2。
- **占位符扫描**：无 TBD/TODO。
- **类型一致性**：`SearchConfig` / `SearchProgress` / `SearchHit` / `TaskStatus` / `Workspace` / `WorkspaceError` 的字段名与 serde 命名在 Task 4、5、6、8 间一致；`SearchResponse` / `WorkspaceResponse` 在 `dto.rs` 与前端 `dto.ts` 一致。
