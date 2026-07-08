import { useEffect, useMemo, useState } from 'react'
import AppShell, { type WorkbenchTab } from '../components/layout/AppShell'
import LogSearchPanel from '../features/log-search/LogSearchPanel'
import RuleCatalogPanel from '../features/rule-config/RuleCatalogPanel'
import LatencyAnalysisPanel from '../features/latency-analysis/LatencyAnalysisPanel'
import { getActiveQuery } from './app-actions'
import { issueRules, latencyResult, savedQueries } from './app-state'
import { searchLogs } from '../api/tauri-client'
import type { LogSearchMode, LogSearchRequestDto } from '../api/dto'
import { mapLogSearchToViewModel } from '../view-model/log-search-view-model'
import type { LogSearchViewModel } from '../view-model/log-search-view-model'
import { mapToViewModel } from '../view-model/latency-view-model'

const latencyViewModel = mapToViewModel(latencyResult)

const tabs: WorkbenchTab[] = [
  { id: 'log-search', label: '日志搜索' },
  { id: 'latency-analysis', label: '时延分析', badge: '核心' },
  { id: 'rule-config', label: '规则配置' },
  { id: 'issue-tips', label: '问题提示' },
]

export default function App() {
  const [activeTabId, setActiveTabId] = useState('latency-analysis')
  const [activeQueryId, setActiveQueryId] = useState(savedQueries[0].id)
  const [queryText, setQueryText] = useState(savedQueries[0].query)
  const [mode, setMode] = useState<LogSearchMode>('keyword')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [result, setResult] = useState<LogSearchViewModel | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [timeStart, setTimeStart] = useState('2026-06-12 10:30:00')
  const [timeEnd, setTimeEnd] = useState('2026-06-12 10:45:00')

  const activeQuery = useMemo(
    () => getActiveQuery(savedQueries, activeQueryId),
    [activeQueryId]
  )

  useEffect(() => {
    setQueryText(activeQuery.query)
  }, [activeQuery.query])

  const runSearch = async (overrideQueryText?: string) => {
    const request: LogSearchRequestDto = {
      query: overrideQueryText ?? queryText,
      mode,
      caseSensitive,
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

  useEffect(() => {
    void runSearch(activeQuery.query)
  }, [activeQuery.query, mode, caseSensitive])

  return (
    <AppShell activeTabId={activeTabId} tabs={tabs} onTabChange={setActiveTabId}>
      {activeTabId === 'log-search' ? (
        <LogSearchPanel
          savedQueries={savedQueries}
          activeQuery={activeQuery}
          queryText={queryText}
          mode={mode}
          caseSensitive={caseSensitive}
          isSearching={isSearching}
          result={result}
          errorMessage={errorMessage}
          onSelectQuery={setActiveQueryId}
          onQueryTextChange={setQueryText}
          onModeChange={setMode}
          onCaseSensitiveChange={setCaseSensitive}
          onSearch={() => void runSearch()}
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

      {activeTabId === 'rule-config' ? <RuleCatalogPanel rules={issueRules} /> : null}

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
