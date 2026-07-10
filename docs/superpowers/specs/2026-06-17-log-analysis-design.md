# 日志分析软件设计文档

## 背景
本工具面向测试工程师，用于在本机分析固定格式日志。阶段 1 聚焦日志加载、解析、搜索、保存查询和导出；阶段 2 扩展阶段时延分析；阶段 3 再考虑业务流程与错误解释。

当前项目已有需求文档:
- `docs/vscode/specs/requirements.md`
- `日志分析软件需求.md`

## 已确认决策
1. 阶段 1 采用本地 Web 应用，测试人员在本机启动并通过浏览器访问，不作为集中式服务器部署。
2. 阶段 1 只处理固定格式日志，字段都会存在，不做多格式兼容、标准化或日志采集。
3. 日志按单行处理，不合并多行异常堆栈。
4. 时间戳不包含年份，阶段 1 不补年份，只在当前加载日志内按 `MM-DD HH:mm:ss.SSS` 排序和过滤。
5. 搜索支持关键字、短语、正则、时间范围、等级、应用前缀、包名、tag。
6. 保存查询支持名称、描述、分组和标签，不做置顶排序。
7. 常用操作响应时间目标为 1s 内；大日志允许分批加载，但 5s 内需要进入可查询或可查看进度状态。
8. 阶段 2 时延分析采用“用户选择某次请求，按应用泳道展示阶段耗时，其他请求作为统计摘要”的方案。

## 推荐方案
采用“本地 Web 应用 + 后端内存数据仓库 + 前端搜索工作台”的方案。

浏览器负责交互展示，后端负责文件读取、固定格式解析、索引/缓存、正则搜索、保存查询持久化、业务数据导入和查询结果导出。这样既能满足测试本机使用，也能把性能敏感逻辑放在后端统一控制。

## 总体架构
```text
Browser UI
  -> Local API Server
    -> Log Loader
    -> Fixed Format Parser
    -> Log Repository
    -> Search Engine
    -> Saved Query Service
    -> Config Store
    -> Import / Export Service
```

### Browser UI
提供搜索工作台。首屏包含文件加载、查询条件、保存查询入口、分组/标签入口和结果列表。结果列表支持高亮、分页或虚拟滚动、查看原始行和上下文。

### Local API Server
提供本地接口，连接 UI 和后端模块。它不依赖远端服务器，也不引入 Elastic 等中间件。

### Log Loader
负责读取本地日志文件，按行分批处理，并向 UI 返回加载进度。它不负责解析业务含义，也不参与搜索。

### Fixed Format Parser
只解析已确认的固定格式日志，输出 `LogEntry`。解析失败时返回失败行和失败原因，不中断整体加载。

### Log Repository
维护当前加载日志的内存数据，包括解析成功日志、解析失败行、统计信息和轻量查询索引。阶段 1 不持久化日志本体，重启后重新加载日志。

### Search Engine
接收统一查询对象，先执行结构化过滤，再执行关键字或正则匹配，最后分页返回结果。正则需要超时保护。

### Saved Query Service
管理保存查询的新增、编辑、删除、调用、分组、标签、导入和导出。数据持久化到本地 JSON 或 YAML 配置文件。

### Import / Export Service
导入保存查询、分组和标签配置；导出当前查询结果为 CSV 或 JSON。

## 阶段 1 数据模型
```ts
LogEntry {
  id: string
  sourceFile: string
  lineNo: string
  timestamp: string
  pid: string
  tid: string
  level: string
  appPrefix: string
  packageName: string
  tag: string
  message: string
  raw: string
  parseStatus: 'parsed' | 'failed'
}

SavedQuery {
  id: string
  name: string
  description: string
  group: string
  tags: string[]
  keyword: string
  searchMode: 'keyword' | 'phrase' | 'regex'
  timeRange?: { start: string, end: string }
  level?: string[]
  appPrefix?: string[]
  packageName?: string[]
  tag?: string[]
  caseSensitive: boolean
  createdAt: string
  updatedAt: string
}

SearchRequest {
  keyword?: string
  searchMode: 'keyword' | 'phrase' | 'regex'
  timeRange?: { start: string, end: string }
  level?: string[]
  appPrefix?: string[]
  packageName?: string[]
  tag?: string[]
  caseSensitive: boolean
  page: number
  pageSize: number
}

SearchResult {
  total: number
  page: number
  pageSize: number
  items: LogEntry[]
  queryTimeMs: number
}
```

## 阶段 1 数据流
```text
选择日志文件
  -> 后端读取文件
  -> 按行解析固定格式
  -> 生成 LogEntry[]
  -> 构建内存缓存/轻量索引
  -> 前端显示加载结果和基础统计
  -> 用户输入查询条件
  -> 后端执行过滤/搜索
  -> 返回分页结果
  -> 前端高亮展示
```

加载过程中记录:
- 总行数
- 成功解析行数
- 解析失败行数
- 加载耗时
- 索引耗时
- 峰值内存

查询顺序固定为:
1. 时间范围、等级、应用前缀、包名、tag 等结构化过滤。
2. 关键字、短语或正则匹配。
3. 排序和分页。
4. 返回当前页、总数和查询耗时。

## 错误处理
### 文件读取错误
文件不存在、权限不足、编码异常等错误需要在 UI 中明确展示。已有日志结果不应被自动清空，用户可以重新选择文件。

### 解析失败行
解析失败行保留原始内容、行号和失败原因。加载完成后展示失败数量和部分样例。

### 正则错误或慢正则
正则语法错误直接提示；正则执行过慢时触发超时，中断本次查询，并提示用户缩小时间范围或增加过滤条件。

### 业务数据导入错误
JSON/YAML 格式错误、字段缺失、重复 ID 等情况返回导入失败报告，不覆盖已有保存查询配置。

## 性能策略
- 30MB 级日志优先使用内存数据结构处理，避免每次查询重复读取磁盘。
- 加载时分批读取、分批解析、渐进更新进度。
- 大日志或多个文件加载时，5s 内进入可查询或可查看进度状态。
- 为 `timestamp`、`level`、`appPrefix`、`packageName`、`tag` 建立轻量索引或缓存。
- 普通关键字优先使用索引或缓存结果。
- 正则只在结构化过滤后的候选集合上执行。
- 查询结果只返回当前页，前端使用分页或虚拟滚动。
- 保存查询、切换分组、编辑标签等配置操作目标响应时间为 1s 内。

## 阶段 2 时延分析设计
阶段 2 基于阶段 1 的 `LogEntry` 扩展，不改变阶段 1 的日志解析和搜索能力。

### 目标
用户可以配置某个应用的阶段边界日志，例如:

```text
A日志 -> B日志 -> C日志
```

其中:
- `A日志 -> B日志` 的耗时记为 `B阶段`
- `B日志 -> C日志` 的耗时记为 `C阶段`
- 如果存在 `C日志 -> D日志`，则记为 `D阶段`

用户选择某次请求后，主视图按应用前缀分泳道展示该请求中的各阶段耗时。其他同类请求只作为统计摘要展示，不在主图中逐条展开。

### 解耦原则
时延分析必须拆成三层:

```text
数据层 -> 加工层 -> 展示层
```

### 数据层
只提供基础日志数据:
- 阶段边界日志
- 请求标识
- 应用前缀
- 时间戳
- 原始日志
- tag、message、lineNo

数据层不关心图表形态，也不计算 UI 颜色和布局。

### 加工层
负责把基础日志加工为展示无关的数据结构:
- 请求链路
- 阶段耗时
- 应用泳道
- 阶段统计摘要
- 慢阶段标记
- 可下钻的边界日志引用

加工层输出稳定模型，后续 UI 调整不应影响计算逻辑。

### 展示层
只消费加工层输出的数据，负责:
- 时间线布局
- 应用泳道展示
- 阶段颜色
- 慢阶段强调
- tooltip
- 点击下钻入口
- 统计摘要位置和样式

如果后续 UI 从泳道图换成甘特图、表格或折线图，优先只修改展示层。

### 阶段 2 建议数据模型
```ts
StageRule {
  id: string
  appPrefix: string
  stageName: string
  fromPattern: string
  toPattern: string
  thresholdMs?: number
}

RequestTrace {
  requestId: string
  startTime: string
  endTime: string
  totalDurationMs: number
  appLanes: AppLane[]
}

AppLane {
  appPrefix: string
  stages: StageDuration[]
}

StageDuration {
  stageName: string
  fromLogId: string
  toLogId: string
  startTime: string
  endTime: string
  durationMs: number
  thresholdMs?: number
  status: 'normal' | 'slow'
}

LatencyStats {
  requestCount: number
  slowRequestCount: number
  avgDurationMs: number
  p90DurationMs: number
  slowestAppPrefix?: string
  slowestStageName?: string
}
```

### 阶段 2 主视图
采用已确认的“单次请求 + 应用泳道”方案:
- 用户先选择某次请求。
- 主区域展示该请求内不同应用的阶段时间线。
- `B阶段`、`C阶段`、`D阶段` 使用不同颜色。
- 超阈值阶段使用强调色。
- 右侧展示其他请求统计，例如请求数、异常请求数、平均耗时、P90、最慢应用、最慢阶段。
- 点击阶段条后展示该阶段的前后边界日志和上下文日志。

示意图参考:
- `docs/vscode/specs/latency-selected-request-app-lanes.svg`
- `docs/vscode/specs/latency-selected-request-with-stats.svg`

## 测试与验收
### 阶段 1 单元测试
- 固定格式解析器。
- 查询条件组合。
- 正则错误和正则超时。
- 保存查询新增、编辑、删除、调用。
- 分组和标签筛选。
- JSON/YAML 导入。
- CSV/JSON 导出。

### 阶段 1 性能测试
使用 30MB 固定格式日志:
- 加载到可见进度或可查询状态 <= 5s。
- 常规关键字查询 <= 1s。
- 典型正则查询 <= 1s。
- 组合过滤查询 <= 1s。
- 峰值内存 < 2GB。

### 阶段 1 用户验收
1. 加载日志，通过关键字定位目标日志。
2. 使用正则搜索一类错误日志。
3. 保存一个带分组和标签的查询，重启后再次调用。
4. 按时间范围和应用前缀过滤日志并导出结果。

### 阶段 2 验收方向
1. 用户配置 `A日志 -> B日志 -> C日志` 阶段规则。
2. 用户选择某次请求后，按应用泳道展示各阶段耗时。
3. `A -> B` 正确显示为 `B阶段`，`B -> C` 正确显示为 `C阶段`。
4. 其他同类请求展示统计摘要。
5. 点击慢阶段能查看对应边界日志和上下文日志。
6. 修改 UI 展示方式不影响阶段计算和统计逻辑。

## 后续不包含内容
阶段 1 不实现:
- 日志采集、拉取、上传服务。
- 日志清洗、标准化、多格式自动识别。
- 自定义日志格式解析规则。
- 时延分析图表。
- 业务流程节点录入与关联。
- 错误原因解释规则库。
- 多用户认证、权限控制、集中式中间件。

阶段 2 只作为扩展设计写入本设计文档，具体实现应在阶段 1 完成后单独拆分计划。
