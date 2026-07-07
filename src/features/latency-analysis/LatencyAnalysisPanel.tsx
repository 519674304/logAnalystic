import type { RequestViewModel } from '../../view-model/latency-view-model'

type LatencyAnalysisPanelProps = {
  viewModel: RequestViewModel
}

export default function LatencyAnalysisPanel({ viewModel }: LatencyAnalysisPanelProps) {
  const stageLabel = viewModel.stages.map((stage) => stage.name).join(' → ')

  return (
    <section className="panel">
      <div className="panel-title-row">
        <h2>时延分析</h2>
        <span>应用 / 时长</span>
      </div>

      <div className="latency-card">
        <div className="latency-bars">
          {viewModel.stages.map((stage, index) => (
            <div className="bar-row" key={stage.id}>
              <span>{stage.name}</span>
              <div
                className="bar"
                style={{
                  width: `${Math.max(34, 82 - index * 18)}%`,
                  background: stage.color,
                }}
              />
            </div>
          ))}
        </div>

        <div className="detail-card">
          <h3>当前请求</h3>
          <p>请求 ID: {viewModel.requestId}</p>
          <p>阶段: {stageLabel}</p>
          <p className="muted">
            样本数: {viewModel.stats.sampleCount} · 平均值: {viewModel.stats.averageMs}ms · P90:{' '}
            {viewModel.stats.p90Ms}ms · 最大值: {viewModel.stats.maxMs}ms
          </p>
        </div>
      </div>
    </section>
  )
}
