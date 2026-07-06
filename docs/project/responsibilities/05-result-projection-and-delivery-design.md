Document ID: RESP-RESULT-PROJECTION-DESIGN
Status: Draft
Approved by:
Approved at:
Depends on: REQ-VIEW, REQ-LATENCY-EXPORT, UI-BASELINE, BASELINE-PRIMARY
Supersedes:

# 结果投影与交付设计

## 包含职责

RESP-REQUEST-LIST-PROJECT、RESP-LATENCY-VIEW-PROJECT、RESP-LOG-DRILLDOWN、RESP-LATENCY-EXPORT-PROJECT、RESP-CSV-WRITE、RESP-UI-RENDER。

## 目的与非目标

将同一份 LatencyAnalysisResult 转换为请求列表、时延页面和 CSV 数据。业务含义、应用名称、顺序和导出开关来自结果内的 EffectiveRuleCatalog。只做选择、排序、分组和格式化，不重新读取 TOML、匹配日志或计算时延。

## 请求列表投影

```text
projectRequestList(result, filter) -> RequestListData
```

输出 systemRequestId、开始时间、结束时间、结果、是否异常、总耗时和展示名。展示名采用 `<systemRequestId>(start=<原始开始时间戳>)`。筛选只作用于已有请求结果。

## 时延页面投影

```text
projectLatencyView(result, selectedRequestId) -> LatencyViewData
```

输出：

- 选中请求摘要。
- 按应用组织的泳道和同一应用多次访问。
- 并行子进程所属应用、并行组总等待阶段和主进程汇总后的后续阶段。
- business 与 internal 阶段及起止日志引用。
- 同类请求统计摘要。
- 阶段下钻入口。

投影不包含固定像素坐标；具体颜色和布局由 UI 渲染器决定。

## 日志下钻

```text
drillDown(datasetId, startLogRef, endLogRef, contextSize)
  -> LogContextData
```

通过 LogLookupPort 读取阶段起止原始日志和前后上下文。阶段结果只保存引用，不复制完整日志正文。

## CSV 投影

```text
projectExport(result) -> LatencyExportTable
```

仅选择当前场景下有效且 `export_enabled=true` 的 matcher 和 stage，生成：

1. 关键日志原始时间戳区域。
2. 每次请求阶段时延区域。
3. 阶段样本数、平均值、P90、最大值区域。

最左列只包含业务含义；缺失值为空。

## 交付适配器

- CSV 写入器只处理二维表格、空行、转义和 UTF-8 BOM。
- UI 渲染器只消费 LatencyViewData，并遵循批准的视觉基线。
- 两者均不知道 matcher 或 stage 的计算方法。

## 问题与恢复

- 选中请求不存在：PROJECTION / EXCEPTION。
- 日志引用不存在：PROJECTION / WARNING，阶段数据仍可显示但无原始证据。
- CSV 保存失败：EXPORT / EXCEPTION，不修改分析结果。

## 测试边界

- 同一分析结果可独立生成 UI 模型和 CSV 模型。
- 请求筛选不改变完整分析结果。
- CSV 行与规则 business_meaning 顺序一致。
- CORE 场景不会输出 FULL 专属行。
- UI 改版不要求修改时延分析流水线。
