import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import type { Options, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { ServerMessage } from './protocol.js'
const mock = vi.hoisted(() => ({ options: [] as Options[], mode: 'success', order: [] as string[], rejectInterrupt: null as null | ((error: Error) => void) }))
vi.mock('./runtime.js', () => ({ assertVerifiedRuntime: () => undefined, assertNoNativeBackground: () => undefined }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ prompt, options }: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => {
    mock.options.push(options)
    const generator = (async function* () {
      yield { type: 'system', subtype: 'init', session_id: options.resume ?? options.sessionId, model: options.model ?? 'sonnet', slash_commands: ['compact'] }
      if (mock.mode === 'crash') throw new Error('synthetic crash')
      for await (const message of prompt) {
        if (mock.mode === 'reset') { yield { type: 'conversation_reset', new_conversation_id: 'reset-session', session_id: options.sessionId }; yield { type: 'conversation_reset', new_conversation_id: 'reset-session', session_id: options.sessionId } }
        if (mock.mode === 'plan') {
          const directory = (options.settings as { plansDirectory: string }).plansDirectory
          writeFileSync(join(directory, 'current.md'), '# Current plan\n\nReview before execution.')
          await options.canUseTool!('ExitPlanMode', {}, { toolUseID: 'plan-test', requestId: 'plan-control', signal: new AbortController().signal })
        }
        if (mock.mode === 'approval') {
          const result = await options.canUseTool!('Write', { file_path: 'test.txt' }, { toolUseID: 'approval-test', requestId: 'approval-control', signal: new AbortController().signal })
          mock.order.push(result?.behavior ?? 'pending')
        }
        yield { type: 'result', subtype: mock.mode.startsWith('failed') ? 'error_during_execution' : 'success', usage: {}, modelUsage: mock.mode === 'failed-usage' ? { test: {inputTokens: 10, outputTokens: 7} } : {}, total_cost_usd: mock.mode === 'failed-usage' ? 0.25 : 0, user_message_uuid: message.uuid }
      }
    })()
    return Object.assign(generator, {
      interrupt: async () => { mock.order.push('interrupt'); if (mock.mode === 'hung-interrupt') await new Promise((_resolve, reject) => { mock.rejectInterrupt = reject }) },
      close: () => undefined,
      setModel: async (model?: string) => { mock.order.push(`model:${model}`) },
      setPermissionMode: async (mode: string) => { if (mode === 'auto') throw new Error('auto unavailable'); mock.order.push(`mode:${mode}`) },
      supportedModels: async () => [{ value: 'discovered', displayName: 'Discovered', description: 'Test' }],
      reconnectMcpServer: async (name: string) => { mock.order.push(`mcp-reconnect:${name}`) },
      toggleMcpServer: async (name: string, enabled: boolean) => { mock.order.push(`mcp-toggle:${name}:${enabled}`) },
      rewindFiles: async (id: string, options: { dryRun: boolean }) => ({ canRewind: true, filesChanged: [id], dryRun: options.dryRun }),
      stopTask: async (id: string) => { mock.order.push(`stop:${id}`) },
      mcpServerStatus: async () => [{ name: 'test-server', status: 'connected' }],
      getContextUsage: async () => ({ usage: { total_tokens: 50, raw_max_tokens: 100, percentage: 50 } }),
    })
  },
}))
let Agent: typeof import('./agent.js').AgentSession
let settings: typeof import('./settings.js').runtimeSettings
let temporary: string
const agents: Array<InstanceType<typeof Agent>> = []
beforeAll(async () => {
  temporary = mkdtempSync(join(tmpdir(), 'ccweb-agent-test-'))
  process.env.CCWEB_HOME = join(temporary, 'app')
  process.env.CLAUDE_CONFIG_DIR = join(temporary, 'claude')
  mkdirSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true })
  Agent = (await import('./agent.js')).AgentSession
  settings = (await import('./settings.js')).runtimeSettings
})
beforeEach(() => {
  for (const agent of agents.splice(0)) agent.abort()
  mock.mode = 'success'; mock.options.length = 0; mock.order.length = 0
  Object.assign(settings, { authentication: 'inherit', model: 'sonnet', permissionMode: 'plan', contextScope: 'none', effort: null, endpointTemplate: null })
})
afterAll(() => {
  for (const agent of agents) agent.abort()
  if (!resolve(temporary).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe temporary path')
  rmSync(temporary, { recursive: true, force: true })
})
function create(events: ServerMessage[]) { const agent = new Agent(event => events.push(event)); agents.push(agent); return agent }
describe('AgentSession SDK adapter contracts (simulated SDK)', () => {
  it('passes initial model, native permission and explicit empty setting sources', async () => {
    const events: ServerMessage[] = [], agent = create(events)
    agent.send('hello')
    expect(mock.options[0]?.model).toBe('sonnet')
    expect(mock.options[0]?.permissionMode).toBe('plan')
    expect(mock.options[0]?.settingSources).toEqual([])
    expect(mock.options[0]?.env?.TEMP).toBe(join(temporary, 'app', 'tmp'))
    expect(mock.options[0]?.settings).toEqual({ plansDirectory: join(temporary, 'app', 'plans', agent.sessionId!) })
    expect(mock.options[0]?.systemPrompt).toEqual({ type: 'preset', preset: 'claude_code' })
    await vi.waitFor(() => expect(events.some(e => e.t === 'message')).toBe(true))
    expect(await agent.mcpStatus()).toEqual([{ name: 'test-server', status: 'connected' }])
  })
  it('native authentication never reuses an inherited third-party bearer or endpoint', async () => {
    const previous = { token: process.env.ANTHROPIC_AUTH_TOKEN, key: process.env.ANTHROPIC_API_KEY, url: process.env.ANTHROPIC_BASE_URL }
    process.env.ANTHROPIC_AUTH_TOKEN = 'private-third-party-token'; process.env.ANTHROPIC_API_KEY = 'private-third-party-key'; process.env.ANTHROPIC_BASE_URL = 'https://third-party.example'
    try {
      const { buildAgentEnv } = await import('./agent.js')
      const env = buildAgentEnv({ ...settings, authentication: 'native' })
      expect(env.ANTHROPIC_AUTH_TOKEN).toBe('')
      expect(env.ANTHROPIC_API_KEY).toBe('')
      expect(env.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com')
      expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe('private-third-party-token')
      Object.assign(settings, { authentication: 'native' })
      const agent = create([]); agent.send('hello')
      expect(mock.options[0]?.settings).toMatchObject({ env: { ANTHROPIC_AUTH_TOKEN: '', ANTHROPIC_API_KEY: '' }, apiKeyHelper: '' })
    } finally {
      if (previous.token === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN; else process.env.ANTHROPIC_AUTH_TOKEN = previous.token
      if (previous.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous.key
      if (previous.url === undefined) delete process.env.ANTHROPIC_BASE_URL; else process.env.ANTHROPIC_BASE_URL = previous.url
      settings.authentication = 'inherit'
    }
  })
  it('uses real SDK control contracts and rejects unknown MCP names', async () => {
    const agent = create([])
    await expect(agent.models()).rejects.toThrow('已启动')
    agent.send('hello')
    await vi.waitFor(() => expect(mock.options).toHaveLength(1))
    expect(mock.options[0]?.enableFileCheckpointing).toBe(true)
    expect((await agent.models())[0]?.value).toBe('discovered')
    await agent.controlMcp('test-server', 'disable')
    await agent.controlMcp('test-server', 'reconnect')
    await expect(agent.controlMcp('foreign', 'enable')).rejects.toThrow('未发现')
    expect(mock.order).toContain('mcp-toggle:test-server:false')
    expect(mock.order).toContain('mcp-reconnect:test-server')
  })
  it('preserves a pending approval until explicitly resolved, without tool-wide allow', async () => {
    mock.mode = 'approval'
    const events: ServerMessage[] = [], agent = create(events)
    agent.send('write')
    await vi.waitFor(() => expect(events.some(e => e.t === 'permission.ask')).toBe(true))
    expect(await agent.resolvePermission('approval-test', true, true)).toBe(true)
    await vi.waitFor(() => expect(mock.order).toContain('allow'))
    agent.send('write again')
    await vi.waitFor(() => expect(events.filter(e => e.t === 'permission.ask')).toHaveLength(2))
    await agent.interrupt()
    await vi.waitFor(() => expect(mock.order).toContain('deny'))
    expect(events.some(e => e.t === 'permission.resolved' && !e.allow)).toBe(true)
  })
  it('rejects Write when the original file changes while approval is pending', async () => {
    mock.mode = 'approval'
    const events: ServerMessage[] = [], agent = new Agent(event => events.push(event), { cwd: temporary }); agents.push(agent)
    const file = join(temporary, 'test.txt'); writeFileSync(file, 'original')
    agent.send('write')
    await vi.waitFor(() => expect(events.some(e => e.t === 'permission.ask')).toBe(true))
    expect(events.some(e => e.t === 'file.baseline' && e.baseline.content === 'original')).toBe(true)
    writeFileSync(file, 'external change')
    await agent.resolvePermission('approval-test', true)
    await vi.waitFor(() => expect(mock.order).toContain('deny'))
    expect(events.some(e => e.t === 'error' && e.code === 'file_conflict')).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe('external change')
  })
  it('rebuilds the query after a crash without resubmitting the failed prompt', async () => {
    mock.mode = 'crash'
    const events: ServerMessage[] = [], agent = create(events)
    agent.send('first')
    await vi.waitFor(() => expect(events.some(e => e.t === 'error')).toBe(true))
    mock.mode = 'success'; agent.send('explicit retry')
    await vi.waitFor(() => expect(mock.options).toHaveLength(2))
    expect(mock.options[1]?.resume).toBe(agent.sessionId)
  })
  it('does not acknowledge unsupported native auto mode as applied', async () => {
    const events: ServerMessage[] = [], agent = create(events)
    agent.send('hello')
    await vi.waitFor(() => expect(events.some(e => e.t === 'init')).toBe(true))
    await expect(agent.applySettings({ permissionMode: 'auto' })).rejects.toThrow('auto unavailable')
    expect(agent.settings.permissionMode).toBe('plan')
  })
  it('presents the current native plan and switches to manual mode only after adoption', async () => {
    mock.mode = 'plan'
    const events: ServerMessage[] = [], agent = create(events)
    agent.send('plan')
    await vi.waitFor(() => expect(events.some(e => e.t === 'permission.ask' && e.plan?.includes('Review before execution.'))).toBe(true))
    expect(agent.settings.permissionMode).toBe('plan')
    await agent.resolvePermission('plan-test', true)
    expect(agent.settings.permissionMode).toBe('default')
    expect(mock.order).toContain('mode:default')
  })

  it('resets usage on native conversation reset instead of keeping an eternal maximum', async () => {
    mock.mode = 'failed-usage'
    const events: ServerMessage[] = [], agent = create(events)
    agent.send('spend')
    await vi.waitFor(() => expect(events.some(e => e.t === 'metrics' && e.metrics.outputTokens === 7)).toBe(true))
    mock.mode = 'reset'; agent.send('reset')
    await vi.waitFor(() => expect(events.some(e => e.t === 'init' && e.sessionId === 'reset-session')).toBe(true))
    const last = events.filter(e => e.t === 'metrics').at(-1)
    expect(last?.t === 'metrics' && last.metrics.outputTokens).toBe(0)
    expect(events.filter(e => e.t === 'cleared')).toHaveLength(1)
  })

  it('bounds a hung interrupt and ignores a late rejection after cancellation', async () => {
    mock.mode = 'hung-interrupt'
    const events: ServerMessage[] = [], agent = create(events)
    agent.send('hello')
    await vi.waitFor(() => expect(events.some(e => e.t === 'init')).toBe(true))
    vi.useFakeTimers()
    try {
      const stopping = agent.interrupt()
      await vi.advanceTimersByTimeAsync(4001)
      await stopping
      expect(mock.options[0]?.abortController?.signal.aborted).toBe(true)
      mock.rejectInterrupt?.(new Error('late native rejection'))
      await Promise.resolve()
      expect(events.filter(e => e.t === 'state' && e.state === 'cancelled')).toHaveLength(1)
    } finally { vi.useRealTimers() }
  })
  it('retains failure usage and does not erase it on a zeroed failure', async () => {
    mock.mode = 'failed-usage'
    const events: ServerMessage[] = [], agent = create(events)
    agent.send('fails after spending')
    await vi.waitFor(() => expect(events.some(e => e.t === 'metrics' && e.metrics.totalCostUsd === 0.25 && e.metrics.outputTokens === 7)).toBe(true))
    mock.mode = 'failed-zero'
    agent.send('explicit retry')
    await vi.waitFor(() => expect(events.filter(e => e.t === 'message')).toHaveLength(2))
    const last = events.filter(e => e.t === 'metrics').at(-1)
    expect(last?.t === 'metrics' && last.metrics.totalCostUsd).toBe(0.25)
  })

})
