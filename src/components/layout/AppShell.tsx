import type { ReactNode } from 'react'

export type WorkbenchTab = {
  id: string
  label: string
  badge?: string
}

type AppShellProps = {
  activeTabId: string
  tabs: WorkbenchTab[]
  onTabChange: (tabId: string) => void
  workspaceControls?: ReactNode
  children: ReactNode
}

export default function AppShell({
  activeTabId,
  tabs,
  onTabChange,
  workspaceControls,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="workbench-header">
        <div>
          <p className="eyebrow">Local Desktop Tool</p>
          <h1>日志分析工作台</h1>
        </div>

        {workspaceControls ? <div className="workbench-scope-bar">{workspaceControls}</div> : null}

        <div className="header-actions">
          <span className="status-chip">规则集: M0 示例</span>
          <span className="status-chip">性能目标: 常用操作 1s 内</span>
        </div>
      </header>

      <nav className="tab-bar" aria-label="工作台功能">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-button ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.badge ? <strong>{tab.badge}</strong> : null}
          </button>
        ))}
      </nav>

      <main className="tab-content">{children}</main>

      <footer className="workbench-footer">
        <span>本地桌面模式</span>
        <span>当前阶段: M0 基础前端与日志搜索验证</span>
        <span>时延分析: 请求泳道 + 步骤树 + 区间统计</span>
      </footer>
    </div>
  )
}
