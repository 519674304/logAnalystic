import { useEffect, useRef, useState, type ReactNode } from 'react'
import type * as React from 'react'
import type { LogSearchMode, RuleRecordDto, SavedQueryDto } from '../../api/dto'
import type { LogSearchHitViewModel, LogSearchViewModel } from '../../view-model/log-search-view-model'
import { fetchLogContext } from '../../api/http-client'
import MatcherSelectTree, { type MatcherTreeScenario } from './MatcherSelectTree'

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
  onSelectDraft: () => void
  onOpenQueryEditor: (queryId: string) => void
  onQueryDraftChange: (next: SavedQueryDto) => void
  onSaveCurrentQuery: () => void
  onSearch: () => void
  onCloseQueryEditor: () => void
  onQueryEditorChange: (next: SavedQueryDto) => void
  onSaveQueryEditor: () => void
  onDeleteQuery: (queryId: string) => void
  searchSource: 'manual' | 'matcher'
  matcherScenarios: MatcherTreeScenario[]
  matcherRecords: RuleRecordDto[]
  selectedMatcherIds: string[]
  onSearchSourceChange: (next: 'manual' | 'matcher') => void
  onSelectedMatcherIdsChange: (next: string[]) => void
}

const FOLDER_REQUIRED_MESSAGE = '请先选择日志文件夹'
const CONTEXT_LINES = 500

interface ContextView {
  hit: LogSearchHitViewModel
  before: string[]
  after: string[]
  loading: boolean
  error: string | null
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

function ContextLine({
  children,
  matched,
  lineRef,
}: {
  children: ReactNode
  matched?: boolean
  lineRef?: { current: HTMLPreElement | null }
}) {
  return (
    <pre ref={lineRef} className={matched ? 'context-log-line matched' : 'context-log-line'}>
      {children}
    </pre>
  )
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
  onSelectDraft,
  onOpenQueryEditor,
  onQueryDraftChange,
  onSaveCurrentQuery,
  onSearch,
  onCloseQueryEditor,
  onQueryEditorChange,
  onSaveQueryEditor,
  onDeleteQuery,
  searchSource,
  matcherScenarios,
  matcherRecords,
  selectedMatcherIds,
  onSearchSourceChange,
  onSelectedMatcherIdsChange,
}: LogSearchPanelProps) {
  const [searchPanelCollapsed, setSearchPanelCollapsed] = useState(false)
  const [contextView, setContextView] = useState<ContextView | null>(null)
  const matchedLineRef = useRef<HTMLPreElement>(null)
  const hasQueries = savedQueries.length > 0
  const selectValue = activeQueryId || '__draft__'

  const runSearchAndReturn = () => {
    setContextView(null)
    onSearch()
  }

  // 查看上下文：按命中行向后端请求更大范围的上下文（before/after 各 CONTEXT_LINES 行）。
  const openContext = async (hit: LogSearchHitViewModel) => {
    setContextView({ hit, before: [], after: [], loading: true, error: null })
    // 本地样例没有 filePath，退回到搜索结果自带的 1 行上下文。
    if (!hit.filePath) {
      setContextView({ hit, before: hit.contextBefore, after: hit.contextAfter, loading: false, error: null })
      return
    }
    try {
      const data = await fetchLogContext({
        filePath: hit.filePath,
        lineNumber: hit.lineNumber,
        contextLines: CONTEXT_LINES,
      })
      setContextView({ hit, before: data.before, after: data.after, loading: false, error: null })
    } catch (error) {
      setContextView({
        hit,
        before: hit.contextBefore,
        after: hit.contextAfter,
        loading: false,
        error: error instanceof Error ? error.message : '加载上下文失败',
      })
    }
  }

  // 上下文加载完成后，把命中行滚动到视图中间，方便上下浏览。
  useEffect(() => {
    if (contextView && !contextView.loading) {
      matchedLineRef.current?.scrollIntoView({ block: 'center' })
    }
  }, [contextView])

  return (
    <section className="panel log-search-page">
      <div className="panel-title-row">
        <h2>日志搜索</h2>
        <span>{savedQueries.length} 条已保存查询</span>
      </div>

      <section className={searchPanelCollapsed ? 'search-panel search-panel-collapsed' : 'search-panel'}>
        <div className="search-header-row">
          <div className="search-header-title">
            <h3>搜索条件</h3>
            <span>{searchSource === 'matcher' ? `规则 matcher · 已选 ${selectedMatcherIds.length} 个` : summarizeQuery(queryDraft)}</span>
          </div>
          {searchSource === 'manual' ? (
            <label className="field search-query-select" title="当前查询">
              <select
                value={selectValue}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                  setContextView(null)
                  if (event.target.value === '__draft__') {
                    onSelectDraft()
                  } else {
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
          ) : null}
          <div className="search-source-toggle" role="group" aria-label="搜索来源">
            <button
              type="button"
              className={searchSource === 'manual' ? 'active' : ''}
              onClick={() => onSearchSourceChange('manual')}
            >
              手动
            </button>
            <button
              type="button"
              className={searchSource === 'matcher' ? 'active' : ''}
              onClick={() => onSearchSourceChange('matcher')}
            >
              规则 matcher
            </button>
          </div>
          <button type="button" className="ghost-button" onClick={() => setSearchPanelCollapsed((value) => !value)}>
            {searchPanelCollapsed ? '展开' : '收起'}
          </button>
          {searchSource === 'manual' ? (
            <button type="button" className="ghost-button" onClick={onSaveCurrentQuery}>
              保存
            </button>
          ) : null}
          <button type="button" className="primary-button" onClick={runSearchAndReturn} disabled={isSearching}>
            {isSearching ? '搜索中...' : '搜索'}
          </button>
        </div>

        {!searchPanelCollapsed ? (
          <>
            {searchSource === 'manual' ? (
              <div className="search-toolbar">
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
            ) : (
              <div className="matcher-select-panel">
                {matcherRecords.length > 0 ? (
                  <MatcherSelectTree
                    scenarios={matcherScenarios}
                    matchers={matcherRecords}
                    selectedIds={selectedMatcherIds}
                    onChange={onSelectedMatcherIdsChange}
                  />
                ) : (
                  <div className="empty-state">
                    <strong>暂无 matcher</strong>
                    <span>请先在规则配置页导入规则包并设置生效版本。</span>
                  </div>
                )}
              </div>
            )}

            {errorMessage && errorMessage !== FOLDER_REQUIRED_MESSAGE ? (
              <p className="error-text">{errorMessage}</p>
            ) : null}

            {searchSource === 'manual' ? (
              <div className="saved-query-strip">
                <div className="saved-query-strip-head">
                  <strong>查询列表</strong>
                  <span>单击切换，双击编辑</span>
                </div>

                <div className="query-list compact-query-list">
                  {hasQueries ? (
                    savedQueries.map((query) => (
                      <div
                        key={query.id}
                        role="button"
                        tabIndex={0}
                        className={`query-item compact-query-item ${query.id === activeQueryId ? 'active' : ''}`}
                        title={`${query.description || summarizeQuery(query)}${query.tags.length > 0 ? ` · ${query.tags.join('、')}` : ''}`}
                        onClick={() => {
                          setContextView(null)
                          onSelectQuery(query.id)
                        }}
                        onDoubleClick={() => onOpenQueryEditor(query.id)}
                      >
                        <strong>{queryLabel(query)}</strong>
                        <button
                          type="button"
                          className="query-item-delete"
                          title="删除这条查询"
                          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                            event.stopPropagation()
                            onDeleteQuery(query.id)
                          }}
                        >
                          删除
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <strong>还没有保存查询</strong>
                      <span>先输入搜索条件，再点击保存。</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="results-panel">
        <div className="panel-title-row compact-title">
          <div>
            <h3>{contextView ? '日志上下文' : '搜索结果'}</h3>
            <span>
              {contextView
                ? `${contextView.hit.filePath || '未知文件'} · 命中行 ${contextView.hit.lineNumber}`
                : `${result?.totalMatches ?? 0} 条命中`}
            </span>
          </div>
          {contextView ? (
            <button type="button" className="ghost-button compact-button" onClick={() => setContextView(null)}>
              返回
            </button>
          ) : null}
        </div>

        <div className="log-list">
          {errorMessage === FOLDER_REQUIRED_MESSAGE ? (
            <div className="empty-state empty-state-loud">
              <strong>{FOLDER_REQUIRED_MESSAGE}</strong>
              <span>在顶部选择或粘贴日志目录后，再点击搜索。</span>
            </div>
          ) : contextView ? (
            <div className="context-log-list">
              {contextView.loading ? (
                <div className="empty-state">
                  <strong>正在加载上下文…</strong>
                </div>
              ) : (
                <>
                  {contextView.error ? <p className="error-text">{contextView.error}</p> : null}
                  {contextView.before.map((line, index) => (
                    <ContextLine key={`before-${contextView.hit.lineNumber}-${index}`}>{line}</ContextLine>
                  ))}
                  <ContextLine matched lineRef={matchedLineRef}>
                    {contextView.hit.headline}
                  </ContextLine>
                  {contextView.after.map((line, index) => (
                    <ContextLine key={`after-${contextView.hit.lineNumber}-${index}`}>{line}</ContextLine>
                  ))}
                </>
              )}
            </div>
          ) : result?.hits.length ? (
            result.hits.map((hit) => (
              <article key={`${hit.lineNumber}-${hit.timestamp}`} className="log-item">
                <div className="raw-log-result">
                  <pre>{hit.headline}</pre>
                  <button type="button" className="log-context-link" onClick={() => void openContext(hit)}>
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
