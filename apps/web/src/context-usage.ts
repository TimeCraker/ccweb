/** Use one native contract for both the detail panel and the status strip. */
export function contextUsage(raw: Record<string, unknown> | null | undefined): { used: number; max: number; percentage: number } | null {
  if (!raw) return null
  if (raw.usage && typeof raw.usage === 'object') raw = raw.usage as Record<string, unknown>
  const number = (...values: unknown[]): number | null => {
    const value = values.find(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)
    return typeof value === 'number' ? value : null
  }
  const used = number(raw.totalTokens, raw.total_tokens, raw.usedTokens, raw.used_tokens, raw.inputTokens, raw.contextTokens)
  const max = number(raw.rawMaxTokens, raw.raw_max_tokens, raw.maxTokens, raw.max_tokens, raw.contextWindow, raw.contextLimit)
  if (used === null || max === null || max === 0) return null
  return { used, max, percentage: used * 100 / max }
}
