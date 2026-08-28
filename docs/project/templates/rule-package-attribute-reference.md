# 规则包字段属性参考

> 本文是规则包三层 TOML 的**逐字段属性规范**，作为 `rule-package-template/` 与 `smoke/rule-package/` 的权威字段说明。字段是否必填、类型、默认值、引用目标与语义以本文为准。
>
> 关系与不变量另见 `../domain/05-rule-set-data-relationships.md`（CTX-RULE-RELATIONSHIP）。本文只负责字段本身；跨元素归属、引用与校验规则在关系文档中。

## 导入校验范围（重要）

导入校验不是核心链路，当前只做**最小本地校验**：整包节点 `id` 全局去重、`*_id` / `*_ids` 引用必须存在。本文的「必填 / 类型 / 互斥 / 值域」是**编写规则包的约定**，用于给开发与测试对齐字段语义，**导入器不强制**——缺必填、类型不符、`process_id` 与 `flow_id` 同时存在，导入器仍会接受，直到实际分析阶段才可能暴露问题。

## 通用约定

- **`id` 整包全局唯一**：当前导入器用一个全局集合收集三层所有节点并去重，因此 `id` 在整个规则包内必须唯一（不限于同一类型）。
- `*_id` 表示引用一个已有 ID（如 `process_id`、`application_id`、`start_matcher_id`）。
- `*_ids` 表示引用多个已有 ID（如 `process_ids`、`sub_process_ids`、`applicable_scenario_ids`）。
- 引用必须指向存在的目标；目标类型匹配属编写约定，导入器只校验存在性。
- 「必填」指编写一个正确规则包时应提供的字段；「可选」指可省略（省略时采用默认值或无需声明）。这些标注用于指导编写，不由导入器强制。

---

## manifest.toml —— 规则包入口

标识整份规则集，声明版本与三层层级文件映射。

### `[rule_set]`

| 字段 | 类型 | 必填 | 默认 | 引用 | 语义 |
| --- | --- | --- | --- | --- | --- |
| `id` | string | 是 | — | — | 规则集稳定标识。修改它会创建另一套规则集。 |
| `name` | string | 是 | — | — | 规则集名称。 |

### `[package]`

| 字段 | 类型 | 必填 | 默认 | 引用 | 语义 |
| --- | --- | --- | --- | --- | --- |
| `version` | string | 是 | — | — | 导入目标版本。`rule_set.id` + `version` 决定新增或覆盖；同版本覆盖，新版本新增。 |
| `description` | string | 否 | — | — | 规则包描述。 |

### `[package.layers]`

三层文件名映射。文件必须都位于 ZIP 根目录，文件名与映射一致，不得用目录、绝对路径或 `..`。

| 字段 | 类型 | 必填 | 默认 | 语义 |
| --- | --- | --- | --- | --- |
| `definitions` | string | 是 | — | `definitions.toml` 文件名。 |
| `matchers` | string | 是 | — | `matchers.toml` 文件名。 |
| `stages` | string | 是 | — | `stages.toml` 文件名。 |

---

## definitions.toml —— 静态定义层

承载分析场景、业务领域、应用、流程与进程的静态结构。本层只定义元素；日志匹配与时延计算见 `matchers.toml`、`stages.toml`。

### `[[scenarios]]` —— 分析场景

定义一次分析关注的范围，用于筛选有效 matcher 和 stage。

| 字段 | 类型 | 必填 | 默认 | 引用 | 语义 |
| --- | --- | --- | --- | --- | --- |
| `id` | string | 是 | — | — | 场景唯一 ID，被 `applicable_scenario_ids` 引用。 |
| `name` | string | 是 | — | — | 场景名称。 |
| `description` | string | 否 | — | — | 场景说明。 |

### `[[domains]]` —— 业务领域

表示被分析系统的业务域，归集业务流程。

| 字段 | 类型 | 必填 | 默认 | 引用 | 语义 |
| --- | --- | --- | --- | --- | --- |
| `id` | string | 是 | — | — | 领域唯一 ID，被 `flows.domain_id` 引用。 |
| `name` | string | 是 | — | — | 领域名称。 |

### `[[applications]]` —— 应用

表示日志所属应用，是进程与 matcher 的归属分组与展示分组依据。

| 字段 | 类型 | 必填 | 默认 | 引用 | 语义 |
| --- | --- | --- | --- | --- | --- |
| `id` | string | 是 | — | — | 应用唯一 ID，被 `processes.application_id` 与 `log_matchers.application_id` 引用。 |
| `name` | string | 是 | — | — | 应用名称。 |
| `log_prefix` | string | 否 | — | — | 日志前缀，用于定位、过滤与展示日志来源（如 `A00010`）。 |

### `[[flows]]` —— 业务流程

跨 application 的一次业务流程，是请求识别与阶段编排的入口。**flow 只有 stage，无 matcher，无开始/结尾边界 stage。**

| 字段 | 类型 | 必填 | 默认 | 引用 | 语义 |
| --- | --- | --- | --- | --- | --- |
| `id` | string | 是 | — | — | 流程唯一 ID，被 `stages.flow_id` 引用。 |
| `name` | string | 是 | — | — | 流程名称。 |
| `domain_id` | string | 是 | — | `domains.id` | 该流程所属业务域。 |
| `root_process_id` | string | 是 | — | `processes.id` | 请求主进程根节点。 |
| `process_ids` | string[] | 是 | — | `processes.id[]` | 该流程覆盖的全部进程。 |

### `[[processes]]` —— 业务进程

表示一次请求中的主进程或子进程，可形成无环父子树。

| 字段 | 类型 | 必填 | 默认 | 引用 | 语义 |
| --- | --- | --- | --- | --- | --- |
| `id` | string | 是 | — | — | 进程唯一 ID，被 `flows.root_process_id`、`flows.process_ids`、`stages.process_id` 与 `stages.sub_process_ids` 引用。 |
| `name` | string | 是 | — | — | 进程名称。 |
| `kind` | string | 否 | `MAIN` | — | 进程类别：`MAIN`（主进程）/ `SUB`（子进程）。 |
| `application_id` | string | 是* | 继承父进程 | `applications.id` | 进程所属应用。子进程省略时继承其父进程的应用。 |
| `parent_process_id` | string | 否 | — | `processes.id` | 父进程。省略表示该进程是主进程（无父）。第二个应用的主进程靠 `application_id` 归属、不带父。 |

---

## matchers.toml —— 日志匹配器层

把原始日志文本映射为业务事件。一个进程的所有 matcher 与应用同属一个应用。

### `[[log_matchers]]`

| 字段 | 类型 | 必填 | 默认 | 引用 | 语义 |
| --- | --- | --- | --- | --- | --- |
| `id` | string | 是 | — | — | 匹配器唯一 ID，被 `stages.start_matcher_id` / `end_matcher_id` 引用。 |
| `name` | string | 是 | — | — | 匹配器名称。 |
| `business_meaning` | string | 否 | — | — | 人读的业务含义注释（该日志代表什么业务事件）。 |
| `enabled` | boolean | 否 | `true` | — | 是否启用。未启用则不参与匹配与分析。 |
| `export_enabled` | boolean | 否 | `true` | — | 是否导出/展示。**不影响计算**，只控导出与展示。 |
| `applicable_scenario_ids` | string[] | 否 | — | `scenarios.id[]` | 适用于哪些分析场景。选择场景后只启用覆盖该场景的匹配器。 |
| `application_id` | string | 是 | — | `applications.id` | 关键日志来自哪个应用，用于过滤、展示与定位来源。 |
| `type` | string | 是 | — | — | 匹配方式：`keyword`（关键字）/ `regex`（正则）。 |
| `pattern` | string | 是 | — | — | 匹配关键字或正则表达式。 |

---

## stages.toml —— 时延阶段层

计算两个关键日志事件（start/end matcher）之间的耗时。stage 无 `role="start"/"end"` 边界：matcher 自带起止，flow 级聚合 stage 用 `result` 表达结果/异常分支。

### `[[stages]]`

| 字段 | 类型 | 必填 | 默认 | 引用 | 语义 |
| --- | --- | --- | --- | --- | --- |
| `id` | string | 是 | — | — | 阶段唯一 ID。 |
| `name` | string | 是 | — | — | 阶段名称。 |
| `business_meaning` | string | 否 | — | — | 人读的业务含义注释（这段时延代表什么）。 |
| `enabled` | boolean | 否 | `true` | — | 是否启用。 |
| `export_enabled` | boolean | 否 | `true` | — | 是否导出/展示。**不影响计算**。 |
| `applicable_scenario_ids` | string[] | 否 | — | `scenarios.id[]` | 适用于哪些分析场景。 |
| `flow_id` | string | 二选一 | — | `flows.id` | 归属 flow（flow 级 stage）。 |
| `process_id` | string | 二选一 | — | `processes.id` | 归属进程（进程级 stage）。 |
| `order` | integer | 是 | — | — | 每个 owner 内独立从 1 编号，**仅标记数据**。同 `order` 的多个 `result` 分支 stage 有唯一 `id`、共享 `order`，互为互斥结尾。 |
| `result` | string | 否 | — | — | 结果/异常分支（如 `SUCCESS`/`ERROR`/`TIMEOUT`）。仅 flow 级聚合 stage 用；同 `order` 的多个 `result` 分支在定义上都存在，执行时同一 `order` 只命中一个。 |
| `start_matcher_id` | string | 是 | — | `log_matchers.id` | 阶段起点事件。拦截 stage 复用请求起点。 |
| `end_matcher_id` | string | 普通必填 | — | `log_matchers.id` | 阶段终点事件。普通 stage 用单个 end。 |
| `end_matcher_ids` | string[] | 拦截必填 | — | `log_matchers.id[]` | **仅 `kind="intercept"` 用**：多个拦截结束事件，**任一命中**即判定该请求被拦截、整个丢弃。 |
| `kind` | string | 否 | 普通 | — | 阶段类型：省略为普通 stage；`intercept` 为拦截 stage（用 `end_matcher_ids`，任一命中即丢弃整请求）。 |
| `sub_process_ids` | string[] | 否 | — | `processes.id[]` | **仅进程级 stage 使用**：同进程内并行子进程分组。触发点后进入，各子进程阶段独立计算，汇总点命中表示组整体完成。 |

### owner 二选一规则

- `process_id` 与 `flow_id` 必须二选一存在，**不能同时为空，也不能同时存在**。

### 进程级 stage（owner = `process_id`）

描述进程内部时延。通常起止 matcher 都属于本进程，且 `application_id` 与该进程（或其父进程）一致；内部各段应恰好铺满该应用的聚合 span，使聚合时延与内部各段对账一致。

- `sub_process_ids`：用于表达同进程内并行的子进程分组（A 扇出到 B/C/D 并等待全部完成）。
- **跨应用收尾**：进程级收尾段可以跨应用（例如 A 汇总完成 `ALL-COMPLETED` → D 成功 `REQ-SUCCESS`），其 start matcher 在调用方、end matcher 在目标应用，归属目标进程（如 D）的泳道。

### flow 级 stage（owner = `flow_id`）

flow 级 stage 是用户自定义起止（`start_matcher_id` → `end_matcher_id`）的时延段，可覆盖一个进程、一个应用的多个进程，或跨应用；一串 flow 级 stage 按 `order` 串起来即完整跨应用业务流程。**规则层不限定类别**，以下两种是常见写法：

| 常见写法 | 说明 | 起止 matcher 应用 |
| --- | --- | --- |
| 聚合 stage | 代表一个进程或一个应用多个进程的整体时延；可带 `result` 拆 SUCCESS/ERROR/TIMEOUT 等互斥分支（同 `order`），判定请求结果。 | 该进程/应用的起止 matcher（可跨到请求终点） |
| rpc 调用 stage | 表达跨应用调用时延。**start 在调用方并行段内、end 在接收应用的 matcher**；可选标记，可加多个，由用户挑关键跨应用调用。 | start 在调用方、end 在接收方 |

flow 级 stage 不使用 `sub_process_ids`（同进程内并行由进程级并行聚合 stage 表达，跨应用调用由 rpc 调用 stage 表达）。

### 拦截 stage（`kind = "intercept"`）

过滤被拦截/拒绝的请求。拦截日志种类很多（校验、鉴权、降级、兜底等），用一个拦截 stage 的 `end_matcher_ids` 数组即可覆盖全部拦截结束事件，**任一命中**即结束：

```toml
[[stages]]
id = "STAGE-INTERCEPT"
name = "请求被拦截"
kind = "intercept"
flow_id = "FLOW-A"                       # 或 process_id
start_matcher_id = "LOG-START"           # 复用请求起点
end_matcher_ids = ["LOG-REJECT-1", "LOG-REJECT-2", "LOG-REJECT-3"]
```

- `start_matcher_id` 复用请求起点；owner 可为 `flow_id`（flow 级）或 `process_id`（进程级）。
- **语义：拦截命中优先级最高**——请求在识别窗口内命中任意一个拦截 `end_matcher_ids` → 判定被拦截 → **整个请求丢弃**（它的所有 stage 样本都不进时延统计，也不单独计数）。无论 flow 级还是进程级拦截，命中一律丢整个请求。
- 拦截 stage 不使用 `order` / `result`（它不是结果分支，只是丢弃标记）。
- 普通 stage 保持单个 `end_matcher_id`；只有拦截 stage 用 `end_matcher_ids` 数组。

---

## 与现有 fixture 的一致性

- `templates/rule-package-template/`：三层最小示例，覆盖场景/领域/应用/流程/进程、匹配器与 flow 聚合 / 跨应用 RPC / 进程内 stage / 拦截 stage（`kind="intercept"` + `end_matcher_ids`）；演示 `processes.kind`（MAIN）与 `applications.log_prefix`。未用到 `stage.sub_process_ids`。
- `smoke/rule-package/`：冒烟规则包，覆盖 `kind`（MAIN/SUB）、matcher `type`（keyword/regex）、flow 级聚合（`export_enabled=false` 保留冒烟 25 样本标准）、rpc 调用 stage，以及进程级 `sub_process_ids` 并行聚合（`STAGE-P`）。
