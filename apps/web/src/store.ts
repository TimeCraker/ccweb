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

/** AskUserQuestion 类工具的问题结构(宽松解析 input.questions) */
export interface QuestionOption {
  label: string
  description?: string
}

export interface QuestionItem {
  question: string
  header?: string
  multiSelect?: boolean
  options: QuestionOption[]
}

export interface QuestionRequest {
  requestId: string
  questions: QuestionItem[]
}

/** 从 permission.ask 的 input 中解析 questions;无效/缺失返回 null(走普通审批) */
export function parseQuestions(input: Record<string, unknown>): QuestionItem[] | null {
  const qs = input.questions
  if (!Array.isArray(qs)) return null
  const items: QuestionItem[] = []
  for (const q of qs) {
    if (!q || typeof q !== 'object') continue
    const obj = q as Record<string, unknown>
    const question = typeof obj.question === 'string' ? obj.question : ''
    const options: QuestionOption[] = []
    if (Array.isArray(obj.options)) {
      for (const o of obj.options) {
        if (!o || typeof o !== 'object') continue
        const oo = o as Record<string, unknown>
        if (typeof oo.label !== 'string' || oo.label === '') continue
        options.push({
          label: oo.label,
          description: typeof oo.description === 'string' ? oo.description : undefined,
        })
      }
    }
    if (question === '' || options.length === 0) continue
    items.push({
      question,
      header: typeof obj.header === 'string' ? obj.header : undefined,
      multiSelect: obj.multiSelect === true,
      options,
    })
  }
  return items.length > 0 ? items : null
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
  /** AskUserQuestion 类挂起请求(一次一条,与审批同闸) */
  question: QuestionRequest | null
  error: string | null
  busy: boolean
  /** 本轮开始时间戳(运行计时行 + turn 尾统计) */
  turnStartedAt: number | null
  /** 上一轮完成时的统计(turn 尾渲染) */
  lastTurnStats: { totalS: number; ttftMs: number | null; tps: number | null } | null
  settings: SettingsSnapshot | null
  mcpServers: Array<{ name: string; status: string }>
  slashCommands: Array<{ name: string; description: string }>
  /** @文件补全结果(server files.search 的相对路径列表,≤15) */
  fileResults: string[]
  /** 排队待处理消息(dsh QueueDock 对齐) */
  queue: Array<{ uuid: string; text: string }>

  setConn: (c: ConnState) => void
  applyInit: (p: { sessionId: string | null; model: string | null; endpoint: string | null }) => void
  setSessions: (list: SessionMeta[]) => void
  setSettings: (s: SettingsSnapshot) => void
  setMcp: (list: Array<{ name: string; status: string }>) => void
  setSlashCommands: (list: Array<{ name: string; description: string }>) => void
  setFileResults: (files: string[]) => void
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
  pushQuestion: (q: QuestionRequest) => void
  resolveQuestionLocal: (requestId: string) => void
  pushTurnError: (text: string) => void
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
  question: null,
  error: null,
  busy: false,
  turnStartedAt: null,
  lastTurnStats: null,
  settings: null,
  mcpServers: [],
  slashCommands: [],
  fileResults: [],
  queue: [],

  setConn: (conn) => set({ conn }),
  applyInit: ({ sessionId, model, endpoint }) => set({ sessionId, model, endpoint }),
  setSessions: (sessions) => set({ sessions }),
  setSettings: (settings) => set({ settings }),
  setMcp: (mcpServers) => set({ mcpServers }),
  setSlashCommands: (slashCommands) => set({ slashCommands }),
  setFileResults: (fileResults) => set({ fileResults }),
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
  /** 历史回放:顺序跑渲染模型(与实时流同构--一条用户消息一个 turn,
   * assistant 消息经对账追加,tool_result 回填;新用户消息前收束上一 turn) */
  replayHistory: (messages) => {
    set({ entries: [], busy: false, permissions: [], question: null })
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
        if (hasToolResult) st.onUserMessage(m)
        if (texts.length > 0) {
          st.finishTurn()
          for (const t of texts) {
            useStore.setState((s) => ({
              entries: [...s.entries, { type: 'user' as const, id: nextEntryId(), text: t }],
            }))
          }
        }
      } else if (m.type === 'assistant') {
        st.onAssistantMessage(m)
      }
    }
    useStore.getState().finishTurn()
  },
  clearView: () => set({ entries: [], permissions: [], question: null, error: null, busy: false }),
  setMetrics: (metrics) => set({ metrics }),
  setContext: (raw) => set({ context: { raw } }),
  pushPermission: (p) => set((s) => ({ permissions: [...s.permissions, p] })),
  resolvePermissionLocal: (requestId) =>
    set((s) => ({ permissions: s.permissions.filter((p) => p.requestId !== requestId) })),
  pushQuestion: (question) => set({ question }),
  resolveQuestionLocal: (requestId) =>
    set((s) => (s.question?.requestId === requestId ? { question: null } : {})),
  pushTurnError: (text) =>
    set((s) => ({ entries: [...s.entries, { type: 'turnError' as const, id: nextEntryId(), text }] })),
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
