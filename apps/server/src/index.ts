import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { WebSocketServer, type WebSocket } from 'ws'
import { clientMessageSchema, type ServerMessage } from './protocol.js'
import { AgentSession } from './agent.js'

const PORT = Number(process.env.CCWEB_PORT ?? 3477)

const app = new Hono()
app.use(logger())
app.get('/healthz', (c) => c.json({ ok: true, name: 'ccweb', version: '0.1.0' }))

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[ccweb] http://127.0.0.1:${info.port}`)
})

// ---------- WebSocket ----------

const wss = new WebSocketServer({ noServer: true })
let seq = 0

function broadcast(msg: ServerMessage, sockets: Set<WebSocket>): void {
  const payload = JSON.stringify({ ...msg, seq: ++seq })
  for (const sock of sockets) {
    if (sock.readyState === sock.OPEN) {
      sock.send(payload)
    }
  }
}

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  } else {
    socket.destroy()
  }
})

wss.on('connection', (ws) => {
  const peers = new Set<WebSocket>([ws])
  const emit = (msg: ServerMessage) => broadcast(msg, peers)

  const agent = new AgentSession(emit)

  ws.on('message', (raw) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(String(raw))
    } catch {
      emit({ t: 'error', seq: 0, code: 'bad_json', message: 'Malformed JSON message.' })
      return
    }
    const result = clientMessageSchema.safeParse(parsed)
    if (!result.success) {
      emit({ t: 'error', seq: 0, code: 'bad_message', message: result.error.issues[0]?.message ?? 'Invalid message.' })
      return
    }
    const msg = result.data

    switch (msg.t) {
      case 'prompt':
        agent.send(msg.text)
        break
      case 'interrupt':
        void agent.interrupt()
        break
      case 'permission.resolve':
        if (!agent.resolvePermission(msg.requestId, msg.allow, msg.always ?? false, msg.updatedInput)) {
          emit({ t: 'error', seq: 0, code: 'permission_not_found', message: 'No pending permission with that id.' })
        }
        break
      case 'session.new':
        // P0 单活跃会话;侧边栏多会话在 P2 引入
        emit({ t: 'init', seq: 0, sessionId: null, model: null, endpoint: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com' })
        break
      case 'ping':
        emit({ t: 'pong', seq: 0 })
        break
    }
  })
})

process.on('SIGINT', () => {
  console.log('[ccweb] shutting down')
  server.close()
  process.exit(0)
})
