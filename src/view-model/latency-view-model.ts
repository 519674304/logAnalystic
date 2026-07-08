import type { LatencyAnalysisResult } from '../api/dto'

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
}

export interface StepTreeRowViewModel {
  level: number
  name: string
  duration: string
  blockId: string
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

const lanes = ['A应用主流程', 'A应用子进程1', 'A应用子进程2', 'B应用处理', 'C应用回调']

const laneBlocks: LaneBlockViewModel[] = [
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

const stepTree: StepTreeRowViewModel[] = [
  { level: 0, name: 'A阶段', duration: '180ms', blockId: 'parse' },
  { level: 1, name: '参数解析', duration: '24ms', blockId: 'parse' },
  { level: 1, name: '触发子进程', duration: '18ms', blockId: 'dispatch' },
  { level: 1, name: 'RPC调用B', duration: '42ms', blockId: 'rpc-b' },
  { level: 1, name: '子进程分支', duration: '90ms', blockId: 'sub-1' },
  { level: 2, name: '子进程1 / 执行任务', duration: '80ms', blockId: 'sub-1' },
  { level: 2, name: '子进程2 / 执行任务', duration: '65ms', blockId: 'sub-2' },
  { level: 1, name: '汇总结果', duration: '20ms', blockId: 'join' },
]

const intervalStepOptions = [
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

export function mapToViewModel(dto: LatencyAnalysisResult): RequestViewModel {
  return {
    requestId: dto.request_id,
    requests: buildSampleRequests(dto),
    requestGroups,
    lanes,
    laneBlocks,
    stepTree,
    intervalStepOptions,
    stats: dto.stats,
  }
}
