import { TauriCommands } from './commands'
import type {
  ActiveRuleVersionDto,
  RuleConfigDto,
  RulePackageImportDto,
  RulePackageImportResultDto,
  RulePackageLayerTomlUpdateDto,
  RulePackageNodeUpdateDto,
  RulePackageVersionDto,
  SavedQueryDto,
} from './dto'
import { getJson, putJson } from './http-client'
import {
  mergeImportedRulePackage,
  parseLayerToml,
  parseLocalRulePackageImport,
  removeLocalRulePackageVersion,
  updateLocalRulePackageNodeTree,
} from './local-rule-package'

const savedQueryStorageKey = 'log-analystic.saved-queries'

function readLocalList<T>(storageKey: string): T[] {
  const rawValue = globalThis.localStorage?.getItem(storageKey)
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function writeLocalList(storageKey: string, value: unknown[]) {
  globalThis.localStorage?.setItem(storageKey, JSON.stringify(value))
}

const ruleConfigPath = '/api/rule-config'

async function loadRuleConfig(): Promise<RuleConfigDto> {
  return getJson<RuleConfigDto>(ruleConfigPath)
}

async function invokeCommand<T>(command: string, payload?: unknown): Promise<T | null> {
  const tauri = (globalThis as typeof globalThis & {
    __TAURI__?: {
      invoke?: (commandName: string, body?: unknown) => Promise<unknown>
      tauri?: { invoke?: (commandName: string, body?: unknown) => Promise<unknown> }
    }
  }).__TAURI__
  const invoke = tauri?.tauri?.invoke ?? tauri?.invoke

  if (!invoke) {
    return null
  }

  return (await invoke(command, payload)) as T
}

export async function listSavedQueries(): Promise<SavedQueryDto[]> {
  const result = await invokeCommand<SavedQueryDto[]>(TauriCommands.listSavedQueries)
  return result ?? readLocalList<SavedQueryDto>(savedQueryStorageKey)
}

export async function upsertSavedQuery(query: SavedQueryDto): Promise<SavedQueryDto[]> {
  const result = await invokeCommand<SavedQueryDto[]>(TauriCommands.upsertSavedQuery, query)
  if (result) {
    return result
  }

  const current = readLocalList<SavedQueryDto>(savedQueryStorageKey)
  const next = current.some((item) => item.id === query.id)
    ? current.map((item) => (item.id === query.id ? query : item))
    : [...current, query]
  writeLocalList(savedQueryStorageKey, next)
  return next
}

export async function deleteSavedQuery(queryId: string): Promise<SavedQueryDto[]> {
  const result = await invokeCommand<SavedQueryDto[]>(TauriCommands.deleteSavedQuery, queryId)
  if (result) {
    return result
  }

  const next = readLocalList<SavedQueryDto>(savedQueryStorageKey).filter((item) => item.id !== queryId)
  writeLocalList(savedQueryStorageKey, next)
  return next
}

// 规则配置已迁移到后端 HTTP（/api/rule-config）；保存的查询仍为 localStorage 过渡态。
export async function importRulePackage(payload: RulePackageImportDto): Promise<RulePackageImportResultDto> {
  const parsed = await parseLocalRulePackageImport(payload)
  const config = await loadRuleConfig()
  const merged = mergeImportedRulePackage(config.versions, parsed)
  await putJson(ruleConfigPath, { ...config, versions: merged.versions })
  return merged
}

export async function listRulePackages(): Promise<RulePackageVersionDto[]> {
  const config = await loadRuleConfig()
  return config.versions
}

export async function updateRulePackageNode(payload: RulePackageNodeUpdateDto): Promise<RulePackageVersionDto[]> {
  const config = await loadRuleConfig()
  const versions = updateLocalRulePackageNodeTree(config.versions, payload)
  await putJson(ruleConfigPath, { ...config, versions })
  return versions
}

export async function updateRulePackageLayerToml(
  payload: RulePackageLayerTomlUpdateDto,
): Promise<RulePackageVersionDto[]> {
  const config = await loadRuleConfig()
  const target = config.versions.find(
    (version) => version.ruleSetId === payload.ruleSetId && version.version === payload.version,
  )
  if (!target) {
    throw new Error('未找到要保存的规则版本')
  }
  const otherLayerIds = target.layers
    .filter((layer) => layer.id !== payload.layerId)
    .flatMap((layer) => layer.nodes.map((node) => node.id))
  const nodes = parseLayerToml(payload.tomlText, payload.layerId, otherLayerIds)
  const versions = config.versions.map((version) => {
    if (version.ruleSetId !== payload.ruleSetId || version.version !== payload.version) {
      return version
    }
    return {
      ...version,
      layers: version.layers.map((layer) =>
        layer.id === payload.layerId ? { ...layer, nodes } : layer,
      ),
    }
  })
  await putJson(ruleConfigPath, { ...config, versions })
  return versions
}

export async function deleteRulePackage(ruleSetId: string, version: string): Promise<RulePackageVersionDto[]> {
  const config = await loadRuleConfig()
  const versions = removeLocalRulePackageVersion(config.versions, ruleSetId, version)
  await putJson(ruleConfigPath, { ...config, versions })
  return versions
}

export async function loadActiveRuleVersion(): Promise<ActiveRuleVersionDto | null> {
  const config = await loadRuleConfig()
  return config.active
}

export async function saveActiveRuleVersion(active: ActiveRuleVersionDto | null): Promise<void> {
  const config = await loadRuleConfig()
  await putJson(ruleConfigPath, { ...config, active })
}
