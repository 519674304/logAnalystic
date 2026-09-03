import {
  buildLatencySpecProjection,
  filterRulesByScenario,
  resolveDiagnosticProblem,
} from '../src/domain/effective-rule-resolver'
import type { DiagnosticProblemConfigDto, RuleRecordDto } from '../src/api/dto'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const rules: RuleRecordDto[] = [
  {
    id: 'request-start', name: '请求开始', description: '', pattern: 'request started', enabled: false, exportEnabled: true,
    scenarios: [], matchType: 'keyword', recordType: 'matcher',
  },
  {
    id: 'request-end', name: '请求结束', description: '', pattern: 'request completed', enabled: true, exportEnabled: true,
    scenarios: [], matchType: 'regex', recordType: 'matcher',
  },
  {
    id: 'intercept-end', name: '拦截结束', description: '', pattern: 'request intercepted', enabled: true, exportEnabled: true,
    scenarios: [], matchType: 'keyword', recordType: 'matcher',
  },
  {
    id: 'flow-start', name: '请求边界', description: '', pattern: '', enabled: true, exportEnabled: true,
    scenarios: ['scenario-a'], recordType: 'stage', flowId: 'flow', order: 1, startMatcherId: 'request-start', endMatcherId: 'request-end',
  },
  {
    id: 'stage-a', name: '阶段 A', description: '', pattern: '', enabled: true, exportEnabled: true,
    scenarios: ['scenario-a'], recordType: 'stage', processId: 'process', order: 2,
    startMatcherIds: ['request-start'], endMatcherIds: ['request-end'],
  },
  {
    id: 'intercept', name: '拦截', description: '', pattern: '', enabled: true, exportEnabled: true,
    scenarios: [], recordType: 'stage', kind: 'intercept', endMatcherIds: ['intercept-end'],
  },
]

const scenarioRules = filterRulesByScenario(rules, 'scenario-a')
assert(scenarioRules.some((rule) => rule.id === 'stage-a'), 'selected scenario must retain matching rules')
assert(scenarioRules.some((rule) => rule.id === 'flow-start'), 'selected scenario must retain global rules')

const latency = buildLatencySpecProjection(scenarioRules)
assert(latency.requestStarts.length === 1, 'flow start must create one request-start marker')
assert(latency.requestStarts[0]?.pattern === 'request started', 'request-start marker must retain its pattern')
assert(latency.interceptEnds[0]?.pattern === 'request intercepted', 'intercept end must be projected')
assert(latency.stageSpecs.some((stage) => stage.id === 'stage-a'), 'process stage must be projected')

const anotherScenarioRules = filterRulesByScenario(rules, 'scenario-b')
const anotherScenarioLatency = buildLatencySpecProjection(anotherScenarioRules, rules)
assert(
  anotherScenarioLatency.requestStarts[0]?.pattern === 'request started',
  'scenario-specific stages must not change the global request-start boundary',
)

const problem: DiagnosticProblemConfigDto = {
  id: 'problem', name: '问题', hitLabel: '命中', missLabel: '未命中',
  judgments: [
    { id: 'matcher-judgment', type: 'matcher', matcherId: 'request-start', range: 'window', when: 'hit', returnMode: 'all', conclusion: '', connector: 'and' },
    { id: 'stage-judgment', type: 'stage', stageId: 'stage-a', range: 'window', when: 'closed', returnMode: 'all', conclusion: '', connector: 'and' },
  ],
}
const diagnostic = resolveDiagnosticProblem(problem, scenarioRules)
assert(diagnostic !== null, 'valid matcher and stage references must resolve')
assert(diagnostic?.judgments[0]?.marker?.pattern === 'request started', 'diagnostic matcher must use the shared marker projection')
assert(diagnostic?.judgments[1]?.stage?.id === 'stage-a', 'diagnostic stage must use the shared stage projection')

console.log('Effective rule resolver passed')
