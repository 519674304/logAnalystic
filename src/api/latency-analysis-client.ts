import { postJson } from './http-client'

export interface LatencyStageSpec {
  id: string
  /** 多个 start matcher，按数组顺序优先（首个命中的决定阶段开始）。 */
  startMarkers: LogMarker[]
  /** 多个 end matcher，按数组顺序优先（首个命中的决定阶段结束）。 */
  endMarkers: LogMarker[]
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
  /** 请求拆分点（flow 级 order=1 聚合起点），任一命中即压栈开新请求。 */
  requestStarts: LogMarker[]
  /** 拦截 stage（kind=intercept）的结束 matcher 集合，任一命中即弹出栈顶请求并整体丢弃。 */
  interceptEnds: LogMarker[]
  /** process 级 stage，产时延样本。 */
  processStages: LatencyStageSpec[]
}

interface AnalyzeRequestBody {
  path: string
  startTime?: string
  endTime?: string
  requestStarts: LogMarker[]
  interceptEnds: LogMarker[]
  processStages: LatencyStageSpec[]
}

/**
 * 端侧栈式时延分析：请求拆分、拦截过滤与 process 级 stage 时延全部由 Rust 后端完成。
 * 前端只做 spec 投影并发起一次分析请求。
 */
export async function analyzeLatencyStream(
  path: string,
  spec: LatencyAnalysisSpec,
): Promise<LatencyAnalysis> {
  const body: AnalyzeRequestBody = {
    path,
    requestStarts: spec.requestStarts,
    interceptEnds: spec.interceptEnds,
    processStages: spec.processStages,
  }
  return postJson<LatencyAnalysis>('/api/latency/analyze', body)
}
