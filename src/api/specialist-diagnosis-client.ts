import { getJson, postJson, putJson } from './http-client'
import type { DiagnosticProblemConfigDto } from './dto'
import type { DiagnosticRunProblemDto } from '../domain/effective-rule-resolver'
export { resolveDiagnosticProblem } from '../domain/effective-rule-resolver'

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

const diagnosticProblemsPath = '/api/diagnostic-problems'

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
