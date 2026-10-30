/** Main-agent stream samples only. Wall clocks for tools/approvals never enter decode time. */
export class StreamMetrics {
  private requests = new Map<string, { start: number | null; end: number | null; tokens: number | null }>()
  private active: string | null = null
  private began = 0
  firstContentMs: number | null = null
  latestSpeed: number | null = null
  begin(now: number): void {
    this.requests.clear(); this.active = null; this.began = now
    this.firstContentMs = null; this.latestSpeed = null
  }
  observe(event: Record<string, unknown>, now: number): void {
    if (event.type === 'message_start') {
      const message = event.message as { id?: string } | undefined
      if (message?.id) {
        this.active = message.id
        if (!this.requests.has(message.id)) this.requests.set(message.id, { start: null, end: null, tokens: null })
      }
      return
    }
    const sample = this.active ? this.requests.get(this.active) : undefined
    if (!sample || sample.end !== null) return
    if (event.type === 'content_block_delta') {
      if (sample.start === null) sample.start = now
      if (this.firstContentMs === null) this.firstContentMs = Math.max(0, now - this.began)
    }
    if (event.type === 'message_delta') {
      const usage = event.usage as { output_tokens?: number } | undefined
      if (typeof usage?.output_tokens === 'number' && Number.isSafeInteger(usage.output_tokens) && usage.output_tokens >= 0) sample.tokens = usage.output_tokens
    }
    if (event.type === 'message_stop') {
      sample.end = now
      if (sample.start !== null && sample.tokens !== null && now > sample.start) this.latestSpeed = sample.tokens * 1000 / (now - sample.start)
    }
  }
  summary(): { speed: number | null; complete: boolean; sampled: number; requests: number } {
    const samples = [...this.requests.values()]
    const paired = samples.filter((s): s is { start: number; end: number; tokens: number } => s.start !== null && s.end !== null && s.tokens !== null && s.end > s.start)
    const complete = samples.length > 0 && samples.length === paired.length
    const elapsed = paired.reduce((sum, s) => sum + s.end - s.start, 0)
    return { speed: complete && elapsed > 0 ? paired.reduce((sum, s) => sum + s.tokens, 0) * 1000 / elapsed : null, complete, sampled: paired.length, requests: samples.length }
  }
}
