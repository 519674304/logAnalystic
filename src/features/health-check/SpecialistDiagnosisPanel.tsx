import { useState } from 'react'
import type * as React from 'react'
import type { DiagnosticJudgmentConfigDto, DiagnosticProblemConfigDto, RuleRecordDto } from '../../api/dto'
import type { DiagnosticReport } from '../../api/specialist-diagnosis-client'

interface Props {
  problems: DiagnosticProblemConfigDto[]
  selectedId: string | null
  report: DiagnosticReport | null
  message: string
  rules: RuleRecordDto[]
  onSelect: (id: string) => void
  onRun: (problem: DiagnosticProblemConfigDto) => void
  onSave: (problem: DiagnosticProblemConfigDto) => void
  onDelete: (id: string) => void
}

const RANGE_OPTIONS: Array<[string, string]> = [
  ['window', '仅时间窗'],
  ['boundedBacktrack', '有界回溯'],
  ['unbounded', '无界回溯'],
]
const RETURN_MODE_OPTIONS: Array<[string, string]> = [
  ['first', '首个命中'],
  ['all', '全部命中'],
]
const CONNECTOR_OPTIONS: Array<[string, string]> = [
  ['and', '且'],
  ['or', '或'],
]
const MATCHER_WHEN_OPTIONS: Array<[string, string]> = [
  ['hit', '命中'],
  ['miss', '未命中'],
]
const STAGE_WHEN_OPTIONS: Array<[string, string]> = [
  ['closed', '已闭合'],
  ['unclosed', '未闭合'],
  ['missing', '缺失'],
]

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createEmptyJudgment(): DiagnosticJudgmentConfigDto {
  return {
    id: createId('judgment'),
    type: 'matcher',
    matcherId: undefined,
    stageId: undefined,
    range: 'window',
    when: 'hit',
    returnMode: 'all',
    conclusion: '',
    connector: 'and',
  }
}

function createEmptyProblem(): DiagnosticProblemConfigDto {
  return {
    id: createId('problem'),
    name: '',
    hitLabel: '',
    missLabel: '',
    judgments: [createEmptyJudgment()],
  }
}

function recordLabel(record: RuleRecordDto | undefined): string {
  if (!record) return ''
  return record.name || record.description || record.id
}

export default function SpecialistDiagnosisPanel({
  problems,
  selectedId,
  report,
  message,
  rules,
  onSelect,
  onRun,
  onSave,
  onDelete,
}: Props) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorDraft, setEditorDraft] = useState<DiagnosticProblemConfigDto | null>(null)

  const matcherRecords = rules.filter((rule) => rule.recordType === 'matcher' && !!rule.pattern)
  const stageRecords = rules.filter((rule) => rule.recordType === 'stage')

  const selected = problems.find((problem) => problem.id === selectedId) ?? null

  const openEditor = (problem: DiagnosticProblemConfigDto | null) => {
    setEditorDraft(problem ? structuredClone(problem) : createEmptyProblem())
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditorDraft(null)
  }

  const saveEditor = () => {
    if (!editorDraft) return
    onSave(editorDraft)
    closeEditor()
  }

  const patchProblem = (patch: Partial<DiagnosticProblemConfigDto>) => {
    setEditorDraft((draft) => (draft ? { ...draft, ...patch } : draft))
  }

  const patchJudgment = (id: string, patch: Partial<DiagnosticJudgmentConfigDto>) => {
    setEditorDraft((draft) =>
      draft
        ? {
            ...draft,
            judgments: draft.judgments.map((judgment) =>
              judgment.id === id ? { ...judgment, ...patch } : judgment,
            ),
          }
        : draft,
    )
  }

  const addJudgment = () => {
    setEditorDraft((draft) =>
      draft ? { ...draft, judgments: [...draft.judgments, createEmptyJudgment()] } : draft,
    )
  }

  const removeJudgment = (id: string) => {
    setEditorDraft((draft) =>
      draft ? { ...draft, judgments: draft.judgments.filter((judgment) => judgment.id !== id) } : draft,
    )
  }

  return (
    <div className="specialist-workbench">
      <div className="detail-card">
        <div className="panel-title-row" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>诊断问题</h3>
          <button type="button" className="ghost-button" onClick={() => openEditor(null)}>
            新增
          </button>
        </div>

        {problems.length === 0 ? (
          <p className="muted">暂无诊断问题，点「新增」创建一个。</p>
        ) : (
          <div className="rule-list">
            {problems.map((problem) => (
              <button
                key={problem.id}
                type="button"
                className={`rule-item-button ${problem.id === selectedId ? 'active' : ''}`}
                onClick={() => onSelect(problem.id)}
              >
                <span className="rule-head">
                  <strong>{problem.name || '未命名问题'}</strong>
                  <span className="muted">{problem.judgments.length} 项判断</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button type="button" className="ghost-button" onClick={() => openEditor(selected)}>
              编辑
            </button>
            <button type="button" className="ghost-button" onClick={() => onDelete(selected.id)}>
              删除
            </button>
          </div>
        )}
      </div>

      <div className="detail-card">
        {selected ? (
          <>
            <div className="panel-title-row" style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>{selected.name || '未命名问题'}</h3>
              <button type="button" className="primary-button" onClick={() => onRun(selected)}>
                运行
              </button>
            </div>
            <p className="muted">{message}</p>

            {report && (
              <>
                <div className="rule-item" style={{ marginBottom: 8 }}>
                  <div className="rule-head">
                    <strong>结论</strong>
                    <span className={`severity ${report.hit ? 'exception' : 'tip'}`}>
                      {report.hit ? '命中' : '未命中'}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0' }}>{report.conclusion}</p>
                </div>

                {report.judgments.map((judgment, index) => (
                  <div key={index} className="rule-item" style={{ marginBottom: 6 }}>
                    <div className="rule-head">
                      <strong>{judgment.conclusion || '判断依据'}</strong>
                      <span className={`severity ${judgment.satisfied ? 'exception' : 'tip'}`}>
                        {judgment.state}
                      </span>
                    </div>
                    {judgment.evidence.length === 0 ? (
                      <p className="muted" style={{ margin: '4px 0 0' }}>无命中证据</p>
                    ) : (
                      <div className="rule-list" style={{ marginTop: 6, gap: 4 }}>
                        {judgment.evidence.map((evidence, evidenceIndex) => (
                          <p key={evidenceIndex} style={{ margin: 0, fontSize: 12 }}>
                            {evidence.timestamp} [{evidence.role}] {evidence.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        ) : (
          <p className="muted">选择左侧诊断问题，点「运行」对当前日志做一次专科诊断。</p>
        )}
      </div>

      {editorOpen && editorDraft && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeEditor}>
          <div
            className="modal-card rule-detail-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
          >
            <div className="panel-title-row">
              <h2 style={{ margin: 0 }}>{problems.some((p) => p.id === editorDraft.id) ? '编辑诊断问题' : '新增诊断问题'}</h2>
            </div>

            <div className="editor-grid">
              <label className="field">
                <span>问题名</span>
                <input
                  value={editorDraft.name}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => patchProblem({ name: event.target.value })}
                  placeholder="例：唤不醒"
                />
              </label>
              <div className="editor-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label className="field">
                  <span>命中时结论</span>
                  <input
                    value={editorDraft.hitLabel}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => patchProblem({ hitLabel: event.target.value })}
                    placeholder="例：唤不醒"
                  />
                </label>
                <label className="field">
                  <span>未命中时结论</span>
                  <input
                    value={editorDraft.missLabel}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => patchProblem({ missLabel: event.target.value })}
                    placeholder="例：唤醒正常"
                  />
                </label>
              </div>
            </div>

            <div className="rule-list" style={{ marginTop: 12 }}>
              {editorDraft.judgments.map((judgment, index) => {
                const whenOptions = judgment.type === 'matcher' ? MATCHER_WHEN_OPTIONS : STAGE_WHEN_OPTIONS
                return (
                  <div key={judgment.id} className="detail-card">
                    <div className="panel-title-row" style={{ marginBottom: 8 }}>
                      <strong style={{ fontSize: 13 }}>判断依据 {index + 1}</strong>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => removeJudgment(judgment.id)}
                        disabled={editorDraft.judgments.length <= 1}
                      >
                        移除
                      </button>
                    </div>

                    <div className="editor-grid">
                      <label className="field">
                        <span>类型</span>
                        <select
                          value={judgment.type}
                          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                            const type = event.target.value as 'matcher' | 'stage'
                            patchJudgment(judgment.id, {
                              type,
                              matcherId: undefined,
                              stageId: undefined,
                              when: type === 'matcher' ? 'hit' : 'closed',
                            })
                          }}
                        >
                          <option value="matcher">matcher</option>
                          <option value="stage">stage</option>
                        </select>
                      </label>

                      <label className="field">
                        <span>目标</span>
                        {judgment.type === 'matcher' ? (
                          <select
                            value={judgment.matcherId ?? ''}
                            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => patchJudgment(judgment.id, { matcherId: event.target.value || undefined })}
                          >
                            <option value="">选择 matcher</option>
                            {matcherRecords.map((matcher) => (
                              <option key={matcher.id} value={matcher.id}>
                                {recordLabel(matcher)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={judgment.stageId ?? ''}
                            onChange={(event: React.ChangeEvent<HTMLSelectElement>) => patchJudgment(judgment.id, { stageId: event.target.value || undefined })}
                          >
                            <option value="">选择 stage</option>
                            {stageRecords.map((stage) => (
                              <option key={stage.id} value={stage.id}>
                                {recordLabel(stage)}
                              </option>
                            ))}
                          </select>
                        )}
                      </label>

                      <label className="field">
                        <span>搜索范围</span>
                        <select
                          value={judgment.range}
                          onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                            patchJudgment(judgment.id, {
                              range: event.target.value as DiagnosticJudgmentConfigDto['range'],
                              windowMinutes:
                                event.target.value === 'boundedBacktrack' ? judgment.windowMinutes ?? 10 : undefined,
                            })
                          }
                        >
                          {RANGE_OPTIONS.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {judgment.range === 'boundedBacktrack' ? (
                        <label className="field">
                          <span>回溯窗口（分钟）</span>
                          <input
                            type="number"
                            min={0}
                            value={judgment.windowMinutes ?? 0}
                            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                              patchJudgment(judgment.id, {
                                windowMinutes: event.target.value === '' ? undefined : Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      ) : (
                        <div />
                      )}

                      <label className="field">
                        <span>命中条件</span>
                        <select
                          value={judgment.when}
                          onChange={(event: React.ChangeEvent<HTMLSelectElement>) => patchJudgment(judgment.id, { when: event.target.value })}
                        >
                          {whenOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field">
                        <span>命中返回</span>
                        <select
                          value={judgment.returnMode}
                          onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                            patchJudgment(judgment.id, {
                              returnMode: event.target.value as DiagnosticJudgmentConfigDto['returnMode'],
                            })
                          }
                        >
                          {RETURN_MODE_OPTIONS.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="field editor-wide">
                        <span>短结论</span>
                        <input
                          value={judgment.conclusion}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) => patchJudgment(judgment.id, { conclusion: event.target.value })}
                          placeholder="例：唤醒开关未打开"
                        />
                      </label>

                      <label className="field">
                        <span>逻辑连接</span>
                        <select
                          value={judgment.connector}
                          onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                            patchJudgment(judgment.id, {
                              connector: event.target.value as DiagnosticJudgmentConfigDto['connector'],
                            })
                          }
                        >
                          {CONNECTOR_OPTIONS.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>

            <button type="button" className="ghost-button" onClick={addJudgment} style={{ marginTop: 10 }}>
              + 添加判断依据
            </button>

            <div className="modal-actions" style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="ghost-button" onClick={closeEditor}>
                取消
              </button>
              <button type="button" className="primary-button" onClick={saveEditor}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
