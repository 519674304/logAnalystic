Document ID: PLAN-APPLICATION-SERVICES-STORAGE
Status: Draft
Approved by:
Approved at:
Depends on: PLAN-RUST-LOG-WORKSPACE, PLAN-RUST-RULE-CONFIGURATION, PLAN-RUST-LATENCY-ANALYSIS, ARCH-LIFECYCLE-STATE, ARCH-TECHNICAL-ARCHITECTURE
Supersedes:

# 应用服务与本地存储计划

## PLAN-APP-001 AppState 与快照替换

- 需求：REQ-SCOPE、REQ-ISSUES。
- 职责：RESP-ANALYSIS-COORDINATE、RESP-ISSUE-HANDLE。
- ADR：ADR-005。
- 目标：实现当前日志数据集、规则集、分析结果和任务状态的受控状态管理。
- 依赖：PLAN-LOG-003、PLAN-RULE-003、PLAN-ANALYSIS-006。
- 文件/模块：`application/app_state.rs`、各 application service。
- 步骤：
  1. 定义 AppState。
  2. 实现日志数据集成功后原子替换。
  3. 实现规则成功激活后原子替换。
  4. 实现分析成功后原子替换。
  5. 规则或日志变化时旧分析结果标记 STALE。
- 测试：成功替换、失败保留、STALE、并发访问。
- 完成证据：任一失败操作不破坏上一份成功状态。

## PLAN-APP-002 Tauri command 边界

- 需求：全部用户主流程。
- 职责：应用服务入口。
- ADR：ADR-001、ADR-002。
- 目标：实现导入日志、搜索、规则、分析、导出等 command，command 只做参数转换和调用。
- 依赖：PLAN-APP-001。
- 文件/模块：`commands/*.rs`、`dto/command_dto.rs`。
- 步骤：
  1. 定义 command DTO。
  2. 实现日志导入和搜索 command。
  3. 实现规则导入、激活、导出 command。
  4. 实现分析执行和结果读取 command。
  5. 实现 CSV 导出 command。
  6. command 不写业务规则。
- 测试：command 参数校验、错误转换、成功 DTO。
- 完成证据：前端能通过统一客户端调用所有主流程 command。

## PLAN-APP-003 异步任务和进度

- 需求：REQ-SCOPE。
- 职责：RESP-LOG-LOAD、RESP-RULE-VALIDATE、RESP-ANALYSIS-COORDINATE、RESP-CSV-WRITE。
- ADR：ADR-005。
- 目标：日志加载、规则校验、分析、导出异步执行，并向 UI 通知进度。
- 依赖：PLAN-APP-002。
- 文件/模块：`application/task_runner.rs`、`application/progress.rs`。
- 步骤：
  1. 定义 taskId 和任务状态。
  2. 同类任务串行。
  3. 执行中拒绝重复任务。
  4. 进度通过监听器/事件发送。
  5. 监听器失败不影响主流程。
- 测试：重复任务、失败恢复、进度事件、监听器失败。
- 完成证据：30MB 加载时 UI 不阻塞并能看到进度。

## PLAN-STORAGE-001 本地配置存储

- 需求：REQ-RULESET、REQ-SAVED-QUERY、REQ-SCOPE。
- 职责：RESP-RULE-BACKUP、RESP-SAVED-QUERY。
- ADR：ADR-003。
- 目标：使用本地文件保存规则、保存查询、最近文件和 UI 偏好。
- 依赖：PLAN-CONTRACT-001。
- 文件/模块：`infrastructure/file_storage/`。
- 步骤：
  1. 确定 app-data 目录。
  2. 实现 active/previous TOML 读写。
  3. 实现 saved-queries.json。
  4. 实现 preferences.json。
  5. 实现 recent-files.json。
  6. 写入采用临时文件和替换策略。
- 测试：首次启动、文件缺失、文件损坏、写入失败、原子替换。
- 完成证据：关闭应用后规则和保存查询仍可恢复，日志数据不落盘。

## PLAN-STORAGE-002 规则激活、备份和恢复

- 需求：REQ-RULESET。
- 职责：RESP-RULE-MANAGE、RESP-RULE-BACKUP、RESP-RULE-SNAPSHOT。
- ADR：ADR-003。
- 目标：校验通过后原子激活规则，保留上一版本，支持恢复上一版本。
- 依赖：PLAN-RULE-003、PLAN-RULE-004、PLAN-STORAGE-001。
- 文件/模块：`application/rule_set_service.rs`、`infrastructure/file_storage/rule_storage.rs`。
- 步骤：
  1. 候选规则先完成 loader、validator、assembler。
  2. 激活前备份当前 active 为 previous。
  3. 临时文件写入新 active。
  4. 原子替换 active。
  5. 发布 ActiveRuleSet 和只读快照。
  6. 恢复 previous 时同样走校验和原子替换。
- 测试：激活成功、校验失败不覆盖、备份恢复、写入失败保留当前规则。
- 完成证据：规则激活失败时当前规则和 previous 保持一致。

## PLAN-APP-004 CSV 导出

- 需求：REQ-LATENCY-EXPORT。
- 职责：RESP-LATENCY-EXPORT-PROJECT、RESP-CSV-WRITE。
- ADR：ADR-006。
- 目标：从 LatencyAnalysisResult 生成三段式 UTF-8 BOM CSV。
- 依赖：PLAN-ANALYSIS-006、PLAN-STORAGE-001。
- 文件/模块：`application/export_service.rs`、`infrastructure/csv_writer/`。
- 步骤：
  1. 生成关键日志时间戳段。
  2. 生成阶段时延段。
  3. 生成统计段。
  4. 过滤 export_enabled=false。
  5. 写 UTF-8 BOM CSV。
- 测试：基线 CSV 对比、缺失值空白、中文、逗号转义、BOM。
- 完成证据：导出文件与批准基线结构一致。

## PLAN-APP-005 统一 Issue 处理

- 需求：REQ-ISSUES。
- 职责：RESP-ISSUE-HANDLE。
- ADR：ARCH-EXTENSION-PATTERNS。
- 目标：实现 CategoryHandlerRegistry + SeverityPolicy，并统一日志、恢复和 UI 转换。
- 依赖：PLAN-CONTRACT-001、PLAN-APP-002。
- 文件/模块：`domain/issue/`、`application/issue_service.rs`。
- 步骤：
  1. 实现 category 到接收方映射。
  2. 实现 TIP/WARNING/EXCEPTION 策略。
  3. 实现未捕获异常到 SYSTEM/EXCEPTION。
  4. 保留 cause 到诊断日志。
  5. UI DTO 不包含堆栈。
- 测试：每个 category 路由、三种 level、cause 隐藏、EXCEPTION 恢复。
- 完成证据：所有错误路径都返回统一 Issue DTO。
