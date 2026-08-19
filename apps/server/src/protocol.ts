import { z } from 'zod'

/**
 * ccweb WebSocket 协议 v1(SPEC §4)
 * - 所有 S→C 消息带递增 seq,客户端重连后以 lastSeq 对账
 * - 错误结构化(code / message / retry),前端据此渲染错误态
 */

// ---------- C→S ----------

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('prompt'), sessionId: z.string().optional(), text: z.string().min(1) }),
  z.object({ t: z.literal('interrupt') }),
  z.object({ t: z.literal('abort') }),
  z.object({
    t: z.literal('permission.resolve'),
    requestId: z.string(),
    allow: z.boolean(),
    updatedInput: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({ t: z.literal('session.new') }),
  z.object({ t: z.literal('session.list') }),
  z.object({ t: z.literal('ping'), lastSeq: z.number().int().optional() }),
])

export type ClientMessage = z.infer<typeof clientMessageSchema>

// ---------- S→C ----------

export type ServerMessage =
  | { t: 'init'; seq: number; sessionId: string | null; model: string | null; endpoint: string | null }
  | { t: 'delta'; seq: number; sessionId: string; kind: 'text' | 'thinking'; text: string }
  | { t: 'message'; seq: number; sessionId: string; sdkMessage: unknown }
  | {
      t: 'permission.ask'
      seq: number
      requestId: string
      sessionId: string
      toolName: string
      input: Record<string, unknown>
    }
  | { t: 'permission.resolved'; seq: number; requestId: string; allow: boolean }
  | { t: 'metrics'; seq: number; sessionId: string; metrics: SessionMetrics }
  | { t: 'error'; seq: number; code: string; message: string; retry?: boolean }
  | { t: 'pong'; seq: number }

/** 底栏指标条(SPEC §5 口径) */
export interface SessionMetrics {
  /** 会话内用户消息数 */
  turns: number
  /** 权威累计 input tokens(result.modelUsage,含 subagent) */
  inputTokens: number
  /** 权威累计 output tokens */
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  /** 本次 LLM 回转 TTFT,毫秒;未产生则 null */
  ttftMs: number | null
  /** 本次回转输出速度 tokens/s;进行中为滚动值 */
  tokensPerSecond: number | null
  /** 缓存命中率:cache_read / (cache_read + cache_creation + input) */
  cacheHitRate: number | null
  /** 客户端估算成本(SDK total_cost_usd) */
  totalCostUsd: number | null
}
