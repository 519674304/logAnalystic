Document ID: CTX-RULE-RELATIONSHIP
Status: Draft
Approved by:
Approved at:
Depends on: CTX-RULE-CONFIG, BASELINE-PRIMARY, REQ-RULESET, REQ-REQUEST, REQ-LATENCY
Supersedes:

# 规则集数据关系说明

## 目的

本文专门说明业务规则集内各类子元素的分类、归属、引用和校验关系。

`RuleSet` 是整份业务规则文件的聚合根。导入、校验和保存时，系统都以完整 `RuleSet` 为单位处理，不把 `log_matchers`、`stages` 或 `business_flow` 拆成互不关联的散装规则。

## 总体结构

```text
RuleSet
  -> AnalysisScenario[]
  -> BusinessDomain[]
       -> Application[]
            -> BusinessProcess[]
                 -> LogMatcher[]
                 -> StageDefinition[]
  -> ProcessRelation[]
  -> SubprocessGroup[]
  -> BusinessFlow
       -> MatchingPolicy
       -> EndResult[]
       -> Branch[]
```

上面的缩进表示主要业务归属，不表示所有字段都必须通过嵌套 TOML 写法表达。当前基线 TOML 使用扁平数组加 ID 引用，因此真实关系由各元素的稳定 ID 字段连接。

## 推荐 TOML 拆分

单文件 TOML 适合机器导入，但不适合人维护。规则作者阅读时会同时看到业务拓扑、关键日志、时延阶段和流程编排，容易混淆“归属关系”和“引用关系”。

后续推荐把一整份规则集组织成规则包目录：

```text
business-rules/
  -> manifest.toml
  -> scenarios.toml
  -> topology.toml
  -> matchers.toml
  -> relations.toml
  -> stages.toml
  -> flow.toml
```

规则包仍然只产生一个 `RuleSet`。拆分只是为了让不同作用层级分开维护，不改变聚合根和完整校验原则。

| 文件 | 内容 | 只负责回答的问题 |
| --- | --- | --- |
| `manifest.toml` | `[rule_set]`、规则包版本、`[package.layers]` 文件映射 | 这是谁的规则集、要导入哪个版本、每层内容在哪个文件。 |
| `scenarios.toml` | `[[analysis_scenarios]]` | 有哪些分析视角。 |
| `topology.toml` | `[[domains]]`、`[[applications]]`、`[[processes]]` | 被分析系统长什么样，进程树如何归属。 |
| `matchers.toml` | `[[log_matchers]]` | 哪些日志行代表关键业务事件。 |
| `relations.toml` | `[[process_relations]]`、`[[subprocess_groups]]` | 进程之间如何调用，哪些子进程构成一组。 |
| `stages.toml` | `[[stages]]` | 哪两个关键事件之间要计算时延。 |
| `flow.toml` | `[business_flow]` | 一次请求如何开始、结束、分支和排序。 |

当前分层样例位于 `../baselines/business-rules-split/`。现有 `../baselines/business-rules.example.toml` 继续保留为单文件兼容基线。

### 拆分后的读取顺序

```text
manifest.toml（读取 package.version 和 package.layers）
  -> scenarios.toml
  -> topology.toml
  -> matchers.toml
  -> relations.toml
  -> stages.toml
  -> flow.toml
  -> 对应版本的 RuleSetCandidate
  -> 完整校验
  -> RuleSetSnapshot
```

这个顺序也符合人的理解顺序：先知道规则包身份，再知道分析视角，再看业务系统结构，然后看日志事件、跨进程关系、时延阶段，最后看完整业务流程怎么编排。

## 元素分类

| 分类 | TOML 节点 | 领域名称 | 作用 |
| --- | --- | --- | --- |
| 规则集元信息 | `[rule_set]` | `RuleSet` | 标识整份规则集、schema 版本和业务版本。 |
| 场景 | `[[analysis_scenarios]]` | `AnalysisScenario` | 定义一次分析关注的范围，筛选有效 matcher 和 stage。 |
| 业务领域 | `[[domains]]` | `BusinessDomain` | 表示被分析系统的业务域，归集应用。 |
| 应用 | `[[applications]]` | `Application` | 表示日志所属应用，提供应用 ID 和日志前缀。 |
| 业务进程 | `[[processes]]` | `BusinessProcess` | 表示一次请求中的主进程或子进程，可形成父子树。 |
| 关键日志规则 | `[[log_matchers]]` | `LogMatcher` | 定义如何从日志中识别关键业务事件。 |
| 进程关系 | `[[process_relations]]` | `ProcessRelation` | 定义跨进程调用、传递或依赖关系。 |
| 子进程组 | `[[subprocess_groups]]` | `SubprocessGroup` | 定义同一个父进程下的一组子进程，支持并行组。 |
| 时延阶段 | `[[stages]]` | `StageDefinition` | 定义用哪两个关键日志计算一个阶段时延。 |
| 业务流程 | `[business_flow]` | `BusinessFlow` | 定义请求入口、结束结果、流程进程、分支和阶段顺序。 |

## 主归属关系

### RuleSet 拥有所有子元素

`RuleSet` 直接拥有所有规则元素。每类元素的 `id` 在本类型内必须唯一，例如 `APP-A` 只需要在 `applications` 内唯一，`DEF-A-PREPARE` 只需要在 `stages` 内唯一。

跨类型引用必须指向存在的目标，并且目标类型必须匹配。例如 `stage.start_matcher_id` 只能引用 `log_matchers.id`，不能引用 `stages.id`。

### Domain 拥有 Application

`domains.application_ids` 列出归属该业务域的应用。

`applications.domain_id` 反向指向所属业务域。两边应保持一致：如果 `DOMAIN-ORDER.application_ids` 包含 `APP-A`，则 `APP-A.domain_id` 应为 `DOMAIN-ORDER`。

### Application 拥有 Process 和 Matcher

`processes.application_id` 表示进程在哪个应用内执行。

`log_matchers.application_id` 表示关键日志来自哪个应用。它用于过滤、展示和定位日志来源，不用于自动推断流程结构。

### Process 形成父子树

`processes.kind = "MAIN"` 表示主进程，通常没有 `parent_process_id`。

`processes.kind = "SUB"` 表示子进程，必须通过 `parent_process_id` 归属于某个父进程。进程父子关系必须无环，且 `business_flow.root_process_id` 必须指向主流程根进程。

示例关系：

```text
PROCESS-A-MAIN
  -> PROCESS-B-HANDLE
       -> PROCESS-B-PREPARE
  -> PROCESS-C-HANDLE
```

### Process 拥有业务事件

`log_matchers.process_id` 表示该关键日志发生在哪个业务进程内。

一个进程可以拥有多个 matcher，例如主进程可以同时拥有请求开始、并行开始、并行结束和请求完成等关键日志。

### Stage 归属于流程位置

`stages` 不只是日志匹配规则，而是时延计算定义。

每个 stage 通过 `start_matcher_id` 和 `end_matcher_id` 指定计算边界。不同阶段类型使用不同归属字段：

| Stage 类型 | 主要归属字段 | 说明 |
| --- | --- | --- |
| `APPLICATION_PROCESSING` | `process_id`、`application_id` | 应用内某个业务进程的处理耗时。 |
| `APPLICATION_INTERNAL` | `process_id`、`application_id` | 应用内部细分阶段，通常服务于完整链路场景。 |
| `RPC_TRANSFER` | `relation_id`、`source_application_id`、`target_application_id` | 跨应用或跨进程传递耗时。 |
| `PARALLEL_GROUP` | `process_id`、`subprocess_group_id` | 一组子进程整体等待耗时。 |

## 横向引用关系

### Scenario 筛选有效规则

`analysis_scenarios` 本身不拥有 matcher 或 stage。

matcher 和 stage 通过 `applicable_scenario_ids` 声明自己适用于哪些场景。分析时选择某个场景后，系统只启用该场景覆盖的 matcher 和 stage。

```text
AnalysisScenario
  <- LogMatcher.applicable_scenario_ids
  <- StageDefinition.applicable_scenario_ids
```

全局请求开始和结束 matcher 应覆盖全部分析场景，因为切换场景不重新切分请求。

### Matcher 是阶段边界

matcher 负责识别关键日志，stage 负责计算两个关键日志之间的时延。

```text
LogMatcher(LOG-REQUEST-START)
  -> StageDefinition.start_matcher_id

LogMatcher(LOG-A-PARALLEL-START)
  -> StageDefinition.end_matcher_id
  -> StageDefinition.start_matcher_id
```

同一个 matcher 可以同时作为一个阶段的结束点和另一个阶段的开始点。

### ProcessRelation 描述跨进程连接

`process_relations` 用于表达两个进程之间的调用或传递关系。

| 字段 | 指向 | 说明 |
| --- | --- | --- |
| `source_process_id` | `processes.id` | 发起进程。 |
| `target_process_id` | `processes.id` | 目标进程。 |
| `start_matcher_id` | `log_matchers.id` | 调用或传递开始事件。 |
| `end_matcher_id` | `log_matchers.id` | 调用或传递到达事件。 |
| `latency_stage_id` | `stages.id` | 表示这段关系耗时的 stage。 |

`RPC_TRANSFER` 类型的 stage 通常通过 `relation_id` 回指 `process_relations.id`。

### SubprocessGroup 描述一组子进程

`subprocess_groups` 用于表达同一父进程下的多个子进程集合。

| 字段 | 指向 | 说明 |
| --- | --- | --- |
| `parent_process_id` | `processes.id` | 这组子进程共同归属的父进程。 |
| `trigger_stage_id` | `stages.id` | 进入该子进程组前的触发阶段。 |
| `child_process_ids` | `processes.id[]` | 组内子进程。 |
| `join_matcher_id` | `log_matchers.id` | 父进程确认子进程汇总完成的关键日志。 |
| `latency_stage_id` | `stages.id` | 表示整组等待耗时的 stage。 |

并行组要求 `mode = "PARALLEL"`，且 `child_process_ids` 至少包含一个子进程。组内子进程必须是 `parent_process_id` 的后代。

## BusinessFlow 关系

`business_flow` 是规则集中最终被请求识别和时延分析消费的流程入口。

| 字段 | 指向 | 说明 |
| --- | --- | --- |
| `domain_id` | `domains.id` | 该流程所属业务域。 |
| `root_process_id` | `processes.id` | 请求主进程根节点。 |
| `request_start_matcher_id` | `log_matchers.id` | 创建一次请求的全局开始日志。 |
| `process_ids` | `processes.id[]` | 该流程覆盖的所有进程。 |
| `subprocess_group_ids` | `subprocess_groups.id[]` | 该流程使用的子进程组。 |
| `end_results[].matcher_id` | `log_matchers.id` | 请求结束事件及其结果。 |
| `branches[].stage_ids` | `stages.id[]` | 某个流程分支下的阶段顺序。 |

`business_flow.matching.strategy = "ordered_first_match"` 表示同一请求范围内按规则顺序取第一次有效命中。

`business_flow.branches` 决定展示和导出时的阶段顺序。`stage.order` 是阶段自身的排序值，分支中的 `stage_ids` 是某条业务路径上的显式编排；两者必须保持一致。

## 一次完整计算链路

下面以基线规则为例说明从规则到结果的关系：

```text
用户选择 SCENARIO-CORE
  -> 过滤出适用于 SCENARIO-CORE 的 log_matchers 和 stages
  -> business_flow.request_start_matcher_id 找到 LOG-REQUEST-START
  -> 日志命中 LOG-REQUEST-START 后创建一次请求
  -> business_flow.end_results 匹配 SUCCESS 或 FAILED 结束日志
  -> 在请求范围内查找各 stage 的 start/end matcher
  -> 根据 business_flow.branches[].stage_ids 输出阶段明细
  -> 根据 stage.application_id、process_id、relation_id、subprocess_group_id 投影到 UI 和 CSV
```

## 必须校验的不变量

- `RuleSet` 元信息必须存在，`id`、`schema_version`、`business_version` 必须明确。
- 每类元素的 `id` 在本类型内唯一。
- 所有 ID 引用必须存在，且引用目标类型正确。
- `domains.application_ids` 与 `applications.domain_id` 必须一致。
- `processes.parent_process_id` 不能形成环。
- `business_flow.root_process_id` 必须存在，并且通常指向 `kind = "MAIN"` 的进程。
- `business_flow.process_ids` 必须覆盖流程实际使用的进程。
- `business_flow.request_start_matcher_id` 必须指向启用的 matcher。
- `business_flow.end_results[].matcher_id` 必须指向启用的 matcher。
- `log_matchers.process_id` 和 `log_matchers.application_id` 必须存在且互相匹配。
- `stages.start_matcher_id` 和 `stages.end_matcher_id` 必须指向启用的 matcher。
- 已启用 stage 的起止 matcher 必须覆盖该 stage 的全部适用场景。
- `process_relations.latency_stage_id` 必须指向表达该关系耗时的 stage。
- `subprocess_groups.latency_stage_id` 必须指向表达该组整体耗时的 stage。
- `subprocess_groups.child_process_ids` 必须至少包含一个子进程。
- `branches[].stage_ids` 必须只引用已定义且适用于该分支场景的 stage。

## 易混概念

| 概念 | 不是 | 正确理解 |
| --- | --- | --- |
| `BusinessDomain` | 软件内部限界上下文 | 被分析业务系统里的业务域。 |
| `Application` | 自动流程推断依据 | 日志来源和展示分组依据。 |
| `LogMatcher` | 时延阶段 | 关键日志识别规则，只提供事件点。 |
| `StageDefinition` | 日志搜索规则 | 时延计算定义，使用两个 matcher 作为边界。 |
| `ProcessRelation` | 进程父子关系 | 跨进程调用或传递关系。 |
| `SubprocessGroup` | 普通进程列表 | 具有共同父进程和汇总点的一组子进程。 |
| `AnalysisScenario` | 独立业务流程 | 对同一流程的分析范围裁剪。 |
| `BusinessFlow` | UI 页面结构 | 请求识别和阶段编排的业务规则入口。 |

## 当前实现投影说明

当前应用服务在导入 TOML 后，会把 `log_matchers` 和 `stages` 投影为 `RuleCatalogRecord`，用于规则页列表、时延分析页面和后续真实计算接入。

该投影不是完整 `RuleSet` 模型，只是面向当前 UI 的规则目录视图：

```text
LogMatcher -> RuleCatalogRecord(record_type = "matcher")
StageDefinition -> RuleCatalogRecord(record_type = "stage")
```

完整规则集关系仍以本文和 `business-rules.example.toml` 为准。后续补齐完整校验和快照时，应保持 `RuleSet` 聚合关系不变，再从中生成前端需要的精简目录。
