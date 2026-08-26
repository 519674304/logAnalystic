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
 * 顺序时延分析：端侧日志按时间顺序发生，无 requestId。
 *
 * 对每个 stage，分别用 /api/search 拉取 start/end 匹配器的全部命中（按文件与行号有序），
 * 然后按下标顺序配对：第 i 个 start 命中 → 第 i 个 end 命中，构成一个时延样本。
 * 每个请求的窗口 = 该请求所有阶段样本的最小 start ~ 最大 end。
 */
export async function analyzeSequentialLatency(
  path: string,
  stages: LatencyStageSpec[],
): Promise<LatencyAnalysis> {
  const cache = new Map<string, LogSearchHitDto[]>()
  const stageHits: Array<{ spec: LatencyStageSpec; starts: LogSearchHitDto[]; ends: LogSearchHitDto[] }> = []

  for (const spec of stages) {
    const starts = await searchPattern(path, spec.startPattern, spec.startMode ?? 'keyword', cache)
    const ends = await searchPattern(path, spec.endPattern, spec.endMode ?? 'keyword', cache)
    stageHits.push({ spec, starts, ends })
  }

  const requestCount = stageHits.reduce(
    (min, { starts, ends }) => Math.min(min, starts.length, ends.length),
    Number.MAX_SAFE_INTEGER,
  )
  if (requestCount === 0 || !Number.isFinite(requestCount)) {
    throw new Error('日志中未匹配到任何完整阶段')
  }

  const requests: RequestAnalysis[] = []
  for (let i = 0; i < requestCount; i += 1) {
    const samples: StageSample[] = []
    for (const { spec, starts, ends } of stageHits) {
      const start = starts[i]
      const end = ends[i]
      if (!start || !end) continue
      const startMs = parseTimestamp(start.timestamp)
      const endMs = parseTimestamp(end.timestamp)
      samples.push({
        stageId: spec.id,
        startTimestamp: start.timestamp,
        endTimestamp: end.timestamp,
        durationMs: Math.max(0, endMs - startMs),
      })
    }
    if (samples.length === 0) continue

    const timestamps = samples.flatMap((sample) => [
      parseTimestamp(sample.startTimestamp),
      parseTimestamp(sample.endTimestamp),
    ])
    const totalMs = Math.max(0, Math.max(...timestamps) - Math.min(...timestamps))
    const id = samples.reduce((earliest, sample) =>
      sample.startTimestamp < earliest.startTimestamp ? sample : earliest,
    ).startTimestamp
    requests.push({ id, totalMs, samples })
  }

  const durations = requests.flatMap((request) => request.samples.map((sample) => sample.durationMs))
  return { requests, stats: computeStats(durations) }
}
