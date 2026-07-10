import { useEffect, useState } from 'react'
import AppShell, { type WorkbenchTab } from '../components/layout/AppShell'
import LogSearchPanel from '../features/log-search/LogSearchPanel'
import RuleCatalogPanel from '../features/rule-config/RuleCatalogPanel'
import LatencyAnalysisPanel from '../features/latency-analysis/LatencyAnalysisPanel'
import { issueRules, latencyResult } from './app-state'
import {
  deleteRuleCatalog,
  deleteSavedQuery,
  importRuleCatalog,
  listRuleCatalog,
  listSavedQueries,
  searchLogs,
  upsertRuleCatalog,
  upsertSavedQuery,
} from '../api/tauri-client'
import type { LogSearchRequestDto, RuleRecordDto, SavedQueryDto } from '../api/dto'
import { mapLogSearchToViewModel } from '../view-model/log-search-view-model'
import type { LogSearchViewModel } from '../view-model/log-search-view-model'
import { mapToViewModel } from '../view-model/latency-view-model'

const latencyViewModel = mapToViewModel(latencyResult)
const defaultTimeRange = '2026-06-12 10:30:00 ~ 2026-06-12 10:45:00'

const tabs: WorkbenchTab[] = [
  { id: 'log-search', label: '日志搜索' },
  { id: 'latency-analysis', label: '时延分析', badge: '核心' },
  { id: 'rule-config', label: '规则配置' },
  { id: 'issue-tips', label: '问题提示' },
]

function createDraftId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createEmptySavedQuery(): SavedQueryDto {
  return {
    id: createDraftId('query'),
    name: '',
    description: '',
    group: 'core',
    tags: [],
    query: '',
    mode: 'keyword',
    caseSensitive: false,
    timeRange: defaultTimeRange,
  }
}

function normalizeSavedQuery(draft: SavedQueryDto): SavedQueryDto {
  return {
    ...draft,
    name: draft.name.trim() || draft.query.trim() || '未命名查询',
    description: draft.description.trim(),
    group: draft.group.trim() || 'core',
    tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
    query: draft.query.trim(),
    timeRange: draft.timeRange.trim() || defaultTimeRange,
  }
}

function getQueryGroups(queries: SavedQueryDto[]) {
  return Array.from(new Set(queries.map((query) => query.group.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, 'zh-Hans-CN'),
  )
}

function createEmptyRule(): RuleRecordDto {
  return {
    id: createDraftId('rule'),
    name: '',
    description: '',
    pattern: '',
    enabled: true,
    exportEnabled: true,
    scenarios: [],
  }
}

function normalizeRule(draft: RuleRecordDto): RuleRecordDto {
  return {
    ...draft,
    name: draft.name.trim() || draft.pattern.trim() || '未命名规则',
    description: draft.description.trim(),
    pattern: draft.pattern.trim(),
    scenarios: draft.scenarios.map((item) => item.trim()).filter(Boolean),
  }
}

export default function App() {
  const [activeTabId, setActiveTabId] = useState('latency-analysis')
  const [savedQueries, setSavedQueries] = useState<SavedQueryDto[]>([])
  const [logFolderPath, setLogFolderPath] = useState('')
  const [selectedQueryGroup, setSelectedQueryGroup] = useState('全部分组')
  const [activeQueryId, setActiveQueryId] = useState('')
  const [queryDraft, setQueryDraft] = useState<SavedQueryDto>(createEmptySavedQuery())
  const [queryEditorOpen, setQueryEditorOpen] = useState(false)
  const [queryEditorDraft, setQueryEditorDraft] = useState<SavedQueryDto>(createEmptySavedQuery())
  const [rules, setRules] = useState<RuleRecordDto[]>([])
  const [activeRuleId, setActiveRuleId] = useState('')
  const [ruleDetailOpen, setRuleDetailOpen] = useState(false)
  const [ruleDetailDraft, setRuleDetailDraft] = useState<RuleRecordDto>(createEmptyRule())
  const [result, setResult] = useState<LogSearchViewModel | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [timeStart, setTimeStart] = useState('2026-06-12 10:30:00')
  const [timeEnd, setTimeEnd] = useState('2026-06-12 10:45:00')
  const [queryListHidden, setQueryListHidden] = useState(() => window.localStorage.getItem('log-analystic.query-list-hidden') === '1')
  const [searchPanelHidden, setSearchPanelHidden] = useState(
    () => window.localStorage.getItem('log-analystic.search-panel-hidden') === '1',
  )
  const [detailQuery, setDetailQuery] = useState<SavedQueryDto | null>(null)

  const queryGroups = getQueryGroups(savedQueries)
  const visibleSavedQueries =
    selectedQueryGroup === '全部分组'
      ? savedQueries
      : savedQueries.filter((query) => query.group === selectedQueryGroup)

  const runSearch = async (record?: SavedQueryDto) => {
    const source = record ?? queryDraft
    const request: LogSearchRequestDto = {
      query: source.query,
      mode: source.mode,
      caseSensitive: source.caseSensitive,
      contextLines: 1,
    }

    setIsSearching(true)
    setErrorMessage(null)

    try {
      const response = await searchLogs(request)
      setResult(mapLogSearchToViewModel(response))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '搜索失败')
    } finally {
      setIsSearching(false)
    }
  }

  const loadFolderPathFromBrowser = () => {
    const current = window.prompt('请输入日志文件夹路径', logFolderPath)
    if (current !== null) {
      setLogFolderPath(current.trim())
    }
  }

  const pickLogFolder = async () => {
    const tauriDialog = (window as Window & {
      __TAURI__?: {
        dialog?: {
          open?: (options?: { directory?: boolean; multiple?: boolean; title?: string }) => Promise<unknown>
        }
      }
    }).__TAURI__?.dialog

    if (!tauriDialog?.open) {
      loadFolderPathFromBrowser()
      return
    }

    const selection = await tauriDialog.open({
      directory: true,
      multiple: false,
      title: '选择日志文件夹',
    })

    if (typeof selection === 'string') {
      setLogFolderPath(selection)
    }
  }

  useEffect(() => {
    window.localStorage.setItem('log-analystic.query-list-hidden', queryListHidden ? '1' : '0')
  }, [queryListHidden])

  useEffect(() => {
    window.localStorage.setItem('log-analystic.search-panel-hidden', searchPanelHidden ? '1' : '0')
  }, [searchPanelHidden])

  useEffect(() => {
    window.localStorage.setItem('log-analystic.log-folder-path', logFolderPath)
  }, [logFolderPath])

  useEffect(() => {
    let cancelled = false

    async function loadWorkspaceLists() {
      try {
        const [loadedQueries, loadedRules] = await Promise.all([listSavedQueries(), listRuleCatalog()])

        if (cancelled) {
          return
        }

        setSavedQueries(loadedQueries)
        const firstQuery = loadedQueries[0] ?? createEmptySavedQuery()
        setActiveQueryId(firstQuery.id)
        setQueryDraft(firstQuery)
        setSelectedQueryGroup('全部分组')
        setLogFolderPath(window.localStorage.getItem('log-analystic.log-folder-path') ?? '')

        setRules(loadedRules)
        const firstRule = loadedRules[0] ?? createEmptyRule()
        setActiveRuleId(firstRule.id)
        setRuleDetailDraft(firstRule)

        if (loadedQueries[0]) {
          void runSearch(loadedQueries[0])
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : '加载本地配置失败')
        }
      }
    }

    void loadWorkspaceLists()

    return () => {
      cancelled = true
    }
  }, [])

  const openNewQueryEditor = () => {
    const next = {
      ...createEmptySavedQuery(),
      group: selectedQueryGroup === '全部分组' ? (queryDraft.group || 'core') : selectedQueryGroup,
      query: queryDraft.query,
      mode: queryDraft.mode,
      caseSensitive: queryDraft.caseSensitive,
      timeRange: queryDraft.timeRange,
    }

    setQueryEditorDraft(next)
    setQueryEditorOpen(true)
  }

  const openExistingQueryEditor = (queryId: string) => {
    const next = savedQueries.find((item) => item.id === queryId)
    if (!next) {
      return
    }

    setQueryEditorDraft(next)
    setQueryEditorOpen(true)
  }

  const saveQueryFromEditor = async () => {
    const next = normalizeSavedQuery(queryEditorDraft)
    const updated = await upsertSavedQuery(next)
    setSavedQueries(updated)
    setActiveQueryId(next.id)
    setQueryDraft(next)
    setQueryEditorDraft(next)
    setQueryEditorOpen(false)
    void runSearch(next)
  }

  const removeQuery = async (queryId: string) => {
    const updated = await deleteSavedQuery(queryId)
    setSavedQueries(updated)

    const next = updated[0] ?? createEmptySavedQuery()
    setActiveQueryId(next.id)
    setQueryDraft(next)
    if (updated.length > 0) {
      void runSearch(next)
    } else {
      setResult(null)
    }
  }

  const selectQuery = (queryId: string) => {
    const next = savedQueries.find((item) => item.id === queryId)
    if (!next) {
      return
    }

    setActiveQueryId(queryId)
    setQueryDraft(next)
    void runSearch(next)
  }

  const selectQueryGroup = (group: string) => {
    setSelectedQueryGroup(group)

    if (group === '全部分组') {
      return
    }

    const next = savedQueries.find((item) => item.group === group)
    if (next) {
      setActiveQueryId(next.id)
      setQueryDraft(next)
      void runSearch(next)
    }
  }

  const openQueryDetail = (queryId: string) => {
    const next = savedQueries.find((item) => item.id === queryId)
    if (next) {
      setDetailQuery(next)
    }
  }

  const selectRule = (ruleId: string) => {
    const next = rules.find((item) => item.id === ruleId)
    if (!next) {
      return
    }

    setActiveRuleId(ruleId)
    setRuleDetailDraft(next)
  }

  const openRuleDetail = (ruleId: string) => {
    const next = rules.find((item) => item.id === ruleId)
    if (!next) {
      return
    }

    setActiveRuleId(ruleId)
    setRuleDetailDraft(next)
    setRuleDetailOpen(true)
  }

  const saveRuleDetail = async () => {
    const next = normalizeRule(ruleDetailDraft)
    const updated = await upsertRuleCatalog(next)
    setRules(updated)
    setActiveRuleId(next.id)
    setRuleDetailDraft(next)
    setRuleDetailOpen(false)
  }

  const removeRule = async (ruleId: string) => {
    const updated = await deleteRuleCatalog(ruleId)
    setRules(updated)

    const next = updated[0] ?? createEmptyRule()
    setActiveRuleId(next.id)
    setRuleDetailDraft(next)
    setRuleDetailOpen(false)
  }

  const importRules = async (payload: { sourceName: string; content: string }) => {
    const confirmed = window.confirm('导入规则会覆盖当前本地规则列表，继续吗？')
    if (!confirmed) {
      return
    }

    try {
      const updated = await importRuleCatalog(payload)
      setRules(updated)
      const next = updated[0] ?? createEmptyRule()
      setActiveRuleId(next.id)
      setRuleDetailDraft(next)
      setRuleDetailOpen(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '导入规则失败')
    }
  }

  return (
    <AppShell activeTabId={activeTabId} tabs={tabs} onTabChange={setActiveTabId}>
      {activeTabId === 'log-search' ? (
        <LogSearchPanel
          savedQueries={visibleSavedQueries}
          queryGroups={queryGroups}
          activeQueryId={activeQueryId}
          logFolderPath={logFolderPath}
          selectedGroup={selectedQueryGroup}
          queryDraft={queryDraft}
          isSearching={isSearching}
          result={result}
          errorMessage={errorMessage}
          queryListHidden={queryListHidden}
          searchPanelHidden={searchPanelHidden}
          detailQuery={detailQuery}
          queryEditorOpen={queryEditorOpen}
          queryEditorDraft={queryEditorDraft}
          onToggleQueryList={() => setQueryListHidden((value) => !value)}
          onToggleSearchPanel={() => setSearchPanelHidden((value) => !value)}
          onLogFolderPathChange={setLogFolderPath}
          onPickLogFolder={() => void pickLogFolder()}
          onSelectGroup={selectQueryGroup}
          onSelectQuery={selectQuery}
          onOpenQueryDetail={openQueryDetail}
          onOpenQueryEditor={openExistingQueryEditor}
          onOpenNewQuery={openNewQueryEditor}
          onCloseDetail={() => setDetailQuery(null)}
          onQueryDraftChange={setQueryDraft}
          onSearch={() => void runSearch()}
          onCloseQueryEditor={() => setQueryEditorOpen(false)}
          onQueryEditorChange={setQueryEditorDraft}
          onSaveQueryEditor={saveQueryFromEditor}
          onDeleteQuery={removeQuery}
        />
      ) : null}

      {activeTabId === 'latency-analysis' ? (
        <LatencyAnalysisPanel
          viewModel={latencyViewModel}
          timeStart={timeStart}
          timeEnd={timeEnd}
          onTimeStartChange={setTimeStart}
          onTimeEndChange={setTimeEnd}
          onAnalyze={() => undefined}
          onExport={() => undefined}
        />
      ) : null}

      {activeTabId === 'rule-config' ? (
        <RuleCatalogPanel
          rules={rules}
          activeRuleId={activeRuleId}
          detailOpen={ruleDetailOpen}
          detailDraft={ruleDetailDraft}
          onSelectRule={selectRule}
          onOpenRuleDetail={openRuleDetail}
          onCloseRuleDetail={() => setRuleDetailOpen(false)}
          onImportRules={importRules}
          onDeleteRule={removeRule}
          onDetailDraftChange={setRuleDetailDraft}
          onSaveRuleDetail={saveRuleDetail}
        />
      ) : null}

      {activeTabId === 'issue-tips' ? (
        <section className="panel">
          <div className="panel-title-row">
            <h2>问题提示</h2>
            <span>按提示 / 警告 / 异常分类</span>
          </div>
          <div className="rule-list">
            {issueRules.map((rule) => (
              <div key={rule.id} className="rule-item">
                <div className="rule-head">
                  <strong>{rule.pattern}</strong>
                  <span className={`severity ${rule.severity.toLowerCase()}`}>{rule.severity}</span>
                </div>
                <p>{rule.explanation}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  )
}
