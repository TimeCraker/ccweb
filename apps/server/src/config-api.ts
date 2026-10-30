import { Hono } from 'hono'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { parseDocument } from 'yaml'
import { APP_DIR, CC_DIR, runtimeSettings, endpointEnv, listEndpointTemplates, readActiveEnv } from './settings.js'

type Kind = 'skill' | 'command' | 'rule' | 'hooks' | 'mcp'
type Source = 'user' | 'project' | 'plugin'
interface Resource { id: string; name: string; kind: Kind; source: Source; path: string; writable: boolean }
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const read = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : ''
export function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try { writeFileSync(temporary, content, { mode: 0o600 }); renameSync(temporary, path) }
  finally { if (existsSync(temporary)) unlinkSync(temporary) }
}
function inside(path: string, root: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.includes(':') && !rel.startsWith(sep))
}
function safeTarget(path: string, root: string): boolean {
  let ancestor = path
  while (!existsSync(ancestor) && dirname(ancestor) !== ancestor) ancestor = dirname(ancestor)
  return inside(resolve(path), resolve(root)) && inside(realpathSync(ancestor), realpathSync(root))
}
export function workspacePath(value?: string): string {
  const path = resolve(value || runtimeSettings.workspace || process.env.CCWEB_WORKSPACE || process.cwd())
  if (!statSync(path).isDirectory()) throw new Error('工作区不是有效目录')
  return path
}
export function listResources(workspace: string): Resource[] {
  const out: Resource[] = []
  const add = (path: string, name: string, kind: Kind, source: Source, root: string) => {
    const id = Buffer.from(JSON.stringify([source, kind, path])).toString('base64url')
    out.push({ id, name, kind, source, path, writable: source !== 'plugin' && safeTarget(path, root) })
  }
  function scan(dir: string, kind: Kind, source: Source, root: string, prefix = '', depth = 0): void {
    if (!existsSync(dir) || depth > 5) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (kind === 'skill') {
        const file = join(path, 'SKILL.md')
        if (existsSync(file) && statSync(file).isFile()) add(file, entry.name, kind, source, root)
      } else if (entry.isDirectory()) scan(path, kind, source, root, `${prefix}${entry.name}:`, depth + 1)
      else if (entry.name.endsWith('.md')) add(path, prefix + entry.name.slice(0, -3), kind, source, root)
    }
  }
  for (const [source, root, config] of [['user', CC_DIR, CC_DIR], ['project', workspace, join(workspace, '.claude')]] as const) {
    if (!existsSync(root)) continue
    scan(join(config, 'skills'), 'skill', source, root)
    scan(join(config, 'commands'), 'command', source, root)
    scan(join(config, 'rules'), 'rule', source, root)
    const md = source === 'user' ? join(CC_DIR, 'CLAUDE.md') : join(workspace, 'CLAUDE.md')
    if (existsSync(md)) add(md, 'CLAUDE.md', 'rule', source, root)
    add(join(config, source === 'project' ? 'settings.local.json' : 'settings.json'), 'Hooks', 'hooks', source, root)
    // MCP's native user file is ~/.claude.json, project file is .mcp.json.
    const mcpRoot = source === 'user' ? homedir() : workspace
    add(join(mcpRoot, source === 'user' ? '.claude.json' : '.mcp.json'), 'MCP servers', 'mcp', source, mcpRoot)
  }
  try {
    const installed = JSON.parse(read(join(CC_DIR, 'plugins', 'installed_plugins.json'))) as { plugins?: Record<string, Array<{ installPath?: string }>> }
    for (const entries of Object.values(installed.plugins ?? {})) for (const plugin of entries) {
      if (!plugin.installPath || !existsSync(plugin.installPath)) continue
      scan(join(plugin.installPath, 'skills'), 'skill', 'plugin', plugin.installPath)
      scan(join(plugin.installPath, 'commands'), 'command', 'plugin', plugin.installPath)
    }
  } catch { /* Optional plugin inventory. */ }
  return [...new Map(out.map(item => [item.id, item])).values()]
}
function resource(workspace: string, id: string): Resource {
  const item = listResources(workspace).find(item => item.id === id)
  if (!item) throw new Error('配置条目不存在或不属于当前工作区')
  return item
}
const MASK = '•••••••• (stored)'
function mask(value: unknown, key = ''): unknown {
  if (/(token|secret|password|authorization|api.?key)/i.test(key) && value != null) return MASK
  if (Array.isArray(value)) return value.map((v, i) => typeof v === 'string' && i > 0 && /(?:key|token|password|secret)/i.test(String(value[i - 1])) ? MASK : mask(v))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, key === 'env' || key === 'headers' ? MASK : mask(v, k)]))
  return value
}
function restore(value: unknown, original: unknown): unknown {
  if (value === MASK) { if (original === undefined) throw new Error('新凭证不能使用遮罩占位符'); return original }
  if (Array.isArray(value)) return value.map((v, i) => restore(v, Array.isArray(original) ? original[i] : undefined))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, restore(v, original && typeof original === 'object' ? (original as Record<string, unknown>)[k] : undefined)]))
  return value
}
function jsonRoot(raw: string): Record<string, unknown> {
  const value: unknown = JSON.parse(raw || '{}')
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置必须是 JSON 对象')
  return value as Record<string, unknown>
}
export function validateContent(kind: Kind, content: string): string[] {
  if (Buffer.byteLength(content) > 1024 * 1024) return ['配置文件最大 1 MiB']
  if (kind === 'hooks' || kind === 'mcp') { try { jsonRoot(content); return [] } catch (error) { return [String(error)] } }
  const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  if (kind === 'skill' && !front) return ['Skill 需要 YAML frontmatter，包含 name 和 description']
  if (!front) return []
  const doc = parseDocument(front[1] ?? '')
  if (doc.errors.length) return doc.errors.map(error => error.message)
  if (kind === 'skill') {
    if (typeof doc.get('name') !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(doc.get('name')))) return ['name 必须为小写英文、数字或连字符，最多 64 字符']
    if (typeof doc.get('description') !== 'string' || !String(doc.get('description')).trim()) return ['description 不能为空']
  }
  return []
}
export function readResource(workspace: string, id: string) {
  const item = resource(workspace, id)
  if (existsSync(item.path) && statSync(item.path).size > 1024 * 1024) throw new Error('文件过大，请使用外部编辑器')
  const raw = read(item.path)
  const content = item.kind === 'hooks' || item.kind === 'mcp' ? JSON.stringify(mask(jsonRoot(raw)[item.kind === 'hooks' ? 'hooks' : 'mcpServers'] ?? {}), null, 2) : raw
  return { ...item, content, revision: hash(raw), errors: validateContent(item.kind, content) }
}
export function writeResource(workspace: string, id: string, content: string, revision: string): void {
  const item = resource(workspace, id)
  if (!item.writable) throw new Error('此来源只读，请复制到用户或项目范围')
  const raw = read(item.path)
  if (hash(raw) !== revision) throw new Error('文件已被其他操作修改，请重新加载后比较；草稿已保留')
  const errors = validateContent(item.kind, content)
  if (errors.length) throw new Error(errors.join('\n'))
  let next = content
  if (item.kind === 'hooks' || item.kind === 'mcp') {
    const root = jsonRoot(raw), key = item.kind === 'hooks' ? 'hooks' : 'mcpServers'
    root[key] = restore(jsonRoot(content), root[key])
    next = JSON.stringify(root, null, 2) + '\n'
  }
  if (raw) atomicWrite(join(APP_DIR, 'backups', `${hash(item.path)}-${hash(raw)}.txt`), raw)
  atomicWrite(item.path, next)
}
export const configApi = new Hono()
configApi.onError((error, c) => c.json({ error: error.message }, /已被其他/.test(error.message) ? 409 : 400))
configApi.use('*', async (c, next) => {
  const origin = c.req.header('origin')
  if (origin && origin !== new URL(c.req.url).origin && !/^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin)) return c.json({ error: 'Origin rejected' }, 403)
  await next()
})
configApi.get('/resources', c => c.json(listResources(workspacePath(c.req.query('workspace')))))
configApi.get('/resource', c => c.json(readResource(workspacePath(c.req.query('workspace')), c.req.query('id') ?? '')))
configApi.post('/resource', async c => {
  const body = await c.req.json<{ workspace?: string; id: string; content: string; revision: string }>()
  if (typeof body.content !== 'string' || typeof body.revision !== 'string') throw new Error('无效的配置内容')
  const workspace = workspacePath(body.workspace)
  writeResource(workspace, body.id, body.content, body.revision)
  return c.json(readResource(workspace, body.id))
})
configApi.post('/resource/create', async c => {
  const body = await c.req.json<{ workspace?: string; source: string; kind: string; name: string; content: string }>()
  if (!['user', 'project'].includes(body.source) || !['skill', 'command', 'rule'].includes(body.kind)) throw new Error('不支持的创建来源')
  if (typeof body.name !== 'string' || !/^[a-z0-9][a-z0-9_:/-]{0,100}$/.test(body.name) || body.name.split(/[/:]/).some(part => !part || part === '..')) throw new Error('名称仅支持英文、数字、连字符和命令分组')
  if (body.kind === 'skill' && /[/:]/.test(body.name)) throw new Error('Skill 名称不能包含目录')
  const workspace = workspacePath(body.workspace), root = body.source === 'user' ? CC_DIR : workspace
  mkdirSync(root, { recursive: true })
  const config = body.source === 'user' ? root : join(root, '.claude')
  const path = body.kind === 'skill' ? join(config, 'skills', body.name, 'SKILL.md') : join(config, `${body.kind}s`, body.name.replace(/:/g, '/') + '.md')
  if (!safeTarget(path, root) || existsSync(path)) throw new Error('名称已存在或目标不安全')
  const errors = validateContent(body.kind as Kind, body.content)
  if (errors.length) throw new Error(errors.join('\n'))
  atomicWrite(path, body.content)
  return c.json(listResources(workspace).find(item => item.path === path))
})
configApi.post('/resource/delete', async c => {
  const body = await c.req.json<{ workspace?: string; id: string; revision: string }>()
  const item = resource(workspacePath(body.workspace), body.id)
  if (!item.writable || !['skill', 'command', 'rule'].includes(item.kind)) throw new Error('不允许删除此配置')
  const raw = read(item.path)
  if (hash(raw) !== body.revision) throw new Error('文件已被其他操作修改')
  atomicWrite(join(APP_DIR, 'backups', `${hash(item.path)}-${hash(raw)}.txt`), raw)
  unlinkSync(item.path)
  return c.json({ ok: true })
})
configApi.get('/runtime', c => {
  const require = createRequire(import.meta.url)
  const sdk = JSON.parse(readFileSync(join(dirname(require.resolve('@anthropic-ai/claude-agent-sdk')), 'package.json'), 'utf8')) as { version: string }
  const env = { ...process.env, ...readActiveEnv(), ...endpointEnv(runtimeSettings.endpointTemplate) }
  return c.json({ sdkVersion: sdk.version, binarySource: 'SDK bundled', credentialConfigured: !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.CLAUDE_CODE_OAUTH_TOKEN), endpoint: env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com', configDirectory: CC_DIR, endpoints: listEndpointTemplates() })
})
configApi.get('/readiness', async c => {
  const require = createRequire(import.meta.url)
  const sdkRequire = createRequire(require.resolve('@anthropic-ai/claude-agent-sdk'))
  const nativePackage = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
  const binary = join(dirname(sdkRequire.resolve(`${nativePackage}/package.json`)), process.platform === 'win32' ? 'claude.exe' : 'claude')
  const { stdout } = await promisify(execFile)(binary, ['--version'], { timeout: 15000, windowsHide: true })
  const env = { ...process.env, ...readActiveEnv(), ...endpointEnv(runtimeSettings.endpointTemplate) }
  return c.json({ binaryStarted: stdout.includes('Claude Code'), version: stdout.trim(), credentialConfigured: !!(env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY || env.CLAUDE_CODE_OAUTH_TOKEN), authenticationVerified: false })
})
configApi.get('/updates', async c => {
  const response = await fetch('https://registry.npmjs.org/ccweb-console/latest', { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error('更新服务暂时不可用')
  const data = await response.json() as { version: string }
  return c.json({ version: data.version, automaticReplacement: false })
})
configApi.post('/connection', async c => {
  const body = await c.req.json<{ name: string; url: string; token?: string; model?: string }>()
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(body.name)) throw new Error('连接名称仅支持英文、数字、连字符')
  const url = new URL(body.url)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search) throw new Error('请输入不含凭证和查询参数的 HTTP(S) 端点')
  const file = join(CC_DIR, 'cc-toolkit', 'settings', `settings.${body.name}.json`)
  const previous = jsonRoot(read(file)), env = previous.env && typeof previous.env === 'object' ? previous.env as Record<string, string> : {}
  env.ANTHROPIC_BASE_URL = url.href.replace(/\/$/, '')
  if (body.model) env.ANTHROPIC_MODEL = body.model
  if (body.token) env.ANTHROPIC_AUTH_TOKEN = body.token
  previous.env = env
  atomicWrite(file, JSON.stringify(previous, null, 2))
  return c.json({ ok: true, key: body.name, credentialConfigured: !!(env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY), path: file })
})
