import type { ClientMessage, ServerMessage } from './types'

/**
 * WS 客户端:自动重连(指数退避封顶 10s)+ lastSeq 对账。
 * 重连时携带最后收到的 seq,server 重放缺口(delta/metrics 等)。
 */
export class WsClient {
  private ws: WebSocket | null = null
  private backoff = 1000
  private closedByUser = false
  private lastSeq = 0
  private handlers = new Set<(msg: ServerMessage) => void>()

  constructor(
    private readonly onState: (s: 'connecting' | 'open' | 'closed') => void,
  ) {}

  connect(): void {
    this.onState('connecting')
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    this.ws = ws

    ws.onopen = () => {
      this.backoff = 1000
      this.onState('open')
      // 重连对账:通知 server 我已收到的位置
      if (this.lastSeq > 0) this.send({ t: 'ping', lastSeq: this.lastSeq })
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMessage
        if (typeof msg.seq === 'number' && msg.seq > this.lastSeq) this.lastSeq = msg.seq
        for (const h of this.handlers) h(msg)
      } catch {
        // 忽略畸形帧
      }
    }
    ws.onclose = () => {
      this.onState('closed')
      if (this.closedByUser) return
      setTimeout(() => this.connect(), this.backoff)
      this.backoff = Math.min(this.backoff * 2, 10_000)
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  on(handler: (msg: ServerMessage) => void): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  dispose(): void {
    this.closedByUser = true
    this.ws?.close()
  }
}
