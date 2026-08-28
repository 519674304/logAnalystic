Document ID: CTX-RULE-CONFIG
Status: Draft
Approved by:
Approved at:
Depends on: REQ-RULESET, BASELINE-PRIMARY
Supersedes: CTX-RULE-CONFIG (2026-07-09)

# 规则配置上下文

## 目的

管理完整规则包，并按 `manifest.toml` 声明的版本新增或覆盖。该上下文只负责让规则包可被浏览、编辑和分析使用，不管理版本历史、启用状态、备份或恢复。

## 最小模型

```text
RulePackage
  -> manifest（规则集 ID、version、三层文件映射）
  -> RuleSet（全部业务规则子元素）
  -> RuleCatalogView（给树和紧凑列表使用的投影）
```

`RuleSet` 是聚合根，包含场景、业务拓扑、matcher、stage 与业务流程。详细归属和引用见 `05-rule-set-data-relationships.md`。

本地存储以 `rule_set_id/version` 为键保存完整 `RulePackage`。每个版本保留 manifest 与三层原始 TOML 文档；同一键的成功导入直接替换原包，不同版本保留为独立可选项。

## 主流程边界

1. UI 选择 ZIP 并交给导入服务。
2. 导入服务读取根目录 `manifest.toml`，解压并组装完整候选规则包。
3. 用户可在导入前自行使用外部 AI 检查；应用不调用或记录该步骤。
4. 应用执行 ZIP、manifest、映射与关键引用校验；失败时不写入任何内容。
5. 校验通过后，按 `rule_set_id/version` 新增或整体覆盖，并返回版本树投影。
6. 节点弹窗编辑的是所属完整规则包；保存时只修改目标 TOML 文档中的目标节点，保留注释、空白和未编辑项目的相对顺序，再重复步骤 4 至 5。

## 不变量

- 只接受根目录具有 `manifest.toml` 的完整 ZIP。
- manifest 必须声明 version 和三层层级文件映射。
- 文件层级、稳定 ID 和关键跨层级引用必须一致。
- 覆盖的最小单位是完整规则包，不能只写入一个 matcher 或 stage。
- 拒绝导入时，原版本内容保持不变。

## 明确排除

- 启用、冻结、回滚、历史记录、备份恢复和版本迁移。
- 多人协作、权限和发布审批。
- 验证规则是否能命中当前日志；这属于后续实际分析。
