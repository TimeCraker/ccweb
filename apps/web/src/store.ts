import { create } from 'zustand'
import type { SessionMetrics } from './types'

export interface ChatEntry {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
}

export interface PermissionRequest {
  requestId: string
  toolName: string
  input: Record<string, unknown>
}

export type ConnState = 'connecting' | 'open' | 'closed'

interface AppState {
  conn: ConnState
  sessionId: string | null
  model: string | null
  endpoint: string | null
  entries: ChatEntry[]
  metrics: SessionMetrics | null
  permissions: PermissionRequest[]
  error: string | null
  busy: boolean

  setConn: (c: ConnState) => void
  applyInit: (p: { sessionId: string | null; model: string | null; endpoint: string | null }) => void
  appendUser: (text: string) => void
  appendDelta: (text: string) => void
  finishStream: () => void
  setMetrics: (m: SessionMetrics) => void
  pushPermission: (p: PermissionRequest) => void
  resolvePermissionLocal: (requestId: string) => void
  setError: (e: string | null) => void
  setBusy: (b: boolean) => void
}

let assistantSeq = 0
const nextId = () => `a${++assistantSeq}`

export const useStore = create<AppState>((set) => ({
  conn: 'connecting',
  sessionId: null,
  model: null,
  endpoint: null,
  entries: [],
  metrics: null,
  permissions: [],
  error: null,
  busy: false,

  setConn: (conn) => set({ conn }),
  applyInit: ({ sessionId, model, endpoint }) => set({ sessionId, model, endpoint }),
  appendUser: (text) =>
    set((s) => ({ entries: [...s.entries, { id: nextId(), role: 'user', text }], busy: true })),
  appendDelta: (text) =>
    set((s) => {
      const last = s.entries[s.entries.length - 1]
      if (last && last.role === 'assistant' && last.streaming) {
        const entries = s.entries.slice(0, -1)
        return { entries: [...entries, { ...last, text: last.text + text }] }
      }
      return { entries: [...s.entries, { id: nextId(), role: 'assistant', text, streaming: true }] }
    }),
  finishStream: () =>
    set((s) => {
      const last = s.entries[s.entries.length - 1]
      if (last?.streaming) {
        return { entries: [...s.entries.slice(0, -1), { ...last, streaming: false }], busy: false }
      }
      return { busy: false }
    }),
  setMetrics: (metrics) => set({ metrics }),
  pushPermission: (p) => set((s) => ({ permissions: [...s.permissions, p] })),
  resolvePermissionLocal: (requestId) =>
    set((s) => ({ permissions: s.permissions.filter((p) => p.requestId !== requestId) })),
  setError: (error) => set({ error }),
  setBusy: (busy) => set({ busy }),
}))
