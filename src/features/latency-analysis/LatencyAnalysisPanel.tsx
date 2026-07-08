import { useMemo, useState } from 'react'
import type * as React from 'react'
import type { RequestGroup, RequestViewModel } from '../../view-model/latency-view-model'

type LatencyAnalysisPanelProps = {
  viewModel: RequestViewModel
  timeStart: string
  timeEnd: string
  onTimeStartChange: (value: string) => void
  onTimeEndChange: (value: string) => void
  onAnalyze: () => void
  onExport: () => void
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function formatLaneBlockTooltip(block: RequestViewModel['laneBlocks'][number]) {
  return `${block.label}
起始: ${block.startTimestamp}
结束: ${block.endTimestamp}
相对耗时: ${block.relativeDuration}
阶段耗时: ${block.duration}`
}

function formatRelativeStart(relativeDuration: string) {
  return relativeDuration.split('~')[0]?.trim() ?? relativeDuration
}

export default function LatencyAnalysisPanel({
  viewModel,
  timeStart,
  timeEnd,
  onTimeStartChange,
  onTimeEndChange,
  onAnalyze,
  onExport,
}: LatencyAnalysisPanelProps) {
  const [leftHidden, setLeftHidden] = useState(false)
  const [rightHidden, setRightHidden] = useState(false)
  const [bottomHidden, setBottomHidden] = useState(false)
  const [leftWidth, setLeftWidth] = useState(270)
  const [rightWidth, setRightWidth] = useState(320)
  const [activeRequestId, setActiveRequestId] = useState(
    viewModel.requests.find((request) => request.group === 'slow')?.id ?? viewModel.requests[0]?.id ?? viewModel.requestId
  )
  const [activeBlockId, setActiveBlockId] = useState('rpc-b')
  const [requestFilter, setRequestFilter] = useState<RequestGroup | 'all'>('all')
  const [requestSort, setRequestSort] = useState<'duration-desc' | 'time-desc'>('duration-desc')
  const [intervalStart, setIntervalStart] = useState(viewModel.intervalStepOptions[2] ?? '')
  const [intervalEnd, setIntervalEnd] = useState(viewModel.intervalStepOptions[3] ?? '')

  const activeRequest = useMemo(
    () => viewModel.requests.find((request) => request.id === activeRequestId) ?? viewModel.requests[0],
    [activeRequestId, viewModel.requests]
  )

  const laneBlockById = useMemo(
    () => new Map(viewModel.laneBlocks.map((block) => [block.id, block])),
    [viewModel.laneBlocks]
  )

  const activeBlock = useMemo(
    () => laneBlockById.get(activeBlockId) ?? viewModel.laneBlocks[0],
    [activeBlockId, laneBlockById, viewModel.laneBlocks]
  )

  const visibleRequests = useMemo(() => {
    const filtered = requestFilter === 'all'
      ? viewModel.requests
      : viewModel.requests.filter((request) => request.group === requestFilter)

    return [...filtered].sort((left, right) => {
      if (requestSort === 'duration-desc') {
        return right.durationMs - left.durationMs
      }

      return right.id.localeCompare(left.id)
    })
  }, [requestFilter, requestSort, viewModel.requests])

  const selectRequest = (requestId: string) => {
    const nextRequest = viewModel.requests.find((request) => request.id === requestId)
    setActiveRequestId(requestId)
    setActiveBlockId(nextRequest?.slowPointBlockId ?? 'rpc-b')
  }

  const startResize = (kind: 'left' | 'right', startEvent: React.MouseEvent<HTMLButtonElement>) => {
    startEvent.preventDefault()
    const startX = startEvent.clientX
    const baseLeftWidth = leftWidth
    const baseRightWidth = rightWidth

    const onMove = (moveEvent: MouseEvent) => {
      if (kind === 'left') {
        setLeftWidth(clamp(baseLeftWidth + moveEvent.clientX - startX, 190, 420))
      }
      if (kind === 'right') {
        setRightWidth(clamp(baseRightWidth - (moveEvent.clientX - startX), 220, 520))
      }
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <section className="tab-page latency-page">
      <div className="analysis-toolbar">
        <label className="field compact-field">
          <span>开始时间</span>
          <input
            value={timeStart}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => onTimeStartChange(event.target.value)}
            placeholder="2026-06-12 10:30:00"
          />
        </label>

        <label className="field compact-field">
          <span>结束时间</span>
          <input
            value={timeEnd}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => onTimeEndChange(event.target.value)}
            placeholder="2026-06-12 10:45:00"
          />
        </label>

        <label className="field compact-field">
          <span>场景</span>
          <select defaultValue="core">
            <option value="core">核心链路</option>
            <option value="full">完整链路</option>
          </select>
        </label>

        <button type="button" className="primary-button" onClick={onAnalyze}>
          分析
        </button>
        <button type="button" className="ghost-button strong" onClick={onExport}>
          导出 CSV
        </button>
      </div>

      <div
        className={`latency-workspace ${leftHidden ? 'left-hidden' : ''} ${rightHidden ? 'right-hidden' : ''}`}
        style={{
          gridTemplateColumns: `${leftHidden ? 0 : leftWidth}px minmax(0, 1fr) ${rightHidden ? 0 : rightWidth}px`,
        }}
      >
        <aside className="side-panel request-panel">
          <div className="panel-title-row">
            <h2>请求资源管理器</h2>
            <button type="button" className="icon-button" onClick={() => setLeftHidden(true)}>
              收起
            </button>
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

              return (
                <section key={group.id} className="request-group">
                  <div className="request-group-title">
                    <strong>{group.title}</strong>
                    <span>{rows.length}</span>
                  </div>
                  {rows.map((request) => (
                    <button
                      key={request.id}
                      type="button"
                      className={`request-row ${request.id === activeRequestId ? 'active' : ''}`}
                      onClick={() => selectRequest(request.id)}
                    >
                      <strong>{request.id}</strong>
                      <span>{request.result} · {request.duration} · 慢点: {request.slowPoint}</span>
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
            onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => startResize('left', event)}
          />
        </aside>

        <section className="main-panel swimlane-panel">
          <div className="panel-title-row">
            <div>
              <h2>当前请求泳道图</h2>
              <span className="muted">请求标识使用开始日志时间戳: {activeRequestId}</span>
            </div>
            <div className="panel-actions">
              {leftHidden ? (
                <button type="button" className="ghost-button" onClick={() => setLeftHidden(false)}>
                  显示请求
                </button>
              ) : null}
              {rightHidden ? (
                <button type="button" className="ghost-button" onClick={() => setRightHidden(false)}>
                  显示步骤
                </button>
              ) : null}
              {bottomHidden ? (
                <button type="button" className="ghost-button" onClick={() => setBottomHidden(false)}>
                  显示区间统计
                </button>
              ) : null}
            </div>
          </div>

          {activeRequest ? (
            <div className="slow-request-summary">
              <div>
                <span>慢请求摘要</span>
                <strong>{activeRequest.result} · {activeRequest.duration}</strong>
              </div>
              <div>
                <span>主要慢点</span>
                <strong>{activeRequest.slowPoint}</strong>
              </div>
              <div>
                <span>场景</span>
                <strong>{activeRequest.scene}</strong>
              </div>
            </div>
          ) : null}

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
                    .filter((block) => block.lane === lane)
                    .map((block) => (
                      <button
                        key={block.id}
                        type="button"
                        className={`lane-block ${block.kind} ${block.id === activeBlock?.id ? 'active' : ''} ${block.id === activeRequest?.slowPointBlockId ? 'bottleneck' : ''}`}
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

        <aside className="side-panel step-panel">
          <button
            type="button"
            className="resize-handle right-resize"
            aria-label="调整步骤树宽度"
            onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => startResize('right', event)}
          />

          <div className="panel-title-row">
            <h2>步骤树</h2>
            <button type="button" className="icon-button" onClick={() => setRightHidden(true)}>
              收起
            </button>
          </div>

          <div className="selected-step-card">
            <span className={`level ${activeBlock?.kind ?? 'info'}`}>{activeBlock?.kind ?? 'stage'}</span>
            <strong>{activeBlock?.label ?? '未选择阶段'}</strong>
            <p>{activeBlock ? `${activeBlock.lane} · ${activeBlock.duration}` : '左侧选择请求后查看阶段'}</p>
            {activeBlock ? (
              <div className="selected-step-meta">
                <span>起始: {activeBlock.startTimestamp}</span>
                <span>结束: {activeBlock.endTimestamp}</span>
                <span>相对耗时: {activeBlock.relativeDuration}</span>
                <span>阶段耗时: {activeBlock.duration}</span>
              </div>
            ) : null}
          </div>

          <div className="step-tree">
            {viewModel.stepTree.map((step) => {
              const stepBlock = laneBlockById.get(step.blockId)

              return (
                <button
                  key={`${step.level}-${step.name}`}
                  type="button"
                  className={`tree-row ${step.blockId === activeBlockId ? 'active' : ''}`}
                  style={{ paddingLeft: `${12 + step.level * 18}px` }}
                  onClick={() => setActiveBlockId(step.blockId)}
                  >
                  <span className="tree-row-main">
                    <span className="tree-row-title">{step.name}</span>
                    <span className="tree-row-metrics">
                      <strong className="tree-row-relative">{stepBlock?.relativeDuration ?? '-'}</strong>
                      <strong className="tree-row-duration">{stepBlock?.duration ?? step.duration}</strong>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </aside>
      </div>

      {!bottomHidden ? (
        <section className="interval-panel">
          <div className="panel-title-row">
            <h2>区间统计</h2>
            <div className="panel-actions">
              <span>任意选择两个日志步骤，统计中间耗时</span>
              <button type="button" className="icon-button" onClick={() => setBottomHidden(true)}>
                收起
              </button>
            </div>
          </div>

          <div className="interval-panel-body">
            <div className="interval-controls">
              <label className="field">
                <span>起点步骤</span>
                <select value={intervalStart} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setIntervalStart(event.target.value)}>
                  {viewModel.intervalStepOptions.map((step) => (
                    <option key={step} value={step}>
                      {step}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>终点步骤</span>
                <select value={intervalEnd} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => setIntervalEnd(event.target.value)}>
                  {viewModel.intervalStepOptions.map((step) => (
                    <option key={step} value={step}>
                      {step}
                    </option>
                  ))}
                </select>
              </label>
            </div>

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
