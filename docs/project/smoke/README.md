# 冒烟测试包

这个目录放本地冒烟测试最小集合。它的目标不是覆盖全部边界，只是帮我们快速确认主流程能跑通。

## 文件清单

- `sample-log-small.txt`：一份很小的固定格式日志样例。
- `sample-business-rules.toml`：旧版单文件规则参考；规则包主流程使用 `../baselines/business-rules-split/` 打包后的 ZIP。
- `sample-saved-queries.json`：一组可直接用于查询列表的保存查询样例。
- `sample-latency-export.csv`：时延分析导出样例。
- `sample-latency-result.json`：时延分析结果样例。

## 冒烟步骤

1. 启动本地应用。
2. 进入日志搜索页，选择日志文件夹。
3. 导入或打开 `sample-log-small.txt`。
4. 用户如需可先自行用外部 AI 检查文件；将 `../baselines/business-rules-split/` 打包为 ZIP 后导入，确认本地校验通过并创建或覆盖 `1.1.0` 版本。
5. 搜索 `request started` 或 `B subprocess received`。
6. 导入或手工创建 `sample-saved-queries.json` 里的查询，确认单击回填、双击查看详情。
7. 切到时延分析页，选择 `REQ-0001`。
8. 检查泳道图、步骤树和区间统计。
9. 导出 CSV，并用表格工具打开 `sample-latency-export.csv` 对照格式。

## 通过标准

- 日志搜索能看到命中结果。
- 完整 ZIP 规则包能通过本地校验导入，并可直接用于时延分析。
- 保存查询可复用，且查询列表可折叠。
- 时延分析页能显示阶段与步骤细节。
- CSV 导出有表头、关键日志时间戳区和阶段统计区。

## 备注

- 这里的样例只用于冒烟，不用于性能压测。
- 30MB 级、5MB 级、50KB 级基线样例仍以 `docs/project/baselines/` 和 `docs/baseline-samples/` 为主。
