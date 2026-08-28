import { useRef } from 'react'
import type * as React from 'react'
import type {
  ActiveRuleVersionDto,
  RulePackageFieldValue,
  RulePackageImportDto,
  RulePackageNodeDto,
  RulePackageVersionDto,
} from '../../api/dto'

export type RuleNodeSelection = {
  key: string
  ruleSetId: string
  version: string
  layerId: string
  layerLabel: string
  node: RulePackageNodeDto
}

type RuleCatalogPanelProps = {
  versions: RulePackageVersionDto[]
  activeRuleVersion: ActiveRuleVersionDto | null
  activeNodeKey: string
  detailOpen: boolean
  detailDraft: RuleNodeSelection | null
  statusMessage: string
  onSelectNode: (selection: RuleNodeSelection) => void
  onOpenNode: (selection: RuleNodeSelection) => void
  onCloseDetail: () => void
  onImportPackage: (payload: RulePackageImportDto) => Promise<void>
  onActivateVersion: (next: ActiveRuleVersionDto | null) => void
  onDetailDraftChange: (next: RuleNodeSelection) => void
  onSaveNode: () => Promise<void>
}

function nodeKey(ruleSetId: string, version: string, layerId: string, node: RulePackageNodeDto) {
  return `${ruleSetId}/${version}/${layerId}/${node.tablePath}/${node.id}`
}

function displayValue(value: RulePackageFieldValue) {
  return Array.isArray(value) ? value.join(', ') : String(value)
}

function updateFieldValue(original: RulePackageFieldValue, rawValue: string): RulePackageFieldValue {
  if (Array.isArray(original)) {
    return rawValue.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
  }
  if (typeof original === 'number') {
    const parsed = Number(rawValue)
    return Number.isFinite(parsed) ? parsed : original
  }
  return rawValue
}

export default function RuleCatalogPanel({
  versions,
  activeRuleVersion,
  activeNodeKey,
  detailOpen,
  detailDraft,
  statusMessage,
  onSelectNode,
  onOpenNode,
  onCloseDetail,
  onImportPackage,
  onActivateVersion,
  onDetailDraftChange,
  onSaveNode,
}: RuleCatalogPanelProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const nodeCount = versions.reduce(
    (versionTotal, version) =>
      versionTotal + version.layers.reduce((layerTotal, layer) => layerTotal + layer.nodes.length, 0),
    0,
  )

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
    await onImportPackage({ sourceName: file.name, bytes })
  }

  const updateDraftField = (field: string, value: RulePackageFieldValue) => {
    if (!detailDraft) return
    onDetailDraftChange({
      ...detailDraft,
      node: {
        ...detailDraft.node,
        name: field === 'name' && typeof value === 'string' ? value : detailDraft.node.name,
        fields: { ...detailDraft.node.fields, [field]: value },
      },
    })
  }

  return (
    <section className="panel rule-page rule-package-page">
      <div className="panel-title-row rule-package-toolbar">
        <div>
          <h2>规则配置</h2>
          <span>{versions.length} 个版本 · {nodeCount} 个节点</span>
        </div>
        <div className="panel-actions">
          <span className="rule-package-status">{statusMessage}</span>
          <a
            className="ghost-button rule-template-download"
            href="/templates/rule-package-import-guide.md"
            download
          >
            下载导入说明
          </a>
          <a
            className="ghost-button rule-template-download"
            href="/templates/rule-package-template.zip"
            download
          >
            下载导入模板
          </a>
          <button type="button" className="primary-button" onClick={() => importInputRef.current?.click()}>
            导入完整规则包
          </button>
        </div>
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".zip"
        className="hidden-input"
        onChange={(event) => void handleImportFile(event)}
      />

      <div className="rule-package-workspace">
        <aside className="rule-package-sidebar" aria-label="规则包版本树">
          <div className="rule-tree-heading">
            <strong>规则包结构</strong>
            <span>双击具体节点编辑</span>
          </div>
          <div className="rule-package-tree">
            {versions.map((version) => {
              const isActive =
                activeRuleVersion?.ruleSetId === version.ruleSetId && activeRuleVersion?.version === version.version

              return (
                <details key={`${version.ruleSetId}/${version.version}`} className="package-version-node" open>
                  <summary>
                    <span className="tree-disclosure" aria-hidden="true">▾</span>
                    <strong>{version.version}</strong>
                    <em>{version.ruleSetId}</em>
                    {isActive ? (
                      <button
                        type="button"
                        className="version-active-badge"
                        title="点击取消生效"
                        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                          event.preventDefault()
                          event.stopPropagation()
                          onActivateVersion(null)
                        }}
                      >
                        生效中
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="version-activate-button"
                        title="设为生效版本，时延分析将使用该版本规则"
                        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                          event.preventDefault()
                          event.stopPropagation()
                          onActivateVersion({ ruleSetId: version.ruleSetId, version: version.version })
                        }}
                      >
                        设为生效
                      </button>
                    )}
                  </summary>
                <div className="package-version-children">
                  {version.layers.map((layer) => (
                    <details key={layer.id} className="package-layer-node" open>
                      <summary>
                        <span className="tree-disclosure" aria-hidden="true">▾</span>
                        <strong>{layer.label}</strong>
                        <em>{layer.nodes.length}</em>
                      </summary>
                      <div className="package-layer-children">
                        {layer.nodes.map((node) => {
                          const selection: RuleNodeSelection = {
                            key: nodeKey(version.ruleSetId, version.version, layer.id, node),
                            ruleSetId: version.ruleSetId,
                            version: version.version,
                            layerId: layer.id,
                            layerLabel: layer.label,
                            node,
                          }
                          return (
                            <button
                              key={selection.key}
                              type="button"
                              className={`package-leaf-node ${selection.key === activeNodeKey ? 'active' : ''}`}
                              onClick={() => onSelectNode(selection)}
                              onDoubleClick={() => onOpenNode(selection)}
                              title={`${node.nodeType} · ${node.id}`}
                            >
                              <span className="node-type-mark" aria-hidden="true" />
                              <span className="node-copy">
                                <strong>{node.name}</strong>
                                <em>{node.id}</em>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </details>
                  ))}
                  </div>
                </details>
              )
            })}
            {versions.length === 0 ? (
              <div className="empty-state rule-package-empty">
                <strong>还没有规则版本</strong>
                <span>导入包含 manifest.toml 和三层 TOML 的完整 ZIP 规则包。</span>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="rule-package-canvas">
          <div className="rule-canvas-guide">
            <span className="guide-icon" aria-hidden="true">⌘</span>
            <strong>{activeNodeKey ? '已选择节点' : '从左侧选择节点'}</strong>
            <p>{activeNodeKey ? '双击选中的具体节点可查看并编辑全部字段。' : '版本、作用层和具体规则保持清晰分层。'}</p>
          </div>
        </div>
      </div>

      {detailOpen && detailDraft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={onCloseDetail}>
          <div
            className="modal-card rule-node-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rule-node-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="panel-title-row">
              <div>
                <h2 id="rule-node-modal-title">编辑节点</h2>
                <span>{detailDraft.version} / {detailDraft.layerLabel} / {detailDraft.node.nodeType}</span>
              </div>
              <div className="panel-actions">
                <button type="button" className="ghost-button" onClick={onCloseDetail}>取消</button>
                <button type="button" className="primary-button" onClick={() => void onSaveNode()}>保存修改</button>
              </div>
            </div>
            <div className="rule-node-fields">
              {Object.entries(detailDraft.node.fields).map(([field, value]) => (
                <label key={field} className={`field ${Array.isArray(value) ? 'field-wide' : ''}`}>
                  <span>{field}</span>
                  {typeof value === 'boolean' ? (
                    <select value={String(value)} onChange={(event) => updateDraftField(field, event.target.value === 'true')}>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      value={displayValue(value)}
                      disabled={field === 'id'}
                      onChange={(event) => updateDraftField(field, updateFieldValue(value, event.target.value))}
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
