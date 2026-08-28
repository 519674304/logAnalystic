import { parse } from 'toml'
import type {
  RulePackageFieldValue,
  RulePackageImportDto,
  RulePackageImportResultDto,
  RulePackageLayerDto,
  RulePackageNodeDto,
  RulePackageNodeUpdateDto,
  RulePackageVersionDto,
} from './dto'

const layerDefinitions = [
  { id: 'definitions', label: '定义' },
  { id: 'matchers', label: '日志匹配器' },
  { id: 'stages', label: '时延阶段' },
] as const

type ParsedManifest = {
  ruleSetId: string
  version: string
  layers: Record<string, string>
}

type ZipEntry = {
  name: string
  data: Uint8Array
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message)
  }
  return value as Record<string, unknown>
}

function asString(value: unknown, message: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(message)
  }
  return value
}

function isSafeStorageSegment(value: string) {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    /^[A-Za-z0-9._-]+$/.test(value)
  )
}

function isRootFile(path: string) {
  return path.length > 0 && !path.startsWith('/') && !path.includes('/') && !path.includes('\\') && path !== '.' && path !== '..'
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder('utf-8').decode(bytes)
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const minimumLength = 22
  const maximumCommentLength = 0xffff
  const start = Math.max(0, bytes.length - minimumLength - maximumCommentLength)

  for (let index = bytes.length - minimumLength; index >= start; index -= 1) {
    if (
      bytes[index] === 0x50 &&
      bytes[index + 1] === 0x4b &&
      bytes[index + 2] === 0x05 &&
      bytes[index + 3] === 0x06
    ) {
      return index
    }
  }

  throw new Error('无法定位 ZIP 中央目录')
}

async function inflateRaw(data: Uint8Array) {
  const streamFactory = (globalThis as typeof globalThis & {
    DecompressionStream?: new (format: string) => {
      writable: WritableStream<Uint8Array>
      readable: ReadableStream<Uint8Array>
    }
  }).DecompressionStream

  if (!streamFactory) {
    throw new Error('当前浏览器不支持 ZIP 解压，请改用桌面端导入')
  }

  const stream = new Blob([data]).stream().pipeThrough(new streamFactory('deflate-raw'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

async function unzipRootFiles(bytes: Uint8Array): Promise<Map<string, string>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocdOffset = findEndOfCentralDirectory(bytes)
  const centralDirectorySize = view.getUint32(eocdOffset + 12, true)
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true)
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize
  const files = new Map<string, string>()
  const decoder = new TextDecoder('utf-8')
  let offset = centralDirectoryOffset

  while (offset < centralDirectoryEnd) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('ZIP 中央目录格式不正确')
    }

    const compressionMethod = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const fileNameLength = view.getUint16(offset + 28, true)
    const extraFieldLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localHeaderOffset = view.getUint32(offset + 42, true)
    const nameStart = offset + 46
    const nameEnd = nameStart + fileNameLength
    const name = decoder.decode(bytes.slice(nameStart, nameEnd))
    offset = nameEnd + extraFieldLength + commentLength

    if (name.endsWith('/')) {
      continue
    }
    if (!isRootFile(name)) {
      throw new Error(`规则包只允许 ZIP 根目录文件：${name}`)
    }

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error(`无法读取 ZIP 条目：${name}`)
    }
    const localNameLength = view.getUint16(localHeaderOffset + 26, true)
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true)
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.slice(dataOffset, dataOffset + compressedSize)

    let entryBytes: Uint8Array
    if (compressionMethod === 0) {
      entryBytes = compressed
    } else if (compressionMethod === 8) {
      entryBytes = await inflateRaw(compressed)
    } else {
      throw new Error(`ZIP 条目 ${name} 使用了不支持的压缩方式`)
    }

    files.set(name, decodeUtf8(entryBytes))
  }

  return files
}

function parseManifest(files: Map<string, string>): ParsedManifest {
  const manifestText = files.get('manifest.toml')
  if (!manifestText) {
    throw new Error('规则包缺少根目录 manifest.toml')
  }

  const manifestValue = asRecord(parse(manifestText), 'manifest.toml 结构不正确')
  const ruleSet = asRecord(manifestValue.rule_set, 'manifest.toml 缺少 rule_set')
  const packageInfo = asRecord(manifestValue.package, 'manifest.toml 缺少 package')
  const layers = asRecord(packageInfo.layers, 'manifest.toml 缺少 package.layers')
  const ruleSetId = asString(ruleSet.id, 'manifest.toml 缺少 rule_set.id')
  const version = asString(packageInfo.version, 'manifest.toml 缺少 package.version')

  if (!isSafeStorageSegment(ruleSetId)) {
    throw new Error('manifest.toml 的 rule_set.id 不是安全的目录标识')
  }
  if (!isSafeStorageSegment(version)) {
    throw new Error('manifest.toml 的 package.version 不是安全的目录标识')
  }

  const normalizedLayers: Record<string, string> = {}
  layerDefinitions.forEach((layer) => {
    const fileName = asString(layers[layer.id], `manifest.toml 缺少 ${layer.id} 层映射`)
    if (!isRootFile(fileName)) {
      throw new Error(`${layer.id} 层必须映射到 ZIP 根目录文件：${fileName}`)
    }
    if (!files.has(fileName)) {
      throw new Error(`规则包缺少 ${layer.id} 层文件：${fileName}`)
    }
    normalizedLayers[layer.id] = fileName
  })

  return {
    ruleSetId,
    version,
    layers: normalizedLayers,
  }
}

function normalizeFieldValue(value: unknown): RulePackageFieldValue | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => normalizeFieldValue(item))
      .filter((item): item is RulePackageFieldValue => item !== null)
    return normalized
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  return null
}

function collectIds(value: unknown, path: string, ids: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectIds(item, `${path}[${index}]`, ids))
    return
  }
  if (!value || typeof value !== 'object') {
    return
  }

  const record = value as Record<string, unknown>
  if (typeof record.id === 'string') {
    if (ids.has(record.id)) {
      throw new Error(`重复节点 ID：${record.id}（${path}）`)
    }
    ids.add(record.id)
  }

  Object.entries(record).forEach(([key, child]) => {
    collectIds(child, path ? `${path}.${key}` : key, ids)
  })
}

function validateReferences(value: unknown, path: string, ids: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateReferences(item, `${path}[${index}]`, ids))
    return
  }
  if (!value || typeof value !== 'object') {
    return
  }

  const record = value as Record<string, unknown>
  Object.entries(record).forEach(([key, child]) => {
    const fieldPath = path ? `${path}.${key}` : key
    if (key !== 'id' && key.endsWith('_id') && typeof child === 'string' && !ids.has(child)) {
      throw new Error(`无效引用 ${fieldPath} = ${child}`)
    }
    if (key.endsWith('_ids') && Array.isArray(child)) {
      child.forEach((item) => {
        if (typeof item === 'string' && !ids.has(item)) {
          throw new Error(`无效引用 ${fieldPath} 包含 ${item}`)
        }
      })
    }
    validateReferences(child, fieldPath, ids)
  })
}

function collectNodes(value: unknown, path: string, nodes: RulePackageNodeDto[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNodes(item, path, nodes))
    return
  }
  if (!value || typeof value !== 'object') {
    return
  }

  const record = value as Record<string, unknown>
  if (typeof record.id === 'string') {
    const fields = Object.entries(record).reduce<Record<string, RulePackageFieldValue>>((result, [key, field]) => {
      const normalized = normalizeFieldValue(field)
      if (normalized !== null) {
        result[key] = normalized
      }
      return result
    }, {})

    nodes.push({
      id: record.id,
      name: typeof record.name === 'string' ? record.name : record.id,
      nodeType: path.split('.').at(-1) ?? 'node',
      tablePath: path,
      fields,
    })
  }

  Object.entries(record).forEach(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key
    collectNodes(child, childPath, nodes)
  })
}

function buildVersionTree(manifest: ParsedManifest, files: Map<string, string>): RulePackageVersionDto {
  const parsedLayers = layerDefinitions.map((layer) => {
    const fileName = manifest.layers[layer.id]
    const parsed = parse(files.get(fileName) ?? '')
    return { layer, fileName, parsed }
  })
  const ids = new Set<string>()

  parsedLayers.forEach(({ layer, parsed }) => collectIds(parsed, layer.id, ids))
  parsedLayers.forEach(({ layer, parsed }) => validateReferences(parsed, layer.id, ids))

  const layers: RulePackageLayerDto[] = parsedLayers.map(({ layer, fileName, parsed }) => {
    const nodes: RulePackageNodeDto[] = []
    collectNodes(parsed, '', nodes)
    return {
      id: layer.id,
      label: layer.label,
      fileName,
      nodes,
    }
  })

  return {
    ruleSetId: manifest.ruleSetId,
    version: manifest.version,
    layers,
  }
}

function compareVersions(left: RulePackageVersionDto, right: RulePackageVersionDto) {
  return left.ruleSetId.localeCompare(right.ruleSetId) || right.version.localeCompare(left.version)
}

export async function parseLocalRulePackageImport(
  payload: RulePackageImportDto,
): Promise<RulePackageImportResultDto> {
  const files = await unzipRootFiles(new Uint8Array(payload.bytes))
  const manifest = parseManifest(files)
  const importedVersion = buildVersionTree(manifest, files)
  return {
    operation: 'created',
    ruleSetId: importedVersion.ruleSetId,
    version: importedVersion.version,
    versions: [importedVersion],
  }
}

export function mergeImportedRulePackage(
  currentVersions: RulePackageVersionDto[],
  imported: RulePackageImportResultDto,
): RulePackageImportResultDto {
  const importedVersion = imported.versions[0]
  const existed = currentVersions.some(
    (version) =>
      version.ruleSetId === importedVersion.ruleSetId && version.version === importedVersion.version,
  )
  const versions = currentVersions
    .filter(
      (version) =>
        version.ruleSetId !== importedVersion.ruleSetId || version.version !== importedVersion.version,
    )
    .concat(importedVersion)
    .sort(compareVersions)

  return {
    operation: existed ? 'replaced' : 'created',
    ruleSetId: importedVersion.ruleSetId,
    version: importedVersion.version,
    versions,
  }
}

export function updateLocalRulePackageNodeTree(
  versions: RulePackageVersionDto[],
  payload: RulePackageNodeUpdateDto,
): RulePackageVersionDto[] {
  let updated = false

  const nextVersions = versions.map((version) => {
    if (version.ruleSetId !== payload.ruleSetId || version.version !== payload.version) {
      return version
    }

    return {
      ...version,
      layers: version.layers.map((layer) => {
        if (layer.id !== payload.layerId) {
          return layer
        }

        return {
          ...layer,
          nodes: layer.nodes.map((node) => {
            if (node.tablePath !== payload.tablePath || node.id !== payload.nodeId) {
              return node
            }
            updated = true
            return {
              ...node,
              name: typeof payload.fields.name === 'string' ? payload.fields.name : node.name,
              fields: payload.fields,
            }
          }),
        }
      }),
    }
  })

  if (!updated) {
    throw new Error('未找到要保存的规则节点')
  }

  return nextVersions
}
