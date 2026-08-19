import type { SessionMetrics } from './protocol.js'

/** 指标累加器(SPEC §5):只存原始数据;派生指标(命中率)由 computeMetrics 现算 */
export interface MetricsAccumulator {
  turns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  ttftMs: number | null
  tokensPerSecond: number | null
  totalCostUsd: number | null
}

export function newAccumulator(): MetricsAccumulator {
  return {
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    ttftMs: null,
    tokensPerSecond: null,
    totalCostUsd: null,
  }
}

export function computeMetrics(acc: MetricsAccumulator): SessionMetrics {
  const totalInput = acc.cacheReadTokens + acc.cacheCreationTokens + acc.inputTokens
  return {
    turns: acc.turns,
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    cacheReadTokens: acc.cacheReadTokens,
    cacheCreationTokens: acc.cacheCreationTokens,
    ttftMs: acc.ttftMs,
    tokensPerSecond: acc.tokensPerSecond,
    cacheHitRate: totalInput > 0 ? acc.cacheReadTokens / totalInput : null,
    totalCostUsd: acc.totalCostUsd,
  }
}
