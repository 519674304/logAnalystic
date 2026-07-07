import { LatencyAnalysisResult } from '../api/dto'

export interface StageViewModel {
  id: string
  name: string
  durationMs?: number
  color: string
}

export interface RequestViewModel {
  requestId: string
  stages: StageViewModel[]
  stats: LatencyAnalysisResult['stats']
}

const STAGE_COLORS = ['#38bdf8', '#818cf8', '#22c55e', '#f97316']

export function mapToViewModel(dto: LatencyAnalysisResult): RequestViewModel {
  return {
    requestId: dto.request_id,
    stages: dto.hits.flatMap((hit) =>
      hit.stages.map((stage, index) => ({
        id: stage.id,
        name: stage.name,
        color: STAGE_COLORS[index % STAGE_COLORS.length],
      }))
    ),
    stats: dto.stats,
  }
}
