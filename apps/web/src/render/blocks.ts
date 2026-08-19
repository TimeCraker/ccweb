/**
 * 会话渲染模型:把 SDK 消息流(block/delta/message)归并为可渲染的 entries。
 * 纯函数,便于单测与回放(P2 历史回放复用同一模型)。
 */

export interface ThinkingBlock {
  kind: 'thinking'
  text: string
  streaming: boolean
}

export interface TextBlock {
  kind: 'text'
  text: string
  streaming: boolean
}

export interface ToolBlock {
  kind: 'tool'
  toolUseId: string
  toolName: string
  inputRaw: string
  input: Record<string, unknown> | null
  status: 'streaming' | 'running' | 'done' | 'error'
  resultText: string | null
}

export type Block = ThinkingBlock | TextBlock | ToolBlock

export interface UserEntry {
  type: 'user'
  id: string
  text: string
}

export interface TurnEntry {
  type: 'turn'
  id: string
  blocks: Block[]
  done: boolean
}

export type Entry = UserEntry | TurnEntry

export interface BlockStartEvent {
  blockType: 'thinking' | 'text' | 'tool_use'
  index: number
  toolUseId?: string
  toolName?: string
}

let seq = 0
export const nextEntryId = (): string => `e${++seq}`

export function currentTurn(entries: Entry[]): TurnEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e && e.type === 'turn') return e.done ? null : e
    if (e && e.type === 'user') return null
  }
  return null
}

function withTurn(entries: Entry[], turn: TurnEntry): Entry[] {
  const idx = entries.findIndex((e) => e.type === 'turn' && e.id === turn.id)
  if (idx === -1) return [...entries, turn]
  const copy = entries.slice()
  copy[idx] = turn
  return copy
}

export function applyBlockStart(entries: Entry[], ev: BlockStartEvent): Entry[] {
  let turn = currentTurn(entries)
  if (!turn) {
    turn = { type: 'turn', id: nextEntryId(), blocks: [], done: false }
    entries = [...entries, turn]
  }
  if (ev.blockType === 'tool_use') {
    return withTurn(entries, {
      ...turn,
      blocks: [
        ...turn.blocks,
        {
          kind: 'tool',
          toolUseId: ev.toolUseId ?? `anon-${ev.index}`,
          toolName: ev.toolName ?? 'tool',
          inputRaw: '',
          input: null,
          status: 'streaming',
          resultText: null,
        },
      ],
    })
  }
  const block: ThinkingBlock | TextBlock =
    ev.blockType === 'thinking'
      ? { kind: 'thinking', text: '', streaming: true }
      : { kind: 'text', text: '', streaming: true }
  return withTurn(entries, { ...turn, blocks: [...turn.blocks, block] })
}

export function applyDelta(
  entries: Entry[],
  ev: { kind: 'text' | 'thinking' | 'tool_input'; text: string; toolUseId?: string },
): Entry[] {
  const turn = currentTurn(entries)
  if (!turn) return entries
  const blocks = turn.blocks.map((b) => {
    if (ev.kind === 'text' && b.kind === 'text' && b.streaming) {
      return { ...b, text: b.text + ev.text }
    }
    if (ev.kind === 'thinking' && b.kind === 'thinking' && b.streaming) {
      return { ...b, text: b.text + ev.text }
    }
    if (ev.kind === 'tool_input' && b.kind === 'tool') {
      const match = ev.toolUseId ? b.toolUseId === ev.toolUseId : b.status === 'streaming'
      if (match) return { ...b, inputRaw: b.inputRaw + ev.text }
    }
    return b
  })
  return withTurn(entries, { ...turn, blocks })
}

export function applyBlockStop(entries: Entry[], index: number): Entry[] {
  const turn = currentTurn(entries)
  if (!turn) return entries
  // 按块序号结算:tool 块进入 running;text/thinking 停止 streaming
  let seen = -1
  const blocks = turn.blocks.map((b) => {
    seen++
    if (seen !== index) return b
    if (b.kind === 'tool') return { ...b, status: 'running' as const }
    return { ...b, streaming: false }
  })
  return withTurn(entries, { ...turn, blocks })
}

/** 完整 assistant 消息到达:以权威数据对账重建(accumulate-and-reconcile) */
export function reconcileAssistant(entries: Entry[], msg: SDKAssistantLike): Entry[] {
  let turn = currentTurn(entries)
  if (!turn) {
    turn = { type: 'turn', id: nextEntryId(), blocks: [], done: false }
    entries = [...entries, turn]
  }
  const prevTools = new Map<string, ToolBlock>()
  for (const b of turn.blocks) if (b.kind === 'tool') prevTools.set(b.toolUseId, b)

  const blocks: Block[] = []
  for (const c of msg.message?.content ?? []) {
    if (!c) continue
    if (c.type === 'thinking') {
      blocks.push({ kind: 'thinking', text: c.thinking ?? '', streaming: false })
    } else if (c.type === 'text') {
      blocks.push({ kind: 'text', text: c.text ?? '', streaming: false })
    } else if (c.type === 'tool_use') {
      const toolUseId = c.id ?? `anon-${blocks.length}`
      const prev = prevTools.get(toolUseId)
      blocks.push({
        kind: 'tool',
        toolUseId,
        toolName: c.name ?? 'tool',
        inputRaw: JSON.stringify(c.input ?? {}, null, 2),
        input: (c.input as Record<string, unknown>) ?? {},
        status: prev?.status === 'done' || prev?.status === 'error' ? prev.status : 'running',
        resultText: prev?.resultText ?? null,
      })
    }
  }
  return withTurn(entries, { ...turn, blocks, done: false })
}

/** user 消息中的 tool_result:回填工具块状态与结果 */
export function applyToolResults(entries: Entry[], msg: SDKUserLike): Entry[] {
  const content = msg.message?.content
  if (!Array.isArray(content)) return entries
  const results = content.filter(
    (c): c is { type: 'tool_result'; tool_use_id: string; content?: unknown; is_error?: boolean } =>
      !!c && c.type === 'tool_result',
  )
  if (results.length === 0) return entries

  return entries.map((e) => {
    if (e.type !== 'turn') return e
    let changed = false
    const blocks = e.blocks.map((b) => {
      if (b.kind !== 'tool') return b
      const r = results.find((x) => x.tool_use_id === b.toolUseId)
      if (!r) return b
      changed = true
      return {
        ...b,
        status: r.is_error ? ('error' as const) : ('done' as const),
        resultText: toolResultText(r.content),
      }
    })
    return changed ? { ...e, blocks } : e
  })
}

export function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (c && typeof c === 'object' && 'text' in c) return String((c as { text: unknown }).text)
        return JSON.stringify(c)
      })
      .join('\n')
  }
  return JSON.stringify(content, null, 2)
}

interface SDKAssistantLike {
  message?: { content?: Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; input?: unknown } | null> } | null
}

interface SDKUserLike {
  message?: { content?: unknown } | null
}

/** 当前 assistant 回转是否产生过任何可见内容(空 turn 不渲染) */
export function turnHasContent(turn: TurnEntry): boolean {
  return turn.blocks.some((b) =>
    b.kind === 'tool' ? true : b.text.length > 0,
  )
}
