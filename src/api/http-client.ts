import type { LogSearchRequestDto, LogSearchResponseDto } from './dto'

const BASE_URL = 'http://127.0.0.1:8080'

export class ApiHttpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiHttpError'
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiHttpError(`无法连接服务端（${BASE_URL}），请先运行 cargo run -p server`)
  }

  if (!response.ok) {
    let message = `请求失败（HTTP ${response.status}）`
    try {
      const data = (await response.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      // 忽略错误体解析失败，保留默认文案
    }
    throw new ApiHttpError(message)
  }

  return (await response.json()) as T
}

export function searchLogs(request: LogSearchRequestDto): Promise<LogSearchResponseDto> {
  return postJson<LogSearchResponseDto>('/api/search', request)
}
