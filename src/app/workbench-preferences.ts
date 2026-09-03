const activeScenarioStorageKey = 'log-analystic.active-scenario'
const selectedMatcherIdsStorageKey = 'log-analystic.selected-matcher-ids'
const recentFoldersStorageKey = 'log-analystic.recent-folders'
const logFolderStorageKey = 'log-analystic.log-folder-path'
const maxRecentFolders = 5

export function readActiveScenario(): string | null {
  try {
    const value = globalThis.localStorage?.getItem(activeScenarioStorageKey)
    return value ? value : null
  } catch {
    return null
  }
}

export function saveActiveScenario(id: string) {
  globalThis.localStorage?.setItem(activeScenarioStorageKey, id)
}

export function clearActiveScenario() {
  globalThis.localStorage?.removeItem(activeScenarioStorageKey)
}

export function readPersistedMatcherIds(): string[] {
  try {
    const value = globalThis.localStorage?.getItem(selectedMatcherIdsStorageKey)
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function writePersistedMatcherIds(ids: string[]) {
  try {
    globalThis.localStorage?.setItem(selectedMatcherIdsStorageKey, JSON.stringify(ids))
  } catch {
    // 忽略 localStorage 不可用的情况。
  }
}

export function readRecentFolders(): string[] {
  try {
    const value = globalThis.localStorage?.getItem(recentFoldersStorageKey)
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      : []
  } catch {
    return []
  }
}

export function writeRecentFolders(folders: string[]) {
  try {
    globalThis.localStorage?.setItem(recentFoldersStorageKey, JSON.stringify(folders))
  } catch {
    // 忽略 localStorage 不可用的情况。
  }
}

export function pushRecentFolder(current: string[], path: string): string[] {
  const trimmed = path.trim()
  if (!trimmed) return current
  return [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, maxRecentFolders)
}

export function readLogFolderPath(): string {
  return globalThis.localStorage?.getItem(logFolderStorageKey) ?? ''
}

export function writeLogFolderPath(path: string) {
  globalThis.localStorage?.setItem(logFolderStorageKey, path)
}
