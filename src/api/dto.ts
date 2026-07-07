export interface IssueDto {
  category: string
  level: 'TIP' | 'WARNING' | 'EXCEPTION'
  message: string
}

export interface LogMatcherDto {
  id: string
  name: string
  pattern: string
  enabled: boolean
  scenarios: string[]
}

export interface StageDto {
  id: string
  name: string
  start_matcher_id?: string
  end_matcher_id?: string
  enabled?: boolean
  scenarios?: string[]
}

export interface RequestHitDto {
  id: string
  application_id: string
  process_id: string
  stages: StageDto[]
}

export interface LatencyAnalysisResult {
  id: string
  request_id: string
  hits: RequestHitDto[]
  stats: {
    sampleCount: number
    averageMs: number
    p90Ms: number
    maxMs: number
  }
}

export interface EffectiveRuleCatalog {
  rule_set_id: string
  rules: LogMatcherDto[]
}
