Document ID: CTX-RULE-RELATIONSHIP
Status: Draft
Approved by:
Approved at:
Depends on: CTX-RULE-CONFIG, BASELINE-PRIMARY, REQ-RULESET, REQ-REQUEST, REQ-LATENCY
Supersedes: CTX-RULE-RELATIONSHIP (2026-07-09, 2026-08-27)

# 规则集数据关系说明

> 本文因「规则集结构收敛」而修订（原版批准于 2026-07-09，本次修订 2026-08-27）。核心变化：取消 `relations.toml`；取消 `role="start"/"end"` 边界 stage（flow 没有开始/结尾边界概念）；stage 收敛为唯一一种；flow 级 stage 是自定义起止段，不限定类别，常为进程整体聚合（按 `result` 拆分支）与跨应用 RPC；`order` 在每个 owner 内独立编号、仅标记数据；一个进程的所有 stage 与 matcher 与所属应用一致。规则集从「6 层 + 关系」收敛为 3 个文件（`definitions.toml` / `matchers.toml` / `stages.toml`）。

## 目的

本文专门说明业务规则集内各类子元素的分类、归属、引用和校验关系。

`RuleSet` 是整份业务规则文件的聚合根。导入、校验和保存时，系统都以完整 `RuleSet` 为单位处理，不把 `log_matchers`、`stages` 或 `flows` 拆成互不关联的散装规则。

## 总体结构

```text
RuleSet
  -> AnalysisScenario[]
  -> BusinessDomain[]
       -> BusinessFlow[]
            -> StageDefinition[]（flow 级：自定义跨应用/多进程流程段）
  -> Application[]
       -> BusinessProcess[]（树，靠 parent_process_id）
            -> StageDefinition[]（进程级：进程内部）
       -> LogMatcher[]
```

上面的缩进表示主要业务归属，不表示所有字段都必须通过嵌套 TOML 写法表达。当前基线 TOML 使用扁平数组加 ID 引用，因此真实关系由各元素的稳定 ID 字段连接。

`flow` 与 `process` 都以 stage 承载时延计算，靠 stage 上的 `flow_id` / `process_id` 区分归属。

## 元素分类

| 分类 | TOML 节点 | 领域名称 | 作用 |
| --- | --- | --- | --- |
| 规则集元信息 | `[rule_set]` | `RuleSet` | 标识整份规则集、schema 版本和业务版本。 |
| 场景 | `[[scenarios]]` | `AnalysisScenario` | 定义一次分析关注的范围，筛选有效 matcher 和 stage。 |
| 业务领域 | `[[domains]]` | `BusinessDomain` | 表示被分析系统的业务域，归集业务流程。 |
| 业务流程 | `[[flows]]` | `BusinessFlow` | 跨 application 的一次业务流程，引用根进程与覆盖进程；不直接感知 matcher，只有 stage。 |
| 应用 | `[[applications]]` | `Application` | 表示日志所属应用，提供应用 ID 和日志前缀，可扩展。 |
| 业务进程 | `[[processes]]` | `BusinessProcess` | 表示一次请求中的主进程或子进程，可形成父子树。 |
| 关键日志规则 | `[[log_matchers]]` | `LogMatcher` | 定义如何从日志中识别关键业务事件。 |
| 时延阶段 | `[[stages]]` | `StageDefinition` | 计算 start/end matcher 之间时延；owner 区分 flow/process，`result` 表达结果/异常分支。 |

## 推荐 TOML 拆分

单文件 TOML 适合机器导入，但不适合人维护。推荐把一整份规则集组织成规则包目录：

```text
business-rules/
  -> manifest.toml
  -> definitions.toml
  -> matchers.toml
  -> stages.toml
```

规则包仍然只产生一个 `RuleSet`。拆分只是为了让不同作用层级分开维护，不改变聚合根和完整校验原则。

| 文件 | 内容 | 只负责回答的问题 |
| --- | --- | --- |
| `manifest.toml` | `[rule_set]`、规则包版本、`[package.layers]` 文件映射 | 这是谁的规则集、要导入哪个版本、每层内容在哪个文件。 |
| `definitions.toml` | `[[scenarios]]`、`[[domains]]`、`[[applications]]`、`[[flows]]`、`[[processes]]` | 有哪些分析视角、被分析系统长什么样、流程怎么编排、进程树如何归属。 |
| `matchers.toml` | `[[log_matchers]]` | 哪些日志行代表关键业务事件。 |
| `stages.toml` | `[[stages]]` | 哪两个关键事件之间要计算时延，stage 属于进程还是流程，以及结果/异常分支。 |

`definitions.toml` 承载静态结构（域 → 应用 → 进程树）与流程编排；stage、matcher 的关系由 `stages.toml`、`matchers.toml` 的引用字段表达。

### 拆分后的读取顺序

```text
manifest.toml（读取 package.version 和 package.layers）
  -> definitions.toml
  -> matchers.toml
  -> stages.toml
  -> 对应版本的 RuleSetCandidate
  -> 完整校验
  -> RuleSetSnapshot
```

这个顺序也符合人的理解顺序：先知道规则包身份，再知道分析视角与业务系统结构，然后看日志事件、时延阶段。

## 主归属关系

### RuleSet 拥有所有子元素

`RuleSet` 直接拥有所有规则元素。每类元素的 `id` 在本类型内必须唯一，例如 `APP-A` 只需要在 `applications` 内唯一，`STAGE-PAY-RPC` 只需要在 `stages` 内唯一。

跨类型引用必须指向存在的目标，并且目标类型必须匹配。例如 `stage.start_matcher_id` 只能引用 `log_matchers.id`，不能引用 `stages.id`。

### Domain 拥有 Flow

`flows.domain_id` 指向所属业务域。一个业务域可以包含多个业务流程。

### Application 拥有 Process 和 Matcher

`processes.application_id` 表示进程在哪个应用内执行。

`log_matchers.application_id` 表示关键日志来自哪个应用。它用于过滤、展示和定位日志来源。

**一个进程的所有 stage 与 matcher 都归属同一个应用**：进程的 `application_id`（未写时继承父进程）必须与其 stage 起止 matcher 的 `application_id` 一致。子进程是父进程内部的 stage 分组，与应用保持一致。

### Flow 是跨 Application 的编排

`flows` 表达一次跨应用的业务流程。`flows.root_process_id` 指向流程根进程，`flows.process_ids` 列出该流程覆盖的全部进程。流程不直接拥有进程，只通过 ID 引用；进程的父子关系由 `processes.parent_process_id` 表达。

### Process 形成父子树

主进程通常没有 `parent_process_id`。子进程通过 `parent_process_id` 归属于某个父进程，形成无环的父子树。

第二个应用的主进程（例如被跨应用 RPC 进入的支付进程）靠 `application_id` 归属、**不带 `parent_process_id`**，不是第一个应用主进程的子进程。

示例关系：

```text
PROCESS-ORDER（APP-A 主进程）
  -> PROCESS-A（子进程，APP-A）
  -> PROCESS-A1（子进程，APP-A）
PROCESS-PAY（APP-PAY 主进程，无父，由 RPC 进入）
```

### Stage 统一结构，owner 区分归属，result 表达分支

`stages` 只有一种结构。每个 stage 通过 `start_matcher_id` 和 `end_matcher_id` 指定计算边界，通过 owner 字段表达归属：

| owner | 归属 | 含义 |
| --- | --- | --- |
| `process_id` | 进程级 stage（属于 process / application） | 进程内部处理，起止 matcher 都在本进程、与应用一致。 |
| `flow_id` | flow 级 stage（属于 flow / domain） | 自定义起止段，可覆盖一个进程或多个进程、可跨应用，串起完整业务流程。 |

**flow 级 stage 不限定类别：**

flow 级 stage 是用户自定义起止（`start_matcher_id` → `end_matcher_id`）的时延段，可覆盖一个进程、一个应用的多个进程，或跨应用；一串 flow 级 stage 按 `order` 串起来即完整跨应用业务流程。**规则层不加限制**，以下两种是常见写法：

- **聚合 stage**：代表一个进程或一个应用多个进程的整体时延；可带 `result` 拆 SUCCESS/ERROR 等分支（同 `order`），判定请求结果。flow 只见各进程整体时延，看不到进程内部细节 stage。
- **跨应用 RPC 边界**：`start_matcher_id` 落在调用方应用、`end_matcher_id` 落在接收方应用。因其起止 matcher 分属不同应用，归属 flow/domain 层，可选、可加多个，由用户挑关键跨应用调用。

`result` 表达结果/异常分支（如 `SUCCESS / ERROR`）。同 `order` 的多个 `result` 分支 stage 在定义上都存在，但**实际执行搜索日志时，同一 `order` 只会命中一个**——由命中的 `end_matcher_id` 决定本次请求/进程走了哪个分支。

`order` 在每个 owner 内独立从 1 编号，**仅标记数据**，不代表唯一：同 `order` 的多个 `result` 分支 stage 有唯一 `id`、共享 `order`。

flow 没有 `role="start"/"end"` 边界概念；请求/进程的开始与结尾由 stage 的 start/end matcher 自然表达，不单独建模边界 stage。

### 拦截 stage（`kind = "intercept"`）——过滤被拦截请求

拦截日志种类很多（校验、鉴权、限流、降级、兜底等）。用一个 `kind="intercept"` 的 stage，用 `end_matcher_ids` 数组覆盖全部拦截结束事件，**任一命中**即结束，避免为每种拦截日志各写一个 result 分支：

- `start_matcher_id` 复用请求起点；owner 可为 `flow_id` 或 `process_id`。
- **语义：拦截命中优先级最高**——请求在识别窗口内命中任意一个拦截 `end_matcher_ids` → 判定被拦截 → **整个请求丢弃**（所有 stage 样本不进时延统计，也不单独计数）。无论 flow 级还是进程级拦截，命中一律丢整个请求。
- 拦截 stage 不使用 `order` / `result`（只是丢弃标记，不是结果分支）。
- 普通 stage 保持单个 `end_matcher_id`；只有拦截 stage 用 `end_matcher_ids` 数组。

## 横向引用关系

### Scenario 筛选有效规则

`scenarios` 本身不拥有 matcher 或 stage。

matcher 和 stage 通过 `applicable_scenario_ids` 声明自己适用于哪些场景。分析时选择某个场景后，系统只启用该场景覆盖的 matcher 和 stage。

```text
AnalysisScenario
  <- LogMatcher.applicable_scenario_ids
  <- StageDefinition.applicable_scenario_ids
```

### Matcher 是阶段边界

matcher 负责识别关键日志，stage 负责计算两个关键日志之间的时延。

```text
LogMatcher(LOG-ORDER-START)
  -> StageDefinition.start_matcher_id

LogMatcher(LOG-PAY-CALL)
  -> StageDefinition.end_matcher_id
  -> StageDefinition.start_matcher_id（跨应用 RPC 的起点）
```

同一个 matcher 可以同时作为一个阶段的结束点和另一个阶段的开始点，也可以被不同 owner 的 stage 复用（例如 `LOG-PAY-CALL` 同时是 flow 聚合的 end 与进程内部 stage 的 end）。

### 跨应用 RPC 边界

跨应用传递由 flow 级的 RPC stage 表达：`start_matcher_id` 落在源应用、`end_matcher_id` 落在目标应用，因此该 stage 不属于任何单一应用，归属 flow/domain 层。

```text
BusinessFlow(FLOW-ORDER)
  -> StageDefinition(STAGE-PAY-RPC, flow_id = FLOW, start = LOG-PAY-CALL(APP-A), end = LOG-PAY-RECEIVED(APP-PAY))
```

## BusinessFlow 关系与整体聚合

`flows` 是规则集中最终被请求识别和时延分析消费的流程入口。它只描述结构归属，不直接感知 matcher，只有 stage。

| 字段 | 指向 | 说明 |
| --- | --- | --- |
| `domain_id` | `domains.id` | 该流程所属业务域。 |
| `root_process_id` | `processes.id` | 请求主进程根节点。 |
| `process_ids` | `processes.id[]` | 该流程覆盖的所有进程。 |

flow 的 stage 是自定义起止段，可覆盖一个进程或多个进程、可跨应用；常见写法包括代表各进程/应用整体的聚合 stage（可按 `result` 拆分支）与跨应用 RPC 边界。**flow 看不到进程内部的细节 stage**。

### 结果分支（result stage）承载结尾语义

一个应用整体或一个进程可能有多种结尾（`SUCCESS / ERROR`）。每个结尾对应一个 `result` 分支 stage，它们同 `order`、`result` 不同、`id` 唯一，互为互斥结尾。

命中哪个分支的 `end_matcher_id`，就判定这次请求/进程走了哪个结尾。若同 `order` 的多个分支都命中（日志里多个结尾事件都在），取时间上最先命中的作为最终结尾，其余命中记 Issue，不产生第二个结果。

### 聚合与内部的衔接

flow 的聚合 stage 覆盖某进程「整体」的整段（从该进程入口到出口）。该进程的内部 stage 应恰好铺满这一段，使聚合时延与内部各段对账一致。

## 一次完整计算链路

下面以规则为例说明从规则到结果的关系：

```text
用户选择 SCENARIO-CORE
  -> 过滤出适用于 SCENARIO-CORE 的 log_matchers 和 stages
  -> 各 stage 的 start/end matcher 在请求范围内命中，计算时延
  -> flow 级聚合 stage 给出各进程整体时延；RPC stage 给出跨应用边界时延
  -> 同 order 的多个 result 分支都命中时，取时间最先者，其余记 Issue
  -> 根据 stage 的 process_id / flow_id 投影到 UI 和 CSV
```

## 必须校验的不变量

- `RuleSet` 元信息必须存在，`id`、`schema_version`、`business_version` 必须明确。
- 每类元素的 `id` 在本类型内唯一。
- 所有 ID 引用必须存在，且引用目标类型正确。
- `processes.parent_process_id` 不能形成环。
- `flows.root_process_id` 必须存在。
- `flows.process_ids` 必须覆盖流程实际使用的进程。
- `flows.domain_id` 必须指向已定义域。
- `processes.application_id` 与 `log_matchers.application_id` 必须指向已定义应用。
- **进程的 stage 起止 matcher 的 `application_id` 必须与该进程（或其父进程）一致。**
- `stage.start_matcher_id` 和 `stage.end_matcher_id` 必须指向启用的 matcher。
- `stage.process_id` 与 `stage.flow_id` 必须二选一存在，不能同时为空或同时存在。
- flow 级 stage 起止 matcher 可属于同一应用或多个应用（跨应用合法），规则层不限制。
- 同 `order` 的多个 `result` 分支 stage 的 `result` 必须互不相同（互斥分支），且 `id` 唯一。
- `stage.sub_process_ids` 只能出现在进程级并行聚合 stage 上，且引用的进程必须是该 flow 覆盖的子进程。
- `stage.end_matcher_ids`（数组）只能出现在 `kind="intercept"` 的 stage 上，且每个引用都必须指向启用的 matcher；普通 stage 不得用数组。
- 拦截命中（任一 `end_matcher_ids`）优先级最高：无论 flow 级还是进程级，命中即整个请求丢弃，不进任何时延统计。
- 已启用 stage 的起止 matcher 必须覆盖该 stage 的全部适用场景。

## 易混概念

| 概念 | 不是 | 正确理解 |
| --- | --- | --- |
| `BusinessDomain` | 软件内部限界上下文 | 被分析业务系统里的业务域。 |
| `BusinessFlow` | UI 页面结构 | 跨 application 的一次业务流程，请求识别和阶段编排的入口。 |
| `Application` | 自动流程推断依据 | 日志来源和展示分组依据。 |
| `LogMatcher` | 时延阶段 | 关键日志识别规则，只提供事件点。 |
| `StageDefinition` | 日志搜索规则 | 时延计算定义，使用两个 matcher 作为边界，owner 区分 process/flow，result 表达结果/异常分支。 |
| `result` 分支 stage | 独立的开始/结尾配置 | 一次请求/进程的一种结果；同 order 的多个 result 分支互为互斥，执行时只命中一个。 |
| `flow 级 stage` | 进程内部细节 | flow 级 stage 表达自定义的跨应用/多进程流程段，看不到进程内部细节 stage。 |
| 拦截 stage（`intercept`） | 一个结果分支 | 丢弃标记：`end_matcher_ids` 任一命中即整请求丢弃，不进任何时延统计；不做业务含义。 |
| `definitions.toml` | 拓扑图的数据源 | 场景/领域/应用/流程/进程的静态定义；拓扑图要根据完整关系渲染。 |
| `AnalysisScenario` | 独立业务流程 | 对同一流程的分析范围裁剪。 |

## 当前实现投影说明

当前应用服务在导入 TOML 后，会把 `log_matchers` 和 `stages` 投影为 `RuleCatalogRecord`，用于规则页列表、时延分析页面和后续真实计算接入。

该投影不是完整 `RuleSet` 模型，只是面向当前 UI 的规则目录视图：

```text
LogMatcher -> RuleCatalogRecord(record_type = "matcher")
StageDefinition -> RuleCatalogRecord(record_type = "stage")
```

完整规则集关系仍以本文为准。后续补齐完整校验和快照时，应保持 `RuleSet` 聚合关系不变，再从中生成前端需要的精简目录。
