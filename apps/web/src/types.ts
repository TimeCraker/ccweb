/** 与 server/src/protocol.ts 对应的前端侧类型(P0 子集) */

export interface SessionMetrics {
  turns: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  ttftMs: number | null
  tokensPerSecond: number | null
  cacheHitRate: number | null
  totalCostUsd: number | null
}

export interface ServerMessage {
  t: string
  seq?: number
  sessionId?: string | null
  model?: string | null
  endpoint?: string | null
  kind?: 'text' | 'thinking'
  text?: string
  sdkMessage?: unknown
  requestId?: string
  toolName?: string
  input?: Record<string, unknown>
  allow?: boolean
  metrics?: SessionMetrics
  code?: string
  message?: string
  retry?: boolean
}

export interface ClientMessage {
  t: string
  [key: string]: unknown
}
