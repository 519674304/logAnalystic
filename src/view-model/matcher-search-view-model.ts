import type { RuleRecordDto } from '../api/dto'

/** 转义正则元字符，把关键字 matcher 的 pattern 当字面量嵌入正则。 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 把勾选的 matcher 合成一个「取并集(OR)」的正则：
 * - keyword 类型先转义成字面量；
 * - regex 类型原样包裹在 `(?:…)` 里，保留其 `^`/`$` 等锚点的分支语义。
 *
 * 无有效 pattern 时返回 null（调用方据此提示未选 matcher）。
 */
export function buildMatcherSearchRegex(matchers: RuleRecordDto[]): string | null {
  const branches = matchers
    .map((matcher) => {
      const pattern = matcher.pattern?.trim()
      if (!pattern) return null
      return matcher.matchType === 'regex' ? `(?:${pattern})` : `(?:${escapeRegExp(pattern)})`
    })
    .filter((branch): branch is string => branch !== null)

  if (branches.length === 0) return null
  return branches.join('|')
}
