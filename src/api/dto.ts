export interface IssueDto {
  category: string
  level: 'TIP' | 'WARNING' | 'EXCEPTION'
  message: string
}

export type LogSearchMode = 'keyword' | 'regex'

export interface LogSearchRequestDto {
  query: string
  mode: LogSearchMode
  caseSensitive: boolean
  contextLines: number
}

export interface LogSearchHitDto {
  lineNumber: number
  rawLine: string
  timestamp: string
  app: string
  level: string
  before: string[]
  after: string[]
}

export interface LogSearchResponseDto {
  totalMatches: number
  hits: LogSearchHitDto[]
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
