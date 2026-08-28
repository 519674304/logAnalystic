import { searchLogs } from './http-client'
import type { LogSearchHitDto } from './dto'

export interface LatencyStageSpec {
  id: string
  startPattern: string
  endPattern: string
  startMode?: 'keyword' | 'regex'
  endMode?: 'keyword' | 'regex'
}

export interface StageSample {
  stageId: string
  startTimestamp: string
  endTimestamp: string
  durationMs: number
}

export interface RequestAnalysis {
  id: string
  totalMs: number
  samples: StageSample[]
}

export interface LatencyAnalysis {
  requests: RequestAnalysis[]
  stats: {
    sampleCount: number
    averageMs: number
    p90Ms: number
    maxMs: number
  }
}

/** 单个日志标记：匹配 pattern + 匹配方式。 */
export interface LogMarker {
  pattern: string
  mode: 'keyword' | 'regex'
}

/** 一次时延分析的全部输入：请求拆分、拦截与产样本的 process 级 stage。 */
export interface LatencyAnalysisSpec {
  /** 请求拆分点（flow 级 order=1 聚合起点），命中即压栈开新请求。 */
  requestStart: LogMarker
  /** 拦截 stage（kind=intercept）的结束 matcher 集合，任一命中即弹出栈顶请求并整体丢弃。 */
  interceptEnds: LogMarker[]
  /** process 级 stage，产时延样本。 */
  processStages: LatencyStageSpec[]
}

type HitRole =
  | { kind: 'start' }
  | { kind: 'intercept' }
  | { kind: 'stage'; stageId: string; boundary: 'start' | 'end' }

interface TimedHit {
  ts: number
  rawTs: string
  line: number
  role: HitRole
}

interface OpenRequest {
  startRaw: string
  stageEvents: Map<string, { starts: Array<{ ts: number; raw: string }>; ends: Array<{ ts: number; raw: string }> }>
}

function parseTimestamp(ts: string): number {
  const millis = Date.parse(ts.replace(' ', 'T'))
  if (Number.isNaN(millis)) {
    throw new Error(`无法解析时间戳: ${ts}`)
  }
  return millis
}

function searchKey(mode: 'keyword' | 'regex', query: string) {
  return `${mode}|${query}`
}

async function searchPattern(
  path: string,
  query: string,
  mode: 'keyword' | 'regex',
  cache: Map<string, LogSearchHitDto[]>,
): Promise<LogSearchHitDto[]> {
  const key = searchKey(mode, query)
  const cached = cache.get(key)
  if (cached) return cached

  const result = await searchLogs({ path, query, mode, caseSensitive: false, contextLines: 0 })
  if (result.truncated) {
    throw new Error(`模式命中过多被截断，请缩小时间范围: ${query}`)
  }
  cache.set(key, result.hits)
  return result.hits
}

function computeStats(durations: number[]): LatencyAnalysis['stats'] {
  if (durations.length === 0) {
    return { sampleCount: 0, averageMs: 0, p90Ms: 0, maxMs: 0 }
  }
  const sorted = [...durations].sort((a, b) => a - b)
  const averageMs = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
  const p90Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)
  return {
    sampleCount: durations.length,
    averageMs,
    p90Ms: sorted[p90Index],
    maxMs: sorted[sorted.length - 1],
  }
}

/**
 * 端侧栈式时延分析：无 requestId，日志按时间顺序发生。
 *
 * 请求按栈（LIFO）划分：requestStart 命中即压栈开新请求；拦截 end matcher 命中弹出栈顶请求并
 * 整体丢弃（拦截优先），之后日志跟回前一个请求；日志结束统一结算栈中剩余请求。真实时延样本
 * 来自 process 级 stage，每个 stage 只取第一对 start/end，重复命中丢弃。
 *
 * 端侧场景：请求基本逐个处理，第二个请求在第一个处理中途进来时几乎立刻被拦截（压栈后被拦截
 * 弹出丢弃），外层请求不受影响。
 */
export async function analyzeLatencyStream(
  path: string,
  spec: LatencyAnalysisSpec,
): Promise<LatencyAnalysis> {
  const cache = new Map<string, LogSearchHitDto[]>()
  const hits: TimedHit[] = []

  async function collect(marker: LogMarker | undefined, role: HitRole) {
    if (!marker) return
    const result = await searchPattern(path, marker.pattern, marker.mode, cache)
    for (const hit of result) {
      hits.push({ ts: parseTimestamp(hit.timestamp), rawTs: hit.timestamp, line: hit.lineNumber, role })
    }
  }

  await collect(spec.requestStart, { kind: 'start' })
  for (const marker of spec.interceptEnds) await collect(marker, { kind: 'intercept' })
  for (const stage of spec.processStages) {
    await collect(
      { pattern: stage.startPattern, mode: stage.startMode ?? 'keyword' },
      { kind: 'stage', stageId: stage.id, boundary: 'start' },
    )
    await collect(
      { pattern: stage.endPattern, mode: stage.endMode ?? 'keyword' },
      { kind: 'stage', stageId: stage.id, boundary: 'end' },
    )
  }

  hits.sort((a, b) => a.ts - b.ts || a.line - b.line)

  const stack: OpenRequest[] = []

  for (const hit of hits) {
    switch (hit.role.kind) {
      case 'start':
        stack.push({ startRaw: hit.rawTs, stageEvents: new Map() })
        break
      case 'intercept':
        // 拦截优先：弹出最近的未闭合请求（找到它之前的 start 成对丢弃），其 stage 事件一并丢弃。
        stack.pop()
        break
      case 'stage': {
        const req = stack[stack.length - 1]
        if (!req) break
        let events = req.stageEvents.get(hit.role.stageId)
        if (!events) {
          events = { starts: [], ends: [] }
          req.stageEvents.set(hit.role.stageId, events)
        }
        if (hit.role.boundary === 'start') events.starts.push({ ts: hit.ts, raw: hit.rawTs })
        else events.ends.push({ ts: hit.ts, raw: hit.rawTs })
        break
      }
    }
  }

  const requests = stack.map(finalize)
  const durations = requests.flatMap((request) => request.samples.map((sample) => sample.durationMs))
  return { requests, stats: computeStats(durations) }
}

function finalize(req: OpenRequest): RequestAnalysis {
  const samples: StageSample[] = []
  for (const [stageId, events] of req.stageEvents) {
    // 每个 stage 只取第一个配对：stage 重复出现，只要第一对 start/end，其余丢弃。
    const firstStart = events.starts[0]
    const firstEnd = events.ends[0]
    if (firstStart && firstEnd) {
      samples.push({
        stageId,
        startTimestamp: firstStart.raw,
        endTimestamp: firstEnd.raw,
        durationMs: Math.max(0, firstEnd.ts - firstStart.ts),
      })
    }
  }
  const allTimestamps = samples.flatMap((sample) => [
    parseTimestamp(sample.startTimestamp),
    parseTimestamp(sample.endTimestamp),
  ])
  const totalMs = allTimestamps.length === 0 ? 0 : Math.max(...allTimestamps) - Math.min(...allTimestamps)
  return { id: req.startRaw, totalMs, samples }
}
