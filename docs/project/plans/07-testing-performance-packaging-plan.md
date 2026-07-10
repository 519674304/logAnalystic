Document ID: PLAN-TESTING-PERFORMANCE-PACKAGING
Status: Approved
Approved by: 用户
Approved at: 2026-07-07
Depends on: PLAN-FRONTEND-UI, ARCH-PERFORMANCE-TESTING
Supersedes:

# 测试、性能与打包计划

## PLAN-TEST-001 Rust 单元和集成测试

- 需求：全部核心需求。
- 职责：全部 Rust 核心职责。
- ADR：ADR-002、ARCH-PERFORMANCE-TESTING。
- 目标：建立 Rust 单元、集成和基线对比测试。
- 依赖：PLAN-ANALYSIS-006、PLAN-APP-004。
- 文件/模块：Rust `tests/`、模块内单元测试。
- 步骤：
  1. 覆盖解析、索引、搜索、规则校验、请求识别、阶段计算、统计、CSV。
  2. 使用基线 TOML 和 CSV。
  3. 验证失败恢复。
  4. 验证 Issue 统一输出。
- 完成证据：Rust 测试命令通过，CSV 基线比对通过。

## PLAN-TEST-002 前端组件和契约测试

- 需求：REQ-VIEW、REQ-SEARCH、REQ-RULESET、REQ-LATENCY-EXPORT。
- 职责：RESP-UI-RENDER、RESP-LATENCY-VIEW-PROJECT。
- ADR：ADR-006、ADR-007。
- 目标：验证 TypeScript DTO、ViewModel、组件渲染和交互。
- 依赖：PLAN-UI-006。
- 文件/模块：前端测试目录。
- 步骤：
  1. DTO 样例读取。
  2. ViewModel 快照。
  3. 搜索表单组件。
  4. 规则页面组件。
  5. 请求列表和 SVG 泳道组件。
  6. Issue 展示。
- 完成证据：前端测试和类型检查通过。

## PLAN-TEST-003 端到端冒烟

- 需求：全部主流程。
- 职责：跨上下文流程。
- ADR：ADR-001。
- 目标：覆盖导入日志、激活规则、分析、查看、钻取、导出主流程。
- 依赖：PLAN-TEST-001、PLAN-TEST-002。
- 文件/模块：E2E 测试目录。
- 步骤：
  1. 打开应用。
  2. 导入测试日志。
  3. 激活基线规则。
  4. 选择时间范围和场景。
  5. 执行时延分析。
  6. 选择请求并查看泳道图。
  7. 钻取原始日志。
  8. 导出 CSV。
- 完成证据：E2E 冒烟稳定通过。

## PLAN-PERF-001 性能基准

- 需求：REQ-SCOPE。
- 职责：RESP-LOG-LOAD、RESP-LOG-SEARCH、RESP-ANALYSIS-COORDINATE、RESP-CSV-WRITE。
- ADR：ARCH-PERFORMANCE-TESTING。
- 目标：按 50KB、5MB、30MB 梯度验证日志加载、搜索、切换、分析、导出和内存目标。
- 依赖：PLAN-TEST-001。
- 文件/模块：性能测试脚本和数据集。
- 步骤：
  1. 准备 50KB 示例日志，覆盖主流程、关键 matcher、阶段时延和 CSV 导出。
  2. 准备 5MB 示例日志，用于常规性能门槛。
  3. 准备 30MB 示例日志，用于上限性能门槛。
  4. 先跑 50KB 快速冒烟，再跑 5MB，最后跑 30MB。
  5. 记录加载到可查询耗时。
  6. 记录基础搜索和正则搜索耗时。
  7. 记录请求识别和时延分析耗时。
  8. 记录 CSV 生成耗时。
  9. 记录峰值内存。
- 完成证据：性能报告显示满足 P90 和 2GB 目标；不满足则创建优化任务。

## PLAN-PACKAGE-001 Windows 打包

- 需求：REQ-SCOPE。
- 职责：交付。
- ADR：ADR-001。
- 目标：生成 Windows 本地可执行程序，并验证应用数据目录和本地权限。
- 依赖：PLAN-TEST-003、PLAN-PERF-001。
- 文件/模块：Tauri 打包配置。
- 步骤：
  1. 配置应用名称和窗口。
  2. 配置 Tauri 文件权限最小化。
  3. 打包 Windows 可执行程序。
  4. 在干净本地数据目录启动。
  5. 验证配置文件创建和恢复。
- 完成证据：Windows 包可启动，主流程冒烟通过。

## PLAN-OBS-001 本地诊断日志

- 需求：REQ-ISSUES、REQ-SCOPE。
- 职责：RESP-ISSUE-HANDLE。
- ADR：ARCH-PERFORMANCE-TESTING。
- 目标：记录操作耗时、输入规模、状态、Issue 分类和版本 ID，不记录原始日志全文。
- 依赖：PLAN-APP-005。
- 文件/模块：`infrastructure/diagnostics/`。
- 步骤：
  1. 接入 tracing。
  2. 记录加载、搜索、规则、分析、导出操作。
  3. 记录 Issue 分类和等级分布。
  4. 验证日志不包含原始日志全文。
- 完成证据：诊断日志能支持定位性能和失败问题，且不泄露日志正文。
