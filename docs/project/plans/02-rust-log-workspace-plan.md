Document ID: PLAN-RUST-LOG-WORKSPACE
Status: Approved
Approved by: 用户
Approved at: 2026-07-07
Depends on: PLAN-SKELETON-CONTRACTS, RESP-LOG-SEARCH-DESIGN, ARCH-TECHNICAL-ARCHITECTURE
Supersedes:

# Rust 日志工作区计划

## PLAN-LOG-001 文件批次读取

- 需求：REQ-INGEST、REQ-SCOPE。
- 职责：RESP-LOG-LOAD。
- ADR：ADR-002、ADR-003。
- 目标：读取用户选择的 `.log` / `.txt` UTF-8 文件，形成导入批次。
- 依赖：PLAN-SKELETON-001、PLAN-CONTRACT-001。
- 文件/模块：`domain/log_workspace/`、`application/log_workspace_service.rs`、`infrastructure/file_storage/`。
- 步骤：
  1. 校验扩展名。
  2. 校验 UTF-8。
  3. 读取文件元信息和文本。
  4. 任一文件失败时整批失败。
  5. 返回结构化 Issue。
- 测试：合法批次、非法扩展名、UTF-8 失败、读取失败。
- 完成证据：批次读取失败不产生半成品数据集。

## PLAN-LOG-002 固定格式解析

- 需求：REQ-INGEST。
- 职责：RESP-LOG-PARSE、RESP-LOG-QUALITY。
- ADR：ADR-002。
- 目标：把固定格式单行日志解析为 `ParsedLogEntry`，失败行进入数据质量列表。
- 依赖：PLAN-LOG-001。
- 文件/模块：`domain/log_workspace/parser.rs`、`domain/log_workspace/data_quality.rs`。
- 步骤：
  1. 定义 `ParsedLogEntry`。
  2. 解析时间戳、应用、级别、正文和原始行号。
  3. 解析失败行生成质量记录。
  4. 保留原始时间戳文本和可比较时间。
- 测试：合法行、解析失败行、时间顺序、质量汇总。
- 完成证据：解析失败不阻断整批导入。

## PLAN-LOG-003 数据集合并与索引

- 需求：REQ-INGEST、REQ-SEARCH、REQ-REQUEST。
- 职责：RESP-LOG-DATASET、RESP-LOG-SEARCH。
- ADR：ADR-004。
- 目标：多文件日志按时间合并，生成不可变 `ParsedLogDataset` 和 `LogIndex`。
- 依赖：PLAN-LOG-002。
- 文件/模块：`domain/log_workspace/dataset.rs`、`domain/log_workspace/log_index.rs`。
- 步骤：
  1. 合并解析成功行。
  2. 按可比较时间和原始顺序排序。
  3. 建立时间、应用、级别、原始行号索引。
  4. 生成 datasetId 和加载摘要。
- 测试：多文件排序、同时间稳定排序、索引查询、不可变快照。
- 性能测试：按 50KB、5MB、30MB 顺序验证加载到可查询；50KB 用于快速冒烟，5MB/30MB 用于性能门槛。
- 完成证据：30MB 数据集能在目标时间内完成索引构建。

## PLAN-LOG-004 搜索与上下文

- 需求：REQ-SEARCH。
- 职责：RESP-LOG-SEARCH、RESP-LOG-DRILLDOWN。
- ADR：ADR-004。
- 目标：支持关键字、短语、正则、结构化字段过滤和上下文读取。
- 依赖：PLAN-LOG-003。
- 文件/模块：`domain/log_workspace/search.rs`、`application/log_workspace_service.rs`。
- 步骤：
  1. 定义搜索条件 DTO。
  2. 结构化过滤先缩小候选范围。
  3. 关键字和短语在候选范围扫描。
  4. 正则编译失败返回 Issue。
  5. 正则执行超时或超限中止本次查询。
  6. 上下文通过日志引用读取前后行。
- 测试：关键字、短语、正则、字段过滤、超时、上下文边界。
- 性能测试：常用搜索 P90 <= 1s。
- 完成证据：正则超时不展示不完整结果，查询条件保留。
