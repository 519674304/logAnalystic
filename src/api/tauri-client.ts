import { TauriCommands } from './commands'
import type {
  LogSearchMode,
  LogSearchRequestDto,
  LogSearchResponseDto,
} from './dto'

const sampleLogLines = [
  '2026-06-12 10:39:38.257 [WARN] A00010 mainProcess dispatch wakeup request',
  '2026-06-12 10:39:39.014 [INFO] A00010 wakeup handler begin',
  '2026-06-12 10:39:40.002 [INFO] A00010 wakeup handler finished',
  '2026-06-12 10:40:02.120 [ERROR] A00011 health check timeout, retry later',
  '2026-06-12 10:40:03.088 [INFO] A00011 health check retry accepted',
  '2026-06-12 10:41:10.430 [INFO] A00010 dfx heartbeat normal',
  '2026-06-12 10:42:01.890 [ERROR] A00012 business flow node 2 exception in parser',
]

function parseLine(rawLine: string, lineNumber: number) {
  const match = rawLine.match(
    /^(\S+\s+\S+)\s+\[(\w+)\]\s+(\S+)\s+(.*)$/
  )

  if (!match) {
    return {
      lineNumber,
      rawLine,
      timestamp: '',
      app: '',
      level: 'INFO',
    }
  }

  return {
    lineNumber,
    rawLine,
    timestamp: match[1],
    level: match[2],
    app: match[3],
    message: match[4],
  }
}

function localSearch(request: LogSearchRequestDto): LogSearchResponseDto {
  const source = sampleLogLines.map(parseLine)
  const matcher =
    request.mode === 'regex'
      ? (value: string) => {
          try {
            return new RegExp(request.query, request.caseSensitive ? '' : 'i').test(value)
          } catch {
            return false
          }
        }
      : (value: string) => {
          const left = request.caseSensitive ? value : value.toLowerCase()
          const right = request.caseSensitive ? request.query : request.query.toLowerCase()
          return left.includes(right)
        }

  const hits = source
    .filter((entry) => matcher(entry.rawLine))
    .map((entry) => {
      const start = Math.max(0, entry.lineNumber - 1 - request.contextLines)
      const end = Math.min(source.length, entry.lineNumber + request.contextLines)

      return {
        lineNumber: entry.lineNumber,
        rawLine: entry.rawLine,
        timestamp: entry.timestamp,
        app: entry.app,
        level: entry.level,
        before: source.slice(start, entry.lineNumber - 1).map((item) => item.rawLine),
        after: source.slice(entry.lineNumber, end).map((item) => item.rawLine),
      }
    })

  return {
    totalMatches: hits.length,
    hits,
  }
}

export async function health(): Promise<string> {
  void TauriCommands.health
  return 'ok'
}

export async function searchLogs(
  request: LogSearchRequestDto
): Promise<LogSearchResponseDto> {
  const invoke = (globalThis as typeof globalThis & {
    __TAURI__?: { invoke?: (command: string, payload: unknown) => Promise<unknown> }
  }).__TAURI__?.invoke

  if (invoke) {
    try {
      const result = await invoke('search_logs', request)
      return result as LogSearchResponseDto
    } catch {
      return localSearch(request)
    }
  }

  return localSearch(request)
}
