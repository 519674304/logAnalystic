import type { LatencyAnalysisResult } from '../api/dto'

export type SavedQuery = {
  id: string
  name: string
  description: string
  query: string
  timeRange: string
}

export type LogEntry = {
  time: string
  app: string
  message: string
  level: 'INFO' | 'WARN' | 'ERROR'
}

export type IssueRule = {
  id: string
  pattern: string
  explanation: string
  severity: 'TIP' | 'WARNING' | 'EXCEPTION'
}

export const savedQueries: SavedQuery[] = [
  {
    id: 'q1',
    name: '唤醒请求',
    description: '定位 wakeup 相关异常',
    query: 'wakeup',
    timeRange: '06-12 10:30 ~ 10:45',
  },
  {
    id: 'q2',
    name: '健康检查失败',
    description: '查看流程中的健康检查日志',
    query: 'health check',
    timeRange: '06-12 10:30 ~ 10:40',
  },
]

export const sampleLogs: LogEntry[] = [
  {
    time: '06-12 10:39:38.257',
    app: 'A00010',
    message: 'mainProcess dispatch wakeup request [undefined,]',
    level: 'WARN',
  },
  {
    time: '06-12 10:40:02.120',
    app: 'A00011',
    message: 'health check timeout, retry later',
    level: 'ERROR',
  },
  {
    time: '06-12 10:41:10.430',
    app: 'A00010',
    message: 'dfx heartbeat normal',
    level: 'INFO',
  },
  {
    time: '06-12 10:42:01.890',
    app: 'A00012',
    message: 'business flow node 2 exception in parser',
    level: 'ERROR',
  },
]

export const issueRules: IssueRule[] = [
  {
    id: 'rule-1',
    pattern: 'wakeup request',
    explanation: '唤醒请求异常，通常由前台组件调度链路引起。',
    severity: 'WARNING',
  },
  {
    id: 'rule-2',
    pattern: 'health check timeout',
    explanation: '健康检查超时，建议先检查依赖服务状态。',
    severity: 'EXCEPTION',
  },
]

export const latencyResult: LatencyAnalysisResult = {
  id: 'req-001',
  request_id: 'req-001',
  hits: [
    {
      id: 'hit-1',
      application_id: 'A00010',
      process_id: 'wakeup',
      stages: [
        { id: 's1', name: 'dispatch', start_matcher_id: 'm1', end_matcher_id: 'm2' },
        { id: 's2', name: 'handler', start_matcher_id: 'm2', end_matcher_id: 'm3' },
        { id: 's3', name: 'callback', start_matcher_id: 'm3', end_matcher_id: 'm4' },
      ],
    },
  ],
  stats: { sampleCount: 16, averageMs: 95, p90Ms: 182, maxMs: 240 },
}
