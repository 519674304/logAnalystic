import type { ReactNode } from 'react'

export type HeroStat = {
  value: string
  label: string
}

type AppShellProps = {
  eyebrow: string
  title: string
  copy: string
  stats: HeroStat[]
  children: ReactNode
}

export default function AppShell({ eyebrow, title, copy, stats, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="hero-card">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="hero-copy">{copy}</p>
        </div>
        <div className="hero-stats">
          {stats.map((item) => (
            <div key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </header>
      <main className="grid">{children}</main>
    </div>
  )
}
