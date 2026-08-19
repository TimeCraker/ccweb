import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Query, SDKUserMessage, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import type { ServerMessage } from './protocol.js'
import { computeMetrics, type MetricsAccumulator, newAccumulator } from './metrics.js'
import { runtimeSettings, endpointEnv } from './settings.js'

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
export function buildAgentEnv(): Record<string, string | undefined> {
  const extra = endpointEnv(runtimeSettings.endpointTemplate)
  const env: Record<string, string | undefined> = { ...process.env, ...extra }
  if (runtimeSettings.effort) env.CLAUDE_CODE_EFFORT_LEVEL = runtimeSettings.effort
  return env
}

/** 推送到前端的消息出口 */
export type Emit = (msg: ServerMessage) => void

/** 手动驱动的 prompt 异步队列(流式输入模式) */
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

  async *stream(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      if (this.buffered.length > 0) {
        yield this.buffered.shift()!
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
    if (this.alwaysAllow.has(toolName)) {
      return Promise.resolve({ behavior: 'allow' })
    }
    onAsk(requestId, toolName, input)
    return new Promise((resolve) => {
      this.pending.set(requestId, { toolName, input, resolve })
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
    if (allow && always) this.alwaysAllow.add(entry.toolName)
    if (allow) {
      entry.resolve({ behavior: 'allow', updatedInput })
    } else {
      entry.resolve({ behavior: 'deny', message: 'User denied this action in ccweb.' })
    }
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
  readonly promptQueue = new PromptQueue()
  private readonly gate = new PermissionGate()
  private readonly acc: MetricsAccumulator = newAccumulator()
  private q: Query | undefined
  private started = false

  sessionId: string | null = null
  /** 最近 content_block_start(tool_use) 的 id——input_json_delta 只有 index,按最近 tool 块归属 */
  private activeToolUseId: string | null = null
  private contextTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly emit: Emit,
    private readonly opts: { cwd?: string; resume?: string; fork?: boolean } = {},
  ) {}

  /** 首次调用时启动底层 query(流式输入模式,常驻多轮) */
  ensureStarted(): void {
    if (this.started) return
    this.started = true
    void this.run()
  }

  /** resume 场景:会话 id 已知,历史轮数由调用方回填 */
  seedTurns(n: number): void {
    this.acc.turns = n
  }

  send(text: string): void {
    this.ensureStarted()
    const content = [{ type: 'text' as const, text }]
    // 首条消息无 session_id(SDK 分配);后续带 session_id 续在同一会话
    const msg: SDKUserMessage = {
      type: 'user',
      session_id: this.sessionId ?? crypto.randomUUID(),
      message: { role: 'user', content },
      parent_tool_use_id: null,
      uuid: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }
    this.acc.turns += 1
    this.emitMetrics()
    this.promptQueue.push(msg)
  }

  /** 软中断:仅流式输入模式可用;进程存活、会话可继续 */
  async interrupt(): Promise<void> {
    await this.q?.interrupt()
  }

  /** 热切设置:模型/权限模式即时生效(q 方法);其余新会话生效 */
  applySettings(patch: {
    model?: string | null
    permissionMode?: string | null
  }): void {
    if (patch.model != null) {
      void (this.q as unknown as { setModel?: (m: string) => Promise<void> })?.setModel?.(patch.model)
    }
    if (patch.permissionMode != null) {
      void (this.q as unknown as { setPermissionMode?: (p: string) => Promise<void> })?.setPermissionMode?.(
        patch.permissionMode,
      )
    }
  }

  /** MCP 服务器状态(设置页展示) */
  async mcpStatus(): Promise<Array<{ name: string; status: string }>> {
    try {
      const status = await (
        this.q as unknown as { mcpServerStatus?: () => Promise<Record<string, unknown>> }
      )?.mcpServerStatus?.()
      if (status && typeof status === 'object') {
        return Object.entries(status).map(([name, v]) => ({
          name,
          status: typeof v === 'object' && v && 'status' in (v as object)
            ? String((v as { status: unknown }).status)
            : String(v),
        }))
      }
    } catch {
      // 查询失败按空处理
    }
    return []
  }

  resolvePermission(
    requestId: string,
    allow: boolean,
    always = false,
    updatedInput?: Record<string, unknown>,
  ): boolean {
    const ok = this.gate.resolve(requestId, allow, always, updatedInput)
    if (ok) this.emit({ t: 'permission.resolved', seq: 0, requestId, allow })
    return ok
  }

  private async run(): Promise<void> {
    try {
      const q = query({
        prompt: this.promptQueue.stream(),
        options: {
          includePartialMessages: true,
          settingSources: ['user', 'project', 'local'],
          env: buildAgentEnv(),
          ...(this.opts.cwd ? { cwd: this.opts.cwd } : {}),
          ...(this.opts.resume ? { resume: this.opts.resume } : {}),
          ...(this.opts.resume && this.opts.fork ? { forkSession: true } : {}),
          canUseTool: async (
            toolName: string,
            input: Record<string, unknown>,
            ctx: { toolUseID: string },
          ): Promise<PermissionResult> => {
            const { toolUseID } = ctx
            return this.gate.wait(toolUseID, toolName, input, (id, name, inp) => {
              this.emit({
                t: 'permission.ask',
                seq: 0,
                requestId: id,
                sessionId: this.sessionId ?? '',
                toolName: name,
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
    } catch (err) {
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
      this.sessionId = (msg.session_id as string) ?? this.sessionId
      this.emit({
        t: 'init',
        seq: 0,
        sessionId: this.sessionId,
        model: (msg.model as string) ?? null,
        endpoint: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
      })
      return
    }

    if (type === 'stream_event') {
      this.handleStreamEvent(msg)
      return
    }

    if (type === 'result' && subtype === 'success') {
      applyResult(this.acc, msg)
      this.emitMetrics()
      void this.pushContextUsage()
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

  /** 上下文水位:事件驱动(result 后)+ 会话进行中低频轮询 */
  private async pushContextUsage(): Promise<void> {
    const q = this.q
    if (!q || typeof (q as unknown as { getContextUsage?: unknown }).getContextUsage !== 'function') {
      return
    }
    try {
      const usage = await (q as unknown as { getContextUsage: () => Promise<unknown> }).getContextUsage()
      if (usage && this.sessionId) {
        this.emit({ t: 'context', seq: 0, sessionId: this.sessionId, usage })
        if (!this.contextTimer) {
          this.contextTimer = setInterval(() => void this.pushContextUsage(), 15_000)
        }
      }
    } catch {
      // 上下文探测失败不影响主流程
    }
  }

  private emitMetrics(): void {
    if (!this.sessionId) return
    this.emit({ t: 'metrics', seq: 0, sessionId: this.sessionId, metrics: computeMetrics(this.acc) })
  }
}

/** result 消息落库:modelUsage 权威累计 + 本轮回转速度 */
function applyResult(acc: MetricsAccumulator, result: Record<string, unknown>): void {
  const modelUsage = result.modelUsage as
    | Record<string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number }>
    | undefined
  if (modelUsage) {
    let input = 0
    let output = 0
    let cacheRead = 0
    let cacheCreation = 0
    for (const u of Object.values(modelUsage)) {
      input += u.inputTokens ?? 0
      output += u.outputTokens ?? 0
      cacheRead += u.cacheReadInputTokens ?? 0
      cacheCreation += u.cacheCreationInputTokens ?? 0
    }
    acc.inputTokens = input
    acc.outputTokens = output
    acc.cacheReadTokens = cacheRead
    acc.cacheCreationTokens = cacheCreation
  }
  if (typeof result.total_cost_usd === 'number') acc.totalCostUsd = result.total_cost_usd
  if (typeof result.ttft_ms === 'number') acc.ttftMs = result.ttft_ms

  // 本轮回转输出速度:主循环 output ÷ (duration - ttft)
  const usage = result.usage as { output_tokens?: number } | undefined
  const durationMs = typeof result.duration_ms === 'number' ? result.duration_ms : null
  if (usage?.output_tokens && durationMs && acc.ttftMs != null && durationMs > acc.ttftMs) {
    acc.tokensPerSecond = (usage.output_tokens / (durationMs - acc.ttftMs)) * 1000
  }
}
