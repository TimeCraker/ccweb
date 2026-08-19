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
    /** 会话级总是允许该工具(server 侧 allowlist,后续同工具自动放行) */
    always: z.boolean().optional(),
  }),
  z.object({ t: z.literal('session.new') }),
  z.object({ t: z.literal('session.list') }),
  z.object({ t: z.literal('session.open'), sessionId: z.string(), fork: z.boolean().optional() }),
  z.object({ t: z.literal('session.rename'), sessionId: z.string(), title: z.string().min(1) }),
  z.object({ t: z.literal('ping'), lastSeq: z.number().int().optional() }),
])

export type ClientMessage = z.infer<typeof clientMessageSchema>

// ---------- S→C ----------

export type ServerMessage =
  | { t: 'init'; seq: number; sessionId: string | null; model: string | null; endpoint: string | null }
  | {
      t: 'delta'
      seq: number
      sessionId: string
      kind: 'text' | 'thinking' | 'tool_input'
      text: string
      toolUseId?: string
    }
  | {
      t: 'block'
      seq: number
      sessionId: string
      action: 'start' | 'stop'
      blockType: 'thinking' | 'text' | 'tool_use'
      index: number
      toolUseId?: string
      toolName?: string
    }
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
  | { t: 'context'; seq: number; sessionId: string; usage: unknown }
  | { t: 'sessions'; seq: number; sessions: SessionMeta[] }
  | { t: 'history'; seq: number; sessionId: string; messages: unknown[] }
  | { t: 'cleared'; seq: number }
  | { t: 'error'; seq: number; code: string; message: string; retry?: boolean }
  | { t: 'pong'; seq: number }

/** 会话列表条目(SDK listSessions 归一化) */
export interface SessionMeta {
  id: string
  title: string
  lastModified: string | null
  gitBranch: string | null
}

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
