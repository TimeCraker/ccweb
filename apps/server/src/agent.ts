import { StreamMetrics } from './stream-metrics.js'
import { assertVerifiedRuntime, assertNoNativeBackground } from './runtime.js'
import { atomicWrite } from './config-api.js'
import { APP_DIR } from './settings.js'
import { mkdirSync, readFileSync, readdirSync, statSync, realpathSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type {
  Query,
  SDKUserMessage,
  PermissionResult,
  SpawnOptions,
  SpawnedProcess,
} from '@anthropic-ai/claude-agent-sdk'
import { spawn, spawnSync } from 'node:child_process'

/** user content 块(text/image)——SDK 类型对 content 要求 ContentBlockParam */
type UserContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
import type { ServerMessage } from './protocol.js'
import { computeMetrics, type MetricsAccumulator, newAccumulator } from './metrics.js'
import { runtimeSettings, effectiveEnv, nativeAuthenticationEnv } from './settings.js'

/**
 * Agent 桥接层(SPEC §2)
 *
 * 已核实的 SDK 事实与对应实现决策:
 * - 流式输入模式(prompt 传 AsyncGenerator):软中断 interrupt() 仅此模式可用
 * - includePartialMessages → stream_event:text_delta 打字机
 * - canUseTool 可无限期挂起:推 permission.ask 等 WS 回执 resolve
 * - env 是整体替换语义:必须 { ...process.env, … } 展开
 * - per-step output_tokens 是占位符:指标只信 result.modelUsage
 * - 单发模式 error result 后还会 throw:for-await 外套 try/catch
 */

/** 构建 agent 子进程 env —— 整体替换语义,必须展开 process.env(否则丢 PATH);
 * 运行时设置(端点模板/effort)叠加其上,新会话生效 */
export function buildAgentEnv(config = runtimeSettings): Record<string, string | undefined> {
  const env = effectiveEnv(config)
  const temporary = join(APP_DIR, 'tmp')
  mkdirSync(temporary, { recursive: true, mode: 0o700 })
  env.TMPDIR = temporary; env.TEMP = temporary; env.TMP = temporary
  env.CLAUDE_CODE_TMPDIR = temporary
  if (config.effort) env.CLAUDE_CODE_EFFORT_LEVEL = config.effort
  return env
}

/**
 * 上下文注入档位 → SDK settingSources(dsh 对照:完全不传 = none 档)。
 * full 与 claude CLI 行为一致;project/none 隔离跨工作区记忆泄漏。
 */
export function scopeToSettingSources(): Array<'user' | 'project' | 'local'> {
  return runtimeSettings.contextScope === 'none' ? [] : runtimeSettings.contextScope === 'project' ? ['project', 'local'] : ['user', 'project', 'local']
}

/** 推送到前端的消息出口 */
export type Emit = (msg: ServerMessage) => void

/** 手动驱动的 prompt 异步队列(流式输入模式);支持撤销未处理项 */
class PromptQueue {
  private buffered: SDKUserMessage[] = []
  private wakeup: (() => void) | null = null
  private closed = false

  push(msg: SDKUserMessage): void {
    this.buffered.push(msg)
    this.wakeup?.()
  }

  close(): void {
    this.closed = true
    this.wakeup?.()
  }

  /** 撤销一条未处理的排队消息 */
  remove(uuid: string): boolean {
    const i = this.buffered.findIndex((m) => m.uuid === uuid)
    if (i === -1) return false
    this.buffered.splice(i, 1)
    return true
  }

  async *stream(onYield?: (uuid: string) => void): AsyncGenerator<SDKUserMessage> {
    while (true) {
      if (this.buffered.length > 0) {
        const msg = this.buffered.shift()!
        if (msg.uuid) onYield?.(msg.uuid)
        yield msg
        continue
      }
      if (this.closed) return
      await new Promise<void>((resolve) => {
        this.wakeup = resolve
      })
      this.wakeup = null
    }
  }
}

/** canUseTool 挂起闸门:WS 回执 resolve + 会话级工具 allowlist */
class PermissionGate {
  constructor(private readonly onResolved: (id: string, allow: boolean) => void) {}
  toolName(id: string): string | undefined { return this.pending.get(id)?.toolName }
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  cancelAll(): void { for (const id of [...this.pending.keys()]) this.resolve(id, false, false) }
  private pending = new Map<
    string,
    { toolName: string; input: Record<string, unknown>; resolve: (r: PermissionResult) => void }
  >()
  /** 会话内"总是允许"的工具名集合 */
  readonly alwaysAllow = new Set<string>()

  wait(
    requestId: string,
    toolName: string,
    input: Record<string, unknown>,
    onAsk: (requestId: string, toolName: string, input: Record<string, unknown>) => void,
  ): Promise<PermissionResult> {

    return new Promise((resolve) => {
      this.pending.set(requestId, { toolName, input, resolve })
      const timer = setTimeout(() => this.resolve(requestId, false, false), 15 * 60_000)
      timer.unref()
      this.timers.set(requestId, timer)
      onAsk(requestId, toolName, input)
    })
  }

  resolve(
    requestId: string,
    allow: boolean,
    always: boolean,
    updatedInput?: Record<string, unknown>,
  ): boolean {
    const entry = this.pending.get(requestId)
    if (!entry) return false
    this.pending.delete(requestId)
    clearTimeout(this.timers.get(requestId))
    this.timers.delete(requestId)
    void always // Tool-wide implicit approvals are deliberately unsupported.
    if (allow) {
      entry.resolve({ behavior: 'allow', updatedInput: { ...entry.input, ...updatedInput } })
    } else {
      entry.resolve({ behavior: 'deny', message: entry.toolName === 'ExitPlanMode' ? '用户要求继续修改计划。请先将完整计划写入原生计划文件，在对话中给出摘要后再调用 ExitPlanMode。不要修改业务文件，等待用户采纳。' : 'User denied this action in ccweb.' })
    }
    this.onResolved(requestId, allow)
    return true
  }

  /** 断线重连后重放所有挂起中的审批 */
  replay(onAsk: (requestId: string, toolName: string, input: Record<string, unknown>) => void): void {
    for (const [requestId, entry] of this.pending) {
      onAsk(requestId, entry.toolName, entry.input)
    }
  }
}

export class AgentSession {
  promptQueue = new PromptQueue()
  private readonly gate = new PermissionGate((requestId, allow) => { const began = this.permissionWaits.get(requestId); if (began !== undefined) this.approvalWaitMs += Math.max(0, Date.now() - began); this.permissionWaits.delete(requestId); this.emit({ t: "permission.resolved", seq: 0, requestId, allow }) })
  private readonly acc: MetricsAccumulator = newAccumulator()
  private readonly streamMetrics = new StreamMetrics()
  private readonly childStreams = new Map<string, StreamMetrics>()
  private readonly permissionWaits = new Map<string, number>()
  private approvalWaitMs = 0
  private queueWaitMs = 0
  private retries: Array<{ id: string; attempt: number; delayMs: number; errorStatus: number | null }> = []
  private readonly baselinePaths = new Map<string, string>()
  private readonly fileBaselines: Record<string, { content: string | null; existed: boolean | null; reason?: string }> = {}
  private readonly seenResults = new Set<string>()
  private nativeToolTimes = new Map<string, number>()
  private runId: string | null = null
  private runStartedAt = 0
  private firstContentMs: number | null = null
  private speedScope: 'last_request' | 'turn' = 'last_request'
  private q: Query | undefined
  private started = false
  private abortController = new AbortController()
  /** 自定义 spawn 捕获的子进程 pid(树杀入口;dsh 借鉴:Windows 不信任优雅退出) */
  private childPid: number | null = null
  /** 排队未处理的消息(dsh QueueDock 对齐:可见、可撤销)+ 当前 turn 状态 */
  private turnActive = false
  private readonly pendingQueue: Array<{ uuid: string; summary: string; content: UserContentBlock[]; queuedAt: number }> = []

  sessionId: string | null = crypto.randomUUID()
  private paused = false
  private disposed = false
  private initialized = false
  private completedAt: number | null = null
  private terminalStatus: 'running' | 'completed' | 'failed' | 'cancelled' = 'running'
  private modelError: string | null = null
  private nativeTiming: { durationMs: number | null; apiDurationMs: number | null; modelUsage: unknown } = { durationMs: null, apiDurationMs: null, modelUsage: null }
  get isRunning(): boolean { return this.turnActive || this.pendingQueue.length > 0 }
  readonly settings = { ...runtimeSettings }
  get workspace(): string { return this.opts.cwd ?? process.cwd() }

  /** 最近 content_block_start(tool_use) 的 id——input_json_delta 只有 index,按最近 tool 块归属 */
  private activeToolUseId: string | null = null

  constructor(
    private readonly emit: Emit,
    private readonly opts: { cwd?: string; resume?: string; fork?: boolean } = {},
  ) {}

  /** 首次调用时启动底层 query(流式输入模式,常驻多轮) */
  ensureStarted(): void {
    if (this.started) return
    assertVerifiedRuntime()
    assertNoNativeBackground(buildAgentEnv(this.settings))
    this.started = true
    void this.run()
  }

  /** resume 场景:会话 id 已知,历史轮数由调用方回填 */
  seedTurns(n: number): void {
    this.acc.turns = n
  }

  send(text: string, images?: string[], uuid: string = crypto.randomUUID()): void {
    if (this.disposed) throw new Error("Session is closed. Start a new conversation.")
    const resumeNewRequest = this.paused
    this.ensureStarted()
    const summary = text.length > 80 ? `${text.slice(0, 80)}…` : text
    const content: UserContentBlock[] = [{ type: 'text', text }]
    // 图片附件:data URL → Anthropic image block
    for (const dataUrl of images ?? []) {
      const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl)
      if (!m?.[1] || !m[2]) continue
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: m[1], data: m[2] },
      })
    }
    // dsh Inbox 模式:排队由 server hold(SDK 会贪读 generator,直接进 queue 不可见);
    // turn 结束(result)后才 flush 下一条
    if (resumeNewRequest && !this.turnActive) {
      // A new explicit prompt runs first; interrupted backlog stays paused afterwards.
      this.pendingQueue.unshift({ uuid, summary, content, queuedAt: Date.now() })
      this.paused = false
      this.flushNext()
      this.paused = true
    } else {
      this.pendingQueue.push({ uuid, summary, content, queuedAt: Date.now() })
      this.emitQueue()
      if (!this.turnActive) this.flushNext()
    }
  }

  /** 把最旧一条排队消息交给 SDK */
  private flushNext(): void {
    if (this.paused) return
    const next = this.pendingQueue.shift()
    if (!next) {
      this.emitQueue()
      return
    }
    this.emitQueue() // 立即从展示中消失
    this.turnActive = true
    this.runId = next.uuid
    this.runStartedAt = Date.now()
    for (const key of Object.keys(this.fileBaselines)) delete this.fileBaselines[key]
    this.baselinePaths.clear()
    this.queueWaitMs = Math.max(0, this.runStartedAt - next.queuedAt); this.retries = []
    this.completedAt = null
    this.terminalStatus = 'running'
    this.streamMetrics.begin(this.runStartedAt)
    this.childStreams.clear(); this.approvalWaitMs = 0; this.nativeToolTimes.clear()
    this.firstContentMs = null
    this.modelError = null
    this.acc.ttftMs = null
    this.nativeTiming = { durationMs: null, apiDurationMs: null, modelUsage: null }
    this.speedScope = "last_request"
    const msg: SDKUserMessage = {
      type: 'user',
      session_id: this.sessionId ?? crypto.randomUUID(),
      message: { role: 'user', content: next.content as unknown as SDKUserMessage['message']['content'] },
      parent_tool_use_id: null,
      uuid: next.uuid,
      timestamp: new Date().toISOString(),
    } as SDKUserMessage
    this.emit({ t: "accepted", seq: 0, sessionId: this.sessionId ?? "", text: next.content.filter(c => c.type === "text").map(c => c.text).join("\n"), runId: next.uuid, images: next.content.flatMap(c => c.type === 'image' ? [`data:${c.source.media_type};base64,${c.source.data}`] : []) })
    this.acc.ttftMs = null
    this.acc.tokensPerSecond = null
    this.acc.turns += 1
    this.emitMetrics()
    this.promptQueue.push(msg)
  }

  /** 软中断:仅流式输入模式可用;进程存活、会话可继续 */
  async interrupt(): Promise<void> {
    this.paused = true
    this.terminalStatus = 'cancelled'
    this.gate.cancelAll()
    if (this.q) {
      // Initialization hooks or a wedged native control request must not hold Stop forever.
      await new Promise<void>(resolve => {
        let settled = false
        const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve() }
        const stopNative = () => { if (settled) return; this.abortController.abort(); this.killTree(); finish() }
        const timer = setTimeout(stopNative, 4000)
        void this.q!.interrupt().then(finish, stopNative)
      })
    }
    this.turnActive = false
    this.completedAt = Date.now()
    this.terminalStatus = 'cancelled'
    this.emitMetrics()
    this.emit({ t: "state", seq: 0, sessionId: this.sessionId ?? "", state: "cancelled" })
  }

  resumeQueue(): void { this.paused = false; this.ensureStarted(); if (!this.turnActive) this.flushNext() }

  /** 撤销排队消息(未开始处理的) */
  deleteQueued(uuid: string): boolean {
    const i = this.pendingQueue.findIndex((q) => q.uuid === uuid)
    if (i === -1) return false
    this.pendingQueue.splice(i, 1)
    this.emitQueue()
    return true
  }

  private emitQueue(): void {
    this.emit({
      t: 'queue',
      seq: 0,
      items: this.pendingQueue.map((q) => ({ uuid: q.uuid, text: q.summary })),
    })
  }

  /**
   * 彻底终止(dsh disposeClaudeCodeChild 顺序):close 流 → 树级强杀。
   * Windows 经验(dsh spawn.ts):优雅退出不可信,taskkill /T /F 是唯一原语;
   * 资源释放以子进程死亡为准,不以 close 事件为准。
   */
  abort(): void {
    this.disposed = true
    if (this.turnActive) { this.completedAt = Date.now(); this.terminalStatus = 'cancelled'; this.emitMetrics() }
    this.gate.cancelAll()
    this.abortController.abort()
    void (this.q as unknown as { close?: () => Promise<void> } | undefined)?.close?.()
    this.promptQueue.close()
    this.killTree()
    this.pendingQueue.length = 0
    this.turnActive = false
    this.emitQueue()
  }

  /** 树级终止:Windows taskkill /T /F;POSIX 进程组 SIGKILL 兜底单杀 */
  private killTree(): void {
    const pid = this.childPid
    this.childPid = null
    if (!pid) return
    try {
      if (process.platform === 'win32') {
        // 参数数组直传(无 shell),pid 为内部数字无注入面
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } else {
        try {
          process.kill(-pid, 'SIGKILL')
        } catch {
          try {
            process.kill(pid, 'SIGKILL')
          } catch {
            // 已退出
          }
        }
      }
    } catch {
      // 进程已不在(正常退出后的 retire)——静默
    }
  }

  /** 热切设置:模型/权限模式即时生效(q 方法);其余新会话生效 */
  async applySettings(patch: { model?: string | null; permissionMode?: string | null }): Promise<void> {
    if (patch.model !== undefined) { await this.q?.setModel(patch.model ?? undefined); this.settings.model = patch.model }
    if (patch.permissionMode !== undefined) {
      const mode = patch.permissionMode ?? 'default'
      if (!['default', 'auto', 'acceptEdits', 'plan', 'bypassPermissions'].includes(mode)) throw new Error('Unsupported permission mode')
      await this.q?.setPermissionMode(mode as NonNullable<typeof runtimeSettings.permissionMode>)
      this.settings.permissionMode = mode as NonNullable<typeof runtimeSettings.permissionMode>
    }
  }

  async mcpStatus(): Promise<Array<{ name: string; status: string; error?: string; scope?: string; source?: string; tools?: string[] }>> {
    if (!this.q) return []
    const status = await this.q.mcpServerStatus()
    // Do not return config/env/headers; SDK status may contain credentials.
    return status.map(({ name, status, error, scope, source, tools }) => ({ name, status, ...(error ? { error } : {}), ...(scope ? { scope } : {}), ...(source ? { source } : {}), ...(tools ? { tools: tools.map(tool => tool.name) } : {}) }))
  }
  async controlMcp(name: string, action: 'reconnect' | 'enable' | 'disable'): Promise<void> {
    if (!this.q) throw new Error('请先启动会话；保存配置不等于 MCP 已启动')
    if (!(await this.q.mcpServerStatus()).some(server => server.name === name)) throw new Error('当前运行时未发现此 MCP')
    if (action === 'reconnect') await this.q.reconnectMcpServer(name)
    else await this.q.toggleMcpServer(name, action === 'enable')
  }
  async stopTask(taskId: string): Promise<void> {
    if (!this.q) throw new Error('当前会话未启动')
    await this.q.stopTask(taskId)
  }
  async rewindFiles(userMessageId: string, dryRun: boolean) {
    if (!this.q || this.isRunning) throw new Error('请先完成或停止当前运行，再预览文件回退')
    return this.q.rewindFiles(userMessageId, { dryRun })
  }
  async models(): Promise<Array<{ value: string; displayName: string; description: string }>> {
    if (!this.q) throw new Error('模型发现需要已启动的原生会话；可先使用自定义模型')
    return this.q.supportedModels()
  }

  async resolvePermission(
    requestId: string,
    allow: boolean,
    always = false,
    updatedInput?: Record<string, unknown>,
  ): Promise<boolean> {
    const baseline = this.fileBaselines[requestId], file = this.baselinePaths.get(requestId)
    if (allow && this.gate.toolName(requestId) === 'Write' && file && baseline?.existed !== null && baseline?.existed !== undefined) {
      let same = false
      try {
        const actual = realpathSync(file), rel = relative(realpathSync(this.workspace), actual)
        if (rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.includes(':') && !rel.startsWith(sep) && statSync(actual).size <= 1024 * 1024) same = baseline.existed === true && readFileSync(actual, 'utf8') === baseline.content
      } catch (error) { same = (error as NodeJS.ErrnoException).code === 'ENOENT' && baseline.existed === false }
      if (!same) {
        this.emit({ t: 'error', seq: 0, code: 'file_conflict', message: '审批期间原文件发生变化或无法确认基线，已拒绝本次 Write。请让模型重新读取并审查差异；未覆盖用户文件。', retry: false })
        return this.gate.resolve(requestId, false, false)
      }
    }
    if (allow && this.gate.toolName(requestId) === "ExitPlanMode") await this.applySettings({ permissionMode: "default" })
    const ok = this.gate.resolve(requestId, allow, always, updatedInput)
    return ok
  }

  private async run(): Promise<void> {
    try {
      const settingSources = this.settings.contextScope === 'none' ? [] : this.settings.contextScope === 'project' ? ['project', 'local'] as const : ['user', 'project', 'local'] as const
      const plansDirectory = join(APP_DIR, 'plans', this.sessionId!)
      mkdirSync(plansDirectory, { recursive: true, mode: 0o700 })
      const q = query({
        prompt: this.promptQueue.stream(),
        options: {
          includePartialMessages: true,
          enableFileCheckpointing: true,
          systemPrompt: { type: 'preset', preset: 'claude_code' },
          settings: { plansDirectory, ...(this.settings.authentication === 'native' ? { env: nativeAuthenticationEnv(), apiKeyHelper: '' } : {}) },
          ...(process.env.CCWEB_MAX_BUDGET_USD ? { maxBudgetUsd: Number(process.env.CCWEB_MAX_BUDGET_USD) } : {}),
          ...(process.env.CCWEB_MAX_TURNS ? { maxTurns: Number(process.env.CCWEB_MAX_TURNS) } : {}),
          model: this.settings.model ?? undefined,
          permissionMode: this.settings.permissionMode ?? undefined,
          allowDangerouslySkipPermissions: this.settings.permissionMode === 'bypassPermissions',
          ...(this.opts.resume || this.initialized ? {} : { sessionId: this.sessionId ?? undefined }),
          settingSources: [...settingSources],
          abortController: this.abortController,
          // 接管 spawn:记录 pid 供树杀(dsh ManagedClaudeCodeProcess 借鉴)
          spawnClaudeCodeProcess: (opts: SpawnOptions): SpawnedProcess => {
            const cp = spawn(opts.command, opts.args, {
              cwd: opts.cwd,
              env: opts.env,
              stdio: ['pipe', 'pipe', 'pipe'],
              windowsHide: true,
            })
            this.childPid = cp.pid ?? null
            return cp
          },
          env: buildAgentEnv(this.settings),
          ...(this.opts.cwd ? { cwd: this.opts.cwd } : {}),
          ...(this.initialized ? { resume: this.sessionId ?? undefined } : this.opts.resume ? { resume: this.opts.resume } : {}),
          ...(this.opts.resume && this.opts.fork ? { forkSession: true } : {}),
          canUseTool: async (
            toolName: string,
            input: Record<string, unknown>,
            ctx: { toolUseID: string; title?: string; description?: string; signal?: AbortSignal },
          ): Promise<PermissionResult> => {
            const { toolUseID } = ctx
            if (toolName === 'Write' && typeof input.file_path === 'string') {
              let baseline: { content: string | null; existed: boolean | null; reason?: string } = { content: null, existed: null, reason: '原文件不可读取或不在当前工作区' }
              try {
                const file = resolve(this.workspace, input.file_path), root = realpathSync(this.workspace), rel = relative(root, file)
                if (rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.includes(':') && !rel.startsWith(sep)) {
                  try {
                    const actual = realpathSync(file), realRel = relative(root, actual)
                    if (realRel !== '..' && !realRel.startsWith(`..${sep}`) && !realRel.includes(':') && !realRel.startsWith(sep) && statSync(actual).isFile() && statSync(actual).size <= 1024 * 1024) baseline = { content: readFileSync(actual, 'utf8'), existed: true }
                  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') baseline = { content: '', existed: false } }
                }
              } catch { /* No arbitrary path fallback. */ }
              this.baselinePaths.set(toolUseID, resolve(this.workspace, input.file_path))
              this.fileBaselines[toolUseID] = baseline
              this.emit({ t: 'file.baseline', seq: 0, sessionId: this.sessionId ?? '', toolUseId: toolUseID, baseline })
              if (this.runId && this.sessionId) try { atomicWrite(join(APP_DIR, 'changes', this.sessionId, `${this.runId}.json`), JSON.stringify(this.fileBaselines)) } catch { /* Baseline persistence must not interrupt approval. */ }
            }
            return this.gate.wait(toolUseID, toolName, input, (id, name, inp) => {
              this.permissionWaits.set(id, Date.now())
              this.emit({
                t: 'permission.ask',
                seq: 0,
                requestId: id,
                sessionId: this.sessionId ?? '',
                toolName: name,
                title: ctx.title,
                description: ctx.description,
                ...(name === 'ExitPlanMode' ? { plan: typeof inp.plan === 'string' ? inp.plan : readCurrentPlan(plansDirectory, this.runStartedAt) } : {}),
                input: inp,
              })
            })
          },
        },
      })
      this.q = q
      for await (const msg of q) {
        this.handle(msg as Record<string, unknown>)
      }
      if (!this.disposed) throw new Error('Claude Code 运行流已关闭；请明确发送新请求以恢复。')
    } catch (err) {
      if (this.disposed) return
      this.gate.cancelAll()
      this.started = false
      this.turnActive = false
      this.paused = true
      this.q = undefined
      this.promptQueue.close()
      this.promptQueue = new PromptQueue()
      this.abortController = new AbortController()
      this.completedAt = Date.now()
      const cancelled = this.terminalStatus === 'cancelled'
      this.terminalStatus = cancelled ? 'cancelled' : 'failed'
      this.emitMetrics()
      this.emit({ t: 'state', seq: 0, sessionId: this.sessionId ?? '', state: this.terminalStatus })
      if (cancelled) return
      this.emit({
        t: 'error',
        seq: 0,
        code: 'agent_crashed',
        message: err instanceof Error ? err.message : String(err),
        retry: true,
      })
    }
  }

  private handle(msg: Record<string, unknown>): void {
    const type = msg.type as string
    const subtype = msg.subtype as string | undefined

    if (type === 'system' && subtype === 'init') {
      this.initialized = true
      this.sessionId = (msg.session_id as string) ?? this.sessionId
      this.emit({
        t: 'init',
        seq: 0,
        sessionId: this.sessionId,
        model: (msg.model as string) ?? null,
        endpoint: buildAgentEnv(this.settings).ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
        slashCommands: Array.isArray(msg.slash_commands)
          ? (msg.slash_commands as Array<string | { name?: string; description?: string }>)
              .map((c) => typeof c === 'string' ? ({ name: c, description: '' }) : ({ name: c.name ?? '', description: c.description ?? '' }))
              .filter((c) => c.name !== '')
          : [],
      })
      return
    }

    if (type === 'conversation_reset' && typeof msg.new_conversation_id === 'string') {
      if (this.sessionId === msg.new_conversation_id) return
      Object.assign(this.acc, newAccumulator())
      this.gate.cancelAll()
      this.sessionId = msg.new_conversation_id
      this.streamMetrics.begin(Date.now())
      this.firstContentMs = null
      this.emit({ t: 'cleared', seq: 0 })
      this.emit({ t: 'init', seq: 0, sessionId: this.sessionId, model: this.settings.model, endpoint: buildAgentEnv(this.settings).ANTHROPIC_BASE_URL ?? null, slashCommands: [] })
      this.emitMetrics()
      return
    }

    if (type === 'stream_event') {
      this.handleStreamEvent(msg)
      return
    }

    if (type === 'tool_progress' && typeof msg.tool_use_id === 'string' && typeof msg.elapsed_time_seconds === 'number') this.nativeToolTimes.set(msg.tool_use_id, Math.max(0, msg.elapsed_time_seconds * 1000))
    if (type === 'assistant' && typeof msg.error === 'string') this.modelError = msg.error
    if (type === 'system' && subtype === 'api_retry' && typeof msg.uuid === 'string' && !this.retries.some(sample => sample.id === msg.uuid)) this.retries.push({ id: msg.uuid, attempt: Number(msg.attempt), delayMs: Number(msg.retry_delay_ms), errorStatus: typeof msg.error_status === 'number' ? msg.error_status : null })
    if (type === 'result') {
      const resultId = typeof msg.uuid === 'string' ? msg.uuid : typeof msg.user_message_uuid === 'string' ? msg.user_message_uuid : null
      if (resultId && this.seenResults.has(resultId)) return
      if (resultId) { this.seenResults.add(resultId); if (this.seenResults.size > 10000) this.seenResults.delete(this.seenResults.values().next().value!) }
      if (this.terminalStatus === 'cancelled') msg = { ...msg, subtype: 'cancelled', is_error: false }
      else if (this.modelError || msg.is_error === true) {
        msg = { ...msg, subtype: 'error_during_execution', is_error: true }
        this.paused = true
        this.emit({ t: 'error', seq: 0, code: this.modelError ?? 'model_error', message: `模型请求失败：${this.modelError ?? '运行时报告错误'}。请检查连接、模型权限与额度。`, retry: false })
      }
      if (this.terminalStatus !== 'cancelled') this.terminalStatus = msg.subtype === 'success' ? 'completed' : 'failed'
      const summary = this.streamMetrics.summary()
      this.acc.tokensPerSecond = summary.speed
      this.speedScope = 'turn'
      this.firstContentMs = this.streamMetrics.firstContentMs
      this.turnActive = false
      this.completedAt = Date.now()
      applyResult(this.acc, msg)
      this.nativeTiming = { durationMs: typeof msg.duration_ms === 'number' ? msg.duration_ms : null, apiDurationMs: typeof msg.duration_api_ms === 'number' ? msg.duration_api_ms : null, modelUsage: msg.modelUsage ?? null }
      if (msg.subtype !== 'success') this.paused = true
      this.emitMetrics()
      this.emitContext()
      if (this.sessionId) this.emit({ t: 'message', seq: 0, sessionId: this.sessionId, sdkMessage: msg })
      this.flushNext()
      return
    }

    // 完整消息(message/result)一律转发,前端负责渲染其余类型
    if (this.sessionId) {
      this.emit({ t: 'message', seq: 0, sessionId: this.sessionId, sdkMessage: msg })
    }
  }

  /** stream_event 细分转发:块边界(thinking/text/tool_use)+ 三类增量 */
  private handleStreamEvent(msg: Record<string, unknown>): void {
    const event = msg.event as Record<string, unknown> | undefined
    if (!event) return
    if (msg.parent_tool_use_id == null) {
      this.streamMetrics.observe(event, Date.now())
      this.firstContentMs = this.streamMetrics.firstContentMs
      this.acc.tokensPerSecond = this.streamMetrics.latestSpeed
      if (event.type === 'message_stop') this.emitMetrics()
    } else if (typeof msg.parent_tool_use_id === 'string') {
      let stream = this.childStreams.get(msg.parent_tool_use_id)
      if (!stream) { stream = new StreamMetrics(); stream.begin(this.runStartedAt); this.childStreams.set(msg.parent_tool_use_id, stream) }
      stream.observe(event, Date.now())
    }
    const sid = this.sessionId ?? ''

    if (event.type === 'message_start' && typeof msg.ttft_ms === 'number') {
      this.acc.ttftMs = msg.ttft_ms
      this.emitMetrics()
      return
    }

    if (event.type === 'content_block_start') {
      const block = event.content_block as Record<string, unknown> | undefined
      const blockType = block?.type as string | undefined
      if (blockType === 'thinking' || blockType === 'text' || blockType === 'tool_use') {
        if (blockType === 'tool_use' && typeof block?.id === 'string') {
          this.activeToolUseId = block.id
        }
        this.emit({
          t: 'block',
          seq: 0,
          sessionId: sid,
          action: 'start',
          blockType,
          index: event.index as number,
          toolUseId: block?.id as string | undefined,
          toolName: block?.name as string | undefined,
        })
      }
      return
    }

    if (event.type === 'content_block_stop') {
      this.emit({
        t: 'block',
        seq: 0,
        sessionId: sid,
        action: 'stop',
        blockType: 'text', // stop 不区分;前端按 index 对齐
        index: event.index as number,
      })
      return
    }

    if (event.type === 'content_block_delta') {
      const delta = event.delta as Record<string, unknown> | undefined
      if (!delta) return
      if (delta.type === 'text_delta') {
        this.emit({ t: 'delta', seq: 0, sessionId: sid, kind: 'text', text: delta.text as string })
      } else if (delta.type === 'thinking_delta') {
        this.emit({ t: 'delta', seq: 0, sessionId: sid, kind: 'thinking', text: delta.thinking as string })
      } else if (delta.type === 'input_json_delta') {
        this.emit({
          t: 'delta',
          seq: 0,
          sessionId: sid,
          kind: 'tool_input',
          text: delta.partial_json as string,
          toolUseId: this.activeToolUseId ?? undefined,
        })
      }
      return
    }
  }

  /** 上下文水位:每轮 result 后从 accumulator 推送(usedTokens/maxTokens,前端兼容) */
  private emitContext(): void {
    void this.q?.getContextUsage().then(usage => {
      this.emit({ t: 'context', seq: 0, sessionId: this.sessionId ?? '', usage })
    }).catch(() => { /* Native context unavailable; do not label accounting totals as context. */ })
  }

  private emitMetrics(): void {
    if (!this.sessionId) return
    const metrics = { ...computeMetrics(this.acc), terminalStatus: this.terminalStatus, runId: this.runId, firstContentMs: this.firstContentMs, speedScope: this.speedScope, runStartedAt: this.runStartedAt || null, completedAt: this.completedAt, sampledRequests: this.streamMetrics.summary().sampled, metricsComplete: this.streamMetrics.summary().complete, requests: [...this.streamMetrics.samples(), ...[...this.childStreams].flatMap(([parentToolUseId, stream]) => stream.samples().map(sample => ({ ...sample, role: 'subagent' as const, parentToolUseId })))], approvalWaitMs: this.approvalWaitMs + [...this.permissionWaits.values()].reduce((total, began) => total + Math.max(0, Date.now() - began), 0), toolTimes: Object.fromEntries(this.nativeToolTimes), queueWaitMs: this.queueWaitMs, retries: this.retries, nativeTiming: this.nativeTiming }
    this.emit({ t: 'metrics', seq: 0, sessionId: this.sessionId, metrics })
    if (this.runId) {
      try { atomicWrite(join(APP_DIR, 'metrics', this.sessionId, `${this.runId}.json`), JSON.stringify(metrics)) } catch { /* Metrics persistence must not break execution. */ }
    }
  }
}

/** result 消息落库:modelUsage 权威累计 + 本轮回转速度 + 上下文水位 */
function applyResult(acc: MetricsAccumulator, result: Record<string, unknown>): void {
  const modelUsage = result.modelUsage as
    | Record<string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number; contextWindow?: number }>
    | undefined
  if (modelUsage) {
    let input = 0
    let output = 0
    let cacheRead = 0
    let cacheCreation = 0
    let ctxMax: number | null = null
    for (const u of Object.values(modelUsage)) {
      input += u.inputTokens ?? 0
      output += u.outputTokens ?? 0
      cacheRead += u.cacheReadInputTokens ?? 0
      cacheCreation += u.cacheCreationInputTokens ?? 0
      if (typeof u.contextWindow === 'number' && u.contextWindow > 0) ctxMax = u.contextWindow
    }
    acc.inputTokens = Math.max(acc.inputTokens, input)
    acc.outputTokens = Math.max(acc.outputTokens, output)
    acc.cacheReadTokens = Math.max(acc.cacheReadTokens, cacheRead)
    acc.cacheCreationTokens = Math.max(acc.cacheCreationTokens, cacheCreation)
    acc.contextMax = ctxMax
  }
  if (typeof result.total_cost_usd === 'number') acc.totalCostUsd = Math.max(acc.totalCostUsd ?? 0, result.total_cost_usd)
  if (typeof result.ttft_ms === 'number') acc.ttftMs = result.ttft_ms

  const usage = result.usage as
    | { output_tokens?: number; input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
    | undefined
  // 上下文水位 = 最近一轮输入侧 token(该轮 prompt 总量,即当前上下文占用)
  if (usage) {
    acc.contextUsed =
      (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
  }

  // Decode throughput is supplied by paired stream samples, never total turn duration.
}

/** Read only the current session's native plan, never arbitrary tool paths. */
function readCurrentPlan(directory: string, startedAt: number): string | undefined {
  try {
    const files = readdirSync(directory, { withFileTypes: true }).filter(file => file.isFile() && file.name.endsWith('.md')).map(file => ({ path: join(directory, file.name), stat: statSync(join(directory, file.name)) })).filter(file => file.stat.mtimeMs >= startedAt - 1000 && file.stat.size <= 1024 * 1024).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    return files[0] ? readFileSync(files[0].path, 'utf8') : undefined
  } catch { return undefined }
}
