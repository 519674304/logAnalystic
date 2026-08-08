import { useMemo, useRef, useState } from 'react'
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
  const [selectedScenario, setSelectedScenario] = useState('全部场景')

  const activeRule = useMemo(
    () => rules.find((rule) => rule.id === activeRuleId) ?? null,
    [activeRuleId, rules],
  )
  const scenarioOptions = useMemo(
    () => Array.from(new Set(rules.flatMap((rule) => rule.scenarios).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
    [rules],
  )
  const visibleRules = useMemo(
    () =>
      selectedScenario === '全部场景'
        ? rules
        : rules.filter((rule) => rule.scenarios.includes(selectedScenario)),
    [rules, selectedScenario],
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
          <span>{visibleRules.length} / {rules.length} 条规则</span>
          <label className="field inline-filter-field">
            <span>场景</span>
            <select value={selectedScenario} onChange={(event) => setSelectedScenario(event.target.value)}>
              <option value="全部场景">全部场景</option>
              {scenarioOptions.map((scenario) => (
                <option key={scenario} value={scenario}>
                  {scenario}
                </option>
              ))}
            </select>
          </label>
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
            {visibleRules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                className={`rule-item rule-item-button ${rule.id === activeRuleId ? 'active' : ''}`}
                onClick={() => onSelectRule(rule.id)}
                onDoubleClick={() => onOpenRuleDetail(rule.id)}
              >
                <div className="rule-head">
                  <strong>{rule.name || '未命名规则'}</strong>
                  <span className={`severity ${rule.enabled ? 'tip' : 'warning'}`}>{rule.enabled ? '启用' : '停用'}</span>
                </div>
                <p className="compact-rule-desc">{rule.description || rule.pattern || '暂无描述'}</p>
                <div className="query-item-meta">
                  <em>{rule.recordType === 'stage' ? 'stage' : 'matcher'}</em>
                  <em>{rule.scenarios.length > 0 ? rule.scenarios.join(' / ') : '未配置场景'}</em>
                  <em>{rule.exportEnabled ? '允许导出' : '仅分析'}</em>
                </div>
              </button>
            ))}
            {visibleRules.length === 0 ? (
              <div className="empty-state">
                <strong>当前场景没有规则</strong>
                <span>切换场景或重新导入规则集。</span>
              </div>
            ) : null}
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
