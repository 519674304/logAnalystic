import { postJson } from './http-client'
import type { LogMarker, LatencyStageSpec } from './latency-analysis-client'

export interface StageThreshold {
  stageId: string
  thresholdMs: number
}

export interface SystemError {
  timestamp: string
  level: string
  tag: string
  message: string
}

export interface SlowStage {
  stageId: string
  durationMs: number
  thresholdMs: number
}

export interface SlowRequest {
  requestId: string
  totalMs: number
  slowStages: SlowStage[]
}

export interface HealthSummary {
  errorCount: number
  slowRequestCount: number
  slowStageCount: number
  totalRequestCount: number
}

export interface HealthReport {
  summary: HealthSummary
  systemErrors: SystemError[]
  slowRequests: SlowRequest[]
}

export interface HealthCheckSpec {
  errorFilters: LogMarker[]
  requestStarts: LogMarker[]
  interceptEnds: LogMarker[]
  processStages: LatencyStageSpec[]
  stageThresholds: StageThreshold[]
}

export async function analyzeHealthCheck(
  path: string,
  spec: HealthCheckSpec,
  timeRange?: { startTime?: string; endTime?: string },
): Promise<HealthReport> {
  return postJson<HealthReport>('/api/health/check', {
    path,
    startTime: timeRange?.startTime,
    endTime: timeRange?.endTime,
    errorFilters: spec.errorFilters,
    requestStarts: spec.requestStarts,
    interceptEnds: spec.interceptEnds,
    processStages: spec.processStages,
    stageThresholds: spec.stageThresholds,
  })
}
