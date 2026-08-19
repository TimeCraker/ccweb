import { create } from 'zustand'
import type { SessionMetrics, SessionMeta, SettingsSnapshot } from './types'
import {
  type Entry,
  type TurnEntry,
  nextEntryId,
  applyBlockStart,
  applyDelta,
  applyBlockStop,
  reconcileAssistant,
  applyToolResults,
  currentTurn,
} from './render/blocks'

export interface PermissionRequest {
  requestId: string
  toolName: string
  input: Record<string, unknown>
}

export type ConnState = 'connecting' | 'open' | 'closed'

export interface ContextUsage {
  raw: Record<string, unknown>
}

interface AppState {
  conn: ConnState
  sessionId: string | null
  model: string | null
  endpoint: string | null
  sessions: SessionMeta[]
  entries: Entry[]
  metrics: SessionMetrics | null
  context: ContextUsage | null
  permissions: PermissionRequest[]
  error: string | null
  busy: boolean
  /** 本轮开始时间戳(运行计时行 + turn 尾统计) */
  turnStartedAt: number | null
  /** 上一轮完成时的统计(turn 尾渲染) */
  lastTurnStats: { totalS: number; ttftMs: number | null; tps: number | null } | null
  settings: SettingsSnapshot | null
  mcpServers: Array<{ name: string; status: string }>
  slashCommands: Array<{ name: string; description: string }>
  /** 排队待处理消息(dsh QueueDock 对齐) */
  queue: Array<{ uuid: string; text: string }>

  setConn: (c: ConnState) => void
  applyInit: (p: { sessionId: string | null; model: string | null; endpoint: string | null }) => void
  setSessions: (list: SessionMeta[]) => void
  setSettings: (s: SettingsSnapshot) => void
  setMcp: (list: Array<{ name: string; status: string }>) => void
  setSlashCommands: (list: Array<{ name: string; description: string }>) => void
  setQueue: (items: Array<{ uuid: string; text: string }>) => void
  appendUser: (text: string) => void
  onBlockStart: (ev: { blockType: 'thinking' | 'text' | 'tool_use'; index: number; toolUseId?: string; toolName?: string }) => void
  onDelta: (ev: { kind: 'text' | 'thinking' | 'tool_input'; text: string; toolUseId?: string }) => void
  onBlockStop: (index: number) => void
  onAssistantMessage: (msg: unknown) => void
  onUserMessage: (msg: unknown) => void
  finishTurn: () => void
  replayHistory: (messages: unknown[]) => void
  clearView: () => void
  setMetrics: (m: SessionMetrics) => void
  setContext: (raw: Record<string, unknown>) => void
  pushPermission: (p: PermissionRequest) => void
  resolvePermissionLocal: (requestId: string) => void
  setError: (e: string | null) => void
  setBusy: (b: boolean) => void
}

export const useStore = create<AppState>((set) => ({
  conn: 'connecting',
  sessionId: null,
  model: null,
  endpoint: null,
  sessions: [],
  entries: [],
  metrics: null,
  context: null,
  permissions: [],
  error: null,
  busy: false,
  turnStartedAt: null,
  lastTurnStats: null,
  settings: null,
  mcpServers: [],
  slashCommands: [],
  queue: [],

  setConn: (conn) => set({ conn }),
  applyInit: ({ sessionId, model, endpoint }) => set({ sessionId, model, endpoint }),
  setSessions: (sessions) => set({ sessions }),
  setSettings: (settings) => set({ settings }),
  setMcp: (mcpServers) => set({ mcpServers }),
  setSlashCommands: (slashCommands) => set({ slashCommands }),
  setQueue: (queue) => set({ queue }),
  appendUser: (text) =>
    set((s) => ({
      entries: [...s.entries, { type: 'user' as const, id: nextEntryId(), text }],
      busy: true,
      turnStartedAt: Date.now(),
      lastTurnStats: null,
    })),
  onBlockStart: (ev) => set((s) => ({ entries: applyBlockStart(s.entries, ev) })),
  onDelta: (ev) => set((s) => ({ entries: applyDelta(s.entries, ev) })),
  onBlockStop: (index) => set((s) => ({ entries: applyBlockStop(s.entries, index) })),
  onAssistantMessage: (msg) =>
    set((s) => ({
      entries: reconcileAssistant(
        s.entries,
        msg as Parameters<typeof reconcileAssistant>[1],
      ),
    })),
  onUserMessage: (msg) =>
    set((s) => ({
      entries: applyToolResults(s.entries, msg as Parameters<typeof applyToolResults>[1]),
    })),
  finishTurn: () =>
    set((s) => {
      const t = currentTurn(s.entries)
      const totalS = s.turnStartedAt ? (Date.now() - s.turnStartedAt) / 1000 : 0
      const stats = {
        totalS,
        ttftMs: s.metrics?.ttftMs ?? null,
        tps: s.metrics?.tokensPerSecond ?? null,
      }
      if (!t) return { busy: false, turnStartedAt: null, lastTurnStats: stats }
      const entries = s.entries.map((e) =>
        e.type === 'turn' && e.id === (t as TurnEntry).id
          ? { ...e, done: true, tail: stats }
          : e,
      )
      return { entries, busy: false, turnStartedAt: null, lastTurnStats: stats }
    }),
  /** 历史回放:顺序跑渲染模型(user 文本入列、assistant 对账、tool_result 回填) */
  replayHistory: (messages) => {
    set({ entries: [], busy: false, permissions: [] })
    for (const raw of messages) {
      const m = raw as { type?: string; message?: { content?: unknown } } | null
      if (!m?.type) continue
      const st = useStore.getState()
      if (m.type === 'user') {
        const content = m.message?.content
        const texts: string[] = []
        let hasToolResult = false
        if (typeof content === 'string') {
          texts.push(content)
        } else if (Array.isArray(content)) {
          for (const c of content) {
            if (c && typeof c === 'object' && 'type' in c) {
              const block = c as { type: string; text?: unknown }
              if (block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
              if (block.type === 'tool_result') hasToolResult = true
            }
          }
        }
        for (const t of texts) {
          useStore.setState((s) => ({
            entries: [...s.entries, { type: 'user' as const, id: nextEntryId(), text: t }],
          }))
        }
        if (hasToolResult) st.onUserMessage(m)
      } else if (m.type === 'assistant') {
        st.onAssistantMessage(m)
        st.finishTurn()
      }
    }
  },
  clearView: () => set({ entries: [], permissions: [], error: null, busy: false }),
  setMetrics: (metrics) => set({ metrics }),
  setContext: (raw) => set({ context: { raw } }),
  pushPermission: (p) => set((s) => ({ permissions: [...s.permissions, p] })),
  resolvePermissionLocal: (requestId) =>
    set((s) => ({ permissions: s.permissions.filter((p) => p.requestId !== requestId) })),
  setError: (error) => set({ error }),
  setBusy: (busy) => set({ busy }),
}))

/** 供组件选择的 helper:忽略空 turn(无内容且已结束) */
export function visibleEntries(entries: Entry[]): Entry[] {
  return entries.filter((e) => {
    if (e.type !== 'turn') return true
    return e.blocks.length > 0
  })
}
