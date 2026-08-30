import { useEffect, useMemo, useState } from 'react'
import type * as React from 'react'
import type { RequestGroup, RequestViewModel } from '../../view-model/latency-view-model'
import LatencyDetailTable from './LatencyDetailTable'

type LatencyAnalysisPanelProps = {
  viewModel: RequestViewModel
  analysisMessage: string
  scenarios: Array<{ id: string; name: string }>
  selectedScenarioId: string | null
  onScenarioChange: (nextId: string) => void
  onAnalyze: () => void
  onExport: (hiddenColumns: Set<string>) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatLaneBlockTooltip(block: RequestViewModel['laneBlocks'][number]) {
  const startTimestamp = block.startTimestamp || '未分析'
  const endTimestamp = block.endTimestamp || '未分析'
  return `${block.label}
开始: ${startTimestamp}
结束: ${endTimestamp}
相对时延: ${block.relativeDuration}
阶段时延: ${block.duration}`
}

function formatRelativeStart(relativeDuration: string) {
  return relativeDuration.split('~')[0]?.trim() ?? relativeDuration
}

export default function LatencyAnalysisPanel({
  viewModel,
  analysisMessage,
  scenarios,
  selectedScenarioId,
  onScenarioChange,
  onAnalyze,
  onExport,
}: LatencyAnalysisPanelProps) {
  const [leftHidden, setLeftHidden] = useState(false)
  const [bottomHidden, setBottomHidden] = useState(false)
  const [viewMode, setViewMode] = useState<'swimlane' | 'table'>('swimlane')
  const [leftWidth, setLeftWidth] = useState(270)
  const [activeRequestId, setActiveRequestId] = useState(
    viewModel.requests.find((request) => request.group === 'slow')?.id ?? viewModel.requests[0]?.id ?? viewModel.requestId,
  )
  const [activeBlockId, setActiveBlockId] = useState(viewModel.requests[0]?.slowPointBlockId ?? viewModel.laneBlocks[0]?.id ?? '')
  const [requestFilter, setRequestFilter] = useState<RequestGroup | 'all'>('all')
  const [requestSort, setRequestSort] = useState<'duration-desc' | 'time-desc'>('duration-desc')
  const [intervalStart, setIntervalStart] = useState(viewModel.intervalStepOptions[0] ?? '')
  const [intervalEnd, setIntervalEnd] = useState(viewModel.intervalStepOptions[1] ?? viewModel.intervalStepOptions[0] ?? '')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({ normal: true, unfinished: true })
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())

  const activeRequest = useMemo(
    () => viewModel.requests.find((request) => request.id === activeRequestId) ?? viewModel.requests[0],
    [activeRequestId, viewModel.requests],
  )

  const laneBlockById = useMemo(
    () => new Map(viewModel.laneBlocks.map((block) => [block.id, block])),
    [viewModel.laneBlocks],
  )

  const activeBlock = useMemo(
    () => laneBlockById.get(activeBlockId) ?? viewModel.laneBlocks[0],
    [activeBlockId, laneBlockById, viewModel.laneBlocks],
  )

  const visibleRequests = useMemo(() => {
    const filtered = requestFilter === 'all' ? viewModel.requests : viewModel.requests.filter((request) => request.group === requestFilter)

    return [...filtered].sort((left, right) => {
      if (requestSort === 'duration-desc') {
        return right.durationMs - left.durationMs
      }

      return right.id.localeCompare(left.id)
    })
  }, [requestFilter, requestSort, viewModel.requests])

  useEffect(() => {
    const nextRequest = viewModel.requests.find((request) => request.group === 'slow') ?? viewModel.requests[0]
    setActiveRequestId(nextRequest?.id ?? viewModel.requestId)
    setActiveBlockId(nextRequest?.slowPointBlockId ?? viewModel.laneBlocks[0]?.id ?? '')
    setIntervalStart(viewModel.intervalStepOptions[0] ?? '')
    setIntervalEnd(viewModel.intervalStepOptions[1] ?? viewModel.intervalStepOptions[0] ?? '')
  }, [viewModel])

  const selectRequest = (requestId: string) => {
    const nextRequest = viewModel.requests.find((request) => request.id === requestId)
    setActiveRequestId(requestId)
    setActiveBlockId(nextRequest?.slowPointBlockId ?? 'rpc-b')
  }

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const toggleColumn = (id: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleColumnGroup = (group: string) => {
    const columns = (viewModel.table?.columns ?? []).filter((column) => column.group === group)
    const allVisible = columns.every((column) => !hiddenColumns.has(column.id))
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      for (const column of columns) {
        if (allVisible) {
          next.add(column.id)
        } else {
          next.delete(column.id)
        }
      }
      return next
    })
  }

  const startResize = (startEvent: React.MouseEvent<HTMLButtonElement>) => {
    startEvent.preventDefault()
    const startX = startEvent.clientX
    const baseLeftWidth = leftWidth

    const onMove = (moveEvent: MouseEvent) => {
      setLeftWidth(clamp(baseLeftWidth + moveEvent.clientX - startX, 190, 420))
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <section className={`tab-page latency-page ${viewMode === 'table' ? 'table-mode' : ''}`}>
      <div
        className={`latency-workspace ${leftHidden ? 'left-hidden' : ''} ${bottomHidden ? 'bottom-hidden' : ''}`}
        style={{
          gridTemplateColumns: `${leftHidden ? 40 : leftWidth}px minmax(0, 1fr)`,
        }}
      >
        {leftHidden ? (
          <aside className="side-panel request-panel">
            <button type="button" className="sidebar-expand-button" onClick={() => setLeftHidden(false)} title="展开请求资源管理器" aria-label="展开请求资源管理器">
              »
            </button>
          </aside>
        ) : (
        <aside className="side-panel request-panel">
          <div className="panel-title-row">
            <h2>请求资源管理器</h2>
            <label className="view-mode-select">
              <span className="visually-hidden">视图切换</span>
              <select
                value={viewMode}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                  setViewMode(event.target.value as 'swimlane' | 'table')
                }
              >
                <option value="swimlane">泳道图</option>
                <option value="table">明细表</option>
              </select>
            </label>
            <button type="button" className="sidebar-collapse-button" onClick={() => setLeftHidden(true)} title="隐藏请求资源管理器" aria-label="隐藏请求资源管理器">
              «
            </button>
          </div>

          <div className="analysis-controls">
            <label className="field compact-field">
              <span>场景</span>
              <select
                value={selectedScenarioId ?? ''}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onScenarioChange(event.target.value)}
              >
                {scenarios.length === 0 ? (
                  <option value="">全场景</option>
                ) : (
                  scenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>{scenario.name}</option>
                  ))
                )}
              </select>
            </label>

            <div className="analysis-actions">
              <button type="button" className="primary-button" onClick={onAnalyze}>
                分析
              </button>
            </div>

            <span className="analysis-status">{analysisMessage}</span>
          </div>

          <div className="request-tools">
            <label className="field">
              <span>请求筛选</span>
              <select value={requestFilter} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setRequestFilter(event.target.value as RequestGroup | 'all')}>
                <option value="all">全部请求</option>
                <option value="slow">只看慢请求</option>
                <option value="abnormal">只看异常</option>
                <option value="unfinished">只看未结束</option>
              </select>
            </label>
            <label className="field">
              <span>耗时排序</span>
              <select value={requestSort} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setRequestSort(event.target.value as 'duration-desc' | 'time-desc')}>
                <option value="duration-desc">耗时从高到低</option>
                <option value="time-desc">时间从新到旧</option>
              </select>
            </label>
          </div>

          <div className="request-explorer">
            {viewModel.requestGroups.map((group) => {
              const rows = visibleRequests.filter((request) => request.group === group.id)
              if (rows.length === 0) {
                return null
              }

              const collapsed = collapsedGroups[group.id] ?? false

              return (
                <section key={group.id} className="request-group">
                  <button
                    type="button"
                    className="request-group-title"
                    onClick={() => toggleGroup(group.id)}
                    title={collapsed ? '展开' : '收起'}
                  >
                    <span className="request-group-disclosure" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
                    <strong>{group.title}</strong>
                    <span className="request-group-count">{rows.length}</span>
                  </button>
                  {collapsed ? null : rows.map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      className={`request-row ${request.id === activeRequestId ? 'active' : ''}`}
                      onClick={() => selectRequest(request.id)}
                    >
                      <strong>{request.id}</strong>
                      <span>
                        {request.result} · {request.duration} · 慢点: {request.slowPoint}
                      </span>
                    </button>
                  ))}
                </section>
              )
            })}
          </div>

          <button
            type="button"
            className="resize-handle left-resize"
            aria-label="调整请求资源管理器宽度"
            onMouseDown={startResize}
          />
        </aside>
        )}

        {viewMode === 'swimlane' ? (
          <section className="main-panel swimlane-panel">
            <div className="panel-title-row">
              <div>
                <h2>当前请求泳道图</h2>
                <span className="muted">请求标识使用开始日志时间戳: {activeRequestId}</span>
              </div>
              <div className="panel-actions">
                {bottomHidden ? (
                  <button type="button" className="icon-button" onClick={() => setBottomHidden(false)} title="显示区间统计" aria-label="显示区间统计">
                    ▴
                  </button>
                ) : null}
              </div>
            </div>

            <div className="time-axis">
              <span>0ms</span>
              <span>100ms</span>
              <span>200ms</span>
              <span>300ms</span>
            </div>

            <div className="swimlane-board">
              {viewModel.lanes.map((lane) => (
                <div className="swimlane-row" key={lane}>
                  <div className="swimlane-label">{lane}</div>
                  <div className="swimlane-track">
                    {viewModel.laneBlocks
                      .filter((block) => block.lane === lane && (!block.requestId || block.requestId === activeRequestId))
                      .map((block) => (
                        <button
                          key={block.id}
                          type="button"
                          className={`lane-block ${block.kind} ${block.id === activeBlock?.id ? 'active' : ''} ${
                            block.id === activeRequest?.slowPointBlockId ? 'bottleneck' : ''
                          }`}
                          title={formatLaneBlockTooltip(block)}
                          aria-label={formatLaneBlockTooltip(block)}
                          style={{
                            left: `${block.startPercent}%`,
                            width: `${block.widthPercent}%`,
                          }}
                          onClick={() => setActiveBlockId(block.id)}
                        >
                          <span className="lane-block-start">{formatRelativeStart(block.relativeDuration)}</span>
                          <strong>{block.label}</strong>
                          <span className="lane-block-meta">{block.duration}</span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="main-panel latency-table-panel">
            <div className="panel-title-row">
              <div>
                <h2>请求明细表</h2>
                <span className="muted">每个请求一行，flow stage 在前、各 process 细节 stage 按时序排列</span>
              </div>
              <div className="panel-actions">
                <button type="button" className="ghost-button strong" onClick={() => onExport(hiddenColumns)}>
                  导出 CSV
                </button>
              </div>
            </div>
            <LatencyDetailTable
              table={viewModel.table ?? { columns: [], rows: [] }}
              hiddenColumns={hiddenColumns}
              onToggleColumn={toggleColumn}
              onToggleGroup={toggleColumnGroup}
            />
          </section>
        )}
      </div>

      {!bottomHidden && viewMode === 'swimlane' ? (
        <section className="interval-panel">
          <div className="panel-title-row">
            <h2>区间统计</h2>
            <div className="panel-actions">
              <div className="interval-controls">
                <label className="field compact-field">
                  <span>起点</span>
                  <select value={intervalStart} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setIntervalStart(event.target.value)}>
                    {viewModel.intervalStepOptions.map((step) => (
                      <option key={step} value={step}>
                        {step}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field compact-field">
                  <span>终点</span>
                  <select value={intervalEnd} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setIntervalEnd(event.target.value)}>
                    {viewModel.intervalStepOptions.map((step) => (
                      <option key={step} value={step}>
                        {step}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="button" className="icon-button" onClick={() => setBottomHidden(true)} title="隐藏区间统计" aria-label="隐藏区间统计">
                ▾
              </button>
            </div>
          </div>

          <div className="interval-panel-body">
            <div className="interval-stats">
              <div>
                <span>当前请求耗时</span>
                <strong>42ms</strong>
              </div>
              <div>
                <span>样本数</span>
                <strong>{viewModel.stats.sampleCount}</strong>
              </div>
              <div>
                <span>平均值(ms)</span>
                <strong>{viewModel.stats.averageMs}</strong>
              </div>
              <div>
                <span>P90(ms)</span>
                <strong>{viewModel.stats.p90Ms}</strong>
              </div>
              <div>
                <span>最大值(ms)</span>
                <strong>{viewModel.stats.maxMs}</strong>
              </div>
              <div>
                <span>异常样本</span>
                <strong>1</strong>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </section>
  )
}
