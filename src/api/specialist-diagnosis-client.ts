import { getJson, postJson, putJson } from './http-client'
import type { LogMarker, LatencyStageSpec } from './latency-analysis-client'
import type {
  DiagnosticProblemConfigDto,
  RuleRecordDto,
} from './dto'

export interface HitEvidence {
  role: string
  timestamp: string
  message: string
}

export interface JudgmentResult {
  conclusion: string
  satisfied: boolean
  state: string
  evidence: HitEvidence[]
}

export interface DiagnosticReport {
  name: string
  hit: boolean
  conclusion: string
  judgments: JudgmentResult[]
}

/** 运行形状：判断依据已由前端把 matcherId/stageId 投影成 pattern。 */
export interface DiagnosticRunJudgmentDto {
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

export interface DiagnosticRunProblemDto {
  name: string
  hitLabel: string
  missLabel: string
  judgments: DiagnosticRunJudgmentDto[]
}

const diagnosticProblemsPath = '/api/diagnostic-problems'

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

/**
 * 把持久化的诊断问题投影成运行形状（matcherId → marker、stageId → stage）。
 * 任一判断依据引用的 matcher/stage 失效（已删除或缺 start/end）时返回 `null`。
 */
export function resolveDiagnosticProblem(
  problem: DiagnosticProblemConfigDto,
  rules: RuleRecordDto[],
): DiagnosticRunProblemDto | null {
  const matchers = new Map(
    rules.filter((rule) => rule.recordType === 'matcher').map((rule) => [rule.id, rule] as const),
  )
  const stages = new Map(
    rules.filter((rule) => rule.recordType === 'stage').map((rule) => [rule.id, rule] as const),
  )
  const toMarker = (id: string): LogMarker | undefined => {
    const matcher = matchers.get(id)
    return matcher?.pattern
      ? { pattern: matcher.pattern, mode: matcher.matchType === 'regex' ? 'regex' : 'keyword' }
      : undefined
  }

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
      const marker = judgment.matcherId ? toMarker(judgment.matcherId) : undefined
      if (!marker) return null
      judgments.push({ type: 'matcher', marker, ...base })
    } else {
      const stage = judgment.stageId ? stages.get(judgment.stageId) : undefined
      if (!stage) return null
      const startMarkers = startMatcherIdsOf(stage).map(toMarker).filter((m): m is LogMarker => Boolean(m))
      const endMarkers = endMatcherIdsOf(stage).map(toMarker).filter((m): m is LogMarker => Boolean(m))
      if (startMarkers.length === 0 || endMarkers.length === 0) return null
      judgments.push({ type: 'stage', stage: { id: stage.id, startMarkers, endMarkers }, ...base })
    }
  }

  return {
    name: problem.name,
    hitLabel: problem.hitLabel,
    missLabel: problem.missLabel,
    judgments,
  }
}

export async function runDiagnostic(
  path: string,
  problem: DiagnosticRunProblemDto,
  timeRange?: { startTime?: string; endTime?: string },
): Promise<DiagnosticReport> {
  return postJson<DiagnosticReport>('/api/diagnostic/run', {
    path,
    startTime: timeRange?.startTime,
    endTime: timeRange?.endTime,
    problem,
  })
}

export async function listDiagnosticProblems(): Promise<DiagnosticProblemConfigDto[]> {
  const document = await getJson<{ problems: DiagnosticProblemConfigDto[] }>(diagnosticProblemsPath)
  return Array.isArray(document.problems) ? document.problems : []
}

export async function saveDiagnosticProblems(problems: DiagnosticProblemConfigDto[]): Promise<void> {
  await putJson<{ problems: DiagnosticProblemConfigDto[] }>(diagnosticProblemsPath, { problems })
}
