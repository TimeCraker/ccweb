import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

let temporary: string
let connections: typeof import('./connections.js')
let settings: typeof import('./settings.js')
let query: (typeof import('@anthropic-ai/claude-agent-sdk'))['query']
let previousToken: string | undefined

beforeAll(async () => {
  temporary = mkdtempSync(join(tmpdir(), 'ccweb-runtime-path-'))
  process.env.CCWEB_HOME = join(temporary, 'app')
  process.env.CLAUDE_CONFIG_DIR = join(temporary, 'claude')
  previousToken = process.env.ANTHROPIC_AUTH_TOKEN
  process.env.ANTHROPIC_AUTH_TOKEN = 'sk-synthetic-runtime-path'
  mkdirSync(join(temporary, 'workspace'), { recursive: true })
  connections = await import('./connections.js')
  settings = await import('./settings.js')
  query = (await import('@anthropic-ai/claude-agent-sdk')).query
})

afterAll(() => {
  if (previousToken === undefined) delete process.env.ANTHROPIC_AUTH_TOKEN
  else process.env.ANTHROPIC_AUTH_TOKEN = previousToken
  if (!resolve(temporary).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe temporary path')
  rmSync(temporary, { recursive: true, force: true })
})

async function withLocalServer(run: (base: string, paths: string[], auths: Array<string | undefined>) => Promise<void>): Promise<void> {
  const paths: string[] = []
  const auths: Array<string | undefined> = []
  const server: Server = createServer((req, res) => {
    paths.push(req.url ?? '')
    auths.push((req.headers.authorization as string | undefined) ?? (req.headers['x-api-key'] as string | undefined))
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'LOCAL_STOP' } }))
    // Runtime may retry; stop soon after the first request.
  })
  await new Promise<void>((resolveReady) => server.listen(0, '127.0.0.1', resolveReady))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Local server did not bind')
  try {
    await run(`http://127.0.0.1:${address.port}`, paths, auths)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
}

async function runRuntime(baseUrl: string, paths: string[]): Promise<void> {
  const cancel = new AbortController()
  const timer = setTimeout(() => cancel.abort(), 20_000)
  const env = settings.effectiveEnv({
    ...settings.runtimeSettings,
    endpointTemplate: connections.templateKeyOf(savedKey),
    authentication: 'inherit',
  })
  expect(env.ANTHROPIC_BASE_URL).toBe(baseUrl)
  expect(env.ANTHROPIC_BASE_URL).not.toMatch(/\/(v1|messages)$/)
  try {
    const q = query({
      prompt: 'Reply OK; no tools.',
      options: {
        cwd: temporary,
        env: {
          ...env,
          ANTHROPIC_API_KEY: '',
          CLAUDE_CODE_OAUTH_TOKEN: '',
          CLAUDE_CONFIG_DIR: join(temporary, 'claude'),
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
          ANTHROPIC_MODEL: 'audit-model',
          CLAUDECODE: '',
        },
        settingSources: [],
        tools: [],
        mcpServers: {},
        model: 'audit-model',
        permissionMode: 'default',
        maxTurns: 1,
        persistSession: false,
        abortController: cancel,
      },
    })
    try {
      for await (const event of q) { void event }
    } finally {
      q.close()
    }
  } catch {
    // The local server intentionally returns 400 and aborts.
  } finally {
    clearTimeout(timer)
  }
  expect(paths.length).toBeGreaterThan(0)
}

let savedKey = ''

describe('locked runtime URL contract', () => {
  for (const suffix of ['/v1', '/v1/messages']) {
    it(`normalizes ${suffix} to one /v1/messages request`, async () => {
      await withLocalServer(async (base, paths, auths) => {
        const saved = connections.saveConnection({ name: `path ${suffix}`, baseUrl: `${base}${suffix}`, apiKey: 'sk-synthetic-runtime-path' })
        savedKey = saved.key
        const probePath = new URL(connections.resolveMessagesUrl(saved.baseUrl)).pathname
        expect(probePath).toBe('/v1/messages')
        await runRuntime(saved.baseUrl, paths)
        for (const path of paths) {
          expect(path.split('?')[0]).toBe('/v1/messages')
        }
        expect(auths.some((auth) => auth?.includes('sk-synthetic-runtime-path'))).toBe(true)
        connections.removeConnection(saved.key)
      })
    }, 30_000)
  }

  it('reaches a no-auth local gateway without sending inherited credentials', async () => {
    await withLocalServer(async (base, paths, auths) => {
      const saved = connections.saveConnection({ name: 'no-auth gateway', baseUrl: base })
      savedKey = saved.key
      await runRuntime(saved.baseUrl, paths)
      expect(paths.length).toBeGreaterThan(0)
      expect(auths.every((auth) => auth === `Bearer ${connections.LOCAL_NO_AUTH_TOKEN}`)).toBe(true)
      connections.removeConnection(saved.key)
    })
  }, 30_000)

  it('only inherits env credentials when the connection explicitly opts in', async () => {
    await withLocalServer(async (base, paths, auths) => {
      const saved = connections.saveConnection({ name: 'inherit gateway', baseUrl: base, inheritAuth: true })
      savedKey = saved.key
      await runRuntime(saved.baseUrl, paths)
      expect(auths.some((auth) => auth?.includes('sk-synthetic-runtime-path'))).toBe(true)
      connections.removeConnection(saved.key)
    })
  }, 30_000)
})
