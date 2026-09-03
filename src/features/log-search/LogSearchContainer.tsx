import { useEffect, useMemo, useRef, useState } from 'react'
import {
  deleteSavedQuery,
  listSavedQueries,
  upsertSavedQuery,
} from '../../api/tauri-client'
import type { LogSearchRequestDto, RuleRecordDto, SavedQueryDto } from '../../api/dto'
import { searchLogs } from '../../api/http-client'
import {
  readPersistedMatcherIds,
  writePersistedMatcherIds,
} from '../../app/workbench-preferences'
import { mapLogSearchToViewModel } from '../../view-model/log-search-view-model'
import type { LogSearchViewModel } from '../../view-model/log-search-view-model'
import { buildMatcherSearchRegex } from '../../view-model/matcher-search-view-model'
import LogSearchPanel from './LogSearchPanel'

type Props = {
  logFolderPath: string
  timeRange: string
  matcherRecords: RuleRecordDto[]
  scenarios: Array<{ id: string; name: string }>
  matcherContextKey: string
  onTimeRangeChange: (value: string) => void
  onRememberFolder: (path: string) => void
}

function createDraftId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createEmptySavedQuery(timeRange: string): SavedQueryDto {
  return {
    id: createDraftId('query'),
    name: '',
    description: '',
    group: 'core',
    tags: [],
    query: '',
    mode: 'keyword',
    caseSensitive: false,
    timeRange,
    matcherIds: [],
  }
}

function parseTimeRange(timeRange: string): { startTime?: string; endTime?: string } {
  const [start, end] = timeRange.split('~').map((part) => part.trim())
  return { startTime: start || undefined, endTime: end || undefined }
}

function normalizeSavedQuery(draft: SavedQueryDto, timeRange: string): SavedQueryDto {
  return {
    ...draft,
    name: draft.name.trim() || draft.query.trim() || '未命名查询',
    description: draft.description.trim(),
    group: draft.group.trim() || 'core',
    tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
    query: draft.query.trim(),
    timeRange: timeRange.trim() || draft.timeRange,
    matcherIds: draft.matcherIds ?? [],
  }
}

export default function LogSearchContainer({
  logFolderPath,
  timeRange,
  matcherRecords,
  scenarios,
  matcherContextKey,
  onTimeRangeChange,
  onRememberFolder,
}: Props) {
  const [savedQueries, setSavedQueries] = useState<SavedQueryDto[]>([])
  const [activeQueryId, setActiveQueryId] = useState('')
  const [queryDraft, setQueryDraft] = useState<SavedQueryDto>(() => createEmptySavedQuery(timeRange))
  const [queryEditorOpen, setQueryEditorOpen] = useState(false)
  const [queryEditorDraft, setQueryEditorDraft] = useState<SavedQueryDto>(() => createEmptySavedQuery(timeRange))
  const [searchSource, setSearchSource] = useState<'manual' | 'matcher'>('manual')
  const [selectedMatcherIds, setSelectedMatcherIds] = useState<string[]>(() => readPersistedMatcherIds())
  const [result, setResult] = useState<LogSearchViewModel | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const matcherById = useMemo(() => new Map(matcherRecords.map((matcher) => [matcher.id, matcher])), [matcherRecords])
  const initializedMatcherContext = useRef(false)

  const rememberMatchers = (next: string[]) => {
    setSelectedMatcherIds(next)
    writePersistedMatcherIds(next)
  }

  const runSearch = async (input?: {
    record?: SavedQueryDto
    source?: 'manual' | 'matcher'
    matcherIds?: string[]
    timeRange?: string
  }) => {
    const record = input?.record ?? queryDraft
    const source = input?.source ?? searchSource
    const matcherIds = input?.matcherIds ?? selectedMatcherIds
    const { startTime, endTime } = parseTimeRange(input?.timeRange ?? timeRange)
    if (!logFolderPath.trim()) return setErrorMessage('请先选择日志文件夹')
    onRememberFolder(logFolderPath)

    let request: LogSearchRequestDto
    if (source === 'matcher') {
      const matchers = matcherIds
        .map((id) => matcherById.get(id))
        .filter((matcher): matcher is RuleRecordDto => Boolean(matcher))
      const regex = buildMatcherSearchRegex(matchers)
      if (!regex) return setErrorMessage('请选择至少一个 matcher')
      request = { path: logFolderPath, query: regex, mode: 'regex', caseSensitive: false, contextLines: 1, startTime, endTime }
    } else {
      if (!record.query.trim()) return setErrorMessage('请输入搜索内容')
      request = { path: logFolderPath, query: record.query, mode: record.mode, caseSensitive: record.caseSensitive, contextLines: 1, startTime, endTime }
    }

    setIsSearching(true)
    setErrorMessage(null)
    try {
      setResult(mapLogSearchToViewModel(await searchLogs(request)))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '搜索失败')
    } finally {
      setIsSearching(false)
    }
  }

  const applyQuery = (query: SavedQueryDto) => {
    const matcherIds = query.matcherIds ?? []
    const source: 'manual' | 'matcher' = matcherIds.length > 0 ? 'matcher' : 'manual'
    setActiveQueryId(query.id)
    setQueryDraft(query)
    setSearchSource(source)
    onTimeRangeChange(query.timeRange)
    if (matcherIds.length > 0) rememberMatchers(matcherIds)
    return { source, matcherIds }
  }

  useEffect(() => {
    let cancelled = false
    async function loadQueries() {
      try {
        const loaded = await listSavedQueries()
        if (cancelled) return
        setSavedQueries(loaded)
        const validMatcherIds = new Set(matcherRecords.map((matcher) => matcher.id))
        const persisted = readPersistedMatcherIds().filter((id) => validMatcherIds.has(id))
        if (persisted.length > 0) {
          setActiveQueryId('')
          setQueryDraft(createEmptySavedQuery(timeRange))
          setSearchSource('matcher')
          rememberMatchers(persisted)
        } else if (loaded[0]) {
          const { source, matcherIds } = applyQuery(loaded[0])
          void runSearch({ record: loaded[0], source, matcherIds, timeRange: loaded[0].timeRange })
        }
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : '加载本地配置失败')
      }
    }
    void loadQueries()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!initializedMatcherContext.current) {
      initializedMatcherContext.current = true
      return
    }
    rememberMatchers([])
    setSearchSource('manual')
  }, [matcherContextKey])

  const selectQuery = (queryId: string) => {
    const next = savedQueries.find((item) => item.id === queryId)
    if (!next) return
    const { source, matcherIds } = applyQuery(next)
    void runSearch({ record: next, source, matcherIds, timeRange: next.timeRange })
  }

  const resetToDraft = () => {
    setActiveQueryId('')
    setQueryDraft(createEmptySavedQuery(timeRange))
    setSearchSource('manual')
    setResult(null)
  }

  const saveCurrentQuery = async () => {
    const matcherIds = searchSource === 'matcher' ? selectedMatcherIds : []
    const next = normalizeSavedQuery({ ...queryDraft, matcherIds }, timeRange)
    const updated = await upsertSavedQuery(next)
    setSavedQueries(updated)
    setActiveQueryId(next.id)
    setQueryDraft(next)
    setErrorMessage(null)
  }

  const saveQueryFromEditor = async () => {
    const next = normalizeSavedQuery({ ...queryEditorDraft, timeRange }, timeRange)
    const updated = await upsertSavedQuery(next)
    setSavedQueries(updated)
    setQueryEditorDraft(next)
    setQueryEditorOpen(false)
    const { source, matcherIds } = applyQuery(next)
    void runSearch({ record: next, source, matcherIds, timeRange: next.timeRange })
  }

  const removeQuery = async (queryId: string) => {
    const updated = await deleteSavedQuery(queryId)
    setSavedQueries(updated)
    const next = updated[0]
    if (next) {
      const { source, matcherIds } = applyQuery(next)
      void runSearch({ record: next, source, matcherIds, timeRange: next.timeRange })
      return
    }
    setActiveQueryId('')
    setQueryDraft(createEmptySavedQuery(timeRange))
    setSearchSource('manual')
    setResult(null)
  }

  return (
    <LogSearchPanel
      savedQueries={savedQueries}
      activeQueryId={activeQueryId}
      queryDraft={queryDraft}
      isSearching={isSearching}
      result={result}
      errorMessage={errorMessage}
      queryEditorOpen={queryEditorOpen}
      queryEditorDraft={queryEditorDraft}
      onSelectQuery={selectQuery}
      onSelectDraft={resetToDraft}
      onOpenQueryEditor={(queryId) => {
        const next = savedQueries.find((item) => item.id === queryId)
        if (!next) return
        setQueryEditorDraft(next)
        setQueryEditorOpen(true)
      }}
      onQueryDraftChange={setQueryDraft}
      onSaveCurrentQuery={() => void saveCurrentQuery()}
      onSearch={() => void runSearch()}
      onCloseQueryEditor={() => setQueryEditorOpen(false)}
      onQueryEditorChange={setQueryEditorDraft}
      onSaveQueryEditor={() => void saveQueryFromEditor()}
      onDeleteQuery={(queryId) => void removeQuery(queryId)}
      searchSource={searchSource}
      matcherScenarios={scenarios}
      matcherRecords={matcherRecords}
      selectedMatcherIds={selectedMatcherIds}
      onSearchSourceChange={setSearchSource}
      onSelectedMatcherIdsChange={rememberMatchers}
    />
  )
}
