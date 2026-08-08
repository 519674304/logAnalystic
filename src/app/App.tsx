import { useEffect, useMemo, useState } from 'react'
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
import { buildLatencyViewModelFromRules, mapToViewModel, type RequestViewModel } from '../view-model/latency-view-model'

const sampleLatencyViewModel = mapToViewModel(latencyResult)
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

function csvCell(value: string | number | undefined) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function csvRow(values: Array<string | number | undefined>) {
  return values.map(csvCell).join(',')
}

function buildLatencyExportCsv(viewModel: RequestViewModel) {
  const rows: string[] = []

  rows.push('时延明细')
  rows.push(csvRow(['业务含义', '泳道/应用', '起始时间戳', '结束时间戳', '相对时延', '耗时']))
  viewModel.laneBlocks.forEach((block) => {
    rows.push(csvRow([block.label, block.lane, block.startTimestamp, block.endTimestamp, block.relativeDuration, block.duration]))
  })

  rows.push('')
  rows.push('步骤树')
  rows.push(csvRow(['业务含义', '层级', '耗时']))
  viewModel.stepTree.forEach((step) => {
    rows.push(csvRow([step.name, step.level, step.duration]))
  })

  rows.push('')
  rows.push('时延统计')
  rows.push(csvRow(['样本数', '平均值(ms)', 'P90(ms)', '最大值(ms)']))
  rows.push(csvRow([viewModel.stats.sampleCount, viewModel.stats.averageMs, viewModel.stats.p90Ms, viewModel.stats.maxMs]))

  return `\uFEFF${rows.join('\r\n')}`
}

function downloadCsv(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function App() {
  const [activeTabId, setActiveTabId] = useState('latency-analysis')
  const [savedQueries, setSavedQueries] = useState<SavedQueryDto[]>([])
  const [logFolderPath, setLogFolderPath] = useState('')
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
  const [latencyAnalysisRunId, setLatencyAnalysisRunId] = useState(0)
  const [latencyAnalysisMessage, setLatencyAnalysisMessage] = useState('等待分析')
  const latencyViewModel = useMemo(
    () => buildLatencyViewModelFromRules(rules, sampleLatencyViewModel),
    [rules, latencyAnalysisRunId],
  )

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

  const selectQuery = (queryId: string) => {
    const next = savedQueries.find((item) => item.id === queryId)
    if (!next) {
      return
    }

    setActiveQueryId(queryId)
    setQueryDraft(next)
    void runSearch(next)
  }

  const saveCurrentQuery = async () => {
    const next = normalizeSavedQuery(queryDraft)
    const updated = await upsertSavedQuery(next)
    setSavedQueries(updated)
    setActiveQueryId(next.id)
    setQueryDraft(next)
    setErrorMessage(null)
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
    const next = normalizeSavedQuery({ ...queryEditorDraft, timeRange: queryDraft.timeRange })
    const updated = await upsertSavedQuery(next)
    const nextDraft = { ...next, timeRange: queryDraft.timeRange }
    setSavedQueries(updated)
    setActiveQueryId(next.id)
    setQueryDraft(nextDraft)
    setQueryEditorDraft(next)
    setQueryEditorOpen(false)
    void runSearch(nextDraft)
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

  const runLatencyAnalysis = () => {
    const enabledStages = rules.filter((rule) => rule.enabled && rule.recordType === 'stage')

    setLatencyAnalysisRunId((value) => value + 1)
    setLatencyAnalysisMessage(
      enabledStages.length > 0
        ? `已按导入规则生成 ${enabledStages.length} 个阶段`
        : '未导入 stage 规则，当前展示样例数据',
    )
  }

  const exportLatencyCsv = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadCsv(`latency-analysis-${timestamp}.csv`, buildLatencyExportCsv(latencyViewModel))
    setLatencyAnalysisMessage('已导出时延 CSV')
  }

  return (
    <AppShell
      activeTabId={activeTabId}
      tabs={tabs}
      onTabChange={setActiveTabId}
      workspaceControls={
        <>
          <label className="field global-folder-field">
            <span>日志文件夹</span>
            <div className="folder-picker compact-folder-picker">
              <input
                value={logFolderPath}
                onChange={(event) => setLogFolderPath(event.target.value)}
                placeholder="选择或粘贴日志目录"
              />
              <button type="button" className="ghost-button" onClick={() => void pickLogFolder()}>
                选择
              </button>
            </div>
          </label>

          <label className="field global-time-field">
            <span>时间范围</span>
            <input
              value={queryDraft.timeRange}
              onChange={(event) => setQueryDraft({ ...queryDraft, timeRange: event.target.value })}
              placeholder="2026-06-12 10:30:00 ~ 2026-06-12 10:45:00"
            />
          </label>
        </>
      }
    >
      {activeTabId === 'log-search' ? (
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
          onOpenQueryEditor={openExistingQueryEditor}
          onQueryDraftChange={setQueryDraft}
          onSaveCurrentQuery={saveCurrentQuery}
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
          analysisMessage={latencyAnalysisMessage}
          onAnalyze={runLatencyAnalysis}
          onExport={exportLatencyCsv}
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
