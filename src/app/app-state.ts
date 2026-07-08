import type { LatencyAnalysisResult } from '../api/dto'

export type SavedQuery = {
  id: string
  name: string
  description: string
  query: string
  timeRange: string
}

export type IssueRule = {
  id: string
  pattern: string
  explanation: string
  severity: 'TIP' | 'WARNING' | 'EXCEPTION'
}

export type LogEntry = {
  time: string
  app: string
  message: string
  level: 'INFO' | 'WARN' | 'ERROR'
}

export const savedQueries: SavedQuery[] = [
  {
    id: 'q1',
    name: '唤醒请求',
    description: '定位 wakeup 相关关键日志',
    query: 'wakeup',
    timeRange: '06-12 10:30 ~ 10:45',
  },
  {
    id: 'q2',
    name: '健康检查失败',
    description: '查看流程中的健康检查异常日志',
    query: 'health check',
    timeRange: '06-12 10:30 ~ 10:40',
  },
]

export const issueRules: IssueRule[] = [
  {
    id: 'rule-1',
    pattern: 'wakeup request',
    explanation: '唤醒请求异常，通常需要先看主流程开始日志和调度日志是否完整。',
    severity: 'WARNING',
  },
  {
    id: 'rule-2',
    pattern: 'health check timeout',
    explanation: '健康检查超时，建议先检查依赖服务状态和重试链路。',
    severity: 'EXCEPTION',
  },
]

export const sampleLogs: LogEntry[] = [
  {
    time: '06-12 10:39:38.257',
    app: 'A应用',
    message: 'mainProcess dispatch wakeup request',
    level: 'WARN',
  },
  {
    time: '06-12 10:40:02.120',
    app: 'B应用',
    message: 'health check timeout, retry later',
    level: 'ERROR',
  },
]

export const latencyResult: LatencyAnalysisResult = {
  id: 'req-001',
  request_id: '2026-06-12 10:39:38.257',
  hits: [
    {
      id: 'hit-1',
      application_id: 'A应用',
      process_id: 'wakeup',
      stages: [
        { id: 's1', name: 'A参数解析', start_matcher_id: 'm1', end_matcher_id: 'm2' },
        { id: 's2', name: 'A调用B', start_matcher_id: 'm2', end_matcher_id: 'm3' },
        { id: 's3', name: 'B处理请求', start_matcher_id: 'm3', end_matcher_id: 'm4' },
        { id: 's4', name: 'A汇总结果', start_matcher_id: 'm4', end_matcher_id: 'm5' },
      ],
    },
  ],
  stats: { sampleCount: 16, averageMs: 95, p90Ms: 182, maxMs: 240 },
}
