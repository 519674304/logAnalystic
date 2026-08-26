# 冒烟测试包

这个目录放本地冒烟测试最小集合。它的目标不是覆盖全部边界，只是帮我们快速确认主流程能跑通。

## 文件清单

- `sample-log-small.txt`：一份很小的固定格式日志样例。
- `sample-business-rules.toml`：旧版单文件规则参考；规则包主流程使用 `../baselines/business-rules-split/` 打包后的 ZIP。
- `rule-package.zip`：时延分析冒烟规则包（6 层 TOML，对齐 `fixture/sample-latency.log` 的消息与 4 应用）。
- `rule-package/`：上面的 7 个 TOML 源文件（修改后重新打包）。
- `fixture/sample-latency.log`：顺序时延 fixture（35 行、5 个请求，每个请求按 5 阶段顺序输出，start/end 按时间相邻出现）。由 `scripts/gen-latency-fixture.js` 生成。
- `sample-saved-queries.json`：一组可直接用于查询列表的保存查询样例。
- `sample-latency-export.csv`：时延分析导出样例。
- `sample-latency-result.json`：时延分析结果样例。

## 冒烟步骤

1. 启动后端与前端：`cargo run -p server` + `npm run dev`。
2. 进入日志搜索页，选择日志文件夹 `docs/project/smoke/fixture/`（此时延 fixture 目录只含 `sample-latency.log`）。
3. 搜索 `request started` 应命中 5 条、`subprocess received` 应命中 5 条，确认命中按时间有序。
4. 切到规则配置页，导入 `docs/project/smoke/rule-package.zip`，确认本地校验通过并新增 `RULESET-SMOKE` 1.0.0。
5. 切到时延分析页，点「分析」。
6. 检查：请求资源管理器显示 5 个请求（含 1 个慢请求 375ms）；泳道图、步骤树显示真实阶段时延；区间统计显示 25 个样本的 avg / P90 / max。
7. 点击慢请求，泳道图切换为对应请求的真实时间线。
8. 导出 CSV 核对格式。

## 通过标准

- 日志搜索能看到命中结果。
- 完整 ZIP 规则包能通过本地校验导入。
- 时延分析用**真实日志时间戳**计算：5 个请求 × 5 阶段 = 25 个样本；最大值 250ms（子进程阶段），总耗时最长的请求为 375ms。
- 泳道图按选中请求过滤，步骤树与区间统计一致。
- CSV 导出有表头、关键日志时间戳区和阶段统计区。

## 备注

- 端侧日志按时间顺序发生、无 requestId：时延分析对每个 stage 用 `/api/search` 拉取 start/end 命中共 10 次（同一模式命中会缓存），按下标顺序配对计算真实耗时。这是冒烟路径，不做流式全量扫描（流式时延分析属 M3 规划范围）。
- `docs/project/baselines/` 下的 5MB 随机生成日志（`gen-sample-log.js`）是逐行随机分配应用与消息，不构成连贯请求流，仅用于搜索，不能用于时延分析。
- 30MB 级、5MB 级、50KB 级基线样例仍以 `docs/project/baselines/` 和 `docs/baseline-samples/` 为主。
