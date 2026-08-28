import { useEffect, useMemo, useState } from 'react'
import AppShell, { type WorkbenchTab } from '../components/layout/AppShell'
import LogSearchPanel from '../features/log-search/LogSearchPanel'
import RuleCatalogPanel, { type RuleNodeSelection } from '../features/rule-config/RuleCatalogPanel'
import LatencyAnalysisPanel from '../features/latency-analysis/LatencyAnalysisPanel'
import { issueRules, latencyResult } from './app-state'
import {
  deleteSavedQuery,
  importRulePackage,
  listRulePackages,
  listSavedQueries,
  updateRulePackageNode,
  upsertSavedQuery,
} from '../api/tauri-client'
import { searchLogs } from '../api/http-client'
import { analyzeSequentialLatency, type LatencyAnalysis, type LatencyStageSpec } from '../api/latency-analysis-client'
import type {
  ActiveRuleVersionDto,
  LogSearchRequestDto,
  RulePackageVersionDto,
  RuleRecordDto,
  SavedQueryDto,
} from '../api/dto'
import { mapLogSearchToViewModel } from '../view-model/log-search-view-model'
import type { LogSearchViewModel } from '../view-model/log-search-view-model'
import {
  buildLatencyViewModelFromAnalysis,
  buildLatencyViewModelFromRules,
  mapToViewModel,
  type RequestViewModel,
} from '../view-model/latency-view-model'

const sampleLatencyViewModel = mapToViewModel(latencyResult)
const defaultTimeRange = '2026-06-12 10:30:00 ~ 2026-06-12 10:45:00'
const activeRuleVersionStorageKey = 'log-analystic.active-rule-version'
const activeScenarioStorageKey = 'log-analystic.active-scenario'

function readActiveRuleVersion(): ActiveRuleVersionDto | null {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(activeRuleVersionStorageKey) ?? '')
    if (parsed && typeof parsed.ruleSetId === 'string' && typeof parsed.version === 'string') {
      return parsed as ActiveRuleVersionDto
    }
  } catch {
    // 无生效版本或存储损坏时按未生效处理
  }
  return null
}

function readActiveScenario(): string | null {
  try {
    const value = globalThis.localStorage?.getItem(activeScenarioStorageKey)
    return value ? value : null
  } catch {
    return null
  }
}

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

function parseTimeRange(timeRange: string): { startTime?: string; endTime?: string } {
  const parts = timeRange.split('~')
  const startTime = parts[0]?.trim()
  const endTime = parts[1]?.trim()
  return {
    startTime: startTime || undefined,
    endTime: endTime || undefined,
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

function projectRuleRecords(versions: RulePackageVersionDto[], active: ActiveRuleVersionDto | null): RuleRecordDto[] {
  const version = active
    ? versions.find((item) => item.ruleSetId === active.ruleSetId && item.version === active.version)
    : undefined
  if (!version) {
    return []
  }

  return version.layers
    .filter((layer) => layer.id === 'matchers' || layer.id === 'stages')
    .flatMap((layer) =>
      layer.nodes.map((node) => {
      const fields = node.fields
      const scenarios = Array.isArray(fields.applicable_scenario_ids)
        ? fields.applicable_scenario_ids.filter((value): value is string => typeof value === 'string')
        : []
      const stringField = (name: string) => typeof fields[name] === 'string' ? fields[name] as string : undefined
      return {
        id: node.id,
        name: node.name,
        description: stringField('business_meaning') ?? stringField('description') ?? '',
        pattern: stringField('pattern') ?? '',
        enabled: typeof fields.enabled === 'boolean' ? fields.enabled : true,
        exportEnabled: typeof fields.export_enabled === 'boolean' ? fields.export_enabled : true,
        scenarios,
        matchType: layer.id === 'matchers' ? stringField('type') : undefined,
        recordType: layer.id === 'stages' ? 'stage' : 'matcher',
        order: typeof fields.order === 'number' ? fields.order : undefined,
        applicationId: stringField('application_id'),
        processId: stringField('process_id'),
        startMatcherId: stringField('start_matcher_id'),
        endMatcherId: stringField('end_matcher_id'),
      } satisfies RuleRecordDto
    }),
  )
}

function filterRulesByScenario(rules: RuleRecordDto[], scenarioId: string | null): RuleRecordDto[] {
  if (!scenarioId) return rules
  return rules.filter((rule) => rule.scenarios.length === 0 || rule.scenarios.includes(scenarioId))
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

function rulePackageErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

export default function App() {
  const [activeTabId, setActiveTabId] = useState('latency-analysis')
  const [savedQueries, setSavedQueries] = useState<SavedQueryDto[]>([])
  const [logFolderPath, setLogFolderPath] = useState('')
  const [activeQueryId, setActiveQueryId] = useState('')
  const [queryDraft, setQueryDraft] = useState<SavedQueryDto>(createEmptySavedQuery())
  const [queryEditorOpen, setQueryEditorOpen] = useState(false)
  const [queryEditorDraft, setQueryEditorDraft] = useState<SavedQueryDto>(createEmptySavedQuery())
  const [rulePackages, setRulePackages] = useState<RulePackageVersionDto[]>([])
  const [activeRuleVersion, setActiveRuleVersion] = useState<ActiveRuleVersionDto | null>(() => readActiveRuleVersion())
  const [activeRuleNodeKey, setActiveRuleNodeKey] = useState('')
  const [ruleDetailOpen, setRuleDetailOpen] = useState(false)
  const [ruleDetailDraft, setRuleDetailDraft] = useState<RuleNodeSelection | null>(null)
  const [rulePackageStatus, setRulePackageStatus] = useState('等待导入')
  const [result, setResult] = useState<LogSearchViewModel | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [latencyAnalysisRunId, setLatencyAnalysisRunId] = useState(0)
  const [latencyAnalysisMessage, setLatencyAnalysisMessage] = useState('等待分析')
  const [latencyAnalysis, setLatencyAnalysis] = useState<LatencyAnalysis | null>(null)
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(() => readActiveScenario())
  const rules = useMemo(() => projectRuleRecords(rulePackages, activeRuleVersion), [rulePackages, activeRuleVersion])
  const scenarios = useMemo(() => {
    const version = activeRuleVersion
      ? rulePackages.find((item) => item.ruleSetId === activeRuleVersion.ruleSetId && item.version === activeRuleVersion.version)
      : undefined
    const layer = version?.layers.find((item) => item.id === 'definitions')
    const scenarioNodes = (layer?.nodes ?? []).filter((node) => node.nodeType === 'scenarios')
    return scenarioNodes.map((node) => ({ id: node.id, name: node.name }))
  }, [rulePackages, activeRuleVersion])
  const effectiveScenarioId = useMemo(() => {
    if (scenarios.length === 0) return null
    return scenarios.some((scenario) => scenario.id === selectedScenarioId) ? selectedScenarioId : scenarios[0].id
  }, [scenarios, selectedScenarioId])
  const scenarioRules = useMemo(() => filterRulesByScenario(rules, effectiveScenarioId), [rules, effectiveScenarioId])
  const latencyViewModel = useMemo(
    () =>
      latencyAnalysis
        ? buildLatencyViewModelFromAnalysis(scenarioRules, latencyAnalysis, sampleLatencyViewModel)
        : buildLatencyViewModelFromRules(scenarioRules, sampleLatencyViewModel),
    [scenarioRules, latencyAnalysis, latencyAnalysisRunId],
  )

  const runSearch = async (record?: SavedQueryDto) => {
    const source = record ?? queryDraft
    const { startTime, endTime } = parseTimeRange(source.timeRange)
    const request: LogSearchRequestDto = {
      path: logFolderPath,
      query: source.query,
      mode: source.mode,
      caseSensitive: source.caseSensitive,
      contextLines: 1,
      startTime,
      endTime,
    }

    if (!request.path.trim()) {
      setErrorMessage('请先选择日志文件夹')
      return
    }
    if (!request.query.trim()) {
      setErrorMessage('请输入搜索内容')
      return
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
        const [loadedQueries, loadedRulePackages] = await Promise.all([listSavedQueries(), listRulePackages()])

        if (cancelled) {
          return
        }

        setSavedQueries(loadedQueries)
        const firstQuery = loadedQueries[0] ?? createEmptySavedQuery()
        setActiveQueryId(firstQuery.id)
        setQueryDraft(firstQuery)
        setLogFolderPath(window.localStorage.getItem('log-analystic.log-folder-path') ?? '')

        setRulePackages(loadedRulePackages)
        setRulePackageStatus(loadedRulePackages.length > 0 ? '已加载本地规则包' : '等待导入')

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

  const selectRuleNode = (selection: RuleNodeSelection) => {
    setActiveRuleNodeKey(selection.key)
  }

  const openRuleNode = (selection: RuleNodeSelection) => {
    setActiveRuleNodeKey(selection.key)
    setRuleDetailDraft(structuredClone(selection))
    setRuleDetailOpen(true)
  }

  const importRules = async (payload: { sourceName: string; bytes: number[] }) => {
    if (!payload.sourceName.toLowerCase().endsWith('.zip')) {
      const message = '请选择 .zip 格式的完整规则包'
      setErrorMessage(message)
      setRulePackageStatus(`导入失败：${message}`)
      return
    }

    try {
      const result = await importRulePackage(payload)
      setRulePackages(result.versions)
      setRulePackageStatus(result.operation === 'replaced' ? `已覆盖 ${result.version}` : `已新增 ${result.version}`)
      setErrorMessage(null)
      setActiveRuleNodeKey('')
      setRuleDetailDraft(null)
      setRuleDetailOpen(false)
    } catch (error) {
      const message = rulePackageErrorMessage(error, '导入规则失败')
      setErrorMessage(message)
      setRulePackageStatus(`导入失败：${message}`)
    }
  }

  const saveRuleDetail = async () => {
    if (!ruleDetailDraft) return
    try {
      const updated = await updateRulePackageNode({
        ruleSetId: ruleDetailDraft.ruleSetId,
        version: ruleDetailDraft.version,
        layerId: ruleDetailDraft.layerId,
        tablePath: ruleDetailDraft.node.tablePath,
        nodeId: ruleDetailDraft.node.id,
        fields: ruleDetailDraft.node.fields,
      })
      setRulePackages(updated)
      setRulePackageStatus(`已保存 ${ruleDetailDraft.node.id}`)
      setErrorMessage(null)
      setRuleDetailOpen(false)
    } catch (error) {
      const message = rulePackageErrorMessage(error, '保存规则节点失败')
      setErrorMessage(message)
      setRulePackageStatus(`保存失败：${message}`)
    }
  }

  const activateRuleVersion = (next: ActiveRuleVersionDto | null) => {
    setActiveRuleVersion(next)
    if (next) {
      window.localStorage.setItem(activeRuleVersionStorageKey, JSON.stringify(next))
    } else {
      window.localStorage.removeItem(activeRuleVersionStorageKey)
    }
    setLatencyAnalysis(null)
    setLatencyAnalysisMessage(next ? `已切换生效版本：${next.ruleSetId} ${next.version}` : '已取消生效版本')
  }

  const changeScenario = (nextId: string) => {
    setSelectedScenarioId(nextId)
    window.localStorage.setItem(activeScenarioStorageKey, nextId)
    setLatencyAnalysis(null)
    setLatencyAnalysisMessage(`已切换场景：${nextId}`)
  }

  const runLatencyAnalysis = async () => {
    const activeExists =
      activeRuleVersion !== null &&
      rulePackages.some((item) => item.ruleSetId === activeRuleVersion.ruleSetId && item.version === activeRuleVersion.version)

    if (!activeExists) {
      setLatencyAnalysisMessage('请先在规则配置页设置生效版本')
      return
    }

    if (!logFolderPath.trim()) {
      setLatencyAnalysisMessage('请先选择日志文件夹')
      return
    }

    const matchers = new Map(
      scenarioRules
        .filter((rule) => rule.recordType === 'matcher')
        .map((rule) => [rule.id, rule] as const),
    )
    const stageSpecs: LatencyStageSpec[] = scenarioRules
      .filter((rule) => rule.enabled && rule.recordType === 'stage')
      .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER))
      .map((stage): LatencyStageSpec | null => {
        const start = stage.startMatcherId ? matchers.get(stage.startMatcherId) : undefined
        const end = stage.endMatcherId ? matchers.get(stage.endMatcherId) : undefined
        if (!start?.pattern || !end?.pattern) return null
        return {
          id: stage.id,
          startPattern: start.pattern,
          endPattern: end.pattern,
          startMode: start.matchType === 'regex' ? 'regex' : 'keyword',
          endMode: end.matchType === 'regex' ? 'regex' : 'keyword',
        }
      })
      .filter((spec): spec is LatencyStageSpec => spec !== null)

    if (stageSpecs.length === 0) {
      setLatencyAnalysisMessage('未导入带 start/end 匹配器的 stage 规则')
      return
    }

    setLatencyAnalysisMessage('正在分析…')
    try {
      const result = await analyzeSequentialLatency(logFolderPath, stageSpecs)
      setLatencyAnalysis(result)
      setLatencyAnalysisRunId((value) => value + 1)
      setLatencyAnalysisMessage(`已分析 ${result.requests.length} 个请求 · ${result.stats.sampleCount} 个阶段样本`)
    } catch (error) {
      setLatencyAnalysisMessage(`分析失败：${error instanceof Error ? error.message : String(error)}`)
    }
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
          scenarios={scenarios}
          selectedScenarioId={effectiveScenarioId}
          onScenarioChange={changeScenario}
          onAnalyze={() => void runLatencyAnalysis()}
          onExport={exportLatencyCsv}
        />
      ) : null}

      {activeTabId === 'rule-config' ? (
        <RuleCatalogPanel
          versions={rulePackages}
          activeRuleVersion={activeRuleVersion}
          activeNodeKey={activeRuleNodeKey}
          detailOpen={ruleDetailOpen}
          detailDraft={ruleDetailDraft}
          statusMessage={rulePackageStatus}
          onSelectNode={selectRuleNode}
          onOpenNode={openRuleNode}
          onCloseDetail={() => setRuleDetailOpen(false)}
          onImportPackage={importRules}
          onActivateVersion={activateRuleVersion}
          onDetailDraftChange={setRuleDetailDraft}
          onSaveNode={saveRuleDetail}
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
