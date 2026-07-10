import type * as React from 'react'
import type { LogSearchMode, SavedQueryDto } from '../../api/dto'
import type { LogSearchViewModel } from '../../view-model/log-search-view-model'

type LogSearchPanelProps = {
  savedQueries: SavedQueryDto[]
  queryGroups: string[]
  activeQueryId: string
  logFolderPath: string
  selectedGroup: string
  queryDraft: SavedQueryDto
  isSearching: boolean
  result: LogSearchViewModel | null
  errorMessage: string | null
  queryListHidden: boolean
  searchPanelHidden: boolean
  detailQuery: SavedQueryDto | null
  queryEditorOpen: boolean
  queryEditorDraft: SavedQueryDto
  onToggleQueryList: () => void
  onToggleSearchPanel: () => void
  onLogFolderPathChange: (path: string) => void
  onPickLogFolder: () => void
  onSelectGroup: (group: string) => void
  onSelectQuery: (queryId: string) => void
  onOpenQueryDetail: (queryId: string) => void
  onOpenQueryEditor: (queryId: string) => void
  onOpenNewQuery: () => void
  onQueryDraftChange: (next: SavedQueryDto) => void
  onSearch: () => void
  onCloseDetail: () => void
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

function summarizeQuery(query: SavedQueryDto | null) {
  if (!query) {
    return '未选择查询'
  }

  return `${query.group || 'core'} · ${query.mode === 'regex' ? '正则' : '关键字'} · ${
    query.caseSensitive ? '区分大小写' : '忽略大小写'
  }`
}

export default function LogSearchPanel({
  savedQueries,
  queryGroups,
  activeQueryId,
  logFolderPath,
  selectedGroup,
  queryDraft,
  isSearching,
  result,
  errorMessage,
  queryListHidden,
  searchPanelHidden,
  detailQuery,
  queryEditorOpen,
  queryEditorDraft,
  onToggleQueryList,
  onToggleSearchPanel,
  onLogFolderPathChange,
  onPickLogFolder,
  onSelectGroup,
  onSelectQuery,
  onOpenQueryDetail,
  onOpenQueryEditor,
  onOpenNewQuery,
  onQueryDraftChange,
  onSearch,
  onCloseDetail,
  onCloseQueryEditor,
  onQueryEditorChange,
  onSaveQueryEditor,
  onDeleteQuery,
}: LogSearchPanelProps) {
  const hasQueries = savedQueries.length > 0

  return (
    <section className="panel log-search-page">
      <div className="panel-title-row">
        <h2>日志搜索</h2>
        <div className="panel-actions">
          <button type="button" className="ghost-button" onClick={onToggleQueryList}>
            {queryListHidden ? '显示查询列表' : '隐藏查询列表'}
          </button>
          <button type="button" className="ghost-button" onClick={onToggleSearchPanel}>
            {searchPanelHidden ? '显示搜索条件' : '隐藏搜索条件'}
          </button>
        </div>
      </div>

      <div className="search-page-toolbar">
        <label className="field search-page-folder">
          <span>日志文件夹</span>
          <div className="folder-picker">
            <input
              value={logFolderPath}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => onLogFolderPathChange(event.target.value)}
              placeholder="选择或粘贴日志目录"
            />
            <button type="button" className="ghost-button" onClick={onPickLogFolder}>
              选择目录
            </button>
          </div>
        </label>
      </div>

      <div className={`log-search-workbench ${queryListHidden ? 'query-list-hidden' : ''}`}>
        <aside className={`query-sidebar ${queryListHidden ? 'query-list-hidden' : ''}`}>
          <div className="panel-title-row compact-title">
            <div>
              <h3>查询列表</h3>
              <span>{savedQueries.length} 条已保存查询</span>
            </div>
            <div className="panel-actions">
              <button type="button" className="ghost-button" onClick={onOpenNewQuery}>
                新建
              </button>
              <button type="button" className="ghost-button" onClick={onToggleQueryList}>
                {queryListHidden ? '展开' : '收起'}
              </button>
            </div>
          </div>

          {!queryListHidden ? (
            <>
              <label className="field">
                <span>查询分组筛选</span>
                <select value={selectedGroup} onChange={(event) => onSelectGroup(event.target.value)}>
                  <option value="全部分组">全部分组</option>
                  {queryGroups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </label>

              <div className="query-list">
                {hasQueries ? (
                  savedQueries.map((query) => (
                    <button
                      key={query.id}
                      type="button"
                      className={`query-item ${query.id === activeQueryId ? 'active' : ''}`}
                      onClick={() => onSelectQuery(query.id)}
                      onDoubleClick={() => onOpenQueryDetail(query.id)}
                    >
                      <strong>{query.name}</strong>
                      <span>{query.description}</span>
                      <span className="query-item-meta">
                        <em>{query.group}</em>
                        <em>{query.mode}</em>
                        <em>{query.caseSensitive ? '区分大小写' : '忽略大小写'}</em>
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="empty-state">
                    <strong>还没有保存查询</strong>
                    <span>先新建几条查询，方便后面快速复用。</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="collapsed-hint">
              <strong>查询列表已隐藏</strong>
              <span>展开后可以单击选中，双击查看详情。</span>
            </div>
          )}
        </aside>

        <div className="search-column">
          <section className={`search-panel ${searchPanelHidden ? 'search-panel-hidden' : ''}`}>
            <div className="panel-title-row compact-title">
              <div>
                <h3>搜索条件</h3>
                <span>{summarizeQuery(queryDraft)}</span>
              </div>
              <div className="panel-actions">
                <button type="button" className="ghost-button" onClick={onToggleSearchPanel}>
                  {searchPanelHidden ? '展开' : '收起'}
                </button>
                <button type="button" className="primary-button" onClick={onSearch} disabled={isSearching}>
                  {isSearching ? '搜索中' : '搜索'}
                </button>
              </div>
            </div>

            {!searchPanelHidden ? (
              <>
                <div className="request-tools request-tools-split search-tools">
                  <label className="field">
                    <span>当前查询</span>
                    <input value={queryDraft.name || queryDraft.query || '未命名查询'} readOnly />
                  </label>

                  <label className="field editor-wide">
                    <span>关键字 / 正则</span>
                    <input
                      value={queryDraft.query}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        onQueryDraftChange({ ...queryDraft, query: event.target.value })
                      }
                      placeholder="输入关键字或正则"
                    />
                  </label>

                  <label className="field">
                    <span>匹配模式</span>
                    <select
                      value={queryDraft.mode}
                      onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                        onQueryDraftChange({ ...queryDraft, mode: event.target.value as LogSearchMode })
                      }
                    >
                      <option value="keyword">关键字</option>
                      <option value="regex">正则</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>时间范围</span>
                    <input
                      value={queryDraft.timeRange}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        onQueryDraftChange({ ...queryDraft, timeRange: event.target.value })
                      }
                      placeholder="2026-06-12 10:30:00 ~ 2026-06-12 10:45:00"
                    />
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
              </>
            ) : (
              <div className="collapsed-hint">
                <strong>搜索条件已隐藏</strong>
                <span>只保留摘要和搜索按钮，方便快速查看日志。</span>
              </div>
            )}
          </section>

          <section className="results-panel">
            <div className="panel-title-row compact-title">
              <div>
                <h3>搜索结果</h3>
                <span>{result?.totalMatches ?? 0} 条命中</span>
              </div>
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
        </div>
      </div>

      {detailQuery ? (
        <div className="modal-backdrop" role="presentation" onClick={onCloseDetail}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="query-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-title-row">
              <div>
                <h3 id="query-detail-title">查询详情</h3>
                <span>双击列表项打开</span>
              </div>
              <div className="panel-actions">
                <button type="button" className="ghost-button" onClick={onCloseDetail}>
                  关闭
                </button>
              </div>
            </div>

            <div className="modal-grid">
              <div>
                <span>名称</span>
                <strong>{detailQuery.name || '未命名查询'}</strong>
              </div>
              <div>
                <span>分组</span>
                <strong>{detailQuery.group}</strong>
              </div>
              <div className="modal-wide">
                <span>关键字 / 正则</span>
                <strong>{detailQuery.query}</strong>
              </div>
              <div>
                <span>匹配模式</span>
                <strong>{detailQuery.mode === 'regex' ? '正则' : '关键字'}</strong>
              </div>
              <div>
                <span>时间范围</span>
                <strong>{detailQuery.timeRange}</strong>
              </div>
              <div className="modal-wide">
                <span>标签</span>
                <strong>{detailQuery.tags.length > 0 ? detailQuery.tags.join('，') : '无'}</strong>
              </div>
              <div className="modal-wide">
                <span>描述</span>
                <strong>{detailQuery.description || '无'}</strong>
              </div>
            </div>

            <div className="panel-actions modal-actions">
              <button type="button" className="ghost-button" onClick={onCloseDetail}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {queryEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={onCloseQueryEditor}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="query-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-title-row">
              <div>
                <h3 id="query-editor-title">新建查询</h3>
                <span>保存到本地查询列表</span>
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

              <label className="field">
                <span>分组</span>
                <input
                  value={queryEditorDraft.group}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onQueryEditorChange({ ...queryEditorDraft, group: event.target.value })
                  }
                  placeholder="core / latency / ops"
                />
              </label>

              <label className="field editor-wide">
                <span>描述</span>
                <input
                  value={queryEditorDraft.description}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onQueryEditorChange({ ...queryEditorDraft, description: event.target.value })
                  }
                  placeholder="这条查询是用来做什么的"
                />
              </label>

              <label className="field editor-wide">
                <span>标签</span>
                <input
                  value={queryEditorDraft.tags.join(', ')}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onQueryEditorChange({ ...queryEditorDraft, tags: splitTags(event.target.value) })
                  }
                  placeholder="wakeup, core, test"
                />
              </label>

              <label className="field editor-wide">
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

              <label className="field">
                <span>时间范围</span>
                <input
                  value={queryEditorDraft.timeRange}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onQueryEditorChange({ ...queryEditorDraft, timeRange: event.target.value })
                  }
                  placeholder="2026-06-12 10:30:00 ~ 2026-06-12 10:45:00"
                />
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
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
