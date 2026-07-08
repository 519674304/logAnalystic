import type { LogSearchResponseDto } from '../api/dto'

export interface LogSearchHitViewModel {
  lineNumber: number
  headline: string
  timestamp: string
  app: string
  level: string
  contextBefore: string[]
  contextAfter: string[]
}

export interface LogSearchViewModel {
  totalMatches: number
  hits: LogSearchHitViewModel[]
}

export function mapLogSearchToViewModel(dto: LogSearchResponseDto): LogSearchViewModel {
  return {
    totalMatches: dto.totalMatches,
    hits: dto.hits.map((hit) => ({
      lineNumber: hit.lineNumber,
      headline: hit.rawLine,
      timestamp: hit.timestamp,
      app: hit.app,
      level: hit.level,
      contextBefore: hit.before,
      contextAfter: hit.after,
    })),
  }
}
