import { useMemo, useRef } from 'react'
import type * as React from 'react'
import type { RuleRecordDto } from '../../api/dto'

type RuleCatalogPanelProps = {
  rules: RuleRecordDto[]
  activeRuleId: string
  detailOpen: boolean
  detailDraft: RuleRecordDto
  onSelectRule: (ruleId: string) => void
  onOpenRuleDetail: (ruleId: string) => void
  onCloseRuleDetail: () => void
  onImportRules: (payload: { sourceName: string; content: string }) => Promise<void>
  onDeleteRule: (ruleId: string) => void
  onDetailDraftChange: (next: RuleRecordDto) => void
  onSaveRuleDetail: () => void
}

function splitScenarios(value: string) {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export default function RuleCatalogPanel({
  rules,
  activeRuleId,
  detailOpen,
  detailDraft,
  onSelectRule,
  onOpenRuleDetail,
  onCloseRuleDetail,
  onImportRules,
  onDeleteRule,
  onDetailDraftChange,
  onSaveRuleDetail,
}: RuleCatalogPanelProps) {
  const importInputRef = useRef<HTMLInputElement>(null)

  const activeRule = useMemo(
    () => rules.find((rule) => rule.id === activeRuleId) ?? null,
    [activeRuleId, rules],
  )

  const handleImportClick = () => {
    importInputRef.current?.click()
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    const content = await file.text()
    await onImportRules({ sourceName: file.name, content })
  }

  const handleDelete = () => {
    if (!activeRule) {
      return
    }

    const confirmed = window.confirm(`确定删除规则 "${activeRule.name}" 吗？`)
    if (confirmed) {
      onDeleteRule(activeRule.id)
    }
  }

  return (
    <section className="panel rule-page">
      <div className="panel-title-row">
        <h2>规则配置</h2>
        <div className="panel-actions">
          <span>{rules.length} 条已导入规则</span>
          <button type="button" className="primary-button" onClick={handleImportClick}>
            导入
          </button>
          <button type="button" className="ghost-button" onClick={handleDelete} disabled={!activeRule}>
            删除
          </button>
        </div>
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".json,.toml,.txt"
        className="hidden-input"
        onChange={handleImportFile}
      />

      <div className="rule-page-layout">
        <div className="rule-list-panel">
          <div className="collapsed-hint section-gap">
            <strong>已导入规则集</strong>
            <span>单击选择，双击查看并编辑详情</span>
          </div>

          <div className="rule-list">
            {rules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                className={`rule-item rule-item-button ${rule.id === activeRuleId ? 'active' : ''}`}
                onClick={() => onSelectRule(rule.id)}
                onDoubleClick={() => onOpenRuleDetail(rule.id)}
              >
                <div className="rule-head">
                  <strong>{rule.name || '未命名规则'}</strong>
                  <span className={`severity ${rule.enabled ? 'tip' : 'warning'}`}>
                    {rule.enabled ? '启用' : '停用'}
                  </span>
                </div>
                <p>{rule.description || '暂无描述'}</p>
                <div className="query-item-meta">
                  <em>{rule.pattern || '未配置表达式'}</em>
                  <em>{rule.exportEnabled ? '允许导出' : '仅分析'}</em>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {detailOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card rule-detail-modal">
            <div className="panel-title-row">
              <h2>规则详情</h2>
              <div className="panel-actions">
                <button type="button" className="ghost-button" onClick={onCloseRuleDetail}>
                  关闭
                </button>
                <button type="button" className="primary-button" onClick={onSaveRuleDetail}>
                  保存修改
                </button>
              </div>
            </div>

            <div className="editor-grid">
              <label className="field">
                <span>名称</span>
                <input
                  value={detailDraft.name}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onDetailDraftChange({ ...detailDraft, name: event.target.value })
                  }
                  placeholder="规则名称"
                />
              </label>

              <label className="field">
                <span>匹配表达式</span>
                <input
                  value={detailDraft.pattern}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onDetailDraftChange({ ...detailDraft, pattern: event.target.value })
                  }
                  placeholder="关键字或正则表达式"
                />
              </label>

              <label className="field editor-wide">
                <span>描述</span>
                <input
                  value={detailDraft.description}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onDetailDraftChange({ ...detailDraft, description: event.target.value })
                  }
                  placeholder="这条规则用于什么场景"
                />
              </label>

              <label className="field editor-wide">
                <span>适用场景</span>
                <input
                  value={detailDraft.scenarios.join(', ')}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onDetailDraftChange({ ...detailDraft, scenarios: splitScenarios(event.target.value) })
                  }
                  placeholder="core, latency, abnormal"
                />
              </label>

              <label className="check-field">
                <input
                  type="checkbox"
                  checked={detailDraft.enabled}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onDetailDraftChange({ ...detailDraft, enabled: event.target.checked })
                  }
                />
                <span>启用</span>
              </label>

              <label className="check-field">
                <input
                  type="checkbox"
                  checked={detailDraft.exportEnabled}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    onDetailDraftChange({ ...detailDraft, exportEnabled: event.target.checked })
                  }
                />
                <span>允许导出</span>
              </label>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
