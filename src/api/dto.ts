export interface IssueDto {
  category: string
  level: 'TIP' | 'WARNING' | 'EXCEPTION'
  message: string
}

export type LogSearchMode = 'keyword' | 'regex'

export interface LogSearchRequestDto {
  path: string
  query: string
  mode: LogSearchMode
  caseSensitive: boolean
  contextLines: number
  startTime?: string
  endTime?: string
}

export interface LogSearchHitDto {
  lineNumber: number
  rawLine: string
  filePath?: string
  timestamp: string
  app: string
  level: string
  before: string[]
  after: string[]
}

export interface LogSearchResponseDto {
  totalMatches: number
  hits: LogSearchHitDto[]
  truncated?: boolean
}

export interface LogContextRequestDto {
  filePath: string
  lineNumber: number
  contextLines: number
}

export interface LogContextDto {
  filePath: string
  lineNumber: number
  before: string[]
  after: string[]
}

export interface SavedQueryDto {
  id: string
  name: string
  description: string
  group: string
  tags: string[]
  query: string
  mode: LogSearchMode
  caseSensitive: boolean
  timeRange: string
  /** 规则模式下勾选的 matcher id（手动模式为空）。用于恢复树勾选并关联规则 matcher。 */
  matcherIds?: string[]
}

export interface RuleRecordDto {
  id: string
  name: string
  description: string
  pattern: string
  enabled: boolean
  exportEnabled: boolean
  scenarios: string[]
  matchType?: string
  recordType?: 'matcher' | 'stage' | string
  order?: number
  applicationId?: string
  processId?: string
  flowId?: string
  kind?: string
  startMatcherId?: string
  startMatcherIds?: string[]
  endMatcherId?: string
  endMatcherIds?: string[]
}

export interface RulePackageImportDto {
  sourceName: string
  bytes: number[]
}

export interface RulePackageImportResultDto {
  operation: 'created' | 'replaced'
  ruleSetId: string
  version: string
  versions: RulePackageVersionDto[]
}

export type RulePackageFieldValue = string | number | boolean | RulePackageFieldValue[]

export interface RulePackageNodeDto {
  id: string
  name: string
  nodeType: string
  tablePath: string
  fields: Record<string, RulePackageFieldValue>
}

export interface RulePackageLayerDto {
  id: string
  label: string
  fileName: string
  nodes: RulePackageNodeDto[]
}

export interface RulePackageVersionDto {
  ruleSetId: string
  version: string
  layers: RulePackageLayerDto[]
}

export interface ActiveRuleVersionDto {
  ruleSetId: string
  version: string
}

export interface RuleConfigDto {
  versions: RulePackageVersionDto[]
  active: ActiveRuleVersionDto | null
}

export interface RulePackageNodeUpdateDto {
  ruleSetId: string
  version: string
  layerId: string
  tablePath: string
  nodeId: string
  fields: Record<string, RulePackageFieldValue>
}

export interface RulePackageLayerTomlUpdateDto {
  ruleSetId: string
  version: string
  layerId: string
  tomlText: string
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
