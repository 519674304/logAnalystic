import type { IssueRule } from '../../app/app-state'

type RuleCatalogPanelProps = {
  rules: IssueRule[]
}

export default function RuleCatalogPanel({ rules }: RuleCatalogPanelProps) {
  return (
    <section className="panel">
      <div className="panel-title-row">
        <h2>规则配置</h2>
        <span>{rules.length} 条示例规则</span>
      </div>

      <div className="rule-list">
        {rules.map((rule) => (
          <div key={rule.id} className="rule-item">
            <div className="rule-head">
              <strong>{rule.pattern}</strong>
              <span className={`severity ${rule.severity.toLowerCase()}`}>{rule.severity}</span>
            </div>
            <p>{rule.explanation}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
