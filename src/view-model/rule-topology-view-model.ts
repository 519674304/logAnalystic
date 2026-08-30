import type { RulePackageNodeDto, RulePackageVersionDto } from '../api/dto'

// 规则配置页拓扑图：从生效规则包的 definitions/matchers/stages 三层，
// 派生出「应用 → 进程 → 流程编排」的分层节点 + stage 细节 + 连线（fork-join + 跨应用 RPC）。
// 只依赖 RulePackageVersionDto，是纯函数，便于独立核对。
//
// 场景过滤语义与 App.tsx 的 filterRulesByScenario 保持一致：
//   selectedScenarioId 为空 → 不过滤；否则 stage 的 applicable_scenario_ids 为空（适用全部）
//   或包含该场景时才展示。进程骨架（分层 + fork/join）与跨应用 RPC 边是结构性的，始终渲染。

export type RuleTopologyNodeRole = 'start' | 'branch' | 'join'

export interface RuleTopologyStageViewModel {
  id: string
  name: string
  businessMeaning: string
  order: number
  kind: string
  result?: string
  enabled: boolean
  exportEnabled: boolean
  startMatcherId?: string
  startMatcherIds: string[]
  endMatcherId?: string
  endMatcherIds: string[]
  subProcessIds: string[]
  startMatcherName?: string
  startMatcherNames: string[]
  endMatcherName?: string
  endMatcherNames: string[]
}

export interface RuleTopologyNode {
  /** 流程内唯一 id：start/branch 用 processId，join 用 `${processId}::join` */
  id: string
  processId: string
  label: string
  appId: string
  appName: string
  kind: string
  role: RuleTopologyNodeRole
  /** 进程级 stage（按 order 排序，场景过滤后）。join 节点不承载 stage。 */
  stages: RuleTopologyStageViewModel[]
}

/** 一个并行扇出组：父进程 → 各子进程（fork），子进程全部完成后回父进程（join）。 */
export interface RuleTopologyFanOut {
  stageId: string
  label: string
  parentNodeId: string
  subNodeIds: string[]
  joinNodeId: string
}

/** 跨应用 RPC 调用边：flow 级 stage（无 result 分支）起止 matcher 分属不同应用。 */
export interface RuleTopologyRpcEdge {
  stageId: string
  label: string
  from: string
  to: string
  stage: RuleTopologyStageViewModel
}

export interface RuleTopologyFlowViewModel {
  flowId: string
  flowName: string
  domainName: string
  layers: RuleTopologyNode[][]
  fanOuts: RuleTopologyFanOut[]
  rpcEdges: RuleTopologyRpcEdge[]
  /** flow 级聚合 stage（含 result 分支 / 同应用跨度 / 拦截），场景过滤后。 */
  flowStages: RuleTopologyStageViewModel[]
}

export interface RuleTopologyViewModel {
  flows: RuleTopologyFlowViewModel[]
  applications: Array<{ id: string; name: string }>
  scenarios: Array<{ id: string; name: string }>
}

interface TopologyContext {
  applicationNameById: Map<string, string>
  processById: Map<string, { name: string; kind: string; applicationId?: string }>
  domainNameById: Map<string, string>
  matcherApplicationId: Map<string, string>
  matcherNameById: Map<string, string>
}

function fieldString(node: RulePackageNodeDto, name: string): string | undefined {
  const value = node.fields[name]
  return typeof value === 'string' ? value : undefined
}

function fieldStringArray(node: RulePackageNodeDto, name: string): string[] {
  const value = node.fields[name]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function fieldBoolean(node: RulePackageNodeDto, name: string, fallback: boolean): boolean {
  const value = node.fields[name]
  return typeof value === 'boolean' ? value : fallback
}

function fieldNumber(node: RulePackageNodeDto, name: string): number {
  const value = node.fields[name]
  return typeof value === 'number' ? value : 0
}

interface FlowDefinition {
  id: string
  name: string
  domainId?: string
  rootProcessId?: string
  processIds: string[]
}

interface StageDefinition {
  id: string
  name: string
  kind: string
  result?: string
  flowId?: string
  processId?: string
  startMatcherId?: string
  startMatcherIds: string[]
  endMatcherId?: string
  endMatcherIds: string[]
  subProcessIds: string[]
  order: number
  enabled: boolean
  exportEnabled: boolean
  businessMeaning: string
  applicableScenarioIds: string[]
}

function collectDefinitions(version: RulePackageVersionDto) {
  const applications: Array<{ id: string; name: string }> = []
  const scenarios: Array<{ id: string; name: string }> = []
  const processes = new Map<string, { name: string; kind: string; applicationId?: string }>()
  const domains = new Map<string, string>()
  const flows: FlowDefinition[] = []

  for (const layer of version.layers) {
    if (layer.id !== 'definitions') continue
    for (const node of layer.nodes) {
      if (node.nodeType === 'applications') {
        applications.push({ id: node.id, name: node.name })
      } else if (node.nodeType === 'scenarios') {
        scenarios.push({ id: node.id, name: node.name })
      } else if (node.nodeType === 'processes') {
        processes.set(node.id, {
          name: node.name,
          kind: fieldString(node, 'kind') ?? 'MAIN',
          applicationId: fieldString(node, 'application_id'),
        })
      } else if (node.nodeType === 'domains') {
        domains.set(node.id, node.name)
      } else if (node.nodeType === 'flows') {
        flows.push({
          id: node.id,
          name: node.name,
          domainId: fieldString(node, 'domain_id'),
          rootProcessId: fieldString(node, 'root_process_id'),
          processIds: fieldStringArray(node, 'process_ids'),
        })
      }
    }
  }

  return { applications, scenarios, processes, domains, flows }
}

function collectStagesAndMatchers(version: RulePackageVersionDto) {
  const stages: StageDefinition[] = []
  const matchers = new Map<string, { name: string; applicationId?: string }>()

  for (const layer of version.layers) {
    if (layer.id === 'matchers') {
      for (const node of layer.nodes) {
        matchers.set(node.id, { name: node.name, applicationId: fieldString(node, 'application_id') })
      }
    } else if (layer.id === 'stages') {
      for (const node of layer.nodes) {
        stages.push({
          id: node.id,
          name: node.name,
          kind: fieldString(node, 'kind') ?? 'normal',
          result: fieldString(node, 'result'),
          flowId: fieldString(node, 'flow_id'),
          processId: fieldString(node, 'process_id'),
          startMatcherId: fieldString(node, 'start_matcher_id'),
          startMatcherIds: fieldStringArray(node, 'start_matcher_ids'),
          endMatcherId: fieldString(node, 'end_matcher_id'),
          endMatcherIds: fieldStringArray(node, 'end_matcher_ids'),
          subProcessIds: fieldStringArray(node, 'sub_process_ids'),
          order: fieldNumber(node, 'order'),
          enabled: fieldBoolean(node, 'enabled', true),
          exportEnabled: fieldBoolean(node, 'export_enabled', true),
          businessMeaning: fieldString(node, 'business_meaning') ?? '',
          applicableScenarioIds: fieldStringArray(node, 'applicable_scenario_ids'),
        })
      }
    }
  }

  return { stages, matchers }
}

function buildContext(version: RulePackageVersionDto): TopologyContext {
  const { applications, processes, domains } = collectDefinitions(version)
  const { matchers } = collectStagesAndMatchers(version)

  const applicationNameById = new Map(applications.map((app) => [app.id, app.name]))
  const matcherApplicationId = new Map<string, string>()
  const matcherNameById = new Map<string, string>()
  for (const [id, matcher] of matchers) {
    matcherNameById.set(id, matcher.name)
    if (matcher.applicationId) matcherApplicationId.set(id, matcher.applicationId)
  }

  return {
    applicationNameById,
    processById: processes,
    domainNameById: domains,
    matcherApplicationId,
    matcherNameById,
  }
}

function toStageViewModel(stage: StageDefinition, context: TopologyContext): RuleTopologyStageViewModel {
  return {
    id: stage.id,
    name: stage.name,
    businessMeaning: stage.businessMeaning,
    order: stage.order,
    kind: stage.kind,
    result: stage.result,
    enabled: stage.enabled,
    exportEnabled: stage.exportEnabled,
    startMatcherId: stage.startMatcherId,
    startMatcherIds: stage.startMatcherIds,
    endMatcherId: stage.endMatcherId,
    endMatcherIds: stage.endMatcherIds,
    subProcessIds: stage.subProcessIds,
    startMatcherName: stage.startMatcherId ? context.matcherNameById.get(stage.startMatcherId) : undefined,
    startMatcherNames: stage.startMatcherIds.map((id) => context.matcherNameById.get(id) ?? id),
    endMatcherName: stage.endMatcherId ? context.matcherNameById.get(stage.endMatcherId) : undefined,
    endMatcherNames: stage.endMatcherIds.map((id) => context.matcherNameById.get(id) ?? id),
  }
}

function matchesScenario(scenarioIds: string[], selectedScenarioId: string | null) {
  if (!selectedScenarioId) return true
  return scenarioIds.length === 0 || scenarioIds.includes(selectedScenarioId)
}

function isCrossAppRpc(stage: StageDefinition, context: TopologyContext) {
  if (stage.kind === 'intercept' || stage.result) return false
  if (!stage.startMatcherId || !stage.endMatcherId) return false
  const startApp = context.matcherApplicationId.get(stage.startMatcherId)
  const endApp = context.matcherApplicationId.get(stage.endMatcherId)
  return !!startApp && !!endApp && startApp !== endApp
}

/** 一个流程的拓扑：root 在顶层，sub_process_ids 扇出并行分支，再合并回父进程。 */
function buildFlowTopology(
  flow: FlowDefinition,
  stages: StageDefinition[],
  context: TopologyContext,
  selectedScenarioId: string | null,
): RuleTopologyFlowViewModel | null {
  const rootProcessId = flow.rootProcessId
  if (!rootProcessId || !context.processById.has(rootProcessId)) return null

  // 扇出组：process 级 stage 带 sub_process_ids，按父进程聚合（合并同名多组）。结构性、不过滤场景。
  const fanOutByParent = new Map<string, { stageId: string; label: string; subs: string[] }[]>()
  for (const stage of stages) {
    if (stage.kind === 'intercept' || !stage.processId || stage.subProcessIds.length === 0) continue
    if (!flow.processIds.includes(stage.processId)) continue
    const group = fanOutByParent.get(stage.processId) ?? []
    group.push({ stageId: stage.id, label: stage.name, subs: stage.subProcessIds })
    fanOutByParent.set(stage.processId, group)
  }

  // 进程级 stage：场景过滤后，按 processId 分组、按 order 排序。
  const processStagesByProcess = new Map<string, RuleTopologyStageViewModel[]>()
  for (const stage of stages) {
    if (!stage.processId || !matchesScenario(stage.applicableScenarioIds, selectedScenarioId)) continue
    if (!flow.processIds.includes(stage.processId)) continue
    const list = processStagesByProcess.get(stage.processId) ?? []
    list.push(toStageViewModel(stage, context))
    processStagesByProcess.set(stage.processId, list)
  }
  for (const list of processStagesByProcess.values()) {
    list.sort((left, right) => left.order - right.order)
  }

  const layers: RuleTopologyNode[][] = []
  const fanOuts: RuleTopologyFanOut[] = []
  const nodeById = new Map<string, RuleTopologyNode>()

  const makeNode = (processId: string, role: RuleTopologyNodeRole): RuleTopologyNode => {
    const id = role === 'join' ? `${processId}::join` : processId
    const existing = nodeById.get(id)
    if (existing) return existing
    const process = context.processById.get(processId)
    const appId = process?.applicationId ?? ''
    const node: RuleTopologyNode = {
      id,
      processId,
      label: process?.name ?? processId,
      appId,
      appName: appId ? context.applicationNameById.get(appId) ?? appId : '',
      kind: process?.kind ?? 'MAIN',
      role,
      stages: role === 'join' ? [] : processStagesByProcess.get(processId) ?? [],
    }
    nodeById.set(id, node)
    return node
  }

  const placeNode = (node: RuleTopologyNode, layerIndex: number) => {
    while (layers.length <= layerIndex) layers.push([])
    if (!layers[layerIndex].some((item) => item.id === node.id)) {
      layers[layerIndex].push(node)
    }
  }

  const expand = (processId: string, layerIndex: number, parentNodeId: string): number => {
    const groups = fanOutByParent.get(processId) ?? []
    if (groups.length === 0) return layerIndex

    // 同一父进程的多组扇出合并成一组（去重、保序）。
    const subIds: string[] = []
    for (const group of groups) {
      for (const subId of group.subs) {
        if (!context.processById.has(subId)) continue
        if (!subIds.includes(subId)) subIds.push(subId)
      }
    }
    if (subIds.length === 0) return layerIndex

    const subNodeIds = subIds.map((subId) => {
      const subNode = makeNode(subId, 'branch')
      placeNode(subNode, layerIndex + 1)
      return subNode.id
    })

    let deepest = layerIndex + 1
    for (const subId of subIds) {
      deepest = Math.max(deepest, expand(subId, layerIndex + 1, subId))
    }

    const joinNode = makeNode(processId, 'join')
    placeNode(joinNode, deepest + 1)

    fanOuts.push({
      stageId: groups[0].stageId,
      label: groups.map((group) => group.label).join(' / '),
      parentNodeId,
      subNodeIds,
      joinNodeId: joinNode.id,
    })

    return deepest + 1
  }

  const rootNode = makeNode(rootProcessId, 'start')
  placeNode(rootNode, 0)
  expand(rootProcessId, 0, rootNode.id)

  // flow 覆盖但未被扇出连接的进程：放到第 1 层作为并行分支，避免浮空节点。
  for (const processId of flow.processIds) {
    if (processId === rootProcessId) continue
    if (!context.processById.has(processId)) continue
    if (nodeById.has(processId)) continue
    placeNode(makeNode(processId, 'branch'), 1)
  }

  // flow 级 stage 分类：跨应用 RPC 成边，其余（聚合 / 同应用跨度 / 拦截）进 flowStages。
  // 两者都按场景过滤。
  const processIdByApp = new Map<string, string>()
  for (const [processId, process] of context.processById) {
    if (!process.applicationId) continue
    if (!flow.processIds.includes(processId)) continue
    if (!processIdByApp.has(process.applicationId)) processIdByApp.set(process.applicationId, processId)
  }

  const rpcEdges: RuleTopologyRpcEdge[] = []
  const flowStages: RuleTopologyStageViewModel[] = []
  for (const stage of stages) {
    if (stage.flowId !== flow.id) continue
    if (!matchesScenario(stage.applicableScenarioIds, selectedScenarioId)) continue

    if (isCrossAppRpc(stage, context)) {
      const startApp = context.matcherApplicationId.get(stage.startMatcherId!)
      const endApp = context.matcherApplicationId.get(stage.endMatcherId!)
      const fromProcess = processIdByApp.get(startApp!)
      const toProcess = processIdByApp.get(endApp!)
      if (fromProcess && toProcess && fromProcess !== toProcess) {
        rpcEdges.push({ stageId: stage.id, label: stage.name, from: fromProcess, to: toProcess, stage: toStageViewModel(stage, context) })
      }
    } else {
      flowStages.push(toStageViewModel(stage, context))
    }
  }
  flowStages.sort((left, right) => left.order - right.order)

  return {
    flowId: flow.id,
    flowName: flow.name,
    domainName: flow.domainId ? context.domainNameById.get(flow.domainId) ?? '' : '',
    layers,
    fanOuts,
    rpcEdges,
    flowStages,
  }
}

export function buildRuleTopologyViewModel(
  version: RulePackageVersionDto | null,
  selectedScenarioId: string | null,
): RuleTopologyViewModel {
  const empty: RuleTopologyViewModel = { flows: [], applications: [], scenarios: [] }
  if (!version) return empty

  const { applications, scenarios, flows } = collectDefinitions(version)
  const { stages } = collectStagesAndMatchers(version)
  const context = buildContext(version)

  const flowViewModels = flows
    .map((flow) => buildFlowTopology(flow, stages, context, selectedScenarioId))
    .filter((flow): flow is RuleTopologyFlowViewModel => flow !== null)

  return { flows: flowViewModels, applications, scenarios }
}
