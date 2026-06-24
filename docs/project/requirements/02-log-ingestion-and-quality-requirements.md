Document ID: REQ-INGEST
Status: Draft
Approved by:
Approved at:
Depends on: REQ-SCOPE
Supersedes: docs/vscode/specs/requirements.md

# 日志导入与数据质量需求

## 需求列表

- REQ-INGEST-001: 用户可以选择一个或多个本地 `.log` / `.txt` 文件作为一次导入批次。
- REQ-INGEST-002: 系统只接受 UTF-8 编码文件。
- REQ-INGEST-003: 同一导入批次内不允许选择重复文件身份。
- REQ-INGEST-004: 文件级校验或读取失败时，整批导入失败，并展示失败文件和原因。
- REQ-INGEST-005: 行级解析失败不阻断导入；成功解析日志继续进入搜索和分析。
- REQ-INGEST-006: 解析失败行不参与搜索、请求识别和时延分析，只进入数据质量列表。
- REQ-INGEST-007: 多文件成功解析后按日志时间戳合并；同时间戳按文件选择顺序、文件内行号排序。
- REQ-INGEST-008: 加载完成后展示总行数、成功解析行数、解析失败行数、文件数和耗时。

## 固定日志格式

首批假设日志已经是固定格式单行日志，示例：

```log
20675: 06-12 10:39:38.257 32033 32033 W A00010/com.huawei.hmos.aibase/WakeupManager: mainProcess dispatch wakeup request [undefined,]
```

解析字段：

| 字段 | 说明 |
| --- | --- |
| lineNo | 原始行号 |
| timestamp | 日志时间，格式示例 `06-12 10:39:38.257` |
| pid | 进程 ID |
| tid | 线程 ID |
| level | 日志级别 |
| appPrefix | 应用前缀，例如 `A00010` |
| packageName | 包名 |
| tag | 日志 tag |
| message | 日志消息主体 |
| raw | 原始日志行 |

## 主流程

1. 用户选择日志文件。
2. 系统校验文件后缀、编码、读取权限和重复文件身份。
3. 校验通过后逐行解析日志。
4. 系统记录解析成功行和解析失败行。
5. 系统按时间合并成功解析的日志。
6. 系统展示加载摘要，基础搜索能力可用。
7. 如存在规则集，系统可继续进行请求识别和时延分析。

## 验收标准

- 给定 UTF-8 的 `.log` / `.txt` 文件，用户可以完成导入并看到加载摘要。
- 任一文件级失败时，整批导入不进入可查询状态。
- 解析失败行数量和样例可以被查看。
- 解析失败行不会出现在搜索结果、请求明细和时延计算中。
- 30MB 以内日志加载到可查询状态 P90 <= 5s。

