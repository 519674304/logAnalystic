# 时延分析流程重新处理

## Goal

让用户在页面上用**已分析好的 matcher / stage 作为积木**，编排「诊断工作流」——针对某类反复出现的问题（例：用户提问唤不醒），描述「出现哪些命中 / 缺失哪些 stage / 某阶段是否未闭合」等判定条件；保存后，可对任意日志目录重新运行，直接得出「命中哪些证据、结论是什么」，而不用为每种问题单独写代码。

核心原则：**基于建模的分析，不用单独处理**——诊断工作流只调用既有模型的接口（`LatencyAnalyzer` / `MarkerMatcher` / `SequentialStackSplitter`），不重新解析日志、不复刻规则匹配。

---

## 总体流程（七步流水线）

```
日志 → 时间过滤 → start 有效处理 → matcher 匹配 → start 分组 → matcher 去重 → stage 处理
```

| # | 步骤 | 做什么 | 归属 |
| --- | --- | --- | --- |
| 1 | 日志 | 读原始日志 | `RipgrepLogSource`（现有） |
| 2 | 时间过滤 | 按时间窗保留条目 | `RipgrepLogSource::entries(dir, range)`（现有） |
| 3 | start 有效处理（去掉拦截的） | 用 `request_starts` + `intercept_ends` 做栈式处理，产出**存活 start 边界** | `SequentialStackSplitter`（收窄） |
| 4 | matcher 匹配 | 用全部 matcher（start / intercept / stage）对条目匹配，标记命中 | 新（统一一步） |
| 5 | start 分组 | 每条 entry 归到「最近的前一个存活 start 边界」 | 新 |
| 6 | matcher 去重 | 去掉重复的 start matcher 与 intercept matcher（**都删掉**），stage marker 组内保留首次命中 | 新（能力已在「取首次命中」里） |
| 7 | stage 处理 | 逐 stage 产出结果（时延 / 存在 / 未闭合） | `LatencyAnalyzer`（改造） |

**`intercept` 的语义 = 唤醒被拦截。** 在「用户提问唤不醒」这类场景里，`start` 标记一次唤醒尝试的起点，`intercept` 标记这次唤醒尝试**被拦截**（被更高优先级打断 / 超时 / 唤醒校验未通过等），即这次尝试**没有成为有效请求**。它区别于 `end`（正常结束边界）。

**核心语义：`intercept` 只丢 start 边界，不丢条目。** 被 pop 掉的 start 不再是「有效请求」的边界，但它下面压着的条目**照常流到下一个存活 start 的组里**，由后续的 matcher 匹配 / 去重 / stage 处理决定去留——不因拦截而丢日志信息。这些条目正是诊断「为什么被拦截 / 为什么唤不醒」的关键证据。

**三种 matcher，按 role 分家：**

| role | 层级 | 用途 | 在哪一步消耗 |
| --- | --- | --- | --- |
| `start` | flow 级 | 产出存活 start 边界 | step 3（push 边界）；step 6 去重时**删掉** |
| `intercept` | flow 级 | 标记唤醒被拦截 | step 3（pop 边界）；step 6 去重时**删掉** |
| `stage start/end` | process 级 | 产 stage 结果 | step 6 组内去重；step 7 处理 |

step 4「matcher 匹配」把三类都匹配上，step 6「matcher 去重」把 flow 级的 `start` / `intercept` 命中**都删掉**（它们的职责在 step 3 已完成，不该进入 stage 处理），只留下 `stage start/end` 命中做「组内同一 marker 保留首次命中」。

---

## 贯穿示例（整条流水线走一遍）

原始日志（时间过滤后，两条请求）：

```
start1 → a → start2 → b → intercept → c → d → end
start3 → a → b → c → d → end
```

### step 3 start 有效处理（栈）

| 条目 | 动作 | 栈 |
| --- | --- | --- |
| start1 | push B1 | [B1] |
| a | 不动 | [B1] |
| start2 | push B2 | [B1, B2] |
| b | 不动 | [B1, B2] |
| intercept | pop B2 | [B1] |
| c / d / end | 不动 | [B1] |
| start3 | push B3 | [B1, B3] |
| a / b / c / d / end | 不动 | [B1, B3] |

存活边界：`[B1(start1), B3(start3)]`。start2 被 intercept pop，不再是边界。

### step 5 start 分组（每条归「最近的前一个存活边界」）

- B1 段：`start1 → a → start2 → b → intercept → c → d → end`
- B3 段：`start3 → a → b → c → d → end`

start2 虽被 pop，它的条目仍在，归 B1；intercept 之后的 c / d / end 也归 B1。

### step 6 matcher 去重（去掉多余的 start matcher 与 intercept matcher）

- B1 段：删 `start2`（重复/被拦截的 start matcher）、删 `intercept`（intercept matcher）→ `start1 → a → b → c → d → end`
- B3 段：无 start/intercept 冗余 → 不变

### step 7 stage 处理

对 `start1 → a → b → c → d → end` 与 `start3 → a → b → c → d → end` 两段做 stage start/end 匹配（见章节二）。

---

## 章节一：start 有效处理 —— `SequentialStackSplitter` 栈式语义

### 职责（收窄后）

splitter **只确定哪些 start 存活**：不匹配 stage marker、不分组、不去重、不做 stage 处理。

- 输入：`request_starts: Vec<Marker>`、`intercept_ends: Vec<Marker>`，及时间过滤后的条目。
- 输出：`Vec<存活 start 边界>`（按时间序；每个边界 = 触发它的 start 条目，含时间戳）。

### 算法

```
surviving_starts(entries):
  1. 按 (ts_ms, line_no) 稳定排序。
  2. 维护栈 stack: Vec<Boundary>（只存 start 边界，不存条目）。
  3. 顺序扫描每条 entry：
     a. 命中 intercept_ends → pop 栈顶边界（只丢边界，条目不动）。continue。
     b. 命中 request_starts → push 新边界（该条目时间戳）。不关旧边界。
     c. 其它 → 不处理（splitter 不碰条目）。
  4. 返回 stack（栈底→栈顶 = 存活 start 边界，时间序）。
```

> 关键：intercept 只 pop 边界，**不丢条目**。条目的去留由下游「start 分组」决定。

### 示例

**例 1（拦截只丢边界，条目流向下一个存活 start）**

输入：`start₁ - a - b - start₂ - a - intercept - c - d - end`

| 步骤 | 条目 | 栈 |
| --- | --- | --- |
| push | `start₁` | `[B₁]` |
| （a/b） | 不处理 | `[B₁]` |
| push | `start₂` | `[B₁, B₂]` |
| （a） | 不处理 | `[B₁, B₂]` |
| intercept | `intercept` | pop B₂ → `[B₁]` |
| （c/d/end） | 不处理 | `[B₁]` |

产出：存活边界 `[B₁]`。下游分组：a、b、a、c、d、end 全归 B₁ → 去重成 `a-b-c-d-end`。

**例 2（唯一条目保留）**

输入：`start₁ - x - start₂ - y - intercept - z - end`（x、y、z 互不相同）

存活边界 `[B₁]`。下游分组：x、y、z、end 全归 B₁，去重后 `x-y-z-end`（**y 保留**）。

### 与现状差异

| 维度 | 现状（单槽） | 新（栈式，只定边界） |
| --- | --- | --- |
| `start` 命中 | 关旧段 + 开新段 | 只 push 边界，不关旧 |
| `intercept` 命中 | 清空 `current`（**连条目一起丢**） | 只 pop 边界（**条目保留**） |
| 输出 | `Vec<Request>`（已分组） | `Vec<存活 start 边界>`（未分组） |
| `end` | 普通条目 | 不变：普通条目，**非边界** |
| 拆分依据 | start | start（明确：end 不参与拆分） |

> 行为变更：intercept 从「丢整段（含条目）」改为「只丢边界」。现状里 `intercept_drops_current_request` 的预期（1 段）不变，但段内容由「含 start 条目的整段」变为「边界 + 归其名下的非 start 条目」，需同步更新该测试与后续「start 分组」一起定义。

---

## 章节二：下游 —— matcher 匹配 / 分组 / 去重 / stage 处理

### step 4–6 落点

| 步骤 | 输入 | 输出 | 实现 |
| --- | --- | --- | --- |
| 4 matcher 匹配 | 条目 + 全部 matcher（start / intercept / stage） | 每条条目的 matcher 命中 | 复用 `MarkerMatcher::matches` |
| 5 start 分组 | 条目 + 存活边界 | `Vec<Request>` | 新函数 `group_by_boundaries(entries, boundaries)` |
| 6 matcher 去重 | 段内 matcher 命中 | 去掉 start / intercept 命中，stage marker 保留首次 | 复用 `find_priority_match` 的「取首次命中」 |

step 5 产出**现有的** `Request { id, entries }`（`id` = 存活 start 边界时间戳），下游消费的仍是 `Vec<Request>`，`LatencyAnalyzer` 的输入契约不变。

### step 7：`LatencyAnalyzer` 加诊断入口

现有 `analyze(stages, requests)` **原样保留**给时延面板（只统计闭合样本）。新增：

```rust
impl LatencyAnalyzer {
    /// 诊断证据：每个 stage 无论闭合与否都产出一条 outcome。
    pub fn diagnose(stages: &[StageSpec], requests: &[Request]) -> Result<DiagnosisEvidence, String>;
}

#[derive(Serialize)] #[serde(rename_all = "camelCase")]
pub enum StageState { Closed, Unclosed, Missing }

#[derive(Serialize)] #[serde(rename_all = "camelCase")]
pub struct StageOutcome {
    pub stage_id: String,
    pub state: StageState,               // Closed / Unclosed / Missing
    pub start_timestamp: Option<String>, // Missing 时 None
    pub end_timestamp: Option<String>,   // Unclosed / Missing 时 None
    pub duration_ms: Option<i64>,        // 仅 Closed 有值
}

pub struct RequestEvidence { pub id: String, pub stages: Vec<StageOutcome> }
pub struct DiagnosisEvidence { pub requests: Vec<RequestEvidence> }
```

改动点：把 `analyze_request` 里现在**静默丢弃**的两种情形显式产出——「只有 start 没 end」→ `Unclosed`，「连 start 都没有」→ `Missing`。诊断工作流的三种判定（出现哪些命中 / 缺失哪些 stage / 某阶段是否未闭合）都落在 `state` 上，不需要额外暴露原始 marker 命中。

### scope（v1）

- v1 只做 `Closed / Unclosed / Missing`，stage 仍「取首次对」（现状 `stage_takes_first_pair_only` 不变）。
- 「全配对」（一个 stage 多次出现时产出每一对）**defer**——「唤不醒」用不上，等有工作流真需要时再加。
- 反向查询原语 `find_prev_hit(entries, from_ts_ms, matcher) -> Option<(i64, String)>`（往前回溯找最近命中）**defer**——等有具体诊断条件需要「往前找 X」时再加。
