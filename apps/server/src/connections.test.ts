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
  it('only trims whitespace and trailing slashes, never guesses provider paths', () => {
    expect(module.normalizeBaseUrl(' https://api.example.com/anthropic/ ')).toBe('https://api.example.com/anthropic')
    expect(module.normalizeBaseUrl('https://api.example.com')).toBe('https://api.example.com')
    expect(module.normalizeBaseUrl('http://localhost:8080/v1/')).toBe('http://localhost:8080/v1')
  })

  it('rejects credentials, query strings and non-http protocols', () => {
    expect(() => module.normalizeBaseUrl('https://user:pass@api.example.com')).toThrow('凭证')
    expect(() => module.normalizeBaseUrl('https://api.example.com?token=1')).toThrow('查询参数')
    expect(() => module.normalizeBaseUrl('ftp://api.example.com')).toThrow('http')
    expect(() => module.normalizeBaseUrl('')).toThrow('接口地址')
  })

  it('derives the messages URL conservatively and reports it', () => {
    expect(module.resolveMessagesUrl('https://api.example.com')).toBe('https://api.example.com/v1/messages')
    expect(module.resolveMessagesUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1/messages')
    expect(module.resolveMessagesUrl('https://api.example.com/custom/messages')).toBe('https://api.example.com/custom/messages')
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
    const cleared = module.saveConnection({ key: first!.key, baseUrl: 'https://api.example.com/v1', apiKey: '' })
    expect(cleared.hasKey).toBe(false)
  })

  it('merges ccweb connections into endpoint templates and runtime env', () => {
    const [connection] = module.listConnections()
    const templateKey = module.templateKeyOf(connection!.key)
    const templates = settings.listEndpointTemplates()
    const match = templates.find((item) => item.key === templateKey)
    expect(match?.name).toBe('改名')
    expect(match?.baseUrl).toBe('https://api.example.com/v1')
    expect(JSON.stringify(templates)).not.toContain('sk-secret-value')
    const env = settings.endpointEnv(templateKey)
    expect(env.ANTHROPIC_BASE_URL).toBe('https://api.example.com/v1')
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
