import type { LatencyAnalysisResult, RuleRecordDto } from '../api/dto'
import type { LatencyAnalysis, StageSample } from '../api/latency-analysis-client'

function uniqueDefinedValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[]
}

export type RequestGroup = 'slow' | 'abnormal' | 'normal' | 'unfinished'
export type LaneBlockKind = 'main' | 'rpc' | 'subprocess' | 'join'

export interface LatencyRequestViewModel {
  id: string
  group: RequestGroup
  result: string
  duration: string
  durationMs: number
  scene: string
  slowPoint: string
  slowPointBlockId: string
}

export interface RequestGroupViewModel {
  id: RequestGroup
  title: string
}

export interface LaneBlockViewModel {
  id: string
  lane: string
  label: string
  startPercent: number
  widthPercent: number
  kind: LaneBlockKind
  duration: string
  startTimestamp: string
  endTimestamp: string
  relativeDuration: string
  /** 所属请求（顺序时延分析结果按请求分组时使用；样例数据缺省为所有请求可见） */
  requestId?: string
}

export interface StepTreeRowViewModel {
  level: number
  name: string
  duration: string
  blockId: string
  requestId?: string
}

export interface RequestViewModel {
  requestId: string
  requests: LatencyRequestViewModel[]
  requestGroups: RequestGroupViewModel[]
  lanes: string[]
  laneBlocks: LaneBlockViewModel[]
  stepTree: StepTreeRowViewModel[]
  intervalStepOptions: string[]
  stats: LatencyAnalysisResult['stats']
}

const requestGroups: RequestGroupViewModel[] = [
  { id: 'slow', title: '慢请求' },
  { id: 'abnormal', title: '异常请求' },
  { id: 'normal', title: '正常请求' },
  { id: 'unfinished', title: '未结束请求' },
]

const sampleLanes = ['A应用主流程', 'A应用子进程1', 'A应用子进程2', 'B应用处理', 'C应用回调']

const sampleLaneBlocks: LaneBlockViewModel[] = [
  {
    id: 'parse',
    lane: 'A应用主流程',
    label: '参数解析',
    startPercent: 4,
    widthPercent: 14,
    kind: 'main',
    duration: '24ms',
    startTimestamp: '2026-06-12 10:40:02.120',
    endTimestamp: '2026-06-12 10:40:02.144',
    relativeDuration: '+0ms ~ +24ms',
  },
  {
    id: 'dispatch',
    lane: 'A应用主流程',
    label: '触发子进程',
    startPercent: 20,
    widthPercent: 12,
    kind: 'main',
    duration: '18ms',
    startTimestamp: '2026-06-12 10:40:02.168',
    endTimestamp: '2026-06-12 10:40:02.186',
    relativeDuration: '+48ms ~ +66ms',
  },
  {
    id: 'rpc-b',
    lane: 'A应用主流程',
    label: 'RPC调用B',
    startPercent: 36,
    widthPercent: 10,
    kind: 'rpc',
    duration: '42ms',
    startTimestamp: '2026-06-12 10:40:02.257',
    endTimestamp: '2026-06-12 10:40:02.299',
    relativeDuration: '+137ms ~ +179ms',
  },
  {
    id: 'sub-1',
    lane: 'A应用子进程1',
    label: '子任务1',
    startPercent: 28,
    widthPercent: 28,
    kind: 'subprocess',
    duration: '80ms',
    startTimestamp: '2026-06-12 10:40:02.216',
    endTimestamp: '2026-06-12 10:40:02.296',
    relativeDuration: '+96ms ~ +176ms',
  },
  {
    id: 'sub-2',
    lane: 'A应用子进程2',
    label: '子任务2',
    startPercent: 31,
    widthPercent: 23,
    kind: 'subprocess',
    duration: '65ms',
    startTimestamp: '2026-06-12 10:40:02.228',
    endTimestamp: '2026-06-12 10:40:02.293',
    relativeDuration: '+108ms ~ +173ms',
  },
  {
    id: 'b-receive',
    lane: 'B应用处理',
    label: 'B接收',
    startPercent: 47,
    widthPercent: 10,
    kind: 'rpc',
    duration: '21ms',
    startTimestamp: '2026-06-12 10:40:02.299',
    endTimestamp: '2026-06-12 10:40:02.320',
    relativeDuration: '+179ms ~ +200ms',
  },
  {
    id: 'b-handle',
    lane: 'B应用处理',
    label: 'B处理',
    startPercent: 58,
    widthPercent: 17,
    kind: 'main',
    duration: '52ms',
    startTimestamp: '2026-06-12 10:40:02.320',
    endTimestamp: '2026-06-12 10:40:02.372',
    relativeDuration: '+200ms ~ +252ms',
  },
  {
    id: 'join',
    lane: 'A应用主流程',
    label: '汇总结果',
    startPercent: 77,
    widthPercent: 12,
    kind: 'join',
    duration: '20ms',
    startTimestamp: '2026-06-12 10:40:02.408',
    endTimestamp: '2026-06-12 10:40:02.428',
    relativeDuration: '+288ms ~ +308ms',
  },
  {
    id: 'callback',
    lane: 'C应用回调',
    label: '结果回调',
    startPercent: 84,
    widthPercent: 10,
    kind: 'join',
    duration: '16ms',
    startTimestamp: '2026-06-12 10:40:02.444',
    endTimestamp: '2026-06-12 10:40:02.460',
    relativeDuration: '+324ms ~ +340ms',
  },
]

const sampleStepTree: StepTreeRowViewModel[] = [
  { level: 0, name: 'A阶段', duration: '180ms', blockId: 'parse' },
  { level: 1, name: '参数解析', duration: '24ms', blockId: 'parse' },
  { level: 1, name: '触发子进程', duration: '18ms', blockId: 'dispatch' },
  { level: 1, name: 'RPC调用B', duration: '42ms', blockId: 'rpc-b' },
  { level: 1, name: '子进程分支', duration: '90ms', blockId: 'sub-1' },
  { level: 2, name: '子进程1 / 执行任务', duration: '80ms', blockId: 'sub-1' },
  { level: 2, name: '子进程2 / 执行任务', duration: '65ms', blockId: 'sub-2' },
  { level: 1, name: '汇总结果', duration: '20ms', blockId: 'join' },
]

const sampleIntervalStepOptions = [
  'A参数解析开始',
  'A触发子进程',
  'A调用B日志',
  'B收到请求日志',
  'B处理完成日志',
  'A汇总结果日志',
  'C回调完成日志',
]

function buildSampleRequests(dto: LatencyAnalysisResult): LatencyRequestViewModel[] {
  return [
    {
      id: dto.request_id,
      group: 'normal',
      result: '完成',
      duration: '240ms',
      durationMs: 240,
      scene: '核心链路',
      slowPoint: 'B处理',
      slowPointBlockId: 'b-handle',
    },
    {
      id: '2026-06-12 10:40:02.120',
      group: 'slow',
      result: '超时',
      duration: '410ms',
      durationMs: 410,
      scene: '核心链路',
      slowPoint: 'RPC调用B',
      slowPointBlockId: 'rpc-b',
    },
    {
      id: '2026-06-12 10:41:18.004',
      group: 'abnormal',
      result: '异常',
      duration: '320ms',
      durationMs: 320,
      scene: '核心链路',
      slowPoint: '子进程分支',
      slowPointBlockId: 'sub-1',
    },
    {
      id: '2026-06-12 10:42:01.890',
      group: 'unfinished',
      result: '未结束',
      duration: '190ms+',
      durationMs: 190,
      scene: '完整链路',
      slowPoint: '汇总结果',
      slowPointBlockId: 'join',
    },
  ]
}

function getStageKind(stage: RuleRecordDto): LaneBlockKind {
  if (stage.processId?.includes('SUB')) {
    return 'subprocess'
  }
  return 'main'
}

interface DefinitionContext {
  applicationNameById: Map<string, string>
  processNameById: Map<string, string>
  processApplicationId: Map<string, string>
}

function buildDefinitionContext(rules: RuleRecordDto[]): DefinitionContext {
  const applicationNameById = new Map<string, string>()
  const processNameById = new Map<string, string>()
  const processApplicationId = new Map<string, string>()

  for (const rule of rules) {
    if (rule.recordType === 'application') {
      applicationNameById.set(rule.id, rule.name)
    } else if (rule.recordType === 'process') {
      processNameById.set(rule.id, rule.name)
      if (rule.applicationId) {
        processApplicationId.set(rule.id, rule.applicationId)
      }
    }
  }

  return { applicationNameById, processNameById, processApplicationId }
}

function getStageLane(stage: RuleRecordDto, context: DefinitionContext) {
  if (stage.processId) {
    const processName = context.processNameById.get(stage.processId) ?? stage.processId
    const applicationId = context.processApplicationId.get(stage.processId)
    const applicationName = applicationId ? context.applicationNameById.get(applicationId) : undefined
    return applicationName ? `${applicationName} · ${processName}` : processName
  }
  if (stage.applicationId) {
    return context.applicationNameById.get(stage.applicationId) ?? stage.applicationId
  }
  if (stage.flowId) {
    return stage.flowId
  }
  return '未指定应用'
}

export function buildLatencyViewModelFromRules(rules: RuleRecordDto[], fallback: RequestViewModel): RequestViewModel {
  const stages = rules
    .filter((rule) => rule.enabled && rule.recordType === 'stage' && (rule.applicationId || rule.processId))
    .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER))

  if (stages.length === 0) {
    return fallback
  }

  const context = buildDefinitionContext(rules)
  const lanes = Array.from(new Set(stages.map((stage) => getStageLane(stage, context))))
  const gapMs = 12
  let cursor = 0
  const timings = stages.map((stage, index) => {
    const durationMs = 40 + index * 15
    const startMs = cursor
    const endMs = startMs + durationMs
    cursor = endMs + gapMs
    return { stage, durationMs, startMs, endMs }
  })
  const totalSpan = Math.max(1, cursor - gapMs)

  const laneBlocks = timings.map(({ stage, durationMs, startMs, endMs }) => ({
    id: stage.id,
    lane: getStageLane(stage, context),
    label: stage.description || stage.name,
    startPercent: clampPercent((startMs / totalSpan) * 100),
    widthPercent: clampPercent((durationMs / totalSpan) * 100),
    kind: getStageKind(stage),
    duration: `${durationMs}ms`,
    startTimestamp: stage.startMatcherId ?? '等待日志命中',
    endTimestamp: stage.endMatcherId ?? '等待日志命中',
    relativeDuration: `+${startMs}ms ~ +${endMs}ms`,
  }))

  const slowest = laneBlocks.reduce((current, next) => {
    const currentMs = Number.parseInt(current.duration, 10)
    const nextMs = Number.parseInt(next.duration, 10)
    return nextMs > currentMs ? next : current
  }, laneBlocks[0])

  return {
    requestId: '规则预览请求',
    requestGroups,
    requests: [
      {
        id: '规则预览请求',
        group: 'normal',
        result: '规则已导入',
        duration: `${laneBlocks.length} 个阶段`,
        durationMs: laneBlocks.length,
        scene: stages[0]?.scenarios[0] ?? '默认场景',
        slowPoint: slowest.label,
        slowPointBlockId: slowest.id,
      },
    ],
    lanes,
    laneBlocks,
    stepTree: stages.map((stage) => ({
      level: getStageKind(stage) === 'subprocess' ? 1 : 0,
      name: stage.description || stage.name,
      duration: laneBlocks.find((block) => block.id === stage.id)?.duration ?? '-',
      blockId: stage.id,
    })),
    intervalStepOptions: uniqueDefinedValues(stages.flatMap((stage) => [stage.startMatcherId, stage.endMatcherId])),
    stats: {
      sampleCount: stages.length,
      averageMs: 0,
      p90Ms: 0,
      maxMs: 0,
    },
  }
}

function msOf(timestamp: string): number {
  return Date.parse(timestamp.replace(' ', 'T'))
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value))
}

/**
 * 由顺序时延分析结果构建真实泳道视图。
 * 每个请求自带一组阶段样本；泳道块 / 步骤树按 requestId 归属请求，
 * 面板按当前选中请求过滤展示。
 */
export function buildLatencyViewModelFromAnalysis(
  rules: RuleRecordDto[],
  analysis: LatencyAnalysis,
  fallback: RequestViewModel,
): RequestViewModel {
  const stages = rules
    .filter((rule) => rule.enabled && rule.recordType === 'stage' && (rule.applicationId || rule.processId))
    .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER))

  if (stages.length === 0 || analysis.requests.length === 0) {
    return fallback
  }

  const stageNameById = new Map(stages.map((stage) => [stage.id, stage.description || stage.name]))

  const requests: LatencyRequestViewModel[] = analysis.requests.map((request) => {
    const slowest = request.samples.reduce<StageSample | undefined>(
      (current, next) => (!current || next.durationMs > current.durationMs ? next : current),
      undefined,
    )
    const group: RequestGroup = request.totalMs >= 300 ? 'slow' : request.totalMs >= 240 ? 'abnormal' : 'normal'
    return {
      id: request.id,
      group,
      result: '完成',
      duration: `${request.totalMs}ms`,
      durationMs: request.totalMs,
      scene: '冒烟链路',
      slowPoint: slowest ? (stageNameById.get(slowest.stageId) ?? slowest.stageId) : '无',
      slowPointBlockId: slowest?.stageId ?? '',
    }
  })

  const context = buildDefinitionContext(rules)
  const lanes = Array.from(new Set(stages.map((stage) => getStageLane(stage, context))))

  const laneBlocks: LaneBlockViewModel[] = analysis.requests.flatMap((request) => {
    const samplesByStage = new Map(request.samples.map((sample) => [sample.stageId, sample]))
    const timestamps = request.samples.flatMap((sample) => [msOf(sample.startTimestamp), msOf(sample.endTimestamp)])
    if (timestamps.length === 0) return []
    const min = Math.min(...timestamps)
    const max = Math.max(...timestamps)
    const span = Math.max(1, max - min)

    return stages
      .map((stage): LaneBlockViewModel | null => {
        const sample = samplesByStage.get(stage.id)
        if (!sample) return null
        const start = msOf(sample.startTimestamp)
        const end = msOf(sample.endTimestamp)
        const startPercent = clampPercent(((start - min) / span) * 100)
        const widthPercent = clampPercent(((end - start) / span) * 100)

        return {
          id: stage.id,
          requestId: request.id,
          lane: getStageLane(stage, context),
          label: stage.description || stage.name,
          startPercent,
          widthPercent,
          kind: getStageKind(stage),
          duration: `${sample.durationMs}ms`,
          startTimestamp: sample.startTimestamp,
          endTimestamp: sample.endTimestamp,
          relativeDuration: `+${start - min}ms ~ +${end - min}ms`,
        }
      })
      .filter((block): block is LaneBlockViewModel => block !== null)
  })

  const stepTree: StepTreeRowViewModel[] = analysis.requests.flatMap((request) =>
    stages
      .filter((stage) => request.samples.some((sample) => sample.stageId === stage.id))
      .map((stage) => {
        const sample = request.samples.find((item) => item.stageId === stage.id)
        return {
          requestId: request.id,
          level: getStageKind(stage) === 'subprocess' ? 1 : 0,
          name: stage.description || stage.name,
          duration: sample ? `${sample.durationMs}ms` : '-',
          blockId: stage.id,
        } satisfies StepTreeRowViewModel
      }),
  )

  return {
    requestId: analysis.requests[0].id,
    requests,
    requestGroups,
    lanes,
    laneBlocks,
    stepTree,
    intervalStepOptions: uniqueDefinedValues(stages.map((stage) => stage.description || stage.name)),
    stats: analysis.stats,
  }
}

export function mapToViewModel(dto: LatencyAnalysisResult): RequestViewModel {
  return {
    requestId: dto.request_id,
    requests: buildSampleRequests(dto),
    requestGroups,
    lanes: sampleLanes,
    laneBlocks: sampleLaneBlocks,
    stepTree: sampleStepTree,
    intervalStepOptions: sampleIntervalStepOptions,
    stats: dto.stats,
  }
}
