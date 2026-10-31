import { create } from 'zustand'
import { t } from './i18n'
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
  title?: string
  description?: string
  plan?: string
  requestId: string
  toolName: string
  input: Record<string, unknown>
}

/** 历史首屏只回放尾部一页;加载更早时每次追加一页 */
const HISTORY_PAGE = 160

function isUserPrompt(raw: unknown): boolean {
  const m = raw as { type?: string; message?: { content?: unknown } } | null
  if (m?.type !== 'user') return false
  const content = m.message?.content
  if (typeof content === 'string') return content.trim().length > 0
  if (!Array.isArray(content)) return false
  return content.some((block) => {
    if (!block || typeof block !== 'object' || !('type' in block)) return false
    const b = block as { type?: string; text?: unknown }
    return b.type === 'text' && typeof b.text === 'string' && b.text.trim().length > 0
  })
}

/** 从用户消息边界开始切,避免历史页从半截 tool_result 开始 */
function historySlice(messages: unknown[], limit: number): unknown[] {
  if (limit >= messages.length) return messages
  let start = Math.max(0, messages.length - limit)
  for (let i = start; i >= 0; i--) {
    if (isUserPrompt(messages[i])) {
      start = i
      break
    }
  }
  return messages.slice(start)
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
  attachmentDraft: boolean
  conn: ConnState
  lastAck: { id: string; ok: boolean } | null
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
  /** 非错误提示(信息类 toast):与 error 分开,避免把所有反馈都标成红色 */
  notice: string | null
  /** 最近一次设置变更的请求时间;用于显示“确认中”而不是抢先展示成功 */
  settingsPending: number | null
  busy: boolean
  /** 本轮开始时间戳(运行计时行 + turn 尾统计) */
  turnStartedAt: number | null
  /** 上一轮完成时的统计(turn 尾渲染) */
  lastTurnStats: { totalS: number; ttftMs: number | null; tps: number | null } | null
  settings: SettingsSnapshot | null
  fileBaselines: Record<string, { content: string | null; existed: boolean | null; reason?: string }>
  nativeTasks: Array<{ id: string; runId?: string; status: string; description: string; summary?: string }>
  checkpoints: Array<{ id: string; text: string }>
  rewind: { preview: boolean; result: { canRewind: boolean; error?: string; filesChanged?: string[]; insertions?: number; deletions?: number; skippedLinks?: number } } | null
  runtimeDiagnostics: Array<{ id: string; event: string; name: string; status: string; output: string; exitCode?: number }>
  availableModels: Array<{
    value: string
    displayName: string
    description: string
    resolvedModel?: string
    supportsEffort?: boolean
    supportedEffortLevels?: Array<'low' | 'medium' | 'high' | 'xhigh' | 'max'>
    supportsAdaptiveThinking?: boolean
  }>
  mcpServers: Array<{ name: string; status: string; error?: string; scope?: string; source?: string; tools?: string[] }>
  slashCommands: Array<{ name: string; description: string }>
  /** @文件补全结果(server files.search 的相对路径列表,≤15) */
  fileResults: string[]
  /** 排队待处理消息(dsh QueueDock 对齐) */
  queue: Array<{ uuid: string; text: string }>
  /** 本 turn 已被用户主动中断(随后的非 success result 走中性提示) */
  interrupted: boolean
  /** 完整历史消息(用于分页加载更早);渲染只取尾部一页 */
  historyRaw: unknown[]
  historyLimit: number
  historyHasMore: boolean
  /** 历史重放后首屏定位:>=0 表示首次渲染落在此 entry,-1 表示落到底部 */
  historyFocus: number
  historyVersion: number

  setConn: (c: ConnState) => void
  applyInit: (p: { sessionId: string | null; model: string | null; endpoint: string | null }) => void
  setSessions: (list: SessionMeta[]) => void
  setSettings: (s: SettingsSnapshot) => void
  setMcp: (list: Array<{ name: string; status: string; error?: string; scope?: string; source?: string; tools?: string[] }>) => void
  setSlashCommands: (list: Array<{ name: string; description: string }>) => void
  setFileResults: (files: string[]) => void
  setQueue: (items: Array<{ uuid: string; text: string }>) => void
  appendUser: (text: string, nativeUuid?: string, images?: string[]) => void
  onBlockStart: (ev: { blockType: 'thinking' | 'text' | 'tool_use'; index: number; toolUseId?: string; toolName?: string }) => void
  onDelta: (ev: { kind: 'text' | 'thinking' | 'tool_input'; text: string; toolUseId?: string }) => void
  onBlockStop: (index: number) => void
  onAssistantMessage: (msg: unknown) => void
  onUserMessage: (msg: unknown) => void
  finishTurn: () => void
  replayHistory: (messages: unknown[], limit?: number) => void
  loadEarlierHistory: () => void
  clearView: () => void
  setMetrics: (m: SessionMetrics) => void
  setContext: (raw: Record<string, unknown>) => void
  pushPermission: (p: PermissionRequest) => void
  resolvePermissionLocal: (requestId: string) => void
  pushQuestion: (q: QuestionRequest) => void
  resolveQuestionLocal: (requestId: string) => void
  pushTurnError: (text: string, muted?: boolean) => void
  /** 标记本 turn 已被用户主动中断:随后到来的非 success result 走中性提示而非红色错误 */
  setInterrupted: (v: boolean) => void
  setError: (e: string | null) => void
  setNotice: (n: string | null) => void
  setBusy: (b: boolean) => void
}

export const useStore = create<AppState>((set) => ({
  attachmentDraft: false,
  conn: 'connecting',
  lastAck: null,
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
  notice: null,
  settingsPending: null,
  busy: false,
  turnStartedAt: null,
  lastTurnStats: null,
  settings: null,
  fileBaselines: {}, nativeTasks: [], checkpoints: [], rewind: null,
  runtimeDiagnostics: [],
  availableModels: [],
  mcpServers: [],
  slashCommands: [],
  fileResults: [],
  queue: [],
  interrupted: false,
  historyRaw: [],
  historyLimit: 0,
  historyHasMore: false,
  historyFocus: -1,
  historyVersion: 0,

  setConn: (conn) => set({ conn }),
  applyInit: ({ sessionId, model, endpoint }) => set({ sessionId, model, endpoint }),
  setSessions: (sessions) => set({ sessions }),
  setSettings: (settings) => set({ settings }),
  setMcp: (mcpServers) => set({ mcpServers }),
  setSlashCommands: (slashCommands) => set({ slashCommands }),
  setFileResults: (fileResults) => set({ fileResults }),
  setQueue: (queue) => set({ queue }),
  appendUser: (text, nativeUuid, images) =>
    set((s) => ({
      entries: [...s.entries, { type: 'user' as const, id: nextEntryId(), text, nativeUuid, images }],
      busy: true,
      turnStartedAt: Date.now(),
      lastTurnStats: null,
      interrupted: false,
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
      const totalS = s.turnStartedAt ? ((s.metrics?.completedAt ?? Date.now()) - s.turnStartedAt) / 1000 : 0
      const stats = {
        totalS,
        ttftMs: s.metrics?.ttftMs ?? null,
        tps: s.metrics?.tokensPerSecond ?? null,
      }
      if (!t) return { busy: false, turnStartedAt: null, lastTurnStats: stats }
      const entries = s.entries.map((e) =>
        e.type === 'turn' && e.id === (t as TurnEntry).id
          ? { ...e, done: true, tail: s.turnStartedAt ? stats : undefined }
          : e,
      )
      return { entries, busy: false, turnStartedAt: null, lastTurnStats: stats }
    }),
  /** 历史回放:顺序跑渲染模型(与实时流同构--一条用户消息一个 turn,
   * assistant 消息经对账追加,tool_result 回填;新用户消息前收束上一 turn) */
  replayHistory: (messages, limit = HISTORY_PAGE) => {
    const page = historySlice(messages, limit)
    set({
      fileBaselines: {}, nativeTasks: [], checkpoints: [], rewind: null, runtimeDiagnostics: [], availableModels: [], entries: [], busy: false, permissions: [], question: null, metrics: null, context: null, turnStartedAt: null,
      historyRaw: messages,
      historyLimit: Math.min(messages.length, limit),
      historyHasMore: page.length < messages.length,
      historyFocus: -1,
      historyVersion: useStore.getState().historyVersion + 1,
    })
    for (const raw of page) {
      const m = raw as { type?: string; uuid?: string; ccwebMetrics?: SessionMetrics; message?: { content?: unknown } } | null
      if (!m?.type) continue
      const st = useStore.getState()
      if (m.type === 'user') {
        const content = m.message?.content
        const texts: string[] = []
        const images: string[] = []
        let hasToolResult = false
        let interruptedMarker = false
        if (typeof content === 'string') {
          texts.push(content)
        } else if (Array.isArray(content)) {
          for (const c of content) {
            if (c && typeof c === 'object' && 'type' in c) {
              const block = c as { type: string; text?: unknown; source?: { type?: string; media_type?: string; data?: string } }
              if (block.type === 'text' && typeof block.text === 'string') {
                // SDK 中断标记回放为中性提示行,不当用户消息渲染
                if (block.text === '[Request interrupted by user]') interruptedMarker = true
                else texts.push(block.text)
              }
              if (block.type === 'image' && block.source?.type === 'base64' && ['image/png','image/jpeg','image/webp','image/gif'].includes(block.source.media_type ?? '')) images.push(`data:${block.source.media_type};base64,${block.source.data}`)
              if (block.type === 'tool_result') hasToolResult = true
            }
          }
        }
        if (hasToolResult) st.onUserMessage(m)
        if (interruptedMarker) {
          // 中断标记:收束当前 turn 并追加中性提示行
          st.finishTurn()
          useStore.setState((s) => ({
            entries: [
              ...s.entries,
              { type: 'turnError' as const, id: nextEntryId(), text: t('ms.interrupted'), muted: true },
            ],
          }))
        }
        if (texts.length > 0) {
          st.finishTurn()
          useStore.setState({ metrics: m.ccwebMetrics ?? null, turnStartedAt: m.ccwebMetrics?.runStartedAt ?? null })
          for (const t of texts) {
            useStore.setState((s) => ({
              entries: [...s.entries, { type: 'user' as const, id: nextEntryId(), text: t, nativeUuid: m.uuid, images }],
            }))
          }
        }
      } else if (m.type === 'assistant') {
        st.onAssistantMessage(m)
      }
    }
    useStore.getState().finishTurn()
  },
  loadEarlierHistory: () => {
    const state = useStore.getState()
    if (state.busy || state.permissions.length > 0 || state.question) return
    const { historyRaw, historyLimit, entries } = state
    if (historyLimit >= historyRaw.length) return
    const before = entries.length
    const next = Math.min(historyRaw.length, historyLimit + HISTORY_PAGE)
    useStore.getState().replayHistory(historyRaw, next)
    const after = useStore.getState().entries.length
    // 定位到原来已加载的第一条,让新增的旧消息出现在上方,而不是被拉到底部
    useStore.setState((s) => ({ historyFocus: Math.max(0, after - before), historyVersion: s.historyVersion + 1 }))
  },
  clearView: () => set({ fileBaselines: {}, nativeTasks: [], checkpoints: [], rewind: null, runtimeDiagnostics: [], availableModels: [], entries: [], permissions: [], question: null, error: null, busy: false, metrics: null, context: null, turnStartedAt: null, queue: [], historyRaw: [], historyLimit: 0, historyHasMore: false, historyFocus: -1 }),
  setMetrics: (metrics) => set(s => ({ metrics, ...(s.busy && metrics.runStartedAt ? { turnStartedAt: metrics.runStartedAt } : {}) })),
  setContext: (raw) => set({ context: { raw } }),
  pushPermission: (p) => set((s) => ({ permissions: [...s.permissions.filter(item => item.requestId !== p.requestId), p] })),
  resolvePermissionLocal: (requestId) =>
    set((s) => ({ permissions: s.permissions.filter((p) => p.requestId !== requestId) })),
  pushQuestion: (question) => set({ question }),
  resolveQuestionLocal: (requestId) =>
    set((s) => (s.question?.requestId === requestId ? { question: null } : {})),
  pushTurnError: (text, muted) =>
    set((s) => ({
      entries: [...s.entries, { type: 'turnError' as const, id: nextEntryId(), text, muted }],
    })),
  setInterrupted: (interrupted) => set({ interrupted }),
  setError: (error) => set({ error, ...(error ? { notice: null } : {}) }),
  setNotice: (notice) => set({ notice, ...(notice ? { error: null } : {}) }),
  setBusy: (busy) => set({ busy }),
}))

/** 供组件选择的 helper:忽略空 turn(无内容且已结束) */
export function visibleEntries(entries: Entry[]): Entry[] {
  return entries.filter((e) => {
    if (e.type !== 'turn') return true
    return e.blocks.length > 0
  })
}
