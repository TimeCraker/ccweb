import { attachNative, startNative, nativeWorkspaceBusy } from './native-terminal.js'
import { atomicWrite, workspacePath, configApi } from './config-api.js'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { readFile } from 'node:fs/promises'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { clientMessageSchema, type ServerMessage, type SettingsSnapshot } from './protocol.js'
import { forkSession, query } from '@anthropic-ai/claude-agent-sdk'
import { AgentSession, buildAgentEnv } from './agent.js'
import { fetchHistory, listSessionMetas, renameSessionMeta, deleteSessionMeta } from './sessions.js'
import { searchWorkspaceFiles } from './files.js'
import {
  runtimeSettings,
  saveRuntimeSettings,
  effectiveEnv,
  APP_DIR,
  listEndpointTemplates,
  listWorkspaces,
  listUserSkills,
  listUserRules,
  readClaudeMd,
  listSlashCommands,
} from './settings.js'

const PORT = Number(process.env.CCWEB_PORT ?? 3477)
const __dirname = dirname(fileURLToPath(import.meta.url))
// dev(src/) 与 dist/ 下 package.json 均在上一级,读真实版本避免硬编码漂移
const PKG_VERSION = String(
  JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')).version ?? '',
)

const app = new Hono()
app.use(logger())
app.route('/api', configApi)
app.post('/api/connection/probe', async c => {
  const origin = c.req.header('origin')
  if (origin !== new URL(c.req.url).origin && !/^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin ?? '')) return c.json({ error: 'Origin rejected' }, 403)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  const began = Date.now()
  try {
    const body = await c.req.json<{ workspace?: string }>()
    const workspace = workspacePath(body.workspace)
    if (nativeWorkspaceBusy(workspace)) return c.json({ error: '请先结束原生进程' }, 409)
    let model: string | null = null, output = '', failure: string | null = null, cost: number | null = null, succeeded = false
    const probe = query({ prompt: 'Reply exactly CCWEB_CONNECTION_OK. Do not use tools.', options: { cwd: workspace, model: runtimeSettings.model ?? undefined, env: buildAgentEnv(), tools: [], mcpServers: {}, settingSources: [], persistSession: false, permissionMode: 'default', maxTurns: 1, maxBudgetUsd: 0.05, abortController: controller } })
    try {
      for await (const event of probe) {
        const message = event as unknown as Record<string, unknown>
        if (message.type === 'system' && message.subtype === 'init') model = String(message.model ?? '')
        if (message.type === 'assistant') {
          if (message.error) failure = String(message.error)
          for (const block of (message.message as { content?: Array<{ type: string; text?: string }> })?.content ?? []) if (block.type === 'text') output += block.text ?? ''
        }
        if (message.type === 'result') { succeeded = message.subtype === 'success' && message.is_error !== true; if (typeof message.total_cost_usd === 'number') cost = message.total_cost_usd }
      }
    } finally { probe.close() }
    const ok = succeeded && !failure && output.includes('CCWEB_CONNECTION_OK')
    return c.json({ ok, model, elapsedMs: Date.now() - began, estimatedCostUsd: cost, category: ok ? 'connected' : failure ?? 'unexpected_response', retried: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const category = controller.signal.aborted ? 'timeout_or_cancelled' : /401|403|auth|credential/i.test(message) ? 'authentication_or_model_permission' : /429|quota|credit|balance/i.test(message) ? 'quota_or_rate_limit' : /ENOENT|binary|spawn/i.test(message) ? 'runtime_installation' : 'network_or_runtime'
    return c.json({ ok: false, category, elapsedMs: Date.now() - began, retried: false })
  } finally { clearTimeout(timeout) }
})
app.post('/api/native/start', async c => {
  const origin = c.req.header('origin')
  if (origin !== new URL(c.req.url).origin && !/^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin ?? '')) return c.json({ error: 'Origin rejected' }, 403)
  try {
    const body = await c.req.json<{ workspace?: string; action: string; args?: string[]; stdin?: string; confirmed?: boolean }>()
    if (body.action === 'maintenance' && body.confirmed !== true) return c.json({ error: '安装独立 CLI 前需要明确确认；不会更换 ccweb 随包 SDK' }, 400)
    const workspace = workspacePath(body.workspace)
    const agents = [...new Set(registry.values())]
    if (agents.some(agent => agent.isRunning)) return c.json({ error: '先停止或完成此工作区的 GUI 任务，再启动原生进程' }, 409)
    for (const agent of agents) { agent.abort(); for (const [key, value] of registry) if (value === agent) registry.delete(key); for (const [socket, value] of observers) if (value === agent) { observers.set(socket, null); socket.send(JSON.stringify({ t: 'state', state: 'native_handoff', sessionId: agent.sessionId, seq: ++seq })) } }
    return c.json(startNative(workspace, body.action, body.args, body.stdin))
  } catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 400) }
})
app.get('/healthz', (c) => c.json({ ok: true, name: 'ccweb', version: PKG_VERSION }))

// 生产模式:服务内嵌 web 产物(public/);SPA fallback 到 index.html
app.use('*', serveStatic({ root: relativePublicRoot() }))
app.get('*', async (c) => {
  try {
    const html = await readFile(join(__dirname, '..', 'public', 'index.html'), 'utf8')
    return c.html(html)
  } catch {
    return c.text('ccweb web bundle missing — run `pnpm build` first.', 404)
  }
})

function relativePublicRoot(): string {
  // serve-static 的 root 相对 cwd;开发期从仓库根跑,发布期从包根跑,两者都兼容
  return join(__dirname, '..', 'public')
}

// 安全:默认只听本机回环(CC 可执行任意命令,绝不能默认暴露局域网);
// 需要局域网访问时显式 CCWEB_HOST=0.0.0.0 自担风险
const HOST = process.env.CCWEB_HOST ?? '127.0.0.1'
const server = serve({ fetch: app.fetch, hostname: HOST, port: PORT }, (info) => {
  console.log(`[ccweb] http://${HOST}:${info.port}`)
})

// ---------- WebSocket ----------

const wss = new WebSocketServer({ noServer: true })

/**
 * 进程持有运行对象和每会话事件日志，连接只订阅目标会话。
 * 重连通过 session.open 完整重建；epoch 区分服务重启，seq 用于帧去重。
 */
let seq = 0
const epoch = crypto.randomUUID()
const registry = new Map<string, AgentSession>()
const commands = new Map<string, { epoch: string; done: boolean; ok: boolean }>()
try {
  const saved = JSON.parse(readFileSync(join(APP_DIR, 'requests.json'), 'utf8')) as Array<[string, { epoch: string; done: boolean; ok: boolean }]>
  for (const [id, entry] of saved) if (typeof id === 'string' && typeof entry.epoch === 'string') commands.set(id, entry)
} catch { /* No previous command receipts. */ }
function persistCommands(): void {
  while (commands.size > 1000) commands.delete(commands.keys().next().value!)
  atomicWrite(join(APP_DIR, 'requests.json'), JSON.stringify([...commands]))
}
const observers = new Map<import('ws').WebSocket, AgentSession | null>()
const journals = new WeakMap<AgentSession, ServerMessage[]>()
let operationTail: Promise<void> = Promise.resolve()

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin
  const allowed = !origin || (() => { try { const u = new URL(origin); return ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) && [String(PORT), '5173'].includes(u.port) } catch { return false } })()
  if (req.url === '/native' && allowed && !!origin) {
    wss.handleUpgrade(req, socket, head, ws => {
      const timer = setTimeout(() => ws.close(1008), 5000)
      ws.once('message', raw => { clearTimeout(timer); try { const msg = JSON.parse(String(raw)); attachNative(ws, String(msg.id), String(msg.token), Number(msg.after) || 0) } catch { ws.close(1008) } })
    })
    return
  }
  if (req.url === '/ws' && allowed) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
  } else {
    socket.destroy()
  }
})

wss.on('connection', (ws) => {
  let currentSession: AgentSession | null = null
  let workspace = runtimeSettings.workspace ?? process.env.CCWEB_WORKSPACE ?? process.cwd()
  observers.set(ws, null)
  ws.send(JSON.stringify({ t: 'hello', epoch, seq: 0 }))
  ws.on('close', () => observers.delete(ws))

  function emit(msg: ServerMessage): void {
    const withSeq = { ...msg, seq: ++seq }
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(withSeq))
  }

  function replaySince(_lastSeq: number): void {
    void _lastSeq
    // Reattachment uses a complete session snapshot, never another client's ring.
  }

  /** 新建 AgentSession 并在 init(拿到真实 sessionId)后自注册进 registry */
  function createTrackedAgent(opts: { cwd?: string; resume?: string; fork?: boolean }): AgentSession {
    const agent = new AgentSession((msg) => {
      if (msg.t === 'init' && msg.sessionId) {
        for (const [key, value] of registry) if (value === agent && key !== msg.sessionId) registry.delete(key)
        registry.set(msg.sessionId, agent)
      }
      // turn 结束后刷新侧栏列表--新会话/新标题第一时间可见
      if (msg.t === 'message' && (msg.sdkMessage as { type?: string } | undefined)?.type === 'result') {
        void pushSessionList()
      }
      const journal = journals.get(agent) ?? []
      journal.push(msg)
      // Complete assistant messages supersede their stream deltas during replay.
      if (journal.length > 5000) {
        for (let i = journal.length - 1; i >= 0; i--) if (journal[i]?.t === 'delta' || journal[i]?.t === 'block') journal.splice(i, 1)
      }
      journals.set(agent, journal)
      const frame = JSON.stringify({ ...msg, seq: ++seq })
      for (const [socket, owner] of observers) if (owner === agent && socket.readyState === socket.OPEN) socket.send(frame)
    }, opts)
    registry.set(agent.sessionId!, agent)
    return agent
  }

  /** 退出当前会话:终止子进程并移出 registry(历史已落盘,切回时 resume 重建) */
  function retireCurrent(): void {
    currentSession = null
    observers.set(ws, null)
  }

  function getOrCreateSession(sessionId?: string): AgentSession {
    if (nativeWorkspaceBusy(workspace)) throw new Error('原生进程正在控制工作区；结束进程后可恢复 GUI 会话')
    const cwd = workspace
    if (!sessionId) {
      retireCurrent()
      const agent = createTrackedAgent({ cwd })
      currentSession = agent
      observers.set(ws, agent)
      return agent
    }
    const existing = registry.get(sessionId)
    if (existing) {
      if (existing.workspace !== workspace) throw new Error('Session belongs to another workspace')
      if (existing !== currentSession) retireCurrent()
      currentSession = existing
      observers.set(ws, existing)
      return existing
    }
    retireCurrent()
    const agent = createTrackedAgent({ resume: sessionId, cwd })
    registry.delete(agent.sessionId!)
    agent.sessionId = sessionId
    registry.set(sessionId, agent)
    currentSession = agent
    observers.set(ws, agent)
    return agent
  }

  let commandChain = Promise.resolve()
  ws.on('message', raw => {
    commandChain = commandChain.then(() => {
      let sharedSettings = false
      try { sharedSettings = JSON.parse(String(raw)).t === 'settings.patch' } catch { /* The schema handler reports invalid messages. */ }
      if (!sharedSettings) return handleCommand(raw)
      // Serialize shared defaults only; another connection must still be able to
      // cancel a run while a native settings control request is waiting.
      const operation = operationTail.then(() => handleCommand(raw))
      operationTail = operation.catch(() => undefined)
      return operation
    }).catch(() => undefined)
  })
  async function handleCommand(raw: import('ws').RawData): Promise<void> {
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
    if (msg.t === 'request.status') {
      const receipt = commands.get(msg.commandId!)
      emit({ t: 'ack', seq: 0, requestId: msg.commandId!, ok: receipt?.done === true && receipt.ok })
      if (receipt && !receipt.done && receipt.epoch !== epoch) emit({ t: 'error', seq: 0, code: 'request_uncertain', message: '上次请求接收后服务重启，执行结果未知。请查看历史，不会自动重发。' })
      return
    }
    if (msg.commandId && commands.has(msg.commandId)) {
      const receipt = commands.get(msg.commandId)!
      emit({ t: 'ack', seq: 0, requestId: msg.commandId, ok: receipt.done && receipt.ok })
      return
    }
    if (msg.commandId) {
      commands.set(msg.commandId, { epoch, done: false, ok: false })
      try { persistCommands() } catch { commands.delete(msg.commandId); emit({ t: 'ack', seq: 0, requestId: msg.commandId, ok: false }); emit({ t: 'error', seq: 0, code: 'receipt_write_failed', message: '无法保存请求回执，操作未执行。' }); return }
    }

    try {
    switch (msg.t) {
      case 'prompt': {
        if (nativeWorkspaceBusy(workspace)) throw new Error('此工作区正在由原生终端控制，请结束原生进程后恢复 GUI 会话')
        if (currentSession && ![...registry.values()].includes(currentSession)) retireCurrent()
        const agent = msg.sessionId
          ? getOrCreateSession(msg.sessionId)
          : (currentSession ?? getOrCreateSession())
        if (agent.workspace !== workspace) throw new Error('Session belongs to another workspace')
        agent.send(msg.text, msg.images, msg.commandId)
        emit({ t: 'settings', seq: 0, settings: { ...settingsSnapshot(workspace), workspace, active: agent.settings } })
        break
      }
      case 'interrupt':
        await currentSession?.interrupt()
        break
      case 'queue.resume':
        if (nativeWorkspaceBusy(workspace)) throw new Error('原生终端使用中，不能恢复 GUI 队列')
        currentSession?.resumeQueue()
        break
      case 'queue.delete':
        if (!currentSession?.deleteQueued(msg.uuid)) {
          throw new Error('Queued message not found (may already be running).')
        }
        break
      case 'abort':
        if (currentSession?.sessionId) registry.delete(currentSession.sessionId)
        currentSession?.abort()
        emit({ t: 'init', seq: 0, sessionId: null, model: null, endpoint: null, slashCommands: [] })
        currentSession = null
        observers.set(ws, null)
        emit({ t: 'cleared', seq: 0 })
        break
      case 'permission.resolve':
        if (
          !await currentSession?.resolvePermission(
            msg.requestId,
            msg.allow,
            msg.always ?? false,
            msg.updatedInput,
          )
        ) {
          throw new Error('No pending permission with that id.')
        }
        emit({ t: 'settings', seq: 0, settings: { ...settingsSnapshot(workspace), workspace, ...(currentSession ? { active: currentSession.settings } : {}) } })
        break
      case 'session.new':
        retireCurrent()
        emit({ t: 'init', seq: 0, sessionId: null, model: null, endpoint: null, slashCommands: [] })
        emit({ t: 'cleared', seq: 0 })
        void pushSessionList()
        break
      case 'session.list':
        void pushSessionList()
        break
      case 'files.search':
        // @文件补全:工作区扫描(同步,已 try/catch 兜底)
        emit({ t: 'files', seq: 0, files: searchWorkspaceFiles(msg.query, workspace) })
        break
      case 'session.open': {
        let openId: string | undefined = msg.sessionId
        if (openId && !registry.has(openId) && !(await sessionExistsOnDisk(openId))) {
          // lastSession 可能来自其他工作区或已被删除:降级为新会话,
          // 避免 resume 死会话导致后续所有消息 error_during_execution
          openId = undefined
        }
        if (openId && msg.fork && registry.get(openId)?.isRunning) throw new Error('请先完成或停止原会话再分叉')
        if (openId && msg.fork) openId = (await forkSession(openId, { dir: workspace.replace(/\\/g, '/'), ...(msg.upToMessageId ? { upToMessageId: msg.upToMessageId } : {}) })).sessionId
        const agent = getOrCreateSession(openId)
        emit({
          t: 'init',
          seq: 0,
          sessionId: agent.sessionId,
          model: null,
          endpoint: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
          slashCommands: [],
        })
        emit({ t: 'cleared', seq: 0 })
        const journal = journals.get(agent)
        if (journal?.length) {
          for (const event of journal) emit(event)
        } else if (openId) {
          const history = await fetchHistory(openId, workspace)
          const event: ServerMessage = { t: 'history', seq: 0, sessionId: openId, messages: history }
          journals.set(agent, [event])
          emit(event)
          try {
            const metricFiles = readdirSync(join(APP_DIR, 'metrics', openId)).filter(name => /^[a-f0-9-]{36}\.json$/i.test(name))
            const all = metricFiles.map(name => JSON.parse(readFileSync(join(APP_DIR, 'metrics', openId, name), 'utf8'))).sort((a, b) => b.runStartedAt - a.runStartedAt)
            try {
              const baselineFiles = readdirSync(join(APP_DIR, 'changes', openId)).filter(name => /^[a-f0-9-]{36}\.json$/i.test(name))
              for (const file of baselineFiles) {
                const baselines = JSON.parse(readFileSync(join(APP_DIR, 'changes', openId, file), 'utf8')) as Record<string, { content: string | null; existed: boolean | null; reason?: string }>
                for (const [toolUseId, baseline] of Object.entries(baselines)) emit({ t: 'file.baseline', seq: 0, sessionId: openId, toolUseId, baseline })
              }
            } catch { /* Old histories have no captured Write baseline. */ }
            if (all[0]?.completedAt) emit({ t: 'metrics', seq: 0, sessionId: openId, metrics: all[0] })
            else if (all[0]) emit({ t: 'error', seq: 0, code: 'run_interrupted', message: '上次运行未记录终态，服务可能重启；不会自动重新执行。请检查文件和历史。' })
          } catch { /* No saved metrics; show unrecorded. */ }
        }

        break
      }
      case 'session.rename': {
        const ok = await renameSessionMeta(msg.sessionId, msg.title)
        if (!ok) {
          throw new Error('renameSession failed (SDK or fs).')
        }
        await pushSessionList()
        break
      }
      case 'settings.get':
        emit({ t: 'settings', seq: 0, settings: { ...settingsSnapshot(workspace), workspace, ...(currentSession ? { active: currentSession.settings } : {}) } })
        break
      case 'session.delete': {
        const ok = await deleteSessionMeta(msg.sessionId)
        if (!ok) {
          throw new Error('deleteSession failed.')
        }
        if (currentSession?.sessionId === msg.sessionId) { currentSession.abort(); registry.delete(msg.sessionId); retireCurrent() }
        await pushSessionList()
        break
      }
      case 'workspace.set': {
        workspace = workspacePath(msg.dir)
        emit({ t: 'init', seq: 0, sessionId: null, model: null, endpoint: null, slashCommands: [] })
        runtimeSettings.workspace = msg.dir
        saveRuntimeSettings()
        // 切工作区 = 会话上下文切换:清当前会话,列表按新工作区拉
        currentSession = null
        observers.set(ws, null)
        emit({ t: 'cleared', seq: 0 })
        await pushSessionList()
        emit({ t: 'settings', seq: 0, settings: { ...settingsSnapshot(workspace), workspace } })
        break
      }
      case 'settings.patch': {
        // 作用范围:session=只影响当前对话;default=只影响新会话默认;both=旧行为(两者)
        const p = msg.patch
        const scope = msg.scope ?? 'both'
        const hasSessionField = p.model !== undefined || p.permissionMode !== undefined
        const hasDefaultOnlyField =
          p.authentication !== undefined ||
          p.effort !== undefined ||
          p.contextScope !== undefined ||
          p.endpointTemplate !== undefined
        if (scope === 'session') {
          if (hasDefaultOnlyField) throw new Error('这些设置需要新会话生效，请保存为默认设置')
          if (!currentSession) throw new Error('当前没有可应用的会话；请先发送一条任务，或保存为默认')
        }
        const previous = { ...runtimeSettings }
        const previousSession = currentSession
          ? { model: currentSession.settings.model, permissionMode: currentSession.settings.permissionMode }
          : null
        try {
          if (scope !== 'session') {
            if (p.authentication !== undefined) runtimeSettings.authentication = p.authentication
            if (p.model !== undefined) runtimeSettings.model = p.model
            if (p.permissionMode !== undefined) runtimeSettings.permissionMode = p.permissionMode
            if (p.effort !== undefined) runtimeSettings.effort = p.effort
            if (p.contextScope !== undefined && ['full', 'project', 'none'].includes(String(p.contextScope))) {
              // 上下文注入是子进程启动参数:新会话生效
              runtimeSettings.contextScope = p.contextScope as 'full' | 'project' | 'none'
            }
            if (p.endpointTemplate !== undefined) {
              // 端点是子进程 env:当前会话作废,新会话生效
              if (runtimeSettings.endpointTemplate !== p.endpointTemplate) runtimeSettings.endpointTemplate = p.endpointTemplate
            }
            saveRuntimeSettings()
          }
          if (scope !== 'default' && hasSessionField) {
            const sessionPatch: { model?: string | null; permissionMode?: string | null } = {}
            if (p.model !== undefined) sessionPatch.model = p.model
            if (p.permissionMode !== undefined) sessionPatch.permissionMode = p.permissionMode
            await currentSession?.applySettings(sessionPatch)
          }
        } catch (error) {
          Object.assign(runtimeSettings, previous)
          try { saveRuntimeSettings() } catch { /* keep in-memory state authoritative */ }
          if (previousSession && currentSession) {
            try { await currentSession.applySettings(previousSession) } catch { /* best-effort rollback */ }
          }
          throw error
        }
        emit({ t: 'settings', seq: 0, settings: { ...settingsSnapshot(workspace), workspace, ...(currentSession ? { active: currentSession.settings } : {}) } })
        break
      }
      case 'task.stop':
        if (!currentSession) throw new Error('请先启动会话')
        await currentSession.stopTask(msg.taskId)
        break
      case 'files.rewind':
        if (!currentSession || nativeWorkspaceBusy(workspace)) throw new Error('此会话当前不可回退')
        emit({ t: 'rewind', seq: 0, preview: msg.dryRun, result: await currentSession.rewindFiles(msg.userMessageId, msg.dryRun) })
        break
      case 'models.list':
        if (!currentSession) throw new Error('先启动原生会话以发现模型；可使用自定义模型')
        emit({ t: 'models', seq: 0, models: await currentSession.models() })
        break
      case 'mcp.control':
        if (!currentSession) throw new Error('请先启动会话')
        await currentSession.controlMcp(msg.name, msg.action)
        emit({ t: 'mcpStatus', seq: 0, servers: await currentSession.mcpStatus() })
        break
      case 'mcp.status': {
        const agent = currentSession
        if (!agent) {
          emit({ t: 'mcpStatus', seq: 0, servers: [] })
          break
        }
        const servers = await agent.mcpStatus()
        emit({ t: 'mcpStatus', seq: 0, servers })
        break
      }
      case 'ping':
        if (msg.lastSeq != null) replaySince(msg.lastSeq)
        emit({ t: 'pong', seq: 0 })
        break
    }
    if (msg.commandId) { commands.set(msg.commandId, { epoch, done: true, ok: true }); persistCommands(); emit({ t: 'ack', seq: 0, requestId: msg.commandId, ok: true }) }
    } catch (error) {
      if (msg.commandId) { commands.set(msg.commandId, { epoch, done: true, ok: false }); try { persistCommands() } catch { /* keep in-memory receipt */ }; emit({ t: 'ack', seq: 0, requestId: msg.commandId, ok: false }) }
      emit({ t: 'error', seq: 0, code: 'operation_failed', message: error instanceof Error ? error.message : 'Operation failed', retry: true })
    }
  }

  async function pushSessionList(): Promise<void> {
    const sessions = await listSessionMetas(workspace)
    emit({ t: 'sessions', seq: 0, sessions })
  }

  /** 会话是否存在于当前工作区磁盘(registry 命中也算;防跨工作区/已删除的 resume) */
  async function sessionExistsOnDisk(sessionId: string): Promise<boolean> {
    const metas = await listSessionMetas(workspace)
    return metas.some((m) => m.id === sessionId)
  }
})

function settingsSnapshot(workspace: string): SettingsSnapshot {
  const activeEnv = effectiveEnv()
  return {
    authentication: runtimeSettings.authentication,
    serverVersion: PKG_VERSION,
    contextScope: runtimeSettings.contextScope,
    model: runtimeSettings.model,
    permissionMode: runtimeSettings.permissionMode,
    effort: runtimeSettings.effort,
    endpointTemplate: runtimeSettings.endpointTemplate,
    currentEndpoint: activeEnv.ANTHROPIC_BASE_URL ?? process.env.ANTHROPIC_BASE_URL ?? null,
    currentModel: activeEnv.ANTHROPIC_MODEL ?? null,
    endpoints: listEndpointTemplates(),
    workspaces: listWorkspaces(),
    workspace: runtimeSettings.workspace,
    skills: listUserSkills().map(({ name, description }) => ({ name, description })),
    rules: listUserRules(),
    claudeMd: readClaudeMd(),
    slashCommands: listSlashCommands(workspace),
  }
}

process.on('SIGINT', () => {
  console.log('[ccweb] shutting down')
  for (const agent of new Set(registry.values())) agent.abort()
  server.close()
  process.exit(0)
})
