import { useMemo, useState } from 'react'
import type * as React from 'react'
import type { LatencyTableColumnViewModel, LatencyTableViewModel } from '../../view-model/latency-view-model'

const PAGE_SIZE = 10
const MAX_ROWS = 100
const DEFAULT_COL_WIDTH = 140
const MIN_COL_WIDTH = 60

type LatencyDetailTableProps = {
  table: LatencyTableViewModel
  hiddenColumns: Set<string>
  onToggleColumn: (id: string) => void
  onToggleGroup: (group: string) => void
}

/** 把连续的、同 group 的列合并成一组，用于两级表头与列选择器。 */
function groupColumns(columns: LatencyTableColumnViewModel[]) {
  const groups: Array<{ group: string; columns: LatencyTableColumnViewModel[] }> = []
  for (const column of columns) {
    const last = groups[groups.length - 1]
    if (last && last.group === column.group) {
      last.columns.push(column)
    } else {
      groups.push({ group: column.group, columns: [column] })
    }
  }
  return groups
}

export default function LatencyDetailTable({ table, hiddenColumns, onToggleColumn, onToggleGroup }: LatencyDetailTableProps) {
  const [page, setPage] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [idColWidth, setIdColWidth] = useState(168)
  const [totalColWidth, setTotalColWidth] = useState(72)
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})

  const visibleColumns = table.columns.filter((column) => !hiddenColumns.has(column.id))
  const headerGroups = useMemo(() => groupColumns(visibleColumns), [visibleColumns])
  const pickerGroups = useMemo(() => groupColumns(table.columns), [table.columns])

  // 每个 group 的第一列，用于在组与组之间画竖线分隔，让 group 名与其下的列在视觉上成组。
  const groupStarts = useMemo(() => {
    const starts = new Set<string>()
    for (const group of headerGroups) {
      if (group.columns.length > 0) {
        starts.add(group.columns[0].id)
      }
    }
    return starts
  }, [headerGroups])

  // 每个列所属的分组序号，用于给同组的列/单元格上同一色带，让分组表头与列强对应。
  const columnGroupIndex = useMemo(() => {
    const map = new Map<string, number>()
    headerGroups.forEach((group, index) => {
      for (const column of group.columns) {
        map.set(column.id, index)
      }
    })
    return map
  }, [headerGroups])

  const totalRows = Math.min(table.rows.length, MAX_ROWS)
  const pageCount = Math.max(1, Math.ceil(totalRows / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = table.rows.slice(0, totalRows).slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const getColumnWidth = (id: string) => columnWidths[id] ?? DEFAULT_COL_WIDTH

  const beginResize = (
    currentWidth: number,
    apply: (width: number) => void,
    startEvent: React.MouseEvent<HTMLSpanElement>,
  ) => {
    startEvent.preventDefault()
    startEvent.stopPropagation()
    const startX = startEvent.clientX
    const onMove = (moveEvent: MouseEvent) => {
      apply(Math.max(MIN_COL_WIDTH, Math.round(currentWidth + moveEvent.clientX - startX)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="latency-table">
      <div className="latency-table-toolbar">
        <div className="latency-table-column-control">
          <button type="button" className="ghost-button" onClick={() => setPickerOpen((value) => !value)}>
            列
          </button>
          {pickerOpen ? (
            <div className="column-picker">
              {pickerGroups.map((group) => (
                <div key={group.group} className="column-picker-group">
                  <label className="check-field column-picker-group-label">
                    <input
                      type="checkbox"
                      checked={group.columns.every((column) => !hiddenColumns.has(column.id))}
                      onChange={() => onToggleGroup(group.group)}
                    />
                    <span>{group.group}</span>
                  </label>
                  <div className="column-picker-items">
                    {group.columns.map((column) => (
                      <label key={column.id} className="check-field">
                        <input
                          type="checkbox"
                          checked={!hiddenColumns.has(column.id)}
                          onChange={() => onToggleColumn(column.id)}
                        />
                        <span>{column.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="latency-table-pager">
          <span className="muted">共 {totalRows} 请求</span>
          <button type="button" className="ghost-button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            上一页
          </button>
          <span className="muted">
            {safePage + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="ghost-button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            下一页
          </button>
        </div>
      </div>

      {table.columns.length === 0 ? (
        <p className="muted">暂无明细数据，请先运行分析。</p>
      ) : (
        <div className="latency-table-scroll">
          <table className="latency-table-table">
            <colgroup>
              <col style={{ width: idColWidth }} />
              <col style={{ width: totalColWidth }} />
              {visibleColumns.map((column) => (
                <col key={column.id} style={{ width: getColumnWidth(column.id) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="latency-table-head latency-table-id" rowSpan={2} style={{ left: 0 }}>
                  请求标识
                  <span
                    className="col-resize-handle"
                    onMouseDown={(event: React.MouseEvent<HTMLSpanElement>) => beginResize(idColWidth, setIdColWidth, event)}
                  />
                </th>
                <th className="latency-table-head latency-table-total" rowSpan={2} style={{ left: idColWidth }}>
                  总耗时
                  <span
                    className="col-resize-handle"
                    onMouseDown={(event: React.MouseEvent<HTMLSpanElement>) => beginResize(totalColWidth, setTotalColWidth, event)}
                  />
                </th>
                {headerGroups.map((group, index) => (
                  <th key={group.group} className={`latency-table-head latency-table-group-head latency-table-band-${index % 2}`} colSpan={group.columns.length}>
                    {group.group}
                  </th>
                ))}
              </tr>
              <tr>
                {headerGroups.flatMap((group) =>
                  group.columns.map((column) => (
                    <th
                      key={column.id}
                      className={`latency-table-head ${groupStarts.has(column.id) ? 'latency-table-group-start' : ''} latency-table-band-${(columnGroupIndex.get(column.id) ?? 0) % 2}`}
                    >
                      {column.name}
                      <span
                        className="col-resize-handle"
                        onMouseDown={(event: React.MouseEvent<HTMLSpanElement>) =>
                          beginResize(
                            getColumnWidth(column.id),
                            (width) => setColumnWidths((prev) => ({ ...prev, [column.id]: width })),
                            event,
                          )
                        }
                      />
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.requestId}>
                  <td className="latency-table-cell latency-table-id" style={{ left: 0 }}>
                    {row.requestId}
                  </td>
                  <td className="latency-table-cell latency-table-total" style={{ left: idColWidth }}>
                    {row.totalMs}ms
                  </td>
                  {visibleColumns.map((column) => {
                    const value = row.cells[column.id]
                    return (
                      <td
                        key={column.id}
                        className={`latency-table-cell ${groupStarts.has(column.id) ? 'latency-table-group-start' : ''} latency-table-band-${(columnGroupIndex.get(column.id) ?? 0) % 2}`}
                      >
                        {value === undefined ? '-' : `${value}ms`}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
