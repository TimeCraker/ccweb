import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

let temporary: string
let module: typeof import('./connections.js')
let settings: typeof import('./settings.js')

beforeAll(async () => {
  temporary = mkdtempSync(join(tmpdir(), 'ccweb-connections-test-'))
  process.env.CCWEB_HOME = join(temporary, 'app')
  process.env.CLAUDE_CONFIG_DIR = join(temporary, 'claude')
  module = await import('./connections.js')
  settings = await import('./settings.js')
})

afterAll(() => {
  if (!resolve(temporary).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe temporary path')
  rmSync(temporary, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

describe('connection URL normalization', () => {
  it('canonicalizes /v1 and /v1/messages to the runtime base root', () => {
    expect(module.normalizeBaseUrl(' https://api.example.com/anthropic/ ')).toBe('https://api.example.com/anthropic')
    expect(module.normalizeBaseUrl('https://api.example.com')).toBe('https://api.example.com')
    expect(module.normalizeBaseUrl('http://localhost:8080/v1/')).toBe('http://localhost:8080')
    expect(module.normalizeBaseUrl('http://localhost:8080/anthropic/v1')).toBe('http://localhost:8080/anthropic')
    expect(module.normalizeBaseUrl('http://localhost:8080/anthropic/v1/messages')).toBe('http://localhost:8080/anthropic')
  })

  it('rejects credentials, query strings, non-http protocols and unsupported /messages paths', () => {
    expect(() => module.normalizeBaseUrl('https://user:pass@api.example.com')).toThrow('凭证')
    expect(() => module.normalizeBaseUrl('https://api.example.com?token=1')).toThrow('查询参数')
    expect(() => module.normalizeBaseUrl('ftp://api.example.com')).toThrow('http')
    expect(() => module.normalizeBaseUrl('')).toThrow('接口地址')
    expect(() => module.normalizeBaseUrl('https://api.example.com/custom/messages')).toThrow('/messages')
  })

  it('uses exactly one /v1/messages suffix for probe and runtime', () => {
    expect(module.resolveMessagesUrl('https://api.example.com')).toBe('https://api.example.com/v1/messages')
    expect(module.resolveMessagesUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1/messages')
    expect(module.resolveMessagesUrl('https://api.example.com/v1/messages')).toBe('https://api.example.com/v1/messages')
    expect(module.resolveMessagesUrl('https://api.example.com/anthropic/v1')).toBe('https://api.example.com/anthropic/v1/messages')
  })
})

describe('connection storage', () => {
  it('stores credentials privately and never returns the key', () => {
    const saved = module.saveConnection({ name: '我的 GLM', baseUrl: 'https://api.example.com/anthropic', model: 'glm-5.3', apiKey: 'sk-secret-value' })
    expect(saved.hasKey).toBe(true)
    expect(Object.keys(saved)).not.toContain('apiKey')
    const raw = readFileSync(join(temporary, 'app', 'connections.json'), 'utf8')
    expect(raw).toContain('sk-secret-value')
    if (process.platform !== 'win32') {
      expect(statSync(join(temporary, 'app', 'connections.json')).mode & 0o777).toBe(0o600)
    }
    const listed = module.listConnections()
    expect(listed).toHaveLength(1)
    expect(JSON.stringify(listed)).not.toContain('sk-secret-value')
    expect(listed[0]?.name).toBe('我的 GLM')
  })

  it('keeps the stored key when updating without a new one and clears it explicitly', () => {
    const [first] = module.listConnections()
    const updated = module.saveConnection({ key: first!.key, name: '改名', baseUrl: 'https://api.example.com/v1', model: null })
    expect(updated.key).toBe(first!.key)
    expect(updated.hasKey).toBe(true)
    expect(updated.model).toBe(null)
    expect(updated.baseUrl).toBe('https://api.example.com')
    const cleared = module.saveConnection({ key: first!.key, baseUrl: 'https://api.example.com/v1', apiKey: '' })
    expect(cleared.hasKey).toBe(false)
  })

  it('merges ccweb connections into endpoint templates and runtime env', () => {
    const [connection] = module.listConnections()
    const templateKey = module.templateKeyOf(connection!.key)
    const templates = settings.listEndpointTemplates()
    const match = templates.find((item) => item.key === templateKey)
    expect(match?.name).toBe('改名')
    expect(match?.baseUrl).toBe('https://api.example.com')
    expect(JSON.stringify(templates)).not.toContain('sk-secret-value')
    const env = settings.endpointEnv(templateKey)
    expect(env.ANTHROPIC_BASE_URL).toBe('https://api.example.com')
    expect(settings.endpointEnv('ccweb-missing')).toEqual({})
  })

  it('removes connections without touching templates on disk', () => {
    const [connection] = module.listConnections()
    expect(module.removeConnection(connection!.key)).toBe(true)
    expect(module.removeConnection(connection!.key)).toBe(false)
    expect(module.listConnections()).toHaveLength(0)
    expect(settings.listEndpointTemplates()).toEqual([])
  })
})

describe('explicit connection auth isolation', () => {
  it('does not inherit old tokens unless explicitly requested', () => {
    const previousToken = process.env.ANTHROPIC_AUTH_TOKEN
    const previousTemplate = settings.runtimeSettings.endpointTemplate
    const previousAuth = settings.runtimeSettings.authentication
    process.env.ANTHROPIC_AUTH_TOKEN = 'sk-synthetic-inherited'
    try {
      const gateway = module.saveConnection({ name: '远程网关', baseUrl: 'https://gateway.example.com' })
      expect(gateway.hasKey).toBe(false)
      expect(gateway.inheritAuth).toBe(false)
      settings.runtimeSettings.endpointTemplate = module.templateKeyOf(gateway.key)
      settings.runtimeSettings.authentication = 'inherit'
      let env = settings.effectiveEnv()
      expect(env.ANTHROPIC_BASE_URL).toBe('https://gateway.example.com')
      expect(env.ANTHROPIC_AUTH_TOKEN).toBe('')
      expect(env.ANTHROPIC_API_KEY).toBe('')
      expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('')

      // 显式继承:保留环境令牌,但仍使用该连接的地址
      module.saveConnection({ key: gateway.key, baseUrl: 'https://gateway.example.com', inheritAuth: true })
      env = settings.effectiveEnv()
      expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-synthetic-inherited')
      expect(env.ANTHROPIC_BASE_URL).toBe('https://gateway.example.com')

      // 切到另一个有 Key 的连接:使用自己的 Key,不沿用上一个
      const own = module.saveConnection({ name: '自有 Key', baseUrl: 'https://second.example.com/anthropic', apiKey: 'sk-synthetic-own' })
      settings.runtimeSettings.endpointTemplate = module.templateKeyOf(own.key)
      env = settings.effectiveEnv()
      expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-synthetic-own')
      expect(env.ANTHROPIC_BASE_URL).toBe('https://second.example.com/anthropic')

      // 删除 Key 后回到无认证,不会再套用 env
      module.saveConnection({ key: own.key, baseUrl: 'https://second.example.com/anthropic', apiKey: '' })
      env = settings.effectiveEnv()
      expect(env.ANTHROPIC_AUTH_TOKEN).toBe('')

      // native 模式忽略第三方连接
      settings.runtimeSettings.authentication = 'native'
      env = settings.effectiveEnv()
      expect(env.ANTHROPIC_BASE_URL).toBe('https://api.anthropic.com')
      expect(env.ANTHROPIC_AUTH_TOKEN).toBe('')

      module.removeConnection(gateway.key)
      module.removeConnection(own.key)
    } finally {
      if (previousToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN
      else process.env.ANTHROPIC_AUTH_TOKEN = previousToken
      settings.runtimeSettings.endpointTemplate = previousTemplate
      settings.runtimeSettings.authentication = previousAuth
    }
  })

  it('probe uses inherited auth only for an explicit inherit connection', async () => {
    const previousToken = process.env.ANTHROPIC_AUTH_TOKEN
    process.env.ANTHROPIC_AUTH_TOKEN = 'sk-synthetic-inherited'
    try {
      const inherited = module.saveConnection({ name: '继承认证', baseUrl: 'http://127.0.0.1:9/anthropic', inheritAuth: true })
      const calls: Array<{ url: string; headers: Record<string, string> }> = []
      vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, headers: init.headers as Record<string, string> })
        return new Response(JSON.stringify({ content: [{ type: 'text', text: 'pong' }] }), { status: 200 })
      }))
      await module.testConnection({ baseUrl: inherited.baseUrl, connectionKey: inherited.key })
      expect(calls[0]?.url).toBe('http://127.0.0.1:9/anthropic/v1/messages')
      expect(calls[0]?.headers.authorization).toBe('Bearer sk-synthetic-inherited')

      const isolated = module.saveConnection({ name: '无认证', baseUrl: 'http://127.0.0.1:9/none' })
      calls.length = 0
      await module.testConnection({ baseUrl: isolated.baseUrl, connectionKey: isolated.key })
      expect(calls[0]?.headers.authorization).toBeUndefined()
      module.removeConnection(inherited.key)
      module.removeConnection(isolated.key)
    } finally {
      if (previousToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN
      else process.env.ANTHROPIC_AUTH_TOKEN = previousToken
    }
  })
})

describe('live connection probe', () => {
  it('accepts an Anthropic Messages response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ model: 'glm-5.3', content: [{ type: 'text', text: 'pong' }] }), { status: 200, headers: { 'content-type': 'application/json' } })))
    const result = await module.testConnection({ baseUrl: 'https://api.example.com/anthropic', apiKey: 'sk-live', model: 'glm-5.3' })
    expect(result.ok).toBe(true)
    expect(result.category).toBe('ok')
    expect(result.requestUrl).toBe('https://api.example.com/anthropic/v1/messages')
    expect(result.model).toBe('glm-5.3')
  })

  it('classifies auth, path, rate and OpenAI-shaped replies without leaking the key', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"bad key sk-live"}}', { status: 401 })))
    const auth = await module.testConnection({ baseUrl: 'https://api.example.com', apiKey: 'sk-live' })
    expect(auth.category).toBe('auth')
    expect(auth.detail).not.toContain('sk-live')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    expect((await module.testConnection({ baseUrl: 'https://api.example.com' })).category).toBe('path')

    vi.stubGlobal('fetch', vi.fn(async () => new Response('slow down', { status: 429 })))
    expect((await module.testConnection({ baseUrl: 'https://api.example.com' })).category).toBe('rate')

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ object: 'chat.completion', choices: [] }), { status: 200 })))
    expect((await module.testConnection({ baseUrl: 'https://api.example.com' })).category).toBe('protocol')
  })

  it('reports network failures and invalid addresses as actionable categories', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed')
    }))
    const network = await module.testConnection({ baseUrl: 'https://api.example.com' })
    expect(network.category).toBe('network')
    expect(network.ok).toBe(false)
    expect((await module.testConnection({ baseUrl: 'not-a-url' })).category).toBe('invalid')
  })
})

describe('provider model display', () => {
  it('maps runtime aliases to the provider model while preserving explicit IDs', () => {
    expect(settings.providerModelName({ ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.3[1m]' }, 'claude-sonnet-4-5')).toBe('glm-5.3[1m]')
    expect(settings.providerModelName({ ANTHROPIC_DEFAULT_FABLE_MODEL: 'glm-5.3[1m]' }, 'claude-fable-5-1')).toBe('glm-5.3[1m]')
    expect(settings.providerModelName({ ANTHROPIC_MODEL: 'connection-model-a' }, 'fixture-model')).toBe('connection-model-a')
    expect(settings.providerModelName({}, 'glm-5.3[1m]', true)).toBe('glm-5.3[1m]')
    expect(settings.providerModelName({ ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-5.3[1m]' }, 'glm-4.7', true)).toBe('glm-4.7')
  })
})
