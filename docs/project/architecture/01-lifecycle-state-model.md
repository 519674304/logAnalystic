Document ID: ARCH-LIFECYCLE-STATE
Status: Draft
Approved by:
Approved at:
Depends on: ARCH-LIFECYCLE-OVERVIEW, RESP-RULE-LIFECYCLE-DESIGN, RESP-LATENCY-PIPELINE-DESIGN
Supersedes:

# 生命周期状态模型

## 日志数据集生命周期

```text
EMPTY
  -> LOADING
  -> ACTIVE
  -> FAILED
```

| 状态 | 含义 | 允许行为 |
| --- | --- | --- |
| `EMPTY` | 未成功加载日志。 | 可选择日志文件并开始加载。 |
| `LOADING` | 正在读取、解析和建立索引。 | 禁止重复加载；旧数据集仍可查看。 |
| `ACTIVE` | 当前日志数据集可用。 | 可搜索、查看上下文、执行时延分析。 |
| `FAILED` | 最近一次加载失败。 | 保留上一份成功数据集；可重新加载。 |

新日志加载成功后原子替换当前数据集。加载失败时，上一份 `ACTIVE` 数据集保持可用。

## 规则集生命周期

```text
ACTIVE_RULE
  -> EDITING_DRAFT
  -> VALIDATING
  -> ACTIVE_RULE
  -> VALIDATION_FAILED
```

| 状态 | 含义 | 允许行为 |
| --- | --- | --- |
| `ACTIVE_RULE` | 当前可用于分析的规则集。 | 可由导入后的列表选择、详情编辑和删除流程维护，并生成分析快照。 |
| `EDITING_DRAFT` | 用户正在编辑或导入候选 TOML。 | 不影响当前规则。 |
| `VALIDATING` | 正在执行规则校验。 | 禁止激活候选规则。 |
| `VALIDATION_FAILED` | 候选规则校验失败。 | 当前规则保持不变，用户修正后重新校验。 |

规则集激活流程：

```text
TOML
  -> RawRuleConfig
  -> RuleSetValidator
  -> RuleSetAssembler
  -> RuleSet
  -> ActiveRuleSet
```

不引入 `RuleSetFactory`。规则集只有一种产品，差异来自加载内容、校验结果、启用状态和版本来源。工厂模式留给存在多种产品族或多种创建产品的场景。

快照由当前 `RuleSet` 派生为只读数据，不需要单独的快照工厂。

## 分析运行生命周期

```text
IDLE
  -> RUNNING
  -> SUCCEEDED
  -> FAILED
```

补充展示状态：

| 状态 | 含义 | 允许行为 |
| --- | --- | --- |
| `STALE` | 日志或规则变化后，旧分析结果已经过期。 | 可查看，不可导出，不作为当前结果。 |
| `EMPTY` | 分析成功，但没有可分析请求。 | 可提示用户，无失败恢复动作。 |

分析运行规则：

- 第一版同一时间只允许一个分析运行。
- 不支持取消。
- 不支持自动重试。
- 用户修正规则、日志或时间范围后手动重新运行。
- 新结果成功发布前，旧结果继续可用。
- 新结果发布成功后，原子替换旧结果。
- 新分析失败时，旧结果保持可用。

## 过期与恢复

当日志数据集或规则集变化时：

```text
CurrentAnalysisResult
  -> STALE
```

`STALE` 结果只读可见，但不可导出。下一次分析成功后，新结果成为当前结果，旧结果释放引用。

## 状态模式取舍

第一版不采用 State 设计模式。当前状态转换简单，使用明确状态字段和应用服务控制即可。领域对象负责保护结果一致性，应用服务负责按钮可用性、任务互斥、失败恢复和结果替换。
