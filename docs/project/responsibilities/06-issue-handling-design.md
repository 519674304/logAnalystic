Document ID: RESP-ISSUE-HANDLING-DESIGN
Status: Approved
Approved by: 用户
Approved at: 2026-07-06
Depends on: REQ-ISSUES, RESP-MAP
Supersedes:

# 统一问题处理设计

## 目的与非目标

统一接收校验、警告和异常，按业务分类选择接收方，按等级决定流程与日志策略，并在应用边界转换为用户可理解的结果。当前只定义分类体系，不分配具体错误码序号，不确定职责链或拦截器实现。

## Issue 契约

```text
Issue
├─ category
├─ level
├─ sourceResponsibility
├─ location
├─ details
└─ cause（可以为空）
```

## 等级

| 等级 | 流程行为 | 日志等级 | 用户结果 |
| --- | --- | --- | --- |
| `TIP` | 继续 | INFO | 可选普通提示 |
| `WARNING` | 继续、跳过或降级 | WARN | 显示可理解警告 |
| `EXCEPTION` | 中止当前操作并保留上一有效状态 | ERROR | 显示失败原因，不展示堆栈 |

## 分类与接收方

| 分类 | 默认接收方 |
| --- | --- |
| `LOG_IMPORT` | 日志加载用例处理器 |
| `LOG_PARSE` | 数据质量处理器 |
| `LOG_SEARCH` | 搜索用例处理器 |
| `RULE_SET` | 规则集生命周期处理器 |
| `REQUEST_RECOGNITION` | 分析协调器 |
| `LOG_MATCHING` | 分析协调器 |
| `STAGE_CALCULATION` | 分析协调器 |
| `STATISTICS` | 分析协调器 |
| `PROJECTION` | 结果投影用例处理器 |
| `EXPORT` | 导出用例处理器 |
| `SYSTEM` | 应用级统一异常处理器 |

## 统一流程

```text
职责发现问题
  -> 创建 Issue
  -> category 路由到接收方
  -> level 决定继续、降级或中止
  -> 执行恢复策略
  -> 按 INFO/WARN/ERROR 打印
  -> 应用边界转换用户提示
```

## 约束

- 业务职责不直接拼接 UI 文案。
- category 决定接收方，level 决定通用流程和打印等级。
- cause 保存技术异常；cause 可以为空。
- 技术堆栈只进入诊断日志。
- 新问题不得绕开统一处理流程。
- 具体错误码后续可以采用 `<CATEGORY>-<LEVEL>-<SEQUENCE>`，当前不定义序号。

## 13 个问题归属

- ISSUE-001 -> RESP-LOG-LOAD
- ISSUE-002 -> RESP-LOG-LOAD
- ISSUE-003 -> RESP-LOG-PARSE / RESP-LOG-QUALITY
- ISSUE-004 -> RESP-LOG-SEARCH
- ISSUE-005 -> RESP-RULE-VALIDATE
- ISSUE-006 -> RESP-REQUEST-RECOGNIZE
- ISSUE-007 -> RESP-REQUEST-RECOGNIZE
- ISSUE-008 -> RESP-REQUEST-RECOGNIZE
- ISSUE-009 -> RESP-STAGE-CALCULATE
- ISSUE-010 -> RESP-LOG-MATCH / RESP-STAGE-CALCULATE
- ISSUE-011 -> RESP-SCENARIO-RESOLVE
- ISSUE-012 -> RESP-LATENCY-STATISTICS
- ISSUE-013 -> RESP-RULE-BACKUP / RESP-RULE-MANAGE

## 扩展点候选

- category 路由可能采用职责链或处理器注册表。
- 用例边界可能采用拦截器捕获未转换异常。
- 用户提示转换可能采用统一异常切面。
- 具体模式、顺序和短路规则由 Phase 3 决定。

## 测试边界

- 每个 category 路由到唯一接收方。
- 三个 level 映射到正确流程和日志等级。
- EXCEPTION 保留上一有效状态。
- cause 堆栈不进入用户输出。
- 未知问题归入 SYSTEM，仍不绕过统一流程。
