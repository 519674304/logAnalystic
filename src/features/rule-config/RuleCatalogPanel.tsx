import { useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import type {
  ActiveRuleVersionDto,
  RulePackageFieldValue,
  RulePackageImportDto,
  RulePackageLayerDto,
  RulePackageNodeDto,
  RulePackageVersionDto,
} from '../../api/dto'
import RuleTopologyCanvas from './RuleTopologyCanvas'
import type { TopologyLocateTarget } from './RuleTopologyCanvas'

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
  selectedScenarioId: string | null
  scenarios: Array<{ id: string; name: string }>
  onScenarioChange: (nextId: string) => void
  activeNodeKey: string
  detailOpen: boolean
  detailDraft: RuleNodeSelection | null
  statusMessage: string
  onSelectNode: (selection: RuleNodeSelection) => void
  onOpenNode: (selection: RuleNodeSelection) => void
  onCloseDetail: () => void
  onImportPackage: (payload: RulePackageImportDto) => Promise<void>
  onActivateVersion: (next: ActiveRuleVersionDto | null) => void
  onDeleteVersion: (ruleSetId: string, version: string) => void
  onDetailDraftChange: (next: RuleNodeSelection) => void
  onSaveNode: () => Promise<void>
}

function nodeKey(ruleSetId: string, version: string, layerId: string, node: RulePackageNodeDto) {
  return `${ruleSetId}/${version}/${layerId}/${node.tablePath}/${node.id}`
}

// 定义层（definitions.toml）里各 table 的中文分组名。
const TABLE_PATH_LABELS: Record<string, string> = {
  scenarios: '场景',
  domains: '领域',
  applications: '应用',
  processes: '进程',
  flows: '流程',
}

/** 把定义层节点按 tablePath（场景/应用/进程/流程…）拆成有序分组。 */
function groupNodesByTable(nodes: RulePackageNodeDto[]) {
  const groups: Array<{ tablePath: string; nodes: RulePackageNodeDto[] }> = []
  for (const node of nodes) {
    const last = groups[groups.length - 1]
    if (last && last.tablePath === node.tablePath) {
      last.nodes.push(node)
    } else {
      groups.push({ tablePath: node.tablePath, nodes: [node] })
    }
  }
  return groups
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
  selectedScenarioId,
  scenarios,
  onScenarioChange,
  activeNodeKey,
  detailOpen,
  detailDraft,
  statusMessage,
  onSelectNode,
  onOpenNode,
  onCloseDetail,
  onImportPackage,
  onActivateVersion,
  onDeleteVersion,
  onDetailDraftChange,
  onSaveNode,
}: RuleCatalogPanelProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const nodeCount = versions.reduce(
    (versionTotal, version) =>
      versionTotal + version.layers.reduce((layerTotal, layer) => layerTotal + layer.nodes.length, 0),
    0,
  )

  const activeVersion = useMemo(
    () =>
      versions.find(
        (version) =>
          version.ruleSetId === activeRuleVersion?.ruleSetId && version.version === activeRuleVersion?.version,
      ) ?? null,
    [versions, activeRuleVersion],
  )

  const activeVersionIndex = activeRuleVersion
    ? versions.findIndex(
        (version) => version.ruleSetId === activeRuleVersion.ruleSetId && version.version === activeRuleVersion.version,
      )
    : -1

  const findTopologyNode = (nodeType: string, nodeId: string) => {
    if (!activeVersion) return null
    for (const layer of activeVersion.layers) {
      const node = layer.nodes.find((item) => item.nodeType === nodeType && item.id === nodeId)
      if (node) return { layer, node }
    }
    return null
  }

  const toSelection = (found: { layer: RulePackageLayerDto; node: RulePackageNodeDto }): RuleNodeSelection => {
    const version = activeVersion as RulePackageVersionDto
    return {
      key: nodeKey(version.ruleSetId, version.version, found.layer.id, found.node),
      ruleSetId: version.ruleSetId,
      version: version.version,
      layerId: found.layer.id,
      layerLabel: found.layer.label,
      node: found.node,
    }
  }

  const handleTopologySelect = (target: TopologyLocateTarget) => {
    const found = findTopologyNode(target.nodeType, target.nodeId)
    if (found) onSelectNode(toSelection(found))
  }

  const handleTopologyEdit = (target: TopologyLocateTarget) => {
    const found = findTopologyNode(target.nodeType, target.nodeId)
    if (found) onOpenNode(toSelection(found))
  }

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

  const renderLayerNodes = (layer: RulePackageLayerDto, ruleSetId: string, version: string) => {
    const renderLeaf = (node: RulePackageNodeDto) => {
      const selection: RuleNodeSelection = {
        key: nodeKey(ruleSetId, version, layer.id, node),
        ruleSetId,
        version,
        layerId: layer.id,
        layerLabel: layer.label,
        node,
      }
      const isScenario = node.nodeType === 'scenarios'
      const isActiveScenario = isScenario && node.id === selectedScenarioId
      const leafClass = `package-leaf-node ${selection.key === activeNodeKey ? 'active' : ''}`

      // 场景节点：在树内直接做「生效」处理，未生效的场景置灰。
      if (isScenario) {
        return (
          <div
            key={selection.key}
            className={`${leafClass} scenario-node ${isActiveScenario ? 'scenario-active' : 'scenario-muted'}`}
          >
            <button
              type="button"
              className="scenario-node-select"
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
            {isActiveScenario ? (
              <span className="scenario-active-badge">当前场景</span>
            ) : (
              <button
                type="button"
                className="scenario-activate-button"
                title="设为当前场景，拓扑图与时延分析将按此场景过滤"
                onClick={() => onScenarioChange(node.id)}
              >
                设为生效
              </button>
            )}
          </div>
        )
      }

      return (
        <button
          key={selection.key}
          type="button"
          className={leafClass}
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
    }

    if (layer.id !== 'definitions') {
      return <div className="package-layer-children">{layer.nodes.map(renderLeaf)}</div>
    }

    const groups = groupNodesByTable(layer.nodes)
    return (
      <div className="package-layer-children">
        {groups.map((group) => (
          <details key={group.tablePath} className="package-table-group" open>
            <summary className="package-table-group-heading">
              <span className="tree-disclosure" aria-hidden="true">▾</span>
              <span className="package-table-group-label">{TABLE_PATH_LABELS[group.tablePath] ?? group.tablePath}</span>
              <em>{group.nodes.length}</em>
            </summary>
            <div className="package-table-group-children">{group.nodes.map(renderLeaf)}</div>
          </details>
        ))}
      </div>
    )
  }

  return (
    <section className="panel rule-page rule-package-page">
      <div className="panel-title-row rule-package-toolbar">
        <div>
          <h2>规则配置</h2>
          <span>{versions.length} 个版本 · {nodeCount} 个节点</span>
        </div>
        <div className="rule-package-selects">
          <label className="rule-package-select">
            <span>生效规则</span>
            <select
              value={activeVersionIndex >= 0 ? String(activeVersionIndex) : ''}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                const raw = event.target.value
                if (raw === '') {
                  onActivateVersion(null)
                  return
                }
                const index = Number(raw)
                const version = versions[index]
                if (version) {
                  onActivateVersion({ ruleSetId: version.ruleSetId, version: version.version })
                }
              }}
            >
              <option value="">未生效</option>
              {versions.map((version, index) => (
                <option key={`${version.ruleSetId}/${version.version}`} value={String(index)}>
                  {version.version} · {version.ruleSetId}
                </option>
              ))}
            </select>
          </label>
          <label className="rule-package-select">
            <span>场景</span>
            <select
              value={selectedScenarioId ?? ''}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => onScenarioChange(event.target.value)}
            >
              <option value="">全部场景</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </label>
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
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => void handleImportFile(event)}
      />

      <div className={`rule-package-workspace ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <aside className={`rule-package-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`} aria-label="规则包版本树">
          {sidebarCollapsed ? (
            <button
              type="button"
              className="sidebar-expand-button"
              title="展开规则包结构"
              onClick={() => setSidebarCollapsed(false)}
            >
              »
            </button>
          ) : (
            <>
              <div className="rule-tree-heading">
                <strong>规则包结构</strong>
                <div className="rule-tree-heading-actions">
                  <span>双击具体节点编辑</span>
                  <button
                    type="button"
                    className="sidebar-collapse-button"
                    title="隐藏规则包结构"
                    onClick={() => setSidebarCollapsed(true)}
                  >
                    «
                  </button>
                </div>
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
                    <button
                      type="button"
                      className="version-delete-button"
                      title="删除整个版本及其全部规则节点"
                      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onDeleteVersion(version.ruleSetId, version.version)
                      }}
                    >
                      删除
                    </button>
                  </summary>
                <div className="package-version-children">
                  {version.layers.map((layer) => (
                    <details key={layer.id} className="package-layer-node" open>
                      <summary>
                        <span className="tree-disclosure" aria-hidden="true">▾</span>
                        <strong>{layer.label}</strong>
                        <em>{layer.nodes.length}</em>
                      </summary>
                      {renderLayerNodes(layer, version.ruleSetId, version.version)}
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
            </>
          )}
        </aside>

        <div className="rule-package-canvas">
          {activeVersion ? (
            <RuleTopologyCanvas
              activeVersion={activeVersion}
              selectedScenarioId={selectedScenarioId}
              onSelectNode={handleTopologySelect}
              onEditNode={handleTopologyEdit}
            />
          ) : (
            <div className="rule-canvas-guide">
              <span className="guide-icon" aria-hidden="true">⌘</span>
              <strong>设为生效版本后查看拓扑</strong>
              <p>在左侧选择一个规则版本并点击「设为生效」，即可查看该规则包的应用 / 进程调用拓扑。</p>
            </div>
          )}
        </div>
      </div>

      {detailOpen && detailDraft ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={onCloseDetail}>
          <div
            className="modal-card rule-node-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rule-node-modal-title"
            onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation()}
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
                    <select value={String(value)} onChange={(event: React.ChangeEvent<HTMLSelectElement>) => updateDraftField(field, event.target.value === 'true')}>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      value={displayValue(value)}
                      disabled={field === 'id'}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateDraftField(field, updateFieldValue(value, event.target.value))}
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
