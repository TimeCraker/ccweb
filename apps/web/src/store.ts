import { create } from 'zustand'
import type { SessionMetrics } from './types'
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
  entries: Entry[]
  metrics: SessionMetrics | null
  context: ContextUsage | null
  permissions: PermissionRequest[]
  error: string | null
  busy: boolean

  setConn: (c: ConnState) => void
  applyInit: (p: { sessionId: string | null; model: string | null; endpoint: string | null }) => void
  appendUser: (text: string) => void
  onBlockStart: (ev: { blockType: 'thinking' | 'text' | 'tool_use'; index: number; toolUseId?: string; toolName?: string }) => void
  onDelta: (ev: { kind: 'text' | 'thinking' | 'tool_input'; text: string; toolUseId?: string }) => void
  onBlockStop: (index: number) => void
  onAssistantMessage: (msg: unknown) => void
  onUserMessage: (msg: unknown) => void
  finishTurn: () => void
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
  entries: [],
  metrics: null,
  context: null,
  permissions: [],
  error: null,
  busy: false,

  setConn: (conn) => set({ conn }),
  applyInit: ({ sessionId, model, endpoint }) => set({ sessionId, model, endpoint }),
  appendUser: (text) =>
    set((s) => ({
      entries: [...s.entries, { type: 'user' as const, id: nextEntryId(), text }],
      busy: true,
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
      if (!t) return { busy: false }
      const entries = s.entries.map((e) =>
        e.type === 'turn' && e.id === (t as TurnEntry).id ? { ...e, done: true } : e,
      )
      return { entries, busy: false }
    }),
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
