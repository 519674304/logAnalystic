import type { HealthReport } from '../../api/health-check-client'

interface Props {
  report: HealthReport | null
  message: string
  onCheck: () => void
  stageNameById: Map<string, string>
}

export default function HealthCheckPanel({ report, message, onCheck, stageNameById }: Props) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <h2>问题提示</h2>
        <span>系统异常 · 时延异常</span>
        <button type="button" className="ghost-button" onClick={onCheck}>
          开始体检
        </button>
      </div>
      <p className="analysis-message">{message}</p>

      {report ? (
        <>
          <div className="health-summary">
            <div className="stat">系统异常 <strong>{report.summary.errorCount}</strong></div>
            <div className="stat">慢请求 <strong>{report.summary.slowRequestCount}</strong></div>
            <div className="stat">慢阶段 <strong>{report.summary.slowStageCount}</strong></div>
            <div className="stat">体检请求 <strong>{report.summary.totalRequestCount}</strong></div>
          </div>

          <h3>系统异常</h3>
          {report.systemErrors.length === 0 ? (
            <p>无</p>
          ) : (
            <div className="rule-list">
              {report.systemErrors.map((error, index) => (
                <div key={index} className="rule-item">
                  <div className="rule-head">
                    <strong>{error.timestamp}</strong>
                    <span className="severity exception">{error.level}</span>
                  </div>
                  <p>[{error.tag}] {error.message}</p>
                </div>
              ))}
            </div>
          )}

          <h3>时延异常（慢阶段）</h3>
          {report.slowRequests.length === 0 ? (
            <p>无</p>
          ) : (
            <div className="rule-list">
              {report.slowRequests.map((request) => (
                <div key={request.requestId} className="rule-item">
                  <div className="rule-head">
                    <strong>{request.requestId}</strong>
                    <span className="severity warning">总耗时 {request.totalMs}ms</span>
                  </div>
                  {request.slowStages.map((stage) => (
                    <p key={stage.stageId}>
                      {stageNameById.get(stage.stageId) ?? stage.stageId}：{stage.durationMs}ms（阈值 {stage.thresholdMs}ms）
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p>点击「开始体检」对当前日志做一次健康检查。</p>
      )}
    </section>
  )
}
