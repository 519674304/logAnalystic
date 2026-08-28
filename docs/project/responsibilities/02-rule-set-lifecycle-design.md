Document ID: RESP-RULE-PACKAGE
Status: Draft
Approved by:
Approved at:
Depends on: CTX-RULE-CONFIG, REQ-RULESET, BASELINE-PRIMARY
Supersedes: RESP-RULE-LIFECYCLE-DESIGN

# 规则包职责设计

## 职责划分

| ID | 职责 | 输入 | 输出 |
| --- | --- | --- | --- |
| RESP-RULE-PACKAGE-READ | 解压 ZIP、读取 manifest 与三层层级文件 | ZIP 字节 | `RulePackageCandidate` |
| RESP-RULE-VALIDATE | 执行最小本地结构校验 | Candidate | 通过或拒绝原因 |
| RESP-RULE-PACKAGE-STORE | 按版本新增或整体覆盖完整规则包 | 已通过 Candidate | 已保存版本 |
| RESP-RULE-CATALOG-PROJECT | 从完整规则包生成版本树、节点概要和详情 | 已保存版本 | UI DTO |
| RESP-RULE-NODE-EDIT | 无损修改目标 TOML 文档的目标节点后重新校验和整体保存 | 节点修改 | 已保存版本 |

## 依赖方向

```text
UI / Tauri command
  -> RulePackageService
       -> ZipReader + ManifestParser
       -> RulePackageValidator + LosslessTomlEditor
       -> RulePackageStore
       -> RuleCatalogProjector
```

用户可在应用外自行使用外部 AI 检查规则包；项目不接入供应商、提示词或网络协议。`RulePackageValidator` 只做 ZIP、manifest、层级映射和关键引用的本地校验。

`LosslessTomlEditor` 使用保留格式的 TOML 文档模型。它只更新用户在弹窗中提交的目标节点，不重写其他层级文件，也不清除目标文件内的注释、空白或未编辑项目的相对顺序。

## 冒烟失败处理

- ZIP 不可读、manifest 缺失、层级映射错误或关键引用错误：拒绝，不写入。
- 覆盖写入失败：返回失败，不把半包暴露给版本树。
- 其他异常不展开恢复机制；记录可读错误即可。

## 明确不做

- `activate`、`restorePrevious`、`RuleSetBackup`、版本状态机和统一 Issue 注册表。
- 单节点独立导入或单节点独立持久化。
