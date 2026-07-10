import type { LogEntry, SavedQuery } from './app-state'

export function getActiveQuery(queries: SavedQuery[], activeQueryId: string): SavedQuery {
  return queries.find((item) => item.id === activeQueryId) ?? queries[0]
}

export function filterLogsByQuery(logs: LogEntry[], queryText: string): LogEntry[] {
  const keyword = queryText.trim().toLowerCase()
  if (!keyword) {
    return logs
  }

  return logs.filter((entry) => entry.message.toLowerCase().includes(keyword))
}
