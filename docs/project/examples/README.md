# 导入样例

这个目录放一份**可直接导入**的完整规则包样例，以及一份对齐它的端侧日志。它与 `smoke/`（冒烟测试）和 `templates/`（下载模板）不同：这里是一个具体的、带业务含义的端侧场景示范，用来验证「端侧日志顺序发生 → 顺序配对时延分析」这条主链路。

## 文件清单

- `import-example/`：可导入的规则包（4 个 TOML）。
  - `manifest.toml`：入口，声明 `rule_set.id`、`package.version` 与三层文件映射。
  - `definitions.toml`：场景 / 领域 / 应用 / 进程 / 流程的静态结构（4 应用 A/B/C/D）。
  - `matchers.toml`：把日志文本映射为业务事件（keyword / regex）。
  - `stages.toml`：两个关键日志事件之间的时延阶段（flow 聚合 / RPC 边界 / 进程内部并行组）。
- `fixture/import-example.log`：端侧顺序日志（35 行、5 个请求）。

## 端侧日志的两个关键特征

这份 fixture 严格体现端侧日志的形态，是理解建模为何能简化的关键：

1. **每个请求顺序发生**：请求 N 的 7 行日志完整输出后，请求 N+1 才开始，绝不交错。因此无需 `requestId` 也能按顺序配对每个 stage 的 start/end。
2. **无业务 requestId**：日志行里没有跨行关联字段；请求识别靠「按时间顺序找 `order=1` 聚合 stage 的 start matcher 命中」，请求内部靠下标顺序配对 start/end。

单个请求内部的结构是「4 应用并行子进程」（A 主进程扇出 B/C/D，D 收尾），但落盘仍是端侧串行顺序：A 的日志、B 的日志、D 的日志按时间先后依次出现。

## 冒烟步骤

1. 启动后端与前端：`cargo run -p server` + `npm run dev`。
2. 日志搜索页选择日志文件夹 `docs/project/examples/fixture/`。
3. 搜索 `request started` 应命中 5 条，且命中按时间有序。
4. 规则配置页导入 `docs/project/examples/import-example/` 四个 TOML 打包成的 ZIP（或直接用 `import-example.zip`），确认新增 `RULESET-EXAMPLE` 1.0.0。
5. 时延分析页点「分析」，确认 5 个请求、各 stage 真实时延与区间统计一致。

## 通过标准

- 5 个请求 × 5 阶段 = 25 个样本；子进程阶段最慢为 220ms（请求 4，总耗时 340ms）。
- 泳道图按选中请求过滤，与区间统计一致。
- 无 requestId 的日志也能被正确切分为 5 个请求（靠顺序配对，不靠 requestId 分组）。

## 打包

把 `import-example/` 下四个 TOML 文件（不含外层目录）压缩为 ZIP 根目录即可导入：

```powershell
Compress-Archive -Path 'docs/project/examples/import-example/*' -DestinationPath 'docs/project/examples/import-example.zip' -CompressionLevel Optimal
```
