import { useEffect, useMemo, useState } from 'react'
import type * as React from 'react'
import AppShell, { type WorkbenchTab } from '../components/layout/AppShell'
import LogSearchPanel from '../features/log-search/LogSearchPanel'
import RuleCatalogPanel, { type RuleLayerTomlSelection, type RuleLayerTomlTarget, type RuleNodeSelection } from '../features/rule-config/RuleCatalogPanel'
import LatencyAnalysisPanel from '../features/latency-analysis/LatencyAnalysisPanel'
import { issueRules, latencyResult } from './app-state'
import {
  deleteRulePackage,
  deleteSavedQuery,
  importRulePackage,
  listRulePackages,
  listSavedQueries,
  loadActiveRuleVersion,
  saveActiveRuleVersion,
  updateRulePackageLayerToml,
  updateRulePackageNode,
  upsertSavedQuery,
} from '../api/tauri-client'
import { serializeLayerToToml } from '../api/local-rule-package'
import { searchLogs } from '../api/http-client'
import { analyzeLatencyStream, type LatencyAnalysis, type LatencyStageSpec, type LogMarker } from '../api/latency-analysis-client'
import type {
  ActiveRuleVersionDto,
  LogSearchRequestDto,
  RulePackageVersionDto,
  RuleRecordDto,
  SavedQueryDto,
} from '../api/dto'
import { mapLogSearchToViewModel } from '../view-model/log-search-view-model'
import type { LogSearchViewModel } from '../view-model/log-search-view-model'
import { buildMatcherSearchRegex } from '../view-model/matcher-search-view-model'
import {
  buildLatencyViewModelFromAnalysis,
  buildLatencyViewModelFromRules,
  mapToViewModel,
  type RequestViewModel,
} from '../view-model/latency-view-model'

const sampleLatencyViewModel = mapToViewModel(latencyResult)

// 默认时间范围动态取当天全天，避免写死演示日期。
function buildDefaultTimeRange(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `${date} 00:00:00 ~ ${date} 23:59:59`
}
const activeScenarioStorageKey = 'log-analystic.active-scenario'
const selectedMatcherIdsStorageKey = 'log-analystic.selected-matcher-ids'
const recentFoldersStorageKey = 'log-analystic.recent-folders'
const MAX_RECENT_FOLDERS = 5

function readActiveScenario(): string | null {
  try {
    const value = globalThis.localStorage?.getItem(activeScenarioStorageKey)
    return value ? value : null
  } catch {
    return null
  }
}

// matcher 勾选是独立、自动持久化的偏好：选中即保存，不绑定保存查询。
function readPersistedMatcherIds(): string[] {
  try {
    const value = globalThis.localStorage?.getItem(selectedMatcherIdsStorageKey)
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function writePersistedMatcherIds(ids: string[]) {
  try {
    globalThis.localStorage?.setItem(selectedMatcherIdsStorageKey, JSON.stringify(ids))
  } catch {
    // 忽略 localStorage 不可用的情况。
  }
}

// 最近搜索过的日志文件夹：最近优先、去重、最多保留 MAX_RECENT_FOLDERS 个。
function readRecentFolders(): string[] {
  try {
    const value = globalThis.localStorage?.getItem(recentFoldersStorageKey)
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      : []
  } catch {
    return []
  }
}

function writeRecentFolders(folders: string[]) {
  try {
    globalThis.localStorage?.setItem(recentFoldersStorageKey, JSON.stringify(folders))
  } catch {
    // 忽略 localStorage 不可用的情况。
  }
}

function pushRecentFolder(current: string[], path: string): string[] {
  const trimmed = path.trim()
  if (!trimmed) return current
  return [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, MAX_RECENT_FOLDERS)
}

const tabs: WorkbenchTab[] = [
  { id: 'log-search', label: '日志搜索' },
  { id: 'latency-analysis', label: '时延分析' },
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
    timeRange: buildDefaultTimeRange(),
    matcherIds: [],
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
    timeRange: draft.timeRange.trim() || buildDefaultTimeRange(),
    matcherIds: draft.matcherIds ?? [],
  }
}

function projectRuleRecords(versions: RulePackageVersionDto[], active: ActiveRuleVersionDto | null): RuleRecordDto[] {
  const version = active
    ? versions.find((item) => item.ruleSetId === active.ruleSetId && item.version === active.version)
    : undefined
  if (!version) {
    return []
  }

  return version.layers.flatMap((layer): RuleRecordDto[] => {
    const stringField = (fields: Record<string, unknown>, name: string) => {
      const value = fields[name]
      return typeof value === 'string' ? value : undefined
    }

    // definitions 层投影应用、进程与流程，供泳道把 stage 的 process_id / flow_id 映射到应用名 / 进程名 / 流程名。
    if (layer.id === 'definitions') {
      return layer.nodes
        .filter((node) => node.nodeType === 'applications' || node.nodeType === 'processes' || node.nodeType === 'flows')
        .map(
          (node) =>
            ({
              id: node.id,
              name: node.name,
              description: stringField(node.fields, 'description') ?? '',
              pattern: '',
              enabled: true,
              exportEnabled: true,
              scenarios: [],
              recordType:
                node.nodeType === 'applications' ? 'application' : node.nodeType === 'flows' ? 'flow' : 'process',
              applicationId: node.nodeType === 'processes' ? stringField(node.fields, 'application_id') : undefined,
            }) satisfies RuleRecordDto,
        )
    }

    if (layer.id !== 'matchers' && layer.id !== 'stages') {
      return []
    }

    return layer.nodes.map((node) => {
      const fields = node.fields
      const scenarios = Array.isArray(fields.applicable_scenario_ids)
        ? fields.applicable_scenario_ids.filter((value): value is string => typeof value === 'string')
        : []
      return {
        id: node.id,
        name: node.name,
        description: stringField(fields, 'business_meaning') ?? stringField(fields, 'description') ?? '',
        pattern: stringField(fields, 'pattern') ?? '',
        enabled: typeof fields.enabled === 'boolean' ? fields.enabled : true,
        exportEnabled: typeof fields.export_enabled === 'boolean' ? fields.export_enabled : true,
        scenarios,
        matchType: layer.id === 'matchers' ? stringField(fields, 'type') : undefined,
        recordType: layer.id === 'stages' ? 'stage' : 'matcher',
        order: typeof fields.order === 'number' ? fields.order : undefined,
        applicationId: stringField(fields, 'application_id'),
        processId: stringField(fields, 'process_id'),
        flowId: stringField(fields, 'flow_id'),
        kind: stringField(fields, 'kind'),
        startMatcherId: stringField(fields, 'start_matcher_id'),
        endMatcherId: stringField(fields, 'end_matcher_id'),
        endMatcherIds: Array.isArray(fields.end_matcher_ids)
          ? fields.end_matcher_ids.filter((value): value is string => typeof value === 'string')
          : undefined,
      } satisfies RuleRecordDto
    })
  })
}

function filterRulesByScenario(rules: RuleRecordDto[], scenarioId: string | null): RuleRecordDto[] {
  if (!scenarioId) return rules
  return rules.filter((rule) => rule.scenarios.length === 0 || rule.scenarios.includes(scenarioId))
}

function csvCell(value: string | number | undefined) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

// 时间戳字段加前导单引号，让 Excel/WPS 按文本处理，
// 否则会被识别成日期时间，只显示到秒而丢掉毫秒（.000）。
function csvTimestampCell(value: string | number | undefined) {
  const text = String(value ?? '')
  if (text === '') return '""'
  return `"'${text.replace(/"/g, '""')}"`
}

function csvRow(values: Array<string | number | undefined>) {
  return values.map(csvCell).join(',')
}

// 导出明细表的 CSV 快照：跟随列选择器（隐藏列不导出），导出全部请求行（上限与明细表一致 100 行）。
// 所有耗时单位统一为毫秒，单位标注在表头。
const MAX_TABLE_ROWS = 100

function buildLatencyExportCsv(viewModel: RequestViewModel, hiddenColumns: Set<string>) {
  const table = viewModel.table
  const columns = table ? table.columns.filter((column) => !hiddenColumns.has(column.id)) : []
  const rows: string[] = []

  // 表头第一行：分组名；请求标识 / 总耗时(ms) 各占一列，stage 列按分组重复分组名。
  rows.push(csvRow(['请求标识', '总耗时(ms)', ...columns.map((column) => column.group)]))
  // 表头第二行：列名；请求标识 / 总耗时 与页面 rowSpan 对应留空，stage 列加 (ms)。
  rows.push(csvRow(['', '', ...columns.map((column) => `${column.name}(ms)`)]))
  if (table) {
    const rowCount = Math.min(table.rows.length, MAX_TABLE_ROWS)
    for (const row of table.rows.slice(0, rowCount)) {
      rows.push(
        [
          csvTimestampCell(row.requestId),
          csvCell(row.totalMs),
          ...columns.map((column) => csvCell(row.cells[column.id])),
        ].join(','),
      )
    }
  }

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
  const [recentFolders, setRecentFolders] = useState<string[]>(() => readRecentFolders())
  const [activeQueryId, setActiveQueryId] = useState('')
  const [queryDraft, setQueryDraft] = useState<SavedQueryDto>(createEmptySavedQuery())
  const [queryEditorOpen, setQueryEditorOpen] = useState(false)
  const [queryEditorDraft, setQueryEditorDraft] = useState<SavedQueryDto>(createEmptySavedQuery())
  const [searchSource, setSearchSource] = useState<'manual' | 'matcher'>('manual')
  const [selectedMatcherIds, setSelectedMatcherIds] = useState<string[]>(() => readPersistedMatcherIds())
  const [rulePackages, setRulePackages] = useState<RulePackageVersionDto[]>([])
  const [activeRuleVersion, setActiveRuleVersion] = useState<ActiveRuleVersionDto | null>(null)
  const [activeRuleNodeKey, setActiveRuleNodeKey] = useState('')
  const [ruleDetailOpen, setRuleDetailOpen] = useState(false)
  const [ruleDetailDraft, setRuleDetailDraft] = useState<RuleNodeSelection | null>(null)
  const [ruleTomlOpen, setRuleTomlOpen] = useState(false)
  const [ruleTomlDraft, setRuleTomlDraft] = useState<RuleLayerTomlSelection | null>(null)
  const [rulePackageStatus, setRulePackageStatus] = useState('等待导入')
  const [result, setResult] = useState<LogSearchViewModel | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [latencyAnalysisRunId, setLatencyAnalysisRunId] = useState(0)
  const [latencyAnalysisMessage, setLatencyAnalysisMessage] = useState('等待分析')
  const [latencyAnalysis, setLatencyAnalysis] = useState<LatencyAnalysis | null>(null)
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(() => readActiveScenario())
  const rules = useMemo(() => projectRuleRecords(rulePackages, activeRuleVersion), [rulePackages, activeRuleVersion])
  const matcherRecords = useMemo(() => rules.filter((rule) => rule.recordType === 'matcher'), [rules])
  const matcherById = useMemo(() => new Map(matcherRecords.map((matcher) => [matcher.id, matcher])), [matcherRecords])
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

  // 记录一个真正被搜索过的文件夹到最近列表（最近优先、去重、上限 5 个）。
  const rememberFolder = (path: string) => {
    const next = pushRecentFolder(recentFolders, path)
    setRecentFolders(next)
    writeRecentFolders(next)
  }

  const runSearch = async (input?: {
    record?: SavedQueryDto
    source?: 'manual' | 'matcher'
    matcherIds?: string[]
  }) => {
    const record = input?.record ?? queryDraft
    const source = input?.source ?? searchSource
    const matcherIds = input?.matcherIds ?? selectedMatcherIds
    const { startTime, endTime } = parseTimeRange(record.timeRange)

    if (!logFolderPath.trim()) {
      setErrorMessage('请先选择日志文件夹')
      return
    }
    rememberFolder(logFolderPath)

    let request: LogSearchRequestDto
    if (source === 'matcher') {
      const matchers = matcherIds
        .map((id) => matcherById.get(id))
        .filter((matcher): matcher is RuleRecordDto => Boolean(matcher))
      const regex = buildMatcherSearchRegex(matchers)
      if (!regex) {
        setErrorMessage('请选择至少一个 matcher')
        return
      }
      request = {
        path: logFolderPath,
        query: regex,
        mode: 'regex',
        caseSensitive: false,
        contextLines: 1,
        startTime,
        endTime,
      }
    } else {
      if (!record.query.trim()) {
        setErrorMessage('请输入搜索内容')
        return
      }
      request = {
        path: logFolderPath,
        query: record.query,
        mode: record.mode,
        caseSensitive: record.caseSensitive,
        contextLines: 1,
        startTime,
        endTime,
      }
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

  // 选中/加载一条保存查询时，恢复 queryDraft + 搜索来源。
  // matcher 勾选是独立持久化的偏好：手动查询不清空它，matcher 查询才回填并落盘。
  const applyQuery = (query: SavedQueryDto) => {
    const hasMatcherIds = query.matcherIds && query.matcherIds.length > 0
    const source: 'manual' | 'matcher' = hasMatcherIds ? 'matcher' : 'manual'
    const matcherIds = query.matcherIds ?? []
    setActiveQueryId(query.id)
    setQueryDraft(query)
    setSearchSource(source)
    if (hasMatcherIds) {
      setSelectedMatcherIds(matcherIds)
      writePersistedMatcherIds(matcherIds)
    }
    return { source, matcherIds }
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
        const [loadedQueries, loadedRulePackages, loadedActiveRuleVersion] = await Promise.all([
          listSavedQueries(),
          listRulePackages(),
          loadActiveRuleVersion(),
        ])

        if (cancelled) {
          return
        }

        setSavedQueries(loadedQueries)
        setLogFolderPath(window.localStorage.getItem('log-analystic.log-folder-path') ?? '')

        // 迁移：旧版本只存单个文件夹路径，首次升级时把它并入最近列表。
        const persistedFolder = window.localStorage.getItem('log-analystic.log-folder-path') ?? ''
        const loadedRecentFolders = readRecentFolders()
        if (loadedRecentFolders.length === 0 && persistedFolder.trim()) {
          const seeded = pushRecentFolder([], persistedFolder)
          setRecentFolders(seeded)
          writeRecentFolders(seeded)
        }

        setRulePackages(loadedRulePackages)
        setActiveRuleVersion(loadedActiveRuleVersion)
        setRulePackageStatus(loadedRulePackages.length > 0 ? '已加载规则包' : '等待导入')

        // matcher 勾选独立持久化：读回并过滤掉当前规则集中已不存在的 id；非空则恢复到 matcher 模式。
        const loadedRules = projectRuleRecords(loadedRulePackages, loadedActiveRuleVersion)
        const loadedMatcherIds = new Set(
          loadedRules.filter((rule) => rule.recordType === 'matcher').map((rule) => rule.id),
        )
        const persistedMatcherIds = readPersistedMatcherIds().filter((id) => loadedMatcherIds.has(id))

        if (persistedMatcherIds.length > 0) {
          setActiveQueryId('')
          setQueryDraft(createEmptySavedQuery())
          setSearchSource('matcher')
          setSelectedMatcherIds(persistedMatcherIds)
        } else if (loadedQueries[0]) {
          const { source, matcherIds } = applyQuery(loadedQueries[0])
          void runSearch({ record: loadedQueries[0], source, matcherIds })
        } else {
          setActiveQueryId('')
          setQueryDraft(createEmptySavedQuery())
          setSearchSource('manual')
          setSelectedMatcherIds([])
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

    const { source, matcherIds } = applyQuery(next)
    void runSearch({ record: next, source, matcherIds })
  }

  // 回到未保存的「当前草稿」：清空 active 查询、恢复手动模式。matcher 勾选独立持久化，不清空。
  const resetToDraft = () => {
    setActiveQueryId('')
    setQueryDraft(createEmptySavedQuery())
    setSearchSource('manual')
    setResult(null)
  }

  // matcher 勾选变化：即时落盘，选中即保存。
  const changeSelectedMatcherIds = (next: string[]) => {
    setSelectedMatcherIds(next)
    writePersistedMatcherIds(next)
  }

  const saveCurrentQuery = async () => {
    const matcherIds = searchSource === 'matcher' ? selectedMatcherIds : []
    const next = normalizeSavedQuery({ ...queryDraft, matcherIds })
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
    setQueryEditorDraft(next)
    setQueryEditorOpen(false)
    const { source, matcherIds } = applyQuery(nextDraft)
    void runSearch({ record: nextDraft, source, matcherIds })
  }

  const removeQuery = async (queryId: string) => {
    const updated = await deleteSavedQuery(queryId)
    setSavedQueries(updated)

    const next = updated[0] ?? createEmptySavedQuery()
    if (updated.length > 0) {
      const { source, matcherIds } = applyQuery(next)
      void runSearch({ record: next, source, matcherIds })
    } else {
      setActiveQueryId(next.id)
      setQueryDraft(next)
      setSearchSource('manual')
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

  const openLayerToml = (target: RuleLayerTomlTarget) => {
    const { layer } = target
    setRuleTomlDraft({
      ruleSetId: target.ruleSetId,
      version: target.version,
      layerId: layer.id,
      layerLabel: layer.label,
      fileName: layer.fileName,
      tomlText: serializeLayerToToml(layer),
    })
    setRuleTomlOpen(true)
  }

  const closeToml = () => {
    setRuleTomlOpen(false)
    setRuleTomlDraft(null)
  }

  const changeTomlDraft = (next: RuleLayerTomlSelection) => {
    setRuleTomlDraft(next)
  }

  const saveLayerToml = async () => {
    if (!ruleTomlDraft) return
    try {
      const updated = await updateRulePackageLayerToml({
        ruleSetId: ruleTomlDraft.ruleSetId,
        version: ruleTomlDraft.version,
        layerId: ruleTomlDraft.layerId,
        tomlText: ruleTomlDraft.tomlText,
      })
      setRulePackages(updated)
      setRulePackageStatus(`已保存 ${ruleTomlDraft.fileName}`)
      setErrorMessage(null)
      setRuleTomlOpen(false)
      setRuleTomlDraft(null)
    } catch (error) {
      const message = rulePackageErrorMessage(error, '保存 TOML 失败')
      setErrorMessage(message)
      setRulePackageStatus(`保存失败：${message}`)
    }
  }

  const removeRulePackage = async (ruleSetId: string, version: string) => {
    try {
      const updated = await deleteRulePackage(ruleSetId, version)
      setRulePackages(updated)
      setRulePackageStatus(`已删除 ${version}`)
      setErrorMessage(null)

      const wasActive =
        activeRuleVersion?.ruleSetId === ruleSetId && activeRuleVersion?.version === version
      if (wasActive) {
        setActiveRuleVersion(null)
        void saveActiveRuleVersion(null)
        setLatencyAnalysis(null)
        setLatencyAnalysisMessage('已删除生效版本，请重新选择')
      }
      setActiveRuleNodeKey('')
      setRuleDetailDraft(null)
      setRuleDetailOpen(false)
    } catch (error) {
      const message = rulePackageErrorMessage(error, '删除规则版本失败')
      setErrorMessage(message)
      setRulePackageStatus(`删除失败：${message}`)
    }
  }

  const activateRuleVersion = (next: ActiveRuleVersionDto | null) => {
    setActiveRuleVersion(next)
    void saveActiveRuleVersion(next)
    // 级联：切换生效版本后重置场景选择，避免残留上一版本的场景 id
    setSelectedScenarioId(null)
    window.localStorage.removeItem(activeScenarioStorageKey)
    // matcher 勾选绑定的 id 随规则集整体变化而失效，切换生效版本时清空。
    setSelectedMatcherIds([])
    writePersistedMatcherIds([])
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
    rememberFolder(logFolderPath)

    const matchers = new Map(
      scenarioRules
        .filter((rule) => rule.recordType === 'matcher')
        .map((rule) => [rule.id, rule] as const),
    )
    const enabledStages = scenarioRules.filter((rule) => rule.enabled && rule.recordType === 'stage')
    const toMarker = (id: string): LogMarker | undefined => {
      const matcher = matchers.get(id)
      return matcher?.pattern
        ? { pattern: matcher.pattern, mode: matcher.matchType === 'regex' ? 'regex' : 'keyword' }
        : undefined
    }

    // 拆分点：flow 级 order=1 聚合分支（非拦截）的起点 matcher。
    const requestStartStage = enabledStages.find(
      (stage) => stage.flowId && stage.order === 1 && stage.kind !== 'intercept' && !!stage.startMatcherId,
    )
    const requestStart = requestStartStage?.startMatcherId ? toMarker(requestStartStage.startMatcherId) : undefined

    // 拦截 ends：kind=intercept 的 end_matcher_ids 逐条展开。
    const interceptEnds: LogMarker[] = []
    for (const stage of enabledStages) {
      if (stage.kind !== 'intercept' || !stage.endMatcherIds) continue
      for (const id of stage.endMatcherIds) {
        const marker = toMarker(id)
        if (marker) interceptEnds.push(marker)
      }
    }

    // process 级 + flow 级 stage：产真实时延样本，每个 stage 只取第一对 start/end。
    // 一个 stage 可配多个 end matcher（端侧日志可能丢失），命中任一即结束；
    // flow 级聚合 stage（result 分支）仍按不同 stage 表达，天然互斥。
    const endMatcherIdsOf = (stage: RuleRecordDto): string[] => {
      const ids: string[] = []
      if (stage.endMatcherId) ids.push(stage.endMatcherId)
      for (const id of stage.endMatcherIds ?? []) {
        if (id && !ids.includes(id)) ids.push(id)
      }
      return ids
    }

    const stageSpecs: LatencyStageSpec[] = []
    for (const stage of enabledStages) {
      if (stage.kind === 'intercept') continue
      if (!stage.processId && !stage.flowId) continue
      if (!stage.startMatcherId) continue
      const start = toMarker(stage.startMatcherId)
      if (!start) continue
      const endMarkers = endMatcherIdsOf(stage)
        .map(toMarker)
        .filter((marker): marker is LogMarker => marker !== undefined)
      if (endMarkers.length === 0) continue
      stageSpecs.push({ id: stage.id, startPattern: start.pattern, startMode: start.mode, endMarkers })
    }

    if (!requestStart || stageSpecs.length === 0) {
      setLatencyAnalysisMessage('未找到 flow 级请求拆分点或 stage 规则')
      return
    }

    setLatencyAnalysisMessage('正在分析…')
    try {
      const result = await analyzeLatencyStream(logFolderPath, { requestStart, interceptEnds, processStages: stageSpecs })
      setLatencyAnalysis(result)
      setLatencyAnalysisRunId((value) => value + 1)
      setLatencyAnalysisMessage(`已分析 ${result.requests.length} 个请求 · ${result.stats.sampleCount} 个阶段样本`)
    } catch (error) {
      setLatencyAnalysisMessage(`分析失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const exportLatencyCsv = (hiddenColumns: Set<string>) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadCsv(`latency-analysis-${timestamp}.csv`, buildLatencyExportCsv(latencyViewModel, hiddenColumns))
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
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setLogFolderPath(event.target.value)}
                placeholder="选择或粘贴日志目录"
                list="recent-folders-list"
              />
              <datalist id="recent-folders-list">
                {recentFolders.map((folder) => (
                  <option key={folder} value={folder} />
                ))}
              </datalist>
              <button type="button" className="ghost-button" onClick={() => void pickLogFolder()}>
                选择
              </button>
            </div>
          </label>

          <label className="field global-time-field">
            <span>时间范围</span>
            <input
              value={queryDraft.timeRange}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQueryDraft({ ...queryDraft, timeRange: event.target.value })}
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
          onSelectDraft={resetToDraft}
          onOpenQueryEditor={openExistingQueryEditor}
          onQueryDraftChange={setQueryDraft}
          onSaveCurrentQuery={saveCurrentQuery}
          onSearch={() => void runSearch()}
          onCloseQueryEditor={() => setQueryEditorOpen(false)}
          onQueryEditorChange={setQueryEditorDraft}
          onSaveQueryEditor={saveQueryFromEditor}
          onDeleteQuery={removeQuery}
          searchSource={searchSource}
          matcherScenarios={scenarios}
          matcherRecords={matcherRecords}
          selectedMatcherIds={selectedMatcherIds}
          onSearchSourceChange={setSearchSource}
          onSelectedMatcherIdsChange={changeSelectedMatcherIds}
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
          selectedScenarioId={effectiveScenarioId}
          scenarios={scenarios}
          onScenarioChange={changeScenario}
          activeNodeKey={activeRuleNodeKey}
          detailOpen={ruleDetailOpen}
          detailDraft={ruleDetailDraft}
          statusMessage={rulePackageStatus}
          onSelectNode={selectRuleNode}
          onOpenNode={openRuleNode}
          onCloseDetail={() => setRuleDetailOpen(false)}
          onImportPackage={importRules}
          onActivateVersion={activateRuleVersion}
          onDeleteVersion={removeRulePackage}
          onDetailDraftChange={setRuleDetailDraft}
          onSaveNode={saveRuleDetail}
          tomlOpen={ruleTomlOpen}
          tomlDraft={ruleTomlDraft}
          onOpenLayerToml={openLayerToml}
          onCloseToml={closeToml}
          onTomlDraftChange={changeTomlDraft}
          onSaveToml={saveLayerToml}
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
