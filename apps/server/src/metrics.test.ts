import { describe, expect, it } from 'vitest'
import { computeMetrics, newAccumulator } from './metrics.js'
import { clientMessageSchema } from './protocol.js'

describe('metrics', () => {
  it('computes cache hit rate as cache_read over total input-side tokens', () => {
    const acc = newAccumulator()
    acc.turns = 2
    acc.inputTokens = 1000
    acc.cacheReadTokens = 3000
    acc.cacheCreationTokens = 1000
    const m = computeMetrics(acc)
    expect(m.cacheHitRate).toBeCloseTo(3000 / 5000)
    expect(m.turns).toBe(2)
  })

  it('yields null hit rate when no input tokens yet', () => {
    expect(computeMetrics(newAccumulator()).cacheHitRate).toBeNull()
  })
})

describe('protocol', () => {
  it('accepts a valid prompt', () => {
    const r = clientMessageSchema.safeParse({ t: 'prompt', text: 'hi' })
    expect(r.success).toBe(true)
  })

  it('rejects empty prompt text', () => {
    const r = clientMessageSchema.safeParse({ t: 'prompt', text: '' })
    expect(r.success).toBe(false)
  })

  it('rejects unknown message type', () => {
    const r = clientMessageSchema.safeParse({ t: 'explode' })
    expect(r.success).toBe(false)
  })

  it('accepts permission.resolve with updatedInput', () => {
    const r = clientMessageSchema.safeParse({
      t: 'permission.resolve',
      requestId: 'tu_1',
      allow: true,
      updatedInput: { a: 1 },
    })
    expect(r.success).toBe(true)
  })
})
