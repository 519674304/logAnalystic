import { useEffect, useMemo, useState } from 'react'
import { analyzeLatencyStream, type LatencyAnalysis } from '../../api/latency-analysis-client'
import type { ActiveRuleVersionDto, RulePackageVersionDto, RuleRecordDto } from '../../api/dto'
import {
  buildLatencySpecProjection,
} from '../../domain/effective-rule-resolver'
import {
  buildEmptyLatencyViewModel,
  buildLatencyViewModelFromAnalysis,
} from '../../view-model/latency-view-model'
import { buildLatencyExportCsv, downloadCsv } from './latency-export'
import LatencyAnalysisPanel from './LatencyAnalysisPanel'

type Props = {
  rulePackages: RulePackageVersionDto[]
  activeRuleVersion: ActiveRuleVersionDto | null
  rules: RuleRecordDto[]
  scenarioRules: RuleRecordDto[]
  scenarios: Array<{ id: string; name: string }>
  selectedScenarioId: string | null
  logFolderPath: string
  timeRange: string
  contextKey: string
  onScenarioChange: (id: string) => void
  onRememberFolder: (path: string) => void
}

function parseTimeRange(timeRange: string): { startTime?: string; endTime?: string } {
  const [start, end] = timeRange.split('~').map((part) => part.trim())
  return { startTime: start || undefined, endTime: end || undefined }
}

export default function LatencyAnalysisContainer({
  rulePackages,
  activeRuleVersion,
  rules,
  scenarioRules,
  scenarios,
  selectedScenarioId,
  logFolderPath,
  timeRange,
  contextKey,
  onScenarioChange,
  onRememberFolder,
}: Props) {
  const [analysis, setAnalysis] = useState<LatencyAnalysis | null>(null)
  const [analysisMessage, setAnalysisMessage] = useState('等待分析')
  const viewModel = useMemo(
    () => (analysis ? buildLatencyViewModelFromAnalysis(scenarioRules, analysis) : buildEmptyLatencyViewModel()),
    [analysis, scenarioRules],
  )

  useEffect(() => {
    setAnalysis(null)
    setAnalysisMessage('等待分析')
  }, [contextKey])

  const runAnalysis = async () => {
    const activeExists = activeRuleVersion !== null && rulePackages.some(
      (item) => item.ruleSetId === activeRuleVersion.ruleSetId && item.version === activeRuleVersion.version,
    )
    if (!activeExists) return setAnalysisMessage('请先在规则配置页设置生效版本')
    if (!logFolderPath.trim()) return setAnalysisMessage('请先选择日志文件夹')
    onRememberFolder(logFolderPath)
    const { requestStarts, interceptEnds, stageSpecs } = buildLatencySpecProjection(scenarioRules, rules)
    if (requestStarts.length === 0 || stageSpecs.length === 0) {
      return setAnalysisMessage('未找到 flow 级请求拆分点或 stage 规则')
    }
    const { startTime, endTime } = parseTimeRange(timeRange)
    setAnalysisMessage('正在分析…')
    try {
      const result = await analyzeLatencyStream(
        logFolderPath,
        { requestStarts, interceptEnds, processStages: stageSpecs },
        { startTime, endTime },
      )
      setAnalysis(result)
      setAnalysisMessage(`已分析 ${result.requests.length} 个请求 · ${result.stats.sampleCount} 个阶段样本`)
    } catch (error) {
      setAnalysisMessage(`分析失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const exportCsv = (hiddenColumns: Set<string>) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    downloadCsv(`latency-analysis-${timestamp}.csv`, buildLatencyExportCsv(viewModel, hiddenColumns))
    setAnalysisMessage('已导出时延 CSV')
  }

  return <LatencyAnalysisPanel viewModel={viewModel} analysisMessage={analysisMessage} scenarios={scenarios}
    selectedScenarioId={selectedScenarioId} onScenarioChange={onScenarioChange}
    onAnalyze={() => void runAnalysis()} onExport={exportCsv} />
}
