import type { LogEntry, SavedQuery } from '../../app/app-state'

type LogSearchPanelProps = {
  savedQueries: SavedQuery[]
  activeQuery: SavedQuery
  matchingLogs: LogEntry[]
  onSelectQuery: (queryId: string) => void
}

export default function LogSearchPanel({
  savedQueries,
  activeQuery,
  matchingLogs,
  onSelectQuery,
}: LogSearchPanelProps) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <h2>已保存查询</h2>
        <span>{savedQueries.length} 条</span>
      </div>

      <div className="query-list">
        {savedQueries.map((query) => (
          <button
            key={query.id}
            type="button"
            className={`query-item ${query.id === activeQuery.id ? 'active' : ''}`}
            onClick={() => onSelectQuery(query.id)}
          >
            <strong>{query.name}</strong>
            <span>{query.description}</span>
          </button>
        ))}
      </div>

      <div className="detail-card">
        <h3>{activeQuery.name}</h3>
        <p>{activeQuery.description}</p>
        <p className="muted">时间范围：{activeQuery.timeRange}</p>
        <p className="muted">检索关键词：{activeQuery.query}</p>
      </div>

      <div className="panel-title-row" style={{ marginTop: 16 }}>
        <h2>匹配日志</h2>
        <span>{matchingLogs.length} 条</span>
      </div>

      <div className="log-list">
        {matchingLogs.map((entry, index) => (
          <article key={`${entry.time}-${index}`} className="log-item">
            <div className="log-meta">
              <span className={`level ${entry.level.toLowerCase()}`}>{entry.level}</span>
              <span>{entry.time}</span>
              <span>{entry.app}</span>
            </div>
            <p>{entry.message}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
