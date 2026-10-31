import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

let useStore: typeof import('./store').useStore

beforeAll(async () => {
  const memory = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, String(value)),
    removeItem: (key: string) => memory.delete(key),
  })
  vi.stubGlobal('navigator', { language: 'zh' })
  ;({ useStore } = await import('./store'))
})

const user = (text: string) => ({ type: 'user', uuid: crypto.randomUUID(), message: { content: text } })
const assistant = (text: string) => ({
  type: 'assistant',
  uuid: crypto.randomUUID(),
  message: { role: 'assistant', content: [{ type: 'text', text }] },
})

function conversation(turns: number) {
  return Array.from({ length: turns }, (_, i) => [user(`问题 ${i}`), assistant(`回答 ${i}`)]).flat()
}

describe('history paging', () => {
  beforeEach(() => {
    useStore.getState().clearView()
  })

  it('renders only the latest page and starts at the bottom', () => {
    useStore.getState().replayHistory(conversation(100))
    const state = useStore.getState()
    expect(state.historyHasMore).toBe(true)
    expect(state.historyFocus).toBe(-1)
    expect(state.historyVersion).toBe(1)
    // 100 轮(200 条)只回放尾部约 160 条,而不是全部
    expect(state.entries.length).toBeLessThan(200)
    expect(state.entries.length).toBeGreaterThan(0)
  })

  it('loads earlier messages and anchors at the previously first entry', () => {
    useStore.getState().replayHistory(conversation(100))
    const before = useStore.getState().entries.length
    useStore.getState().loadEarlierHistory()
    const state = useStore.getState()
    expect(state.historyHasMore).toBe(false)
    expect(state.entries.length).toBeGreaterThan(before)
    expect(state.historyFocus).toBeGreaterThan(0)
    expect(state.historyVersion).toBeGreaterThan(1)
  })

  it('keeps short histories intact without a load-earlier control', () => {
    useStore.getState().replayHistory(conversation(3))
    const state = useStore.getState()
    expect(state.historyHasMore).toBe(false)
    expect(state.entries.length).toBe(6)
    expect(state.historyFocus).toBe(-1)
  })
})
