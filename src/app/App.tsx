import { useMemo, useState } from 'react'
import AppShell from '../components/layout/AppShell'
import LogSearchPanel from '../features/log-search/LogSearchPanel'
import RuleCatalogPanel from '../features/rule-config/RuleCatalogPanel'
import LatencyAnalysisPanel from '../features/latency-analysis/LatencyAnalysisPanel'
import { getActiveQuery, filterLogsByQuery } from './app-actions'
import { issueRules, latencyResult, savedQueries, sampleLogs } from './app-state'
import { mapToViewModel } from '../view-model/latency-view-model'

const latencyViewModel = mapToViewModel(latencyResult)

export default function App() {
  const [activeQueryId, setActiveQueryId] = useState(savedQueries[0].id)

  const activeQuery = useMemo(
    () => getActiveQuery(savedQueries, activeQueryId),
    [activeQueryId]
  )

  const matchingLogs = useMemo(
    () => filterLogsByQuery(sampleLogs, activeQuery.query),
    [activeQuery.query]
  )

  const stats = [
    { value: '30MB', label: 'log volume target' },
    { value: '1s', label: 'typical query target' },
    { value: '2GB', label: 'memory ceiling' },
  ]

  return (
    <AppShell
      eyebrow="Log Analysis · M0"
      title="A lightweight desktop workbench for test teams"
      copy="Keyword search, rule notes, request context, and latency analysis all live in one local app."
      stats={stats}
    >
      <LogSearchPanel
        savedQueries={savedQueries}
        activeQuery={activeQuery}
        matchingLogs={matchingLogs}
        onSelectQuery={setActiveQueryId}
      />

      <RuleCatalogPanel rules={issueRules} />

      <LatencyAnalysisPanel viewModel={latencyViewModel} />
    </AppShell>
  )
}
