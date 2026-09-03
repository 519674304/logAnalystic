import type { HealthCheckSpec } from '../api/health-check-client'
import type { LatencyStageSpec, LogMarker } from '../api/latency-analysis-client'
import type {
  ActiveRuleVersionDto,
  DiagnosticProblemConfigDto,
  RulePackageVersionDto,
  RuleRecordDto,
} from '../api/dto'

export type LatencySpecProjection = {
  requestStarts: LogMarker[]
  interceptEnds: LogMarker[]
  stageSpecs: LatencyStageSpec[]
}

export type DiagnosticRunJudgmentDto = {
  type: 'matcher' | 'stage'
  marker?: LogMarker
  stage?: LatencyStageSpec
  range: string
  windowMs?: number
  when: string
  returnMode: string
  conclusion: string
  connector: string
}

export type DiagnosticRunProblemDto = {
  name: string
  hitLabel: string
  missLabel: string
  judgments: DiagnosticRunJudgmentDto[]
}

function stringField(fields: Record<string, unknown>, name: string): string | undefined {
  const value = fields[name]
  return typeof value === 'string' ? value : undefined
}

export function projectRuleRecords(
  versions: RulePackageVersionDto[],
  active: ActiveRuleVersionDto | null,
): RuleRecordDto[] {
  const version = active
    ? versions.find((item) => item.ruleSetId === active.ruleSetId && item.version === active.version)
    : undefined
  if (!version) return []

  return version.layers.flatMap((layer): RuleRecordDto[] => {
    if (layer.id === 'definitions') {
      return layer.nodes
        .filter((node) => node.nodeType === 'applications' || node.nodeType === 'processes' || node.nodeType === 'flows')
        .map(
          (node) =>
            ({
              id: node.id,
              name: node.name,
              description: stringField(node.fields, 'description') ?? '',
              pattern: '',
              enabled: true,
              exportEnabled: true,
              scenarios: [],
              recordType:
                node.nodeType === 'applications' ? 'application' : node.nodeType === 'flows' ? 'flow' : 'process',
              applicationId: node.nodeType === 'processes' ? stringField(node.fields, 'application_id') : undefined,
            }) satisfies RuleRecordDto,
        )
    }
    if (layer.id !== 'matchers' && layer.id !== 'stages') return []

    return layer.nodes.map((node) => {
      const fields = node.fields
      const scenarios = Array.isArray(fields.applicable_scenario_ids)
        ? fields.applicable_scenario_ids.filter((value): value is string => typeof value === 'string')
        : []
      return {
        id: node.id,
        name: node.name,
        description: stringField(fields, 'business_meaning') ?? stringField(fields, 'description') ?? '',
        pattern: stringField(fields, 'pattern') ?? '',
        enabled: typeof fields.enabled === 'boolean' ? fields.enabled : true,
        exportEnabled: typeof fields.export_enabled === 'boolean' ? fields.export_enabled : true,
        scenarios,
        matchType: layer.id === 'matchers' ? stringField(fields, 'type') : undefined,
        recordType: layer.id === 'stages' ? 'stage' : 'matcher',
        order: typeof fields.order === 'number' ? fields.order : undefined,
        applicationId: stringField(fields, 'application_id'),
        processId: stringField(fields, 'process_id'),
        flowId: stringField(fields, 'flow_id'),
        kind: stringField(fields, 'kind'),
        startMatcherId: stringField(fields, 'start_matcher_id'),
        startMatcherIds: Array.isArray(fields.start_matcher_ids)
          ? fields.start_matcher_ids.filter((value): value is string => typeof value === 'string')
          : undefined,
        endMatcherId: stringField(fields, 'end_matcher_id'),
        endMatcherIds: Array.isArray(fields.end_matcher_ids)
          ? fields.end_matcher_ids.filter((value): value is string => typeof value === 'string')
          : undefined,
        matcherRole: stringField(fields, 'matcher_role'),
        thresholdMs: typeof fields.threshold_ms === 'number' ? fields.threshold_ms : undefined,
      } satisfies RuleRecordDto
    })
  })
}

export function filterRulesByScenario(rules: RuleRecordDto[], scenarioId: string | null): RuleRecordDto[] {
  if (!scenarioId) return rules
  return rules.filter((rule) => rule.scenarios.length === 0 || rule.scenarios.includes(scenarioId))
}

function markerResolver(rules: RuleRecordDto[]): (id: string) => LogMarker | undefined {
  const matchers = new Map(
    rules.filter((rule) => rule.recordType === 'matcher').map((rule) => [rule.id, rule] as const),
  )
  return (id) => {
    const matcher = matchers.get(id)
    return matcher?.pattern
      ? { pattern: matcher.pattern, mode: matcher.matchType === 'regex' ? 'regex' : 'keyword' }
      : undefined
  }
}

function startMatcherIdsOf(stage: RuleRecordDto): string[] {
  const ids: string[] = []
  if (stage.startMatcherId) ids.push(stage.startMatcherId)
  for (const id of stage.startMatcherIds ?? []) {
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function endMatcherIdsOf(stage: RuleRecordDto): string[] {
  const ids: string[] = []
  if (stage.endMatcherId) ids.push(stage.endMatcherId)
  for (const id of stage.endMatcherIds ?? []) {
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function markersFor(ids: string[], resolveMarker: (id: string) => LogMarker | undefined): LogMarker[] {
  return ids.map(resolveMarker).filter((marker): marker is LogMarker => marker !== undefined)
}

function toStageSpec(stage: RuleRecordDto, resolveMarker: (id: string) => LogMarker | undefined): LatencyStageSpec | null {
  const startMarkers = markersFor(startMatcherIdsOf(stage), resolveMarker)
  const endMarkers = markersFor(endMatcherIdsOf(stage), resolveMarker)
  return startMarkers.length > 0 && endMarkers.length > 0 ? { id: stage.id, startMarkers, endMarkers } : null
}

/**
 * 场景决定请求内参与分析的 matcher/stage；requestBoundaryRules 始终按 flow 全局规则识别请求开始。
 */
export function buildLatencySpecProjection(
  rules: RuleRecordDto[],
  requestBoundaryRules: RuleRecordDto[] = rules,
): LatencySpecProjection {
  const resolveMarker = markerResolver(rules)
  const enabledStages = rules.filter((rule) => rule.enabled && rule.recordType === 'stage')
  const resolveRequestBoundaryMarker = markerResolver(requestBoundaryRules)
  const enabledBoundaryStages = requestBoundaryRules.filter(
    (rule) => rule.enabled && rule.recordType === 'stage',
  )
  const requestStartStage = enabledBoundaryStages.find(
    (stage) => stage.flowId && stage.order === 1 && stage.kind !== 'intercept' && startMatcherIdsOf(stage).length > 0,
  )
  const requestStarts = requestStartStage
    ? markersFor(startMatcherIdsOf(requestStartStage), resolveRequestBoundaryMarker)
    : []
  const interceptEnds = enabledStages.flatMap((stage) =>
    stage.kind === 'intercept' ? markersFor(stage.endMatcherIds ?? [], resolveMarker) : [],
  )
  const stageSpecs = enabledStages.flatMap((stage) => {
    if (stage.kind === 'intercept' || (!stage.processId && !stage.flowId)) return []
    const spec = toStageSpec(stage, resolveMarker)
    return spec ? [spec] : []
  })

  return { requestStarts, interceptEnds, stageSpecs }
}

export function buildHealthCheckProjection(
  rules: RuleRecordDto[],
  requestBoundaryRules: RuleRecordDto[] = rules,
): HealthCheckSpec {
  const latency = buildLatencySpecProjection(rules, requestBoundaryRules)
  return {
    errorFilters: rules
      .filter((rule) => rule.enabled && rule.recordType === 'matcher' && rule.matcherRole === 'error' && !!rule.pattern)
      .map((rule) => ({ pattern: rule.pattern, mode: rule.matchType === 'regex' ? 'regex' : 'keyword' })),
    requestStarts: latency.requestStarts,
    interceptEnds: latency.interceptEnds,
    processStages: latency.stageSpecs,
    stageThresholds: rules
      .filter((rule) => rule.enabled && rule.recordType === 'stage' && rule.thresholdMs != null)
      .map((rule) => ({ stageId: rule.id, thresholdMs: rule.thresholdMs as number })),
  }
}

export function resolveDiagnosticProblem(
  problem: DiagnosticProblemConfigDto,
  rules: RuleRecordDto[],
): DiagnosticRunProblemDto | null {
  const resolveMarker = markerResolver(rules)
  const stages = new Map(
    rules.filter((rule) => rule.recordType === 'stage').map((rule) => [rule.id, rule] as const),
  )
  const judgments: DiagnosticRunJudgmentDto[] = []
  for (const judgment of problem.judgments) {
    const base = {
      range: judgment.range,
      windowMs: judgment.windowMinutes != null ? judgment.windowMinutes * 60_000 : undefined,
      when: judgment.when,
      returnMode: judgment.returnMode,
      conclusion: judgment.conclusion,
      connector: judgment.connector,
    }
    if (judgment.type === 'matcher') {
      const marker = judgment.matcherId ? resolveMarker(judgment.matcherId) : undefined
      if (!marker) return null
      judgments.push({ type: 'matcher', marker, ...base })
    } else {
      const stage = judgment.stageId ? stages.get(judgment.stageId) : undefined
      const spec = stage ? toStageSpec(stage, resolveMarker) : null
      if (!spec) return null
      judgments.push({ type: 'stage', stage: spec, ...base })
    }
  }
  return { name: problem.name, hitLabel: problem.hitLabel, missLabel: problem.missLabel, judgments }
}
