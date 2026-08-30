use std::collections::VecDeque;
use std::fs::File;
use std::io::Read;
use std::path::Path;

use crate::domain::log_workspace::log_entry::LogEntry;
use crate::domain::log_workspace::log_parser::{LogParser, LogcatParser};
use crate::domain::log_workspace::port::{
    LogContextData, LogSource, SearchCondition, SearchHit, SearchMode, SearchResult, TimeRange,
};
use crate::domain::log_workspace::workspace::{FileRef, Workspace, WorkspaceSummary};

const BUFFER_SIZE: usize = 64 * 1024;
const MAX_LINE_LEN: usize = 4 * 1024 * 1024; // 4MB 长行上限，避免无界内存
const MAX_HITS: usize = 1000;

pub struct RipgrepLogSource;

/// 流式行读取器：固定缓冲区 + 跨块残行拼接 + 长行上限。
struct LineReader {
    file: File,
    carry: Vec<u8>,
    pending: VecDeque<String>,
    eof: bool,
}

impl LineReader {
    fn new(path: &Path) -> Result<Self, String> {
        let file = File::open(path).map_err(|e| format!("无法读取文件 {}: {e}", path.display()))?;
        Ok(Self {
            file,
            carry: Vec::new(),
            pending: VecDeque::new(),
            eof: false,
        })
    }

    fn fill(&mut self) -> Result<(), String> {
        let mut buf = vec![0u8; BUFFER_SIZE];
        let n = self.file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            self.eof = true;
            if !self.carry.is_empty() {
                self.pending
                    .push_back(String::from_utf8_lossy(&self.carry).into_owned());
                self.carry.clear();
            }
            return Ok(());
        }
        self.carry.extend_from_slice(&buf[..n]);

        // 长行上限：尚未遇到换行且超出上限，截断丢弃超限部分
        if self.carry.len() > MAX_LINE_LEN && !self.carry.contains(&b'\n') {
            self.carry.truncate(MAX_LINE_LEN);
        }

        // 切分完整行；块边界处的残行保留到 carry，下一块继续拼接
        let mut start = 0;
        for (i, &b) in self.carry.iter().enumerate() {
            if b == b'\n' {
                self.pending
                    .push_back(String::from_utf8_lossy(&self.carry[start..i]).into_owned());
                start = i + 1;
            }
        }
        if start < self.carry.len() {
            self.carry = self.carry[start..].to_vec();
        } else {
            self.carry.clear();
        }
        Ok(())
    }

    fn next_line(&mut self) -> Result<Option<String>, String> {
        loop {
            if let Some(line) = self.pending.pop_front() {
                return Ok(Some(line));
            }
            if self.eof {
                return Ok(None);
            }
            self.fill()?;
        }
    }
}

enum Matcher {
    Keyword {
        needle: String,
        needle_lower: String,
        case_sensitive: bool,
    },
    Regex(regex::Regex),
}

impl Matcher {
    fn build(cond: &SearchCondition) -> Result<Self, String> {
        match cond.mode {
            SearchMode::Keyword => Ok(Matcher::Keyword {
                needle: cond.query.clone(),
                needle_lower: cond.query.to_lowercase(),
                case_sensitive: cond.case_sensitive,
            }),
            SearchMode::Regex => {
                let re = regex::RegexBuilder::new(&cond.query)
                    .case_insensitive(!cond.case_sensitive)
                    .build()
                    .map_err(|e| format!("正则表达式无效: {e}"))?;
                Ok(Matcher::Regex(re))
            }
        }
    }

    fn matches(&self, line: &str) -> bool {
        match self {
            Matcher::Keyword {
                needle,
                needle_lower,
                case_sensitive,
            } => {
                if needle.is_empty() {
                    return true;
                }
                if *case_sensitive {
                    line.contains(needle.as_str())
                } else {
                    line.to_lowercase().contains(needle_lower.as_str())
                }
            }
            Matcher::Regex(re) => re.is_match(line),
        }
    }
}

struct PendingHit {
    hit: SearchHit,
    after_needed: usize,
}

fn normalize_start(s: &str) -> String {
    let t = s.trim();
    if t.len() == 19 {
        format!("{t}.000")
    } else {
        t.to_string()
    }
}

fn normalize_end(s: &str) -> String {
    let t = s.trim();
    if t.len() == 19 {
        format!("{t}.999")
    } else {
        t.to_string()
    }
}

fn in_range(ts: &str, range: &TimeRange) -> bool {
    if let Some(s) = &range.start {
        if !s.trim().is_empty() && ts < normalize_start(s).as_str() {
            return false;
        }
    }
    if let Some(e) = &range.end {
        if !e.trim().is_empty() && ts > normalize_end(e).as_str() {
            return false;
        }
    }
    true
}

fn strip_newline(raw: &str) -> String {
    raw.trim_end_matches(|c: char| c == '\n' || c == '\r')
        .to_string()
}

impl LogSource for RipgrepLogSource {
    fn open(&self, dir: &str) -> Result<Workspace, String> {
        let read_dir = std::fs::read_dir(dir).map_err(|e| format!("无法打开目录 {dir}: {e}"))?;
        let mut files = Vec::new();
        for entry in read_dir {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            if !(name.ends_with(".log") || name.ends_with(".txt")) {
                continue;
            }
            let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
            files.push(FileRef {
                name,
                path: path.to_string_lossy().into_owned(),
                size_bytes,
            });
        }
        files.sort_by(|a, b| a.name.cmp(&b.name));
        let file_count = files.len();
        let total_size_bytes = files.iter().map(|f| f.size_bytes).sum();
        Ok(Workspace {
            directory: dir.to_string(),
            files,
            summary: WorkspaceSummary {
                file_count,
                total_size_bytes,
            },
        })
    }

    fn search(
        &self,
        dir: &str,
        cond: &SearchCondition,
        range: &TimeRange,
        context_lines: usize,
    ) -> Result<SearchResult, String> {
        let workspace = self.open(dir)?;
        let matcher = Matcher::build(cond)?;
        let mut total_matches: u64 = 0;
        let mut hits: Vec<SearchHit> = Vec::new();
        let mut truncated = false;

        for file in &workspace.files {
            if truncated {
                break;
            }
            let mut reader = LineReader::new(Path::new(&file.path))?;
            let mut before: VecDeque<String> = VecDeque::with_capacity(context_lines.max(1));
            let mut pending: Vec<PendingHit> = Vec::new();

            while let Some(raw) = reader.next_line()? {
                let line = strip_newline(&raw);

                // A. 用当前行补齐 pending 命中的 after 上下文
                let mut still_pending = Vec::with_capacity(pending.len());
                for mut p in pending {
                    if p.after_needed > 0 {
                        p.hit.after.push(line.clone());
                        p.after_needed -= 1;
                    }
                    if p.after_needed == 0 {
                        hits.push(p.hit);
                    } else {
                        still_pending.push(p);
                    }
                }
                pending = still_pending;

                // B. 判定当前行是否命中（解析失败行不参与搜索）
                let entry = LogcatParser.parse_line(&line);
                let is_match = match &entry {
                    Some(e) => in_range(&e.timestamp, range) && matcher.matches(&line),
                    None => false,
                };

                // C. 命中则创建 pending hit（before 为当前窗口，不含本行）
                if is_match {
                    total_matches += 1;
                    if hits.len() + pending.len() < MAX_HITS {
                        let hit = SearchHit {
                            line_number: entry.as_ref().map(|e| e.line_no).unwrap_or(0),
                            raw_line: line.clone(),
                            file_path: file.path.clone(),
                            timestamp: entry
                                .as_ref()
                                .map(|e| e.timestamp.clone())
                                .unwrap_or_default(),
                            app: entry
                                .as_ref()
                                .and_then(|e| e.app())
                                .map(String::from)
                                .unwrap_or_default(),
                            level: entry.as_ref().map(|e| e.level.clone()).unwrap_or_default(),
                            before: before.iter().cloned().collect(),
                            after: Vec::new(),
                        };
                        pending.push(PendingHit {
                            hit,
                            after_needed: context_lines,
                        });
                    } else {
                        truncated = true;
                    }
                }

                // D. 更新 before 窗口（含本行，供后续命中使用）
                if context_lines > 0 {
                    if before.len() == context_lines {
                        before.pop_front();
                    }
                    before.push_back(line);
                }
            }

            // EOF：flush 尚未补齐 after 的 pending 命中
            for p in pending {
                hits.push(p.hit);
            }
        }

        Ok(SearchResult {
            total_matches,
            hits,
            truncated,
        })
    }

    fn read_context(
        &self,
        file_path: &str,
        line_number: u64,
        context_lines: usize,
    ) -> Result<LogContextData, String> {
        let mut reader = LineReader::new(Path::new(file_path))?;
        let mut before: VecDeque<String> = VecDeque::new();
        let mut after: Vec<String> = Vec::new();
        let mut target_found = false;
        let mut after_remaining = context_lines;

        while let Some(raw) = reader.next_line()? {
            let line = strip_newline(&raw);
            let entry = LogcatParser.parse_line(&line);
            let no = entry.as_ref().map(|e| e.line_no).unwrap_or(0);

            if target_found {
                if after_remaining == 0 {
                    break;
                }
                after.push(line);
                after_remaining -= 1;
                continue;
            }
            if no == line_number {
                target_found = true;
                continue;
            }
            if context_lines > 0 {
                if before.len() == context_lines {
                    before.pop_front();
                }
                before.push_back(line);
            }
        }

        if !target_found {
            return Err(format!("未找到行号 {line_number} 于文件 {file_path}"));
        }

        Ok(LogContextData {
            file_path: file_path.to_string(),
            line_number,
            before: before.into_iter().collect(),
            after,
        })
    }

    fn entries(&self, dir: &str, range: &TimeRange) -> Result<Vec<LogEntry>, String> {
        let workspace = self.open(dir)?;
        let mut entries = Vec::new();
        for file in &workspace.files {
            let mut reader = LineReader::new(Path::new(&file.path))?;
            while let Some(raw) = reader.next_line()? {
                let line = strip_newline(&raw);
                if let Some(entry) = LogcatParser.parse_line(&line) {
                    if in_range(&entry.timestamp, range) {
                        entries.push(entry);
                    }
                }
            }
        }
        Ok(entries)
    }
}
