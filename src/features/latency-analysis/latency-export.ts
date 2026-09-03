import type { RequestViewModel } from '../../view-model/latency-view-model'

const maxTableRows = 1000

function csvCell(value: string | number | undefined) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function csvTimestampCell(value: string | number | undefined) {
  const text = String(value ?? '')
  if (text === '') return '""'
  return `"'${text.replace(/"/g, '""')}"`
}

function csvRow(values: Array<string | number | undefined>) {
  return values.map(csvCell).join(',')
}

export function buildLatencyExportCsv(viewModel: RequestViewModel, hiddenColumns: Set<string>) {
  const table = viewModel.table
  const columns = table ? table.columns.filter((column) => !hiddenColumns.has(column.id)) : []
  const rows = [
    csvRow(['请求标识', '总耗时(ms)', ...columns.map((column) => column.group)]),
    csvRow(['', '', ...columns.map((column) => `${column.name}(ms)`)]),
  ]
  if (table) {
    for (const row of table.rows.slice(0, maxTableRows)) {
      rows.push(
        [
          csvTimestampCell(row.requestId),
          csvCell(row.totalMs),
          ...columns.map((column) => csvCell(row.cells[column.id])),
        ].join(','),
      )
    }
  }
  return `\uFEFF${rows.join('\r\n')}`
}

export function downloadCsv(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
