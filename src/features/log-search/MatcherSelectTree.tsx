import { useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import type { RuleRecordDto } from '../../api/dto'

export interface MatcherTreeScenario {
  id: string
  name: string
}

interface MatcherSelectTreeProps {
  scenarios: MatcherTreeScenario[]
  matchers: RuleRecordDto[]
  selectedIds: string[]
  onChange: (next: string[]) => void
}

function matcherLabel(matcher: RuleRecordDto) {
  return matcher.name || matcher.id
}

function GroupCheckbox({
  checked,
  indeterminate,
  label,
  count,
  collapsed,
  onChange,
  onToggleCollapse,
}: {
  checked: boolean
  indeterminate: boolean
  label: string
  count: number
  collapsed: boolean
  onChange: () => void
  onToggleCollapse: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate
    }
  }, [indeterminate])

  return (
    <div className="matcher-group-label">
      <input ref={ref} type="checkbox" checked={checked} onChange={onChange} />
      <button type="button" className="matcher-group-toggle" onClick={onToggleCollapse}>
        <span className="matcher-caret">{collapsed ? '▸' : '▾'}</span>
        <span className="matcher-group-name">{label}</span>
        <em className="matcher-group-count">{count}</em>
      </button>
    </div>
  )
}

function MatcherLeaf({
  matcher,
  checked,
  onToggle,
}: {
  matcher: RuleRecordDto
  checked: boolean
  onToggle: () => void
}) {
  const typeLabel = matcher.matchType === 'regex' ? '正则' : '关键字'
  return (
    <label
      className="matcher-leaf"
      title={`${matcherLabel(matcher)} · ${typeLabel} · ${matcher.pattern ?? ''}`}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="matcher-leaf-name">{matcherLabel(matcher)}</span>
      <em className="matcher-leaf-type">{typeLabel}</em>
    </label>
  )
}

const UNGROUPED_KEY = '__ungrouped__'

export default function MatcherSelectTree({
  scenarios,
  matchers,
  selectedIds,
  onChange,
}: MatcherSelectTreeProps) {
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const { byScenario, ungrouped } = useMemo(() => {
    const byScenario = new Map<string, RuleRecordDto[]>()
    const ungrouped: RuleRecordDto[] = []
    for (const matcher of matchers) {
      if (matcher.scenarios.length === 0) {
        ungrouped.push(matcher)
        continue
      }
      for (const scenarioId of matcher.scenarios) {
        const list = byScenario.get(scenarioId) ?? []
        list.push(matcher)
        byScenario.set(scenarioId, list)
      }
    }
    return { byScenario, ungrouped }
  }, [matchers])

  const allSelected = (ids: string[]) => ids.length > 0 && ids.every((id) => selectedSet.has(id))
  const someSelected = (ids: string[]) => ids.some((id) => selectedSet.has(id))

  const toggleId = (id: string) => {
    const next = new Set(selectedSet)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onChange(Array.from(next))
  }

  const toggleIds = (ids: string[]) => {
    const next = new Set(selectedSet)
    if (allSelected(ids)) {
      ids.forEach((id) => next.delete(id))
    } else {
      ids.forEach((id) => next.add(id))
    }
    onChange(Array.from(next))
  }

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const renderLeaf = (matcher: RuleRecordDto) => (
    <MatcherLeaf
      key={matcher.id}
      matcher={matcher}
      checked={selectedSet.has(matcher.id)}
      onToggle={() => toggleId(matcher.id)}
    />
  )

  return (
    <div className="matcher-tree">
      {ungrouped.length > 0 ? (
        <div className="matcher-group">
          <GroupCheckbox
            checked={allSelected(ungrouped.map((matcher) => matcher.id))}
            indeterminate={someSelected(ungrouped.map((matcher) => matcher.id))}
            label="未归属场景"
            count={ungrouped.length}
            collapsed={collapsedGroups.has(UNGROUPED_KEY)}
            onChange={() => toggleIds(ungrouped.map((matcher) => matcher.id))}
            onToggleCollapse={() => toggleGroup(UNGROUPED_KEY)}
          />
          {collapsedGroups.has(UNGROUPED_KEY) ? null : (
            <div className="matcher-group-children">{ungrouped.map(renderLeaf)}</div>
          )}
        </div>
      ) : null}

      {scenarios.map((scenario) => {
        const children = byScenario.get(scenario.id) ?? []
        if (children.length === 0) return null
        const childIds = children.map((matcher) => matcher.id)
        return (
          <div className="matcher-group" key={scenario.id}>
            <GroupCheckbox
              checked={allSelected(childIds)}
              indeterminate={someSelected(childIds)}
              label={scenario.name}
              count={children.length}
              collapsed={collapsedGroups.has(scenario.id)}
              onChange={() => toggleIds(childIds)}
              onToggleCollapse={() => toggleGroup(scenario.id)}
            />
            {collapsedGroups.has(scenario.id) ? null : (
              <div className="matcher-group-children">{children.map(renderLeaf)}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
