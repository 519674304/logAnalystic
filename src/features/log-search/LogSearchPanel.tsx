import type * as React from 'react'
import type { SavedQuery } from '../../app/app-state'
import type { LogSearchMode } from '../../api/dto'
import type { LogSearchViewModel } from '../../view-model/log-search-view-model'

type LogSearchPanelProps = {
  savedQueries: SavedQuery[]
  activeQuery: SavedQuery
  queryText: string
  mode: LogSearchMode
  caseSensitive: boolean
  isSearching: boolean
  result: LogSearchViewModel | null
  errorMessage: string | null
  onSelectQuery: (queryId: string) => void
  onQueryTextChange: (value: string) => void
  onModeChange: (mode: LogSearchMode) => void
  onCaseSensitiveChange: (checked: boolean) => void
  onSearch: () => void
}

export default function LogSearchPanel({
  savedQueries,
  activeQuery,
  queryText,
  mode,
  caseSensitive,
  isSearching,
  result,
  errorMessage,
  onSelectQuery,
  onQueryTextChange,
  onModeChange,
  onCaseSensitiveChange,
  onSearch,
}: LogSearchPanelProps) {
  return (
    <section className="panel log-search-page">
      <div className="panel-title-row">
        <h2>日志搜索</h2>
        <span>{savedQueries.length} 条预设</span>
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
        <div className="search-toolbar">
          <label className="field">
            <span>关键字 / 正则</span>
            <input
              value={queryText}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => onQueryTextChange(event.target.value)}
              placeholder="输入关键字或正则"
            />
          </label>

          <label className="field">
            <span>匹配模式</span>
            <select
              value={mode}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onModeChange(event.target.value as LogSearchMode)}
            >
              <option value="keyword">关键字</option>
              <option value="regex">正则</option>
            </select>
          </label>

          <label className="check-field">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => onCaseSensitiveChange(event.target.checked)}
            />
            <span>区分大小写</span>
          </label>

          <button type="button" className="primary-button" onClick={onSearch} disabled={isSearching}>
            {isSearching ? '搜索中...' : '搜索'}
          </button>
        </div>

        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

        <p className="muted">
          当前预设: {activeQuery.name} · 时间范围: {activeQuery.timeRange}
        </p>
      </div>

      <div className="panel-title-row section-gap">
        <h2>搜索结果</h2>
        <span>{result?.totalMatches ?? 0} 条命中</span>
      </div>

      <div className="log-list">
        {result?.hits.map((hit) => (
          <article key={hit.lineNumber} className="log-item">
            <div className="log-meta">
              <span className={`level ${hit.level.toLowerCase()}`}>{hit.level}</span>
              <span>Line {hit.lineNumber}</span>
              <span>{hit.timestamp}</span>
              <span>{hit.app}</span>
            </div>
            <p>{hit.headline}</p>
            {hit.contextBefore.length > 0 ? (
              <div className="context-block">
                {hit.contextBefore.map((line, index) => (
                  <p key={`before-${hit.lineNumber}-${index}`} className="context-line muted">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
            {hit.contextAfter.length > 0 ? (
              <div className="context-block">
                {hit.contextAfter.map((line, index) => (
                  <p key={`after-${hit.lineNumber}-${index}`} className="context-line muted">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
