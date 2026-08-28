import { useState, type ReactNode } from 'react'
import type * as React from 'react'
import type { LogSearchMode, SavedQueryDto } from '../../api/dto'
import type { LogSearchHitViewModel, LogSearchViewModel } from '../../view-model/log-search-view-model'

type LogSearchPanelProps = {
  savedQueries: SavedQueryDto[]
  activeQueryId: string
  queryDraft: SavedQueryDto
  isSearching: boolean
  result: LogSearchViewModel | null
  errorMessage: string | null
  queryEditorOpen: boolean
  queryEditorDraft: SavedQueryDto
  onSelectQuery: (queryId: string) => void
  onOpenQueryEditor: (queryId: string) => void
  onQueryDraftChange: (next: SavedQueryDto) => void
  onSaveCurrentQuery: () => void
  onSearch: () => void
  onCloseQueryEditor: () => void
  onQueryEditorChange: (next: SavedQueryDto) => void
  onSaveQueryEditor: () => void
  onDeleteQuery: (queryId: string) => void
}

function splitTags(value: string) {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function summarizeQuery(query: SavedQueryDto) {
  return `${query.mode === 'regex' ? '正则' : '关键字'} · ${query.caseSensitive ? '区分大小写' : '忽略大小写'}`
}

function queryLabel(query: SavedQueryDto) {
  return query.name || query.query || '未命名查询'
}

function ContextLine({ children, matched }: { children: ReactNode; matched?: boolean }) {
  return <pre className={matched ? 'context-log-line matched' : 'context-log-line'}>{children}</pre>
}

export default function LogSearchPanel({
  savedQueries,
  activeQueryId,
  queryDraft,
  isSearching,
  result,
  errorMessage,
  queryEditorOpen,
  queryEditorDraft,
  onSelectQuery,
  onOpenQueryEditor,
  onQueryDraftChange,
  onSaveCurrentQuery,
  onSearch,
  onCloseQueryEditor,
  onQueryEditorChange,
  onSaveQueryEditor,
  onDeleteQuery,
}: LogSearchPanelProps) {
  const [searchPanelCollapsed, setSearchPanelCollapsed] = useState(false)
  const [contextHit, setContextHit] = useState<LogSearchHitViewModel | null>(null)
  const hasQueries = savedQueries.length > 0
  const selectValue = activeQueryId || '__draft__'

  const runSearchAndReturn = () => {
    setContextHit(null)
    onSearch()
  }

  return (
    <section className="panel log-search-page">
      <div className="panel-title-row">
        <h2>日志搜索</h2>
        <span>{savedQueries.length} 条已保存查询</span>
      </div>

      <section className={searchPanelCollapsed ? 'search-panel search-panel-collapsed' : 'search-panel'}>
        <div className="panel-title-row compact-title">
          <div>
            <h3>搜索条件</h3>
            <span>{summarizeQuery(queryDraft)}</span>
          </div>
          <div className="panel-actions">
            <button type="button" className="ghost-button" onClick={() => setSearchPanelCollapsed((value) => !value)}>
              {searchPanelCollapsed ? '展开' : '收起'}
            </button>
            <button type="button" className="ghost-button" onClick={onSaveCurrentQuery}>
              保存
            </button>
            <button type="button" className="primary-button" onClick={runSearchAndReturn} disabled={isSearching}>
              {isSearching ? '搜索中...' : '搜索'}
            </button>
          </div>
        </div>

        {!searchPanelCollapsed ? (
          <>
            <div className="search-toolbar">
              <label className="field">
                <span>当前查询</span>
                <select
                  value={selectValue}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                    if (event.target.value !== '__draft__') {
                      setContextHit(null)
                      onSelectQuery(event.target.value)
                    }
                  }}
                >
                  <option value="__draft__">当前草稿</option>
                  {savedQueries.map((query) => (
                    <option key={query.id} value={query.id}>
                      {queryLabel(query)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field search-query-field">
                <span>关键字 / 正则</span>
                <input
                  value={queryDraft.query}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => onQueryDraftChange({ ...queryDraft, query: event.target.value })}
                  placeholder="输入关键字或正则"
                />
              </label>

              <label className="field">
                <span>匹配模式</span>
                <select
                  value={queryDraft.mode}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onQueryDraftChange({ ...queryDraft, mode: event.target.value as LogSearchMode })}
                >
                  <option value="keyword">关键字</option>
                  <option value="regex">正则</option>
                </select>
              </label>

              <label className="check-field">
                <input
                  type="checkbox"
                  checked={queryDraft.caseSensitive}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onQueryDraftChange({ ...queryDraft, caseSensitive: event.target.checked })
                  }
                />
                <span>区分大小写</span>
              </label>
            </div>

            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

            <div className="saved-query-strip">
              <div className="saved-query-strip-head">
                <strong>查询列表</strong>
                <span>单击切换，双击编辑</span>
              </div>

              <div className="query-list compact-query-list">
                {hasQueries ? (
                  savedQueries.map((query) => (
                    <button
                      key={query.id}
                      type="button"
                      className={`query-item compact-query-item ${query.id === activeQueryId ? 'active' : ''}`}
                      onClick={() => {
                        setContextHit(null)
                        onSelectQuery(query.id)
                      }}
                      onDoubleClick={() => onOpenQueryEditor(query.id)}
                    >
                      <strong>{queryLabel(query)}</strong>
                      <span>{query.description || summarizeQuery(query)}</span>
                      <span className="query-item-meta">
                        <em>{query.tags.length > 0 ? query.tags.join('、') : '无标签'}</em>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="empty-state">
                    <strong>还没有保存查询</strong>
                    <span>先输入搜索条件，再点击保存。</span>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </section>

      <section className="results-panel">
        <div className="panel-title-row compact-title">
          <div>
            <h3>{contextHit ? '日志上下文' : '搜索结果'}</h3>
            <span>{contextHit ? `命中行 ${contextHit.lineNumber}` : `${result?.totalMatches ?? 0} 条命中`}</span>
          </div>
          {contextHit ? (
            <button type="button" className="ghost-button compact-button" onClick={() => setContextHit(null)}>
              返回
            </button>
          ) : null}
        </div>

        <div className="log-list">
          {contextHit ? (
            <div className="context-log-list">
              {contextHit.contextBefore.map((line, index) => (
                <ContextLine key={`before-${contextHit.lineNumber}-${index}`}>{line}</ContextLine>
              ))}
              <ContextLine matched>{contextHit.headline}</ContextLine>
              {contextHit.contextAfter.map((line, index) => (
                <ContextLine key={`after-${contextHit.lineNumber}-${index}`}>{line}</ContextLine>
              ))}
            </div>
          ) : result?.hits.length ? (
            result.hits.map((hit) => (
              <article key={`${hit.lineNumber}-${hit.timestamp}`} className="log-item">
                <div className="raw-log-result">
                  <pre>{hit.headline}</pre>
                  <button type="button" className="log-context-link" onClick={() => setContextHit(hit)}>
                    查看上下文
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <strong>暂无搜索结果</strong>
              <span>输入关键字后点击搜索，结果会按时间顺序展示。</span>
            </div>
          )}
        </div>
      </section>

      {queryEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={onCloseQueryEditor}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="query-editor-title"
            onClick={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
          >
            <div className="panel-title-row">
              <div>
                <h3 id="query-editor-title">编辑查询</h3>
                <span>双击列表项后修改并保存</span>
              </div>
              <button type="button" className="ghost-button" onClick={onCloseQueryEditor}>
                关闭
              </button>
            </div>

            <div className="editor-grid">
              <label className="field">
                <span>名称</span>
                <input
                  value={queryEditorDraft.name}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onQueryEditorChange({ ...queryEditorDraft, name: event.target.value })
                  }
                  placeholder="保存查询名称"
                />
              </label>

              <label className="field search-editor-wide">
                <span>描述</span>
                <input
                  value={queryEditorDraft.description}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onQueryEditorChange({ ...queryEditorDraft, description: event.target.value })
                  }
                  placeholder="这条查询是做什么的"
                />
              </label>

              <label className="field search-editor-wide">
                <span>标签</span>
                <input
                  value={queryEditorDraft.tags.join(', ')}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onQueryEditorChange({ ...queryEditorDraft, tags: splitTags(event.target.value) })
                  }
                  placeholder="wakeup, core, test"
                />
              </label>

              <label className="field search-editor-wide">
                <span>关键字 / 正则</span>
                <input
                  value={queryEditorDraft.query}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onQueryEditorChange({ ...queryEditorDraft, query: event.target.value })
                  }
                  placeholder="输入关键字或正则"
                />
              </label>

              <label className="field">
                <span>匹配模式</span>
                <select
                  value={queryEditorDraft.mode}
                  onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                    onQueryEditorChange({ ...queryEditorDraft, mode: event.target.value as LogSearchMode })
                  }
                >
                  <option value="keyword">关键字</option>
                  <option value="regex">正则</option>
                </select>
              </label>

              <label className="check-field">
                <input
                  type="checkbox"
                  checked={queryEditorDraft.caseSensitive}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onQueryEditorChange({ ...queryEditorDraft, caseSensitive: event.target.checked })
                  }
                />
                <span>区分大小写</span>
              </label>
            </div>

            <div className="panel-actions modal-actions">
              <button type="button" className="ghost-button" onClick={onCloseQueryEditor}>
                取消
              </button>
              <button type="button" className="primary-button" onClick={onSaveQueryEditor}>
                保存
              </button>
              <button type="button" className="ghost-button" onClick={() => onDeleteQuery(queryEditorDraft.id)}>
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
