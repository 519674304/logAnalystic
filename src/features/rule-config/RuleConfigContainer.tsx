import { useState } from 'react'
import {
  deleteRulePackage,
  importRulePackage,
  saveActiveRuleVersion,
  updateRulePackageLayerToml,
  updateRulePackageNode,
} from '../../api/tauri-client'
import { serializeLayerToToml } from '../../api/local-rule-package'
import type { ActiveRuleVersionDto, RulePackageVersionDto } from '../../api/dto'
import RuleCatalogPanel, {
  type RuleLayerTomlSelection,
  type RuleLayerTomlTarget,
  type RuleNodeSelection,
} from './RuleCatalogPanel'

type Props = {
  versions: RulePackageVersionDto[]
  activeRuleVersion: ActiveRuleVersionDto | null
  selectedScenarioId: string | null
  scenarios: Array<{ id: string; name: string }>
  onVersionsChange: (versions: RulePackageVersionDto[]) => void
  onActiveRuleVersionChange: (version: ActiveRuleVersionDto | null) => void
  onScenarioChange: (id: string) => void
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

export default function RuleConfigContainer({
  versions,
  activeRuleVersion,
  selectedScenarioId,
  scenarios,
  onVersionsChange,
  onActiveRuleVersionChange,
  onScenarioChange,
}: Props) {
  const [activeNodeKey, setActiveNodeKey] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailDraft, setDetailDraft] = useState<RuleNodeSelection | null>(null)
  const [tomlOpen, setTomlOpen] = useState(false)
  const [tomlDraft, setTomlDraft] = useState<RuleLayerTomlSelection | null>(null)
  const [statusMessage, setStatusMessage] = useState('等待导入')

  const closeDetail = () => {
    setDetailOpen(false)
    setDetailDraft(null)
  }

  const importRules = async (payload: { sourceName: string; bytes: number[] }) => {
    if (!payload.sourceName.toLowerCase().endsWith('.zip')) {
      setStatusMessage('导入失败：请选择 .zip 格式的完整规则包')
      return
    }
    try {
      const result = await importRulePackage(payload)
      onVersionsChange(result.versions)
      setStatusMessage(result.operation === 'replaced' ? `已覆盖 ${result.version}` : `已新增 ${result.version}`)
      setActiveNodeKey('')
      closeDetail()
    } catch (error) {
      setStatusMessage(`导入失败：${errorMessage(error, '导入规则失败')}`)
    }
  }

  const saveNode = async () => {
    if (!detailDraft) return
    try {
      const updated = await updateRulePackageNode({
        ruleSetId: detailDraft.ruleSetId,
        version: detailDraft.version,
        layerId: detailDraft.layerId,
        tablePath: detailDraft.node.tablePath,
        nodeId: detailDraft.node.id,
        fields: detailDraft.node.fields,
      })
      onVersionsChange(updated)
      setStatusMessage(`已保存 ${detailDraft.node.id}`)
      closeDetail()
    } catch (error) {
      setStatusMessage(`保存失败：${errorMessage(error, '保存规则节点失败')}`)
    }
  }

  const openLayerToml = (target: RuleLayerTomlTarget) => {
    const { layer } = target
    setTomlDraft({
      ruleSetId: target.ruleSetId,
      version: target.version,
      layerId: layer.id,
      layerLabel: layer.label,
      fileName: layer.fileName,
      tomlText: serializeLayerToToml(layer),
    })
    setTomlOpen(true)
  }

  const closeToml = () => {
    setTomlOpen(false)
    setTomlDraft(null)
  }

  const saveToml = async () => {
    if (!tomlDraft) return
    try {
      const updated = await updateRulePackageLayerToml({
        ruleSetId: tomlDraft.ruleSetId,
        version: tomlDraft.version,
        layerId: tomlDraft.layerId,
        tomlText: tomlDraft.tomlText,
      })
      onVersionsChange(updated)
      setStatusMessage(`已保存 ${tomlDraft.fileName}`)
      closeToml()
    } catch (error) {
      setStatusMessage(`保存失败：${errorMessage(error, '保存 TOML 失败')}`)
    }
  }

  const activateVersion = async (next: ActiveRuleVersionDto | null) => {
    try {
      await saveActiveRuleVersion(next)
      onActiveRuleVersionChange(next)
    } catch (error) {
      setStatusMessage(`切换失败：${errorMessage(error, '保存生效版本失败')}`)
    }
  }

  const removeVersion = async (ruleSetId: string, version: string) => {
    try {
      const updated = await deleteRulePackage(ruleSetId, version)
      onVersionsChange(updated)
      setStatusMessage(`已删除 ${version}`)
      if (activeRuleVersion?.ruleSetId === ruleSetId && activeRuleVersion.version === version) {
        await saveActiveRuleVersion(null)
        onActiveRuleVersionChange(null)
      }
      setActiveNodeKey('')
      closeDetail()
    } catch (error) {
      setStatusMessage(`删除失败：${errorMessage(error, '删除规则版本失败')}`)
    }
  }

  return (
    <RuleCatalogPanel
      versions={versions}
      activeRuleVersion={activeRuleVersion}
      selectedScenarioId={selectedScenarioId}
      scenarios={scenarios}
      onScenarioChange={onScenarioChange}
      activeNodeKey={activeNodeKey}
      detailOpen={detailOpen}
      detailDraft={detailDraft}
      statusMessage={statusMessage}
      onSelectNode={(selection) => setActiveNodeKey(selection.key)}
      onOpenNode={(selection) => {
        setActiveNodeKey(selection.key)
        setDetailDraft(structuredClone(selection))
        setDetailOpen(true)
      }}
      onCloseDetail={closeDetail}
      onImportPackage={importRules}
      onActivateVersion={(next) => void activateVersion(next)}
      onDeleteVersion={(ruleSetId, version) => void removeVersion(ruleSetId, version)}
      onDetailDraftChange={setDetailDraft}
      onSaveNode={saveNode}
      tomlOpen={tomlOpen}
      tomlDraft={tomlDraft}
      onOpenLayerToml={openLayerToml}
      onCloseToml={closeToml}
      onTomlDraftChange={setTomlDraft}
      onSaveToml={saveToml}
    />
  )
}
