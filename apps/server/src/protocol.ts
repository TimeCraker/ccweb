import { z } from 'zod'

/**
 * ccweb WebSocket 协议 v1(SPEC §4)
 * - 所有 S→C 消息带递增 seq,客户端重连后以 lastSeq 对账
 * - 错误结构化(code / message / retry),前端据此渲染错误态
 */

// ---------- C→S ----------

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('prompt'),
    sessionId: z.string().optional(),
    text: z.string().min(1),
    /** 附件图片(data:image/png;base64,…) */
    images: z.array(z.string().max(7 * 1024 * 1024).regex(/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/)).max(5).optional(),
  }),
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
  z.object({ t: z.literal('session.open'), sessionId: z.string(), fork: z.boolean().optional(), upToMessageId: z.string().uuid().optional() }),
  z.object({ t: z.literal('session.rename'), sessionId: z.string(), title: z.string().min(1) }),
  z.object({ t: z.literal('session.delete'), sessionId: z.string(), title: z.string().max(200).optional() }),
  z.object({ t: z.literal('queue.resume') }),
  z.object({ t: z.literal('queue.delete'), uuid: z.string() }),
  z.object({
    t: z.literal('workspace.set'),
    dir: z.string().min(1),
  }),
  z.object({ t: z.literal('files.search'), query: z.string() }),
  z.object({ t: z.literal('settings.get') }),
  z.object({
    t: z.literal('settings.patch'),
    /**
     * 作用范围:
     * session = 只应用到当前对话(模型/工作方式)
     * default = 只保存为新会话默认
     * both    = 兼容旧客户端的默认行为
     */
    scope: z.enum(['session', 'default', 'both']).optional(),
    patch: z.object({
      authentication: z.enum(['inherit', 'native']).optional(),
      model: z.string().nullable().optional(),
      permissionMode: z.enum(['auto', 'default', 'acceptEdits', 'plan', 'bypassPermissions']).nullable().optional(),
      effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).nullable().optional(),
      endpointTemplate: z.string().nullable().optional(),
      contextScope: z.enum(['full', 'project', 'none']).optional(),
    }),
  }),
  z.object({ t: z.literal('mcp.status') }),
  z.object({ t: z.literal('mcp.control'), name: z.string().min(1), action: z.enum(['reconnect', 'enable', 'disable']) }),
  z.object({ t: z.literal('models.list') }),
  z.object({ t: z.literal('task.stop'), taskId: z.string().min(1) }),
  z.object({ t: z.literal('files.rewind'), userMessageId: z.string().uuid(), dryRun: z.boolean() }),
  z.object({ t: z.literal('request.status'), commandId: z.string().uuid() }),
  z.object({ t: z.literal('ping'), lastSeq: z.number().int().optional() }),
]).and(z.object({ commandId: z.string().uuid().optional() }))

export type ClientMessage = z.infer<typeof clientMessageSchema>

// ---------- S→C ----------

export type ServerMessage =
  | { t: 'accepted'; seq: number; sessionId: string; runId: string; text: string; images?: string[] }
  | { t: 'state'; seq: number; sessionId: string; state: string }
  | { t: 'ack'; seq: number; requestId: string; ok: boolean }

  | {
      t: 'init'
      seq: number
      sessionId: string | null
      model: string | null
      endpoint: string | null
      slashCommands: Array<{ name: string; description: string }>
    }
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
      title?: string
      description?: string
      plan?: string
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
  | { t: 'files'; seq: number; files: string[] }
  | { t: 'queue'; seq: number; items: Array<{ uuid: string; text: string }> }
  | { t: 'history'; seq: number; sessionId: string; messages: unknown[] }
  | { t: 'settings'; seq: number; settings: SettingsSnapshot }
  | { t: 'file.baseline'; seq: number; sessionId: string; toolUseId: string; baseline: { content: string | null; existed: boolean | null; reason?: string } }
  | { t: 'rewind'; seq: number; preview: boolean; result: { canRewind: boolean; error?: string; filesChanged?: string[]; insertions?: number; deletions?: number; skippedLinks?: number } }
  | { t: 'models'; seq: number; models: Array<{ value: string; displayName: string; description: string }> }
  | { t: 'mcpStatus'; seq: number; servers: Array<{ name: string; status: string; error?: string; scope?: string; source?: string; tools?: string[] }> }
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

/** 设置快照(下发前端;端点只带 name/url,无凭证) */
export interface SettingsSnapshot {
  authentication?: 'inherit' | 'native'
  active?: { authentication?: 'inherit' | 'native'; model: string | null; permissionMode: string | null; effort: string | null; contextScope: string; endpointTemplate: string | null }
  /** server 包版本(package.json,前端页脚展示) */
  serverVersion: string
  /** 会话上下文注入档位 */
  contextScope: 'full' | 'project' | 'none'
  model: string | null
  permissionMode: string | null
  effort: string | null
  endpointTemplate: string | null
  /** 真实生效端点(读 ~/.claude/settings.json,非进程 env) */
  currentEndpoint: string | null
  /** 真实生效模型(settings.json env.ANTHROPIC_MODEL) */
  currentModel: string | null
  endpoints: Array<{ key: string; name: string; baseUrl: string | null; model: string | null }>
  workspaces: Array<{ dir: string; sessions: number; lastModified: string | null }>
  workspace: string | null
  skills: Array<{ name: string; description: string }>
  rules: Array<{ name: string; size: number }>
  claudeMd: string | null
  slashCommands: Array<{ name: string; description: string }>
}

/** 底栏指标条(SPEC §5 口径) */
export interface SessionMetrics {
  requests?: Array<{ requestId: string; role: 'main' | 'subagent'; parentToolUseId?: string; streamOpenedAt: number; firstContentAt: number | null; endedAt: number | null; outputTokens: number | null; outputDurationMs: number | null }>
  queueWaitMs?: number
  retries?: Array<{ id: string; attempt: number; delayMs: number; errorStatus: number | null }>
  approvalWaitMs?: number
  toolTimes?: Record<string, number>
  nativeTiming?: { durationMs: number | null; apiDurationMs: number | null; modelUsage: unknown }
  terminalStatus?: 'running' | 'completed' | 'failed' | 'cancelled'
  runId?: string | null
  firstContentMs?: number | null
  speedScope?: 'last_request' | 'turn'
  completedAt?: number | null
  runStartedAt?: number | null
  sampledRequests?: number
  metricsComplete?: boolean
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
