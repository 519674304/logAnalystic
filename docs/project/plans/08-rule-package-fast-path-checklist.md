Document ID: PLAN-RULE-PACKAGE-FAST
Status: Implemented (desktop file-picker smoke pending)
Approved by:
Approved at:
Depends on: REQ-RULESET, CTX-RULE-CONFIG, RESP-RULE-PACKAGE, BASELINE-PRIMARY, UI-BASELINE
Supersedes: PLAN-RULE-003, PLAN-STORAGE-002, PLAN-UI-003

# 规则包快速路径实施清单

## 目标

将当前扁平 `RuleCatalog` 替换为完整 ZIP 规则包的新增/覆盖流程，并实现树状浏览和节点弹窗编辑；以 `business-rules-split/` 的 ZIP 和冒烟步骤为验收依据。

## 关键难点与投入审视

以下比例是本轮规则包改造的相对推理、实现和验证投入，不是项目总 token 的精确计费。目的是防止个人项目把精力花在低价值的版本治理上。

| 环节 | 难点 | 建议投入 | 是否值得 | 控制策略 |
| --- | --- | --- | --- | --- |
| ZIP 与 manifest 边界 | 只接受根目录 manifest，防止缺文件、重复映射和路径越界 | 15% | 必须 | 一次读取、拒绝绝对路径和 `..` 路径；不做压缩包修复。 |
| 三层文件的组装与引用索引 | 元素分散在文件中，ID 与引用必须能定位 | 20% | 必须 | 使用轻量 ID 索引，不为全部字段建立庞大 Rust 类型树。 |
| 同版本整包覆盖 | 写入失败不能让树读到半包 | 20% | 必须 | 候选包先在内存完成校验，再写临时目录并整体替换目标版本目录。 |
| 树投影和节点定位 | 树显示的是层级视图，实际数据是跨文件引用 | 10% | 值得 | 单独生成 `RuleCatalogView`，UI 不直接理解 TOML。 |
| 节点编辑与回写 | 修改一个节点仍要保存完整包，同时保留 TOML 注释、空白和未编辑项目顺序 | 25% | 必须 | 使用无损 TOML 文档编辑器，只修改目标节点；不重写其他层级文件。 |
| 页面紧凑化与弹窗 | 交互清晰但技术风险低 | 10% | 值得 | 严格按低保真原型，不额外做拖拽、搜索、批量编辑。 |

### 明确不投入

- 外部 AI 接入、提示词、检查结果回传：用户在应用外完成。
- 版本激活、冻结、历史、备份、迁移、回滚和审批流。
- 全量强类型领域模型、规则 DSL、自动修复和复杂异常体系。

### 推荐实现取舍

第一版保留 manifest 与三层原始 TOML 文档，并只建立 manifest、层级名称、节点 ID、节点类型和关键引用的轻量索引。节点编辑使用无损 TOML 文档模型，仅修改目标节点，保留注释、空白和未编辑项目的相对顺序。这样支持导入、覆盖、树展示和弹窗编辑，同时避免为几乎不会变化的字段建立全量 Rust 类型模型。

## 文件级清单

- [x] `src-tauri/Cargo.toml`：加入 ZIP 解压与无损 TOML 编辑依赖；不加入版本管理、迁移或备份依赖。
- [x] `src-tauri/src/domain/rule_package.rs`：定义 manifest、完整 RuleSet、保留格式的层级 TOML 文档、节点索引和本地校验结果。
- [x] `src-tauri/src/application/rule_package_service.rs`：读取 ZIP、组装候选包、执行本地校验、按版本新增或整包覆盖。
- [x] `src-tauri/src/infrastructure/file_storage/rule_package_store.rs`：按 `rule_set_id/version` 读写完整包；仅在完整写入成功后替换旧包。
- [x] `src-tauri/src/commands/rule_commands.rs` 与 `src-tauri/src/dto/command_dto.rs`：用规则包命令替换 `list/import/upsert/delete_rule_catalog`。
- [x] `src-tauri/src/main.rs`：注册新的规则包命令并删除旧目录命令。
- [x] `src/api/commands.ts`、`src/api/dto.ts`、`src/api/tauri-client.ts`：定义 ZIP 导入、版本树、节点详情和节点保存的前端契约；移除浏览器端 TOML 解析回退。
- [x] `src/app/App.tsx`：保存选中的版本、树节点和弹窗草稿，不再保存扁平规则数组。
- [x] `src/features/rule-config/RuleCatalogPanel.tsx`：按已批准原型实现左侧版本树、紧凑概要列表、ZIP 导入反馈和双击编辑弹窗；移除删除、启用和散装文件导入。
- [x] `src/index.css`：压缩树节点与列表单元尺寸，补齐弹窗与窄窗口布局。

## 最小测试与冒烟

- [x] Rust：合法 ZIP 新增版本；同版本 ZIP 完整覆盖；非 ZIP、缺 manifest、映射错误或关键引用错误都不改变已保存版本；节点编辑保留注释、空白和未编辑项目的相对顺序。
- [x] React：树节点单击选择；双击打开弹窗；导入控件只接受 `.zip`；成功反馈显示新增或覆盖。
- [x] 下载模板：规则配置页提供完整 ZIP 下载；模板含 `manifest.toml` 与三层 TOML 的中文注释，并可通过现有规则包解析校验。
- [x] 导入说明：规则配置页提供可下载 Markdown，说明 ZIP 结构、版本覆盖、三层职责、ID 引用与常见失败原因。
- [ ] 手工冒烟：按 `docs/project/smoke/README.md` 导入基线 ZIP，打开任一节点编辑并保存，再运行一次请求分析。

## 外部 AI 边界

用户可在导入前自行用外部 AI 检查规则包。该过程不属于项目功能，不需要 API、服务、页面状态或持久化记录。
