Document ID: ARCH-EXTENSION-PATTERNS
Status: Draft
Approved by:
Approved at:
Depends on: ARCH-LIFECYCLE-OVERVIEW, ARCH-LIFECYCLE-STATE, RESP-ISSUE-HANDLING-DESIGN
Supersedes:

# 扩展点与设计模式决策

## 决策原则

只在存在真实变化点时使用设计模式。模式必须服务于解耦、测试和生命周期稳定性，不为命名而引入。

## 决策表

| 位置 | 决策 | 原因 | 第一版实现边界 |
| --- | --- | --- | --- |
| 规则校验 | 采用职责链 | 校验项有顺序、可独立测试，结构解析错误需要短路，其他校验尽量汇总 Issue。 | `RuleValidationChain`。 |
| 日志匹配 | 采用内部策略 | 关键字、正则、结构化字段匹配算法不同，但不需要外部插件。 | `MatcherStrategy`，内置策略注册。 |
| 阶段计算 | 不采用策略 | 第一版阶段时延都是 `end - start`，差异只是语义和校验。 | 单一 `StageLatencyCalculator`。 |
| 时延分析流程 | 采用显式流水线 | 分析步骤固定，便于定位问题和做冒烟测试。 | `scope -> scenario -> request -> match -> stage -> statistics -> assemble`。 |
| 应用边界 | 采用拦截器 | 加载、激活规则、分析、导出需要统一计时、日志、异常转换和操作上下文。 | 应用层拦截器，不放业务规则。 |
| 问题处理 | 采用处理器注册表 | category 决定接收方，level 决定处理策略，表驱动比职责链更直观。 | `CategoryHandlerRegistry + SeverityPolicy`。 |
| 进度通知 | 采用监听器 | 进度是旁路通知，UI 是独立消费者。 | `ProgressListener`，失败不影响主流程。 |
| 工厂 | 不采用 | 规则集只有一种产品，不存在多产品族。 | 使用 `Loader + Validator + Assembler`。 |
| 外部插件 | 不采用 | 第一版没有独立安装、版本兼容、加载隔离需求。 | 只保留内部接口边界。 |
| 状态模式 | 不采用 | 状态转换简单，应用服务可控。 | 明确状态字段。 |
| 领域事件总线 | 不采用 | 当前没有多个独立消费者需要可靠事件交付。 | 同步调用和进度监听足够。 |

## 规则校验职责链

```text
RawRuleConfig
  -> SchemaVersionValidator
  -> UniqueIdValidator
  -> ReferenceValidator
  -> DomainApplicationProcessValidator
  -> ScenarioValidator
  -> MatcherValidator
  -> StageValidator
  -> RuleValidationResult
```

执行策略：

- TOML 解析失败和基础结构错误短路。
- 引用、场景、matcher、stage（含 role / sub_process_ids）校验尽量继续执行并汇总 Issue。
- 任一 `EXCEPTION` 存在时不能激活规则。
- `TIP` 和 `WARNING` 可以随结果返回，由接收方按等级处理。

## 日志匹配内部策略

```text
MatcherStrategy
  -> KeywordMatcherStrategy
  -> RegexMatcherStrategy
```

策略输入是标准化日志记录和 matcher 配置，输出是是否命中以及命中上下文。策略不读取文件，不访问 UI，不修改分析状态。

第一版不允许用户安装自定义 matcher 插件。后续如果确实需要外部扩展，再在 Phase 4 或后续版本单独设计插件加载、版本兼容和失败隔离。

## 时延分析流水线

固定流水线：

```text
AnalysisScopeResolver
  -> ScenarioRuleResolver
  -> RequestRecognizer
  -> RequestLogMatcher
  -> StageLatencyCalculator
  -> LatencyStatisticsAggregator
  -> LatencyAnalysisAssembler
```

流水线只接收不可变数据集和有效规则，不读取 TOML，不操作 UI，不写 CSV。任一 `EXCEPTION` 使本次分析不发布结果，上一份有效结果保持可用。

## 应用层拦截器

拦截器只包围用例边界：

- 加载日志。
- 激活规则。
- 执行分析。
- 导出 CSV。

职责：

- 创建操作上下文。
- 统一计时和诊断日志。
- 捕获未转换异常并转为 `SYSTEM / EXCEPTION`。
- 执行失败恢复策略。

约束：

- 不做日志匹配。
- 不做时延计算。
- 不判断业务场景是否生效。
- 不拼接 UI 文案。

## 问题处理注册表

```text
Issue
  -> CategoryHandlerRegistry
  -> SeverityPolicy
  -> Receiver
  -> UserMessageProjection
```

category 决定接收方，level 决定继续、降级、跳过或中断。当前只定义分类和处理流程，不定义具体错误码序号。

后续具体错误码可以使用：

```text
<CATEGORY>-<LEVEL>-<SEQUENCE>
```

## 进度监听器

`ProgressListener` 用于加载、校验、分析和导出过程的进度通知。

- 监听器只接收进度快照。
- 监听器失败记录日志，不中断主流程。
- 监听器不改变领域对象。
- 第一版不引入领域事件总线。

## 插件机制取舍

第一版不做插件框架，只保留内部扩展接口。原因：

- 当前变化点都能由内部策略、职责链和流水线解决。
- 外部插件会增加清单、兼容性、加载隔离、失败隔离、配置管理和卸载重载成本。
- 当前用户是本地测试和开发人员，不需要第三方能力独立安装。

## 工厂模式取舍

不引入 `RuleSetFactory` 或 `RuleSetSnapshotFactory`。

原因：

- `RuleSet` 只有一种产品。
- 快照只是当前规则集的只读版本，不是另一类产品。
- 当前差异来自加载内容、校验结果和版本状态，不来自产品族变化。

采用更直接的生命周期对象：

```text
RuleSetLoader
  -> RuleSetValidator
  -> RuleSetAssembler
  -> RuleSet
```
