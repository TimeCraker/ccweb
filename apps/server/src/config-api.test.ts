import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
let temporary: string
let workspace: string
let module: typeof import('./config-api.js')
beforeAll(async () => {
  temporary = mkdtempSync(join(tmpdir(), 'ccweb-config-test-'))
  workspace = join(temporary, 'workspace'); mkdirSync(workspace)
  process.env.CLAUDE_CONFIG_DIR = join(temporary, 'claude'); mkdirSync(process.env.CLAUDE_CONFIG_DIR)
  process.env.CCWEB_HOME = join(temporary, 'app')
  module = await import('./config-api.js')
})
afterAll(() => {
  if (!resolve(temporary).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe temporary path')
  rmSync(temporary, { recursive: true, force: true })
})
describe('native configuration persistence contracts', () => {
  it('preserves unknown frontmatter and refuses stale revisions', async () => {
    const path = join(workspace, '.claude', 'skills', 'review', 'SKILL.md')
    mkdirSync(join(workspace, '.claude', 'skills', 'review'), { recursive: true })
    writeFileSync(path, '---\nname: review\ndescription: Review changes\ncustom: keep\n---\nOriginal\n')
    const item = module.listResources(workspace).find(item => item.kind === 'skill')!
    const first = module.readResource(workspace, item.id)
    module.writeResource(workspace, item.id, first.content.replace('Original', 'Updated'), first.revision)
    expect(readFileSync(path, 'utf8')).toContain('custom: keep')
    expect(() => module.writeResource(workspace, item.id, first.content, first.revision)).toThrow('其他操作修改')
    const invalid = await module.configApi.request('/resource/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspace, source: 'project', kind: 'command', name: '../outside', content: 'no' }) })
    expect(invalid.status).toBe(400)
  })
  it('merges only Hooks and keeps unrelated keys intact', () => {
    const path = join(workspace, '.claude', 'settings.local.json')
    writeFileSync(path, JSON.stringify({ model: 'keep-model', env: { TOKEN: 'private' }, hooks: {} }))
    const item = module.listResources(workspace).find(item => item.kind === 'hooks' && item.source === 'project')!
    const first = module.readResource(workspace, item.id)
    expect(first.content).not.toContain('private')
    module.writeResource(workspace, item.id, '{"Stop":[]}', first.revision)
    const saved = JSON.parse(readFileSync(path, 'utf8')) as { model: string; env: { TOKEN: string } }
    expect(saved.model).toBe('keep-model'); expect(saved.env.TOKEN).toBe('private')
  })
  it('redacts MCP credentials and preserves placeholders on save', () => {
    const path = join(workspace, '.mcp.json')
    writeFileSync(path, JSON.stringify({ other: 'keep', mcpServers: { test: { command: 'node', env: { API_KEY: 'secret-test-value' }, headers: { Authorization: 'secret-header' } } } }))
    const item = module.listResources(workspace).find(item => item.kind === 'mcp' && item.source === 'project')!
    const first = module.readResource(workspace, item.id)
    expect(first.content).not.toContain('secret-test-value'); expect(first.content).not.toContain('secret-header')
    module.writeResource(workspace, item.id, first.content.replace('node', 'node.exe'), first.revision)
    const saved = JSON.parse(readFileSync(path, 'utf8')) as { other: string; mcpServers: { test: { env: { API_KEY: string } } } }
    expect(saved.other).toBe('keep'); expect(saved.mcpServers.test.env.API_KEY).toBe('secret-test-value')
  })
  it('treats plugin entries and linked targets outside the managed root as read-only', () => {
    const plugin = join(temporary, 'plugin'); mkdirSync(join(plugin, 'commands'), { recursive: true }); writeFileSync(join(plugin, 'commands', 'test.md'), 'plugin instructions')
    const config = process.env.CLAUDE_CONFIG_DIR!; mkdirSync(join(config, 'plugins'), { recursive: true })
    writeFileSync(join(config, 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { test: [{ installPath: plugin }] } }))
    const item = module.listResources(workspace).find(item => item.source === 'plugin')!
    const first = module.readResource(workspace, item.id)
    expect(() => module.writeResource(workspace, item.id, 'changed', first.revision)).toThrow('只读')
    const outside = join(temporary, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'SKILL.md'), 'external')
    symlinkSync(outside, join(workspace, '.claude', 'skills', 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    expect(module.listResources(workspace).find(item => item.name === 'linked')?.writable).toBe(false)
  })
  it('never returns connection secrets and rejects foreign origins', async () => {
    const secret = 'e2e-private-credential'
    const response = await module.configApi.request('/connection', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'e2e-local', url: 'https://example.com/api', token: secret }) })
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain(secret)
    const denied = await module.configApi.request('/connection', { method:'POST', headers:{ origin:'https://foreign.example', 'content-type':'application/json' }, body:'{}' })
    expect(denied.status).toBe(403)
    const invalid = await module.configApi.request('/connection', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({name:'e2e-invalid',url:'https://example.com?token=private'}) })
    expect(invalid.status).toBe(400)
  })

})
