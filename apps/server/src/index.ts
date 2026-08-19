import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { WebSocketServer } from 'ws'
import { clientMessageSchema, type ServerMessage } from './protocol.js'
import { AgentSession } from './agent.js'
import { fetchHistory, listSessionMetas } from './sessions.js'

const PORT = Number(process.env.CCWEB_PORT ?? 3477)

const app = new Hono()
app.use(logger())
app.get('/healthz', (c) => c.json({ ok: true, name: 'ccweb', version: '0.1.0' }))

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[ccweb] http://127.0.0.1:${info.port}`)
})

// ---------- WebSocket ----------

const wss = new WebSocketServer({ noServer: true })

/**
 * 单连接模型(本地单人工具):seq 单调递增 + 环形缓冲,
 * 断线重连时客户端带 lastSeq 对账,server 重放缺口。
 */
const RING_SIZE = 500
const ring: ServerMessage[] = []
let seq = 0

server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  } else {
    socket.destroy()
  }
})

wss.on('connection', (ws) => {
  let currentSession: AgentSession | null = null
  const registry = new Map<string, AgentSession>()

  function emit(msg: ServerMessage): void {
    const withSeq = { ...msg, seq: ++seq }
    ring.push(withSeq)
    if (ring.length > RING_SIZE) ring.shift()
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(withSeq))
  }

  function emitRaw(msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
  }

  /** 重连对账:重放 lastSeq 之后的缺口(历史/元数据消息不重放) */
  function replaySince(lastSeq: number): void {
    for (const m of ring) {
      if ((m.seq ?? 0) > lastSeq && m.t !== 'history' && m.t !== 'sessions') {
        emitRaw(m)
      }
    }
  }

  /** 新建 AgentSession 并在 init(拿到真实 sessionId)后自注册进 registry */
  function createTrackedAgent(opts: { cwd?: string; resume?: string; fork?: boolean }): AgentSession {
    const agent = new AgentSession((msg) => {
      if (msg.t === 'init' && msg.sessionId) registry.set(msg.sessionId, agent)
      emit(msg)
    }, opts)
    return agent
  }

  function getOrCreateSession(sessionId?: string, fork = false): AgentSession {
    if (!sessionId) {
      const agent = createTrackedAgent({})
      currentSession = agent
      return agent
    }
    const existing = registry.get(sessionId)
    if (existing && !fork) {
      currentSession = existing
      return existing
    }
    const agent = createTrackedAgent({ resume: sessionId, fork })
    agent.sessionId = fork ? null : sessionId
    registry.set(sessionId, agent)
    currentSession = agent
    return agent
  }

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
      case 'prompt': {
        const agent = msg.sessionId
          ? getOrCreateSession(msg.sessionId)
          : (currentSession ?? getOrCreateSession())
        agent.send(msg.text)
        break
      }
      case 'interrupt':
        void currentSession?.interrupt()
        break
      case 'permission.resolve':
        if (
          !currentSession?.resolvePermission(
            msg.requestId,
            msg.allow,
            msg.always ?? false,
            msg.updatedInput,
          )
        ) {
          emit({ t: 'error', seq: 0, code: 'permission_not_found', message: 'No pending permission with that id.' })
        }
        break
      case 'session.new':
        currentSession = null
        emit({ t: 'cleared', seq: 0 })
        void pushSessionList()
        break
      case 'session.list':
        void pushSessionList()
        break
      case 'session.open': {
        const agent = getOrCreateSession(msg.sessionId, msg.fork ?? false)
        emit({
          t: 'init',
          seq: 0,
          sessionId: agent.sessionId,
          model: null,
          endpoint: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
        })
        emit({ t: 'cleared', seq: 0 })
        // 历史回放:归一化消息流供前端渲染模型重放
        void (async () => {
          const history = await fetchHistory(msg.sessionId)
          emit({ t: 'history', seq: 0, sessionId: msg.sessionId, messages: history })
        })()
        break
      }
      case 'session.rename':
        // SDK renameSession 0.3.x 不可用;标题由列表 summary 兜底,P3 接 customTitle
        void pushSessionList()
        break
      case 'ping':
        if (msg.lastSeq != null) replaySince(msg.lastSeq)
        emit({ t: 'pong', seq: 0 })
        break
    }
  })

  async function pushSessionList(): Promise<void> {
    const sessions = await listSessionMetas(process.cwd())
    emit({ t: 'sessions', seq: 0, sessions })
  }
})

process.on('SIGINT', () => {
  console.log('[ccweb] shutting down')
  server.close()
  process.exit(0)
})
