import { useEffect, useMemo, useState } from 'react'
import { analyzeHealthCheck, type HealthReport } from '../../api/health-check-client'
import type { ActiveRuleVersionDto, DiagnosticProblemConfigDto, RulePackageVersionDto, RuleRecordDto } from '../../api/dto'
import {
  listDiagnosticProblems,
  runDiagnostic as runDiagnosticRequest,
  saveDiagnosticProblems,
  type DiagnosticReport,
} from '../../api/specialist-diagnosis-client'
import {
  buildHealthCheckProjection,
  resolveDiagnosticProblem,
} from '../../domain/effective-rule-resolver'
import HealthCheckPanel from './HealthCheckPanel'

type Props = {
  rulePackages: RulePackageVersionDto[]
  activeRuleVersion: ActiveRuleVersionDto | null
  rules: RuleRecordDto[]
  scenarioRules: RuleRecordDto[]
  logFolderPath: string
  timeRange: string
  contextKey: string
  onRememberFolder: (path: string) => void
}

function parseTimeRange(timeRange: string): { startTime?: string; endTime?: string } {
  const [start, end] = timeRange.split('~').map((part) => part.trim())
  return { startTime: start || undefined, endTime: end || undefined }
}

export default function HealthCheckContainer({
  rulePackages,
  activeRuleVersion,
  rules,
  scenarioRules,
  logFolderPath,
  timeRange,
  contextKey,
  onRememberFolder,
}: Props) {
  const [report, setReport] = useState<HealthReport | null>(null)
  const [message, setMessage] = useState('等待体检')
  const [problems, setProblems] = useState<DiagnosticProblemConfigDto[]>([])
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null)
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticReport | null>(null)
  const [diagnosticMessage, setDiagnosticMessage] = useState('选择问题后运行')
  const stageNameById = useMemo(
    () => new Map(
      scenarioRules
        .filter((rule) => rule.recordType === 'stage')
        .map((rule) => [rule.id, rule.description || rule.name] as const),
    ),
    [scenarioRules],
  )

  useEffect(() => {
    let cancelled = false

    async function loadProblems() {
      try {
        const loaded = await listDiagnosticProblems()
        if (cancelled) return
        setProblems(loaded)
        setSelectedProblemId(loaded[0]?.id ?? null)
      } catch (error) {
        if (!cancelled) {
          setDiagnosticMessage(`加载问题失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }

    void loadProblems()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setReport(null)
    setMessage('等待体检')
    setDiagnosticReport(null)
    setDiagnosticMessage('选择问题后运行')
  }, [contextKey])

  const runHealthCheck = async () => {
    const activeExists = activeRuleVersion !== null && rulePackages.some(
      (item) => item.ruleSetId === activeRuleVersion.ruleSetId && item.version === activeRuleVersion.version,
    )
    if (!activeExists) return setMessage('请先在规则配置页设置生效版本')
    if (!logFolderPath.trim()) return setMessage('请先选择日志文件夹')
    onRememberFolder(logFolderPath)

    const { errorFilters, requestStarts, interceptEnds, processStages, stageThresholds } =
      buildHealthCheckProjection(scenarioRules, rules)
    if (stageThresholds.length > 0 && (requestStarts.length === 0 || processStages.length === 0)) {
      return setMessage('未找到 flow 级请求拆分点或 stage 规则')
    }

    const { startTime, endTime } = parseTimeRange(timeRange)
    setMessage('正在体检…')
    try {
      const nextReport = await analyzeHealthCheck(
        logFolderPath,
        { errorFilters, requestStarts, interceptEnds, processStages, stageThresholds },
        { startTime, endTime },
      )
      setReport(nextReport)
      setMessage(`体检完成：${nextReport.summary.errorCount} 条异常 · ${nextReport.summary.slowRequestCount} 个慢请求`)
    } catch (error) {
      setMessage(`体检失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const runDiagnostic = async (problem: DiagnosticProblemConfigDto) => {
    if (!logFolderPath.trim()) return setDiagnosticMessage('请先选择日志文件夹')
    onRememberFolder(logFolderPath)
    const resolved = resolveDiagnosticProblem(problem, rules)
    if (!resolved) return setDiagnosticMessage('问题引用的 matcher/stage 已失效，请编辑问题重新选择')

    const { startTime, endTime } = parseTimeRange(timeRange)
    setDiagnosticMessage('正在诊断…')
    try {
      const nextReport = await runDiagnosticRequest(logFolderPath, resolved, { startTime, endTime })
      setDiagnosticReport(nextReport)
      setDiagnosticMessage(nextReport.hit ? `命中：${nextReport.conclusion}` : `未命中：${nextReport.conclusion}`)
    } catch (error) {
      setDiagnosticMessage(`诊断失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const saveProblem = async (problem: DiagnosticProblemConfigDto) => {
    const exists = problems.some((item) => item.id === problem.id)
    const next = exists ? problems.map((item) => (item.id === problem.id ? problem : item)) : [...problems, problem]
    setProblems(next)
    setSelectedProblemId(problem.id)
    try {
      await saveDiagnosticProblems(next)
    } catch (error) {
      setDiagnosticMessage(`保存失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const deleteProblem = async (id: string) => {
    const next = problems.filter((item) => item.id !== id)
    setProblems(next)
    if (selectedProblemId === id) {
      setSelectedProblemId(null)
      setDiagnosticReport(null)
    }
    try {
      await saveDiagnosticProblems(next)
    } catch (error) {
      setDiagnosticMessage(`删除失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <HealthCheckPanel
      report={report}
      message={message}
      stageNameById={stageNameById}
      onCheck={() => void runHealthCheck()}
      problems={problems}
      selectedProblemId={selectedProblemId}
      diagnosticReport={diagnosticReport}
      diagnosticMessage={diagnosticMessage}
      rules={rules}
      onSelectProblem={setSelectedProblemId}
      onRunDiagnostic={(problem) => void runDiagnostic(problem)}
      onSaveProblem={(problem) => void saveProblem(problem)}
      onDeleteProblem={(id) => void deleteProblem(id)}
    />
  )
}
