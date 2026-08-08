import type { LogSearchResponseDto } from '../api/dto'

export interface LogSearchHitViewModel {
  lineNumber: number
  headline: string
  filePath?: string
  sourceUri?: string
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

function buildSourceUri(filePath: string | undefined, lineNumber: number) {
  if (!filePath) {
    return undefined
  }

  const normalizedPath = filePath.replace(/\\/g, '/')
  return `vscode://file/${encodeURI(normalizedPath)}:${lineNumber}`
}

export function mapLogSearchToViewModel(dto: LogSearchResponseDto): LogSearchViewModel {
  return {
    totalMatches: dto.totalMatches,
    hits: dto.hits
      .map((hit) => ({
        lineNumber: hit.lineNumber,
        headline: hit.rawLine,
        filePath: hit.filePath,
        sourceUri: buildSourceUri(hit.filePath, hit.lineNumber),
        timestamp: hit.timestamp,
        app: hit.app,
        level: hit.level,
        contextBefore: hit.before,
        contextAfter: hit.after,
      }))
      .sort((left, right) => {
        const byTimestamp = left.timestamp.localeCompare(right.timestamp)
        return byTimestamp === 0 ? left.lineNumber - right.lineNumber : byTimestamp
      }),
  }
}
