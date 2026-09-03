import { useEffect, useMemo, useState } from 'react'
import type * as React from 'react'
import AppShell, { type WorkbenchTab } from '../components/layout/AppShell'
import LogSearchContainer from '../features/log-search/LogSearchContainer'
import RuleConfigContainer from '../features/rule-config/RuleConfigContainer'
import LatencyAnalysisContainer from '../features/latency-analysis/LatencyAnalysisContainer'
import HealthCheckContainer from '../features/health-check/HealthCheckContainer'
import {
  listRulePackages,
  loadActiveRuleVersion,
} from '../api/tauri-client'
import type {
  ActiveRuleVersionDto,
  RulePackageVersionDto,
} from '../api/dto'
import {
  clearActiveScenario,
  pushRecentFolder,
  readActiveScenario,
  readLogFolderPath,
  readRecentFolders,
  saveActiveScenario,
  writeLogFolderPath,
  writeRecentFolders,
} from './workbench-preferences'
import {
  filterRulesByScenario,
  projectRuleRecords,
} from '../domain/effective-rule-resolver'

// 默认时间范围动态取当天全天，避免写死演示日期。
function buildDefaultTimeRange(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `${date} 00:00:00 ~ ${date} 23:59:59`
}
const tabs: WorkbenchTab[] = [
  { id: 'log-search', label: '日志搜索' },
  { id: 'latency-analysis', label: '时延分析' },
  { id: 'rule-config', label: '规则配置' },
  { id: 'issue-tips', label: '问题提示' },
]

export default function App() {
  const [activeTabId, setActiveTabId] = useState('latency-analysis')
  const [logFolderPath, setLogFolderPath] = useState(() => readLogFolderPath())
  const [timeRange, setTimeRange] = useState(buildDefaultTimeRange)
  const [recentFolders, setRecentFolders] = useState<string[]>(() => readRecentFolders())
  const [rulePackages, setRulePackages] = useState<RulePackageVersionDto[]>([])
  const [activeRuleVersion, setActiveRuleVersion] = useState<ActiveRuleVersionDto | null>(null)
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(() => readActiveScenario())
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false)
  const rules = useMemo(() => projectRuleRecords(rulePackages, activeRuleVersion), [rulePackages, activeRuleVersion])
  const matcherRecords = useMemo(() => rules.filter((rule) => rule.recordType === 'matcher'), [rules])
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

  // 记录一个真正被搜索过的文件夹到最近列表（最近优先、去重、上限 5 个）。
  const rememberFolder = (path: string) => {
    const next = pushRecentFolder(recentFolders, path)
    setRecentFolders(next)
    writeRecentFolders(next)
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
    writeLogFolderPath(logFolderPath)
  }, [logFolderPath])

  useEffect(() => {
    let cancelled = false

    async function loadWorkspaceLists() {
      try {
        const [loadedRulePackages, loadedActiveRuleVersion] = await Promise.all([
          listRulePackages(),
          loadActiveRuleVersion(),
        ])

        if (cancelled) {
          return
        }

        // 迁移：旧版本只存单个文件夹路径，首次升级时把它并入最近列表。
        const persistedFolder = readLogFolderPath()
        const loadedRecentFolders = readRecentFolders()
        if (loadedRecentFolders.length === 0 && persistedFolder.trim()) {
          const seeded = pushRecentFolder([], persistedFolder)
          setRecentFolders(seeded)
          writeRecentFolders(seeded)
        }

        setRulePackages(loadedRulePackages)
        setActiveRuleVersion(loadedActiveRuleVersion)

      } catch (error) {
        if (!cancelled) console.error('加载工作台配置失败', error)
      } finally {
        if (!cancelled) setWorkspaceLoaded(true)
      }
    }

    void loadWorkspaceLists()

    return () => {
      cancelled = true
    }
  }, [])

  const changeActiveRuleVersion = (next: ActiveRuleVersionDto | null) => {
    setActiveRuleVersion(next)
    // 级联：切换生效版本后重置场景选择，避免残留上一版本的场景 id
    setSelectedScenarioId(null)
    clearActiveScenario()
  }

  const changeScenario = (nextId: string) => {
    setSelectedScenarioId(nextId)
    saveActiveScenario(nextId)
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
              value={timeRange}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTimeRange(event.target.value)}
              placeholder="2026-06-12 10:30:00 ~ 2026-06-12 10:45:00"
            />
          </label>
        </>
      }
    >
      {workspaceLoaded ? <>
      <div hidden={activeTabId !== 'log-search'}>
        <LogSearchContainer
          logFolderPath={logFolderPath}
          timeRange={timeRange}
          matcherRecords={matcherRecords}
          scenarios={scenarios}
          matcherContextKey={`${activeRuleVersion?.ruleSetId ?? ''}/${activeRuleVersion?.version ?? ''}`}
          onTimeRangeChange={setTimeRange}
          onRememberFolder={rememberFolder}
        />
      </div>

      <div hidden={activeTabId !== 'latency-analysis'}>
        <LatencyAnalysisContainer
          rulePackages={rulePackages}
          activeRuleVersion={activeRuleVersion}
          rules={rules}
          scenarioRules={scenarioRules}
          scenarios={scenarios}
          selectedScenarioId={effectiveScenarioId}
          logFolderPath={logFolderPath}
          timeRange={timeRange}
          contextKey={`${activeRuleVersion?.ruleSetId ?? ''}/${activeRuleVersion?.version ?? ''}/${effectiveScenarioId ?? ''}`}
          onScenarioChange={changeScenario}
          onRememberFolder={rememberFolder}
        />
      </div>

      <div hidden={activeTabId !== 'rule-config'}>
        <RuleConfigContainer
          versions={rulePackages}
          activeRuleVersion={activeRuleVersion}
          selectedScenarioId={effectiveScenarioId}
          scenarios={scenarios}
          onVersionsChange={setRulePackages}
          onActiveRuleVersionChange={changeActiveRuleVersion}
          onScenarioChange={changeScenario}
        />
      </div>

      <div hidden={activeTabId !== 'issue-tips'}>
        <HealthCheckContainer
          rulePackages={rulePackages}
          activeRuleVersion={activeRuleVersion}
          rules={rules}
          scenarioRules={scenarioRules}
          logFolderPath={logFolderPath}
          timeRange={timeRange}
          contextKey={`${activeRuleVersion?.ruleSetId ?? ''}/${activeRuleVersion?.version ?? ''}/${effectiveScenarioId ?? ''}`}
          onRememberFolder={rememberFolder}
        />
      </div>
      </> : null}
    </AppShell>
  )
}
