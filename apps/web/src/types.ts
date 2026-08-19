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

export interface SessionMeta {
  id: string
  title: string
  lastModified: string | null
  gitBranch: string | null
}

export interface SettingsSnapshot {
  model: string | null
  permissionMode: string | null
  effort: string | null
  endpointTemplate: string | null
  currentEndpoint: string | null
  currentModel: string | null
  endpoints: Array<{ key: string; name: string; baseUrl: string | null }>
  workspaces: Array<{ dir: string; sessions: number; lastModified: string | null }>
  workspace: string | null
  skills: Array<{ name: string; description: string }>
  rules: Array<{ name: string; size: number }>
  claudeMd: string | null
  slashCommands: Array<{ name: string; description: string }>
}

export interface ServerMessage {
  t: string
  seq?: number
  sessionId?: string | null
  model?: string | null
  endpoint?: string | null
  slashCommands?: Array<{ name: string; description: string }>
  action?: 'start' | 'stop'
  blockType?: 'thinking' | 'text' | 'tool_use'
  index?: number
  kind?: 'text' | 'thinking' | 'tool_input'
  text?: string
  toolUseId?: string
  toolName?: string
  sdkMessage?: unknown
  requestId?: string
  input?: Record<string, unknown>
  allow?: boolean
  metrics?: SessionMetrics
  usage?: unknown
  sessions?: SessionMeta[]
  messages?: unknown[]
  settings?: SettingsSnapshot
  servers?: Array<{ name: string; status: string }>
  code?: string
  message?: string
  retry?: boolean
}

export interface ClientMessage {
  t: string
  [key: string]: unknown
}
