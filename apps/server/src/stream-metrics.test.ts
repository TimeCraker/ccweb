import { describe, expect, it } from 'vitest'
import { StreamMetrics } from './stream-metrics.js'

function sample(m: StreamMetrics, id: string, time: number, tokens: number, duration: number) {
  m.observe({ type: 'message_start', message: { id } }, time)
  m.observe({ type: 'content_block_delta' }, time + 100)
  m.observe({ type: 'message_delta', usage: { output_tokens: tokens } }, time + 100 + duration)
  m.observe({ type: 'message_stop' }, time + 100 + duration)
}
describe('paired stream throughput', () => {
  it('excludes tool/approval gaps and weights samples by decode time', () => {
    const m = new StreamMetrics(); m.begin(0)
    sample(m, 'a', 100, 100, 1000)
    sample(m, 'b', 100_000, 100, 3000)
    expect(m.summary()).toEqual({ speed: 50, complete: true, sampled: 2, requests: 2 })
    expect(m.firstContentMs).toBe(200)
  })
  it('deduplicates repeated stream frames and request ids', () => {
    const m = new StreamMetrics(); m.begin(0)
    sample(m, 'a', 100, 100, 1000); sample(m, 'a', 100, 100, 1000)
    expect(m.summary().speed).toBe(100)
    expect(m.summary().requests).toBe(1)
  })
  it('does not fabricate a complete speed for missing or partial samples', () => {
    const m = new StreamMetrics(); m.begin(0)
    sample(m, 'a', 100, 100, 1000)
    m.observe({ type: 'message_start', message: { id: 'b' } }, 5000)
    m.observe({ type: 'content_block_delta' }, 5100)
    expect(m.summary().speed).toBeNull()
    expect(m.latestSpeed).toBe(100)
    m.begin(10000)
    expect(m.latestSpeed).toBeNull()
    expect(m.firstContentMs).toBeNull()
  })
})
