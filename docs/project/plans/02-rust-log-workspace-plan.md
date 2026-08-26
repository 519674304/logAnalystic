Document ID: PLAN-RUST-LOG-WORKSPACE
Status: Draft
Approved by:
Approved at:
Depends on: PLAN-SKELETON-CONTRACTS, DOMAIN-MAP, ARCH-TECH-SELECTION
Supersedes:

# Rust 日志工作区计划

> 因「整体载入内存 → 流式读取」「搜索后台任务 → 快速单查询」重构而修订（原版批准于 2026-07-07）。删除「导入批次 + 多文件合并 + 内存索引 + ParsedLogDataset」，改为统一 `LogSource` 端口 + ripgrep 流式。

## PLAN-LOG-001 LogSource 端口与目录工作区

- 需求：REQ-INGEST、REQ-SCOPE。
- 职责：RESP-LOG-OPEN。
- ADR：ADR-004、ADR-010。
- 目标：定义 `LogSource` trait（open/scan/search/read_context/entries），实现 `open(dir)` 扫描候选 `.log`/`.txt` 文件生成 `Workspace { file_list, summary }`。
- 依赖：PLAN-SKELETON-001。
- 文件/模块：`crates/log-core/src/domain/log_workspace/port.rs`、`workspace.rs`。
- 步骤：
  1. 定义 `LogSource` trait 五操作。
  2. 定义 `Workspace`、`FileRef`、`WorkspaceSummary` 类型。
  3. 实现目录扫描：发现 `.log`/`.txt`，统计文件数与总大小。
  4. 目录不存在或空返回结构化 Issue。
- 测试：空目录、含文件目录、非法目录、文件清单与摘要正确。
- 完成证据：`open(dir)` 不读取日志正文，只返回清单与摘要。

## PLAN-LOG-002 ripgrep 流式读取

- 需求：REQ-INGEST、REQ-SCOPE、REQ-WEB。
- 职责：RESP-LOG-STREAM。
- ADR：ADR-004、ADR-010。
- 目标：用 ripgrep 引擎库（grep/grep-regex + regex + memchr）实现 `scan(range)` 和 `entries(range)` 流式读取：固定缓冲区、跨块残行拼接、长行上限。
- 依赖：PLAN-LOG-001。
- 文件/模块：`crates/log-core/src/infrastructure/ripgrep_log_source.rs`。
- 步骤：
  1. 逐文件分块读取，固定大小缓冲区。
  2. 跨块残行拼接（块边界在行中间时保留残行接下一块）。
  3. 长行超上限时截断或记录，不 OOM。
  4. 按时间范围过滤。
- 测试：跨块边界行、超长行、多文件顺序、时间范围过滤。
- 性能测试：内存不随文件总大小线性增长；五档规模烟测（50KB/5MB/30MB/500MB/2GB）。
- 完成证据：2GB 日志按范围流式读取，峰值内存 < 2GB。

## PLAN-LOG-003 固定格式解析

- 需求：REQ-INGEST。
- 职责：RESP-LOG-PARSE、RESP-LOG-QUALITY。
- ADR：ADR-002、ADR-004。
- 目标：把固定格式单行日志解析为 `LogEntry`，失败行进入数据质量列表。
- 依赖：PLAN-LOG-002。
- 文件/模块：`crates/log-core/src/domain/log_workspace/log_parser.rs`、`data_quality.rs`。
- 步骤：
  1. 定义 `LogEntry`（时间戳、应用、级别、正文、原始行引用）。
  2. 解析时间戳、应用、级别、正文和原始行号。
  3. 解析失败行生成质量记录。
  4. 保留原始时间戳文本和可比较时间。
- 测试：合法行、解析失败行、时间顺序、质量汇总。
- 完成证据：解析失败不阻断流式读取。

## PLAN-LOG-004 快速单查询与上下文

- 需求：REQ-SEARCH、REQ-WEB。
- 职责：RESP-LOG-SEARCH。
- ADR：ADR-004、ADR-005、ADR-010。
- 目标：实现 `search(cond, range)` 快速单查询，返回 `{ hits≤1000, context, total_matches, truncated }`；`read_context(ref, n)` 读前后 n 行。
- 依赖：PLAN-LOG-003。
- 文件/模块：`crates/log-core/src/infrastructure/ripgrep_log_source.rs`、`application/log_workspace_service.rs`、`crates/server/src/http/handlers/log_handlers.rs`。
- 步骤：
  1. 定义搜索条件 DTO（关键字/正则/匹配模式/大小写）。
  2. 关键字和短语在范围内扫描。
  3. 正则编译失败返回 Issue；执行超时或超限中止。
  4. 命中最多 1000 条 + total_matches + truncated。
  5. 上下文经行引用读前后 n 行。
  6. server 暴露搜索与上下文 HTTP 端点。
- 测试：关键字、短语、正则、超时、截断、上下文边界。
- 性能测试：常用搜索 P90 <= 1s。
- 完成证据：正则超时不展示不完整结果，查询条件保留；命中超 1000 返回 truncated + total_matches。
