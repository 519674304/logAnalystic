# 规则包导入说明下载设计

## 目标

为规则配置页提供一份可下载、可离线保存的中文 Markdown 导入说明，让用户无需阅读源码或额外文档即可理解完整规则包的准备和导入方式。

## 方案

采用静态 Markdown 文件，和现有规则包 ZIP 模板同样通过 Vite 的 `public/` 目录发布。

- 说明源文件：`docs/project/templates/rule-package-import-guide.md`
- 发布文件：`public/templates/rule-package-import-guide.md`
- 页面入口：规则配置工具栏的“下载导入说明”次级按钮
- 下载地址：`/templates/rule-package-import-guide.md`

不增加弹窗、Tauri 命令、后端状态或浏览器端 TOML 解析。按钮仅下载文件，不会读取或修改用户的规则包。

## 文档内容

说明必须使用中文，并按以下固定顺序组织：

1. 导入前检查：ZIP 根目录、`manifest.toml` 和六层 TOML 文件。
2. 最短导入步骤：下载模板、修改、压缩、选择 ZIP、查看新增或覆盖反馈。
3. 版本规则：`rule_set.id` 区分规则集，`package.version` 不存在时新增、存在时完整覆盖。
4. 六层职责：场景、拓扑、匹配器、关系与分组、时延阶段、业务流程。
5. 引用规则：`id` 全包唯一，`*_id` 与 `*_ids` 必须引用已经存在的 ID。
6. 注释与编辑：模板注释可保留；节点弹窗只修改目标节点，保存前重新校验完整规则包。
7. 边界：外部 AI 检查由用户自行完成，应用不调用外部 AI。
8. 常见失败：非 ZIP、缺少层文件、路径不在根目录、重复 ID、引用不存在。

## 验收

- 页面显示“下载导入说明”链接，使用次级按钮样式。
- `npm run build` 后，`dist/templates/rule-package-import-guide.md` 存在。
- 规则页面静态契约检查验证链接文字、链接地址和 `public/` 文件。
- Markdown 包含“同版本号会覆盖”和“六层”两个关键说明，防止退化为无效空文档。

## 非目标

- 不提供弹窗、在线文档浏览器或 Markdown 编辑器。
- 不把说明打入 ZIP 模板，不改变 ZIP 的七文件结构。
- 不增加版本治理、自动修复或外部 AI 集成。
