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
  /** 健康体检：matcher_role === "error" 时该 matcher 是错误过滤器。 */
  matcherRole?: string
  /** 健康体检：该 stage 的慢阈值（毫秒）。 */
  thresholdMs?: number
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

// —— 专科诊断：诊断问题配置（持久化形状，引用 matcherId / stageId）——

export type DiagnosticJudgmentType = 'matcher' | 'stage'
export type DiagnosticRange = 'window' | 'boundedBacktrack' | 'unbounded'
export type DiagnosticReturnMode = 'first' | 'all'
export type DiagnosticConnector = 'and' | 'or'

export interface DiagnosticJudgmentConfigDto {
  id: string
  type: DiagnosticJudgmentType
  /** type=matcher 时引用的 matcher id。 */
  matcherId?: string
  /** type=stage 时引用的 stage id。 */
  stageId?: string
  range: DiagnosticRange
  /** range=boundedBacktrack 时相对 t0 的回溯窗口（分钟）。 */
  windowMinutes?: number
  /** 命中条件：matcher 为 hit/miss，stage 为 closed/unclosed/missing。 */
  when: string
  returnMode: DiagnosticReturnMode
  /** 短结论（命中时拼接进最终结论）。 */
  conclusion: string
  connector: DiagnosticConnector
}

export interface DiagnosticProblemConfigDto {
  id: string
  name: string
  hitLabel: string
  missLabel: string
  judgments: DiagnosticJudgmentConfigDto[]
}
