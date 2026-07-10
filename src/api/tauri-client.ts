import { TauriCommands } from './commands'
import type {
  LogSearchRequestDto,
  LogSearchResponseDto,
  RuleCatalogImportDto,
  RuleRecordDto,
  SavedQueryDto,
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

const savedQueryStorageKey = 'log-analystic.saved-queries'
const ruleCatalogStorageKey = 'log-analystic.rule-catalog'

function parseLine(rawLine: string, lineNumber: number) {
  const match = rawLine.match(/^(\S+\s+\S+)\s+\[(\w+)\]\s+(\S+)\s+(.*)$/)

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

function readLocalList<T>(storageKey: string): T[] {
  const rawValue = globalThis.localStorage?.getItem(storageKey)
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function writeLocalList(storageKey: string, value: unknown[]) {
  globalThis.localStorage?.setItem(storageKey, JSON.stringify(value))
}

async function invokeCommand<T>(command: string, payload?: unknown): Promise<T | null> {
  const invoke = (globalThis as typeof globalThis & {
    __TAURI__?: { invoke?: (commandName: string, body?: unknown) => Promise<unknown> }
  }).__TAURI__?.invoke

  if (!invoke) {
    return null
  }

  return (await invoke(command, payload)) as T
}

function toRuleRecord(input: {
  id: string
  name?: string
  description?: string
  business_meaning?: string
  pattern?: string
  enabled?: boolean
  export_enabled?: boolean
  scenarios?: string[]
  applicable_scenario_ids?: string[]
}): RuleRecordDto {
  return {
    id: input.id,
    name: input.name ?? input.business_meaning ?? '未命名规则',
    description: input.description ?? input.business_meaning ?? '',
    pattern: input.pattern ?? '',
    enabled: input.enabled ?? true,
    exportEnabled: input.export_enabled ?? true,
    scenarios: input.scenarios ?? input.applicable_scenario_ids ?? [],
  }
}

async function parseLocalRuleCatalogImport(sourceName: string, content: string): Promise<RuleRecordDto[]> {
  const trimmed = content.trim()
  if (!trimmed) {
    return []
  }

  if (sourceName.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) {
      return parsed as RuleRecordDto[]
    }
  }

  if (sourceName.toLowerCase().endsWith('.toml') || sourceName.toLowerCase().endsWith('.txt')) {
    const tomlModule = await import('toml')
    const parsed = tomlModule.parse(trimmed) as {
      log_matchers?: Array<{
        id: string
        name?: string
        description?: string
        business_meaning?: string
        pattern?: string
        enabled?: boolean
        export_enabled?: boolean
        scenarios?: string[]
        applicable_scenario_ids?: string[]
      }>
      rules?: Array<{
        id: string
        name?: string
        description?: string
        business_meaning?: string
        pattern?: string
        enabled?: boolean
        export_enabled?: boolean
        scenarios?: string[]
        applicable_scenario_ids?: string[]
      }>
    }

    const logMatchers = Array.isArray(parsed.log_matchers) ? parsed.log_matchers.map(toRuleRecord) : []
    const rules = Array.isArray(parsed.rules) ? parsed.rules.map(toRuleRecord) : []
    const merged = [...logMatchers, ...rules]

    if (merged.length > 0) {
      return merged
    }
  }

  return []
}

export async function health(): Promise<string> {
  void TauriCommands.health
  return 'ok'
}

export async function searchLogs(request: LogSearchRequestDto): Promise<LogSearchResponseDto> {
  const result = await invokeCommand<LogSearchResponseDto>(TauriCommands.searchLogs, request)
  return result ?? localSearch(request)
}

export async function listSavedQueries(): Promise<SavedQueryDto[]> {
  const result = await invokeCommand<SavedQueryDto[]>(TauriCommands.listSavedQueries)
  return result ?? readLocalList<SavedQueryDto>(savedQueryStorageKey)
}

export async function upsertSavedQuery(query: SavedQueryDto): Promise<SavedQueryDto[]> {
  const result = await invokeCommand<SavedQueryDto[]>(TauriCommands.upsertSavedQuery, query)
  if (result) {
    return result
  }

  const current = readLocalList<SavedQueryDto>(savedQueryStorageKey)
  const next = current.some((item) => item.id === query.id)
    ? current.map((item) => (item.id === query.id ? query : item))
    : [...current, query]
  writeLocalList(savedQueryStorageKey, next)
  return next
}

export async function deleteSavedQuery(queryId: string): Promise<SavedQueryDto[]> {
  const result = await invokeCommand<SavedQueryDto[]>(TauriCommands.deleteSavedQuery, queryId)
  if (result) {
    return result
  }

  const next = readLocalList<SavedQueryDto>(savedQueryStorageKey).filter((item) => item.id !== queryId)
  writeLocalList(savedQueryStorageKey, next)
  return next
}

export async function listRuleCatalog(): Promise<RuleRecordDto[]> {
  const result = await invokeCommand<RuleRecordDto[]>(TauriCommands.listRuleCatalog)
  return result ?? readLocalList<RuleRecordDto>(ruleCatalogStorageKey)
}

export async function upsertRuleCatalog(rule: RuleRecordDto): Promise<RuleRecordDto[]> {
  const result = await invokeCommand<RuleRecordDto[]>(TauriCommands.upsertRuleCatalog, rule)
  if (result) {
    return result
  }

  const current = readLocalList<RuleRecordDto>(ruleCatalogStorageKey)
  const next = current.some((item) => item.id === rule.id)
    ? current.map((item) => (item.id === rule.id ? rule : item))
    : [...current, rule]
  writeLocalList(ruleCatalogStorageKey, next)
  return next
}

export async function deleteRuleCatalog(ruleId: string): Promise<RuleRecordDto[]> {
  const result = await invokeCommand<RuleRecordDto[]>(TauriCommands.deleteRuleCatalog, ruleId)
  if (result) {
    return result
  }

  const next = readLocalList<RuleRecordDto>(ruleCatalogStorageKey).filter((item) => item.id !== ruleId)
  writeLocalList(ruleCatalogStorageKey, next)
  return next
}

export async function importRuleCatalog(payload: RuleCatalogImportDto): Promise<RuleRecordDto[]> {
  const result = await invokeCommand<RuleRecordDto[]>(TauriCommands.importRuleCatalog, payload)
  if (result) {
    return result
  }

  const importedRules = await parseLocalRuleCatalogImport(payload.sourceName, payload.content)
  writeLocalList(ruleCatalogStorageKey, importedRules)
  return importedRules
}
