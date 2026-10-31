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

type Kind = 'skill' | 'command' | 'rule' | 'hooks' | 'mcp' | 'permissions'
type Source = 'user' | 'project' | 'plugin' | 'inherited' | 'managed'
interface Resource { id: string; name: string; kind: Kind; source: Source; path: string; writable: boolean; description?: string; invocation?: string; scope?: string }
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
    out.push({ id, name, kind, source, path, writable: !['plugin', 'inherited', 'managed'].includes(source) && safeTarget(path, root) })
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
    if (source === 'project') {
      for (const [file, name] of [[join(config, 'CLAUDE.md'), '.claude/CLAUDE.md'], [join(workspace, 'CLAUDE.local.md'), 'CLAUDE.local.md']]) {
        if (existsSync(file!)) add(file!, name!, 'rule', source, root)
      }
      add(join(config, 'settings.json'), 'Hooks · 项目共享', 'hooks', source, root)
      add(join(config, 'settings.json'), '权限 · 项目共享', 'permissions', source, root)
    }
    add(join(config, source === 'project' ? 'settings.local.json' : 'settings.json'), 'Hooks', 'hooks', source, root)
    add(join(config, source === 'project' ? 'settings.local.json' : 'settings.json'), source === 'project' ? '权限 · 项目本地' : '权限 · 用户', 'permissions', source, root)
    // MCP's native user file is ~/.claude.json, project file is .mcp.json.
    const mcpRoot = source === 'user' ? homedir() : workspace
    add(join(mcpRoot, source === 'user' ? '.claude.json' : '.mcp.json'), 'MCP servers', 'mcp', source, mcpRoot)
  }
  // Native parent instructions are additive. They are shown read-only outside the selected workspace.
  for (let parent = dirname(workspace); ; parent = dirname(parent)) {
    for (const file of ['CLAUDE.md', 'CLAUDE.local.md', '.claude/CLAUDE.md']) {
      const path = join(parent, file)
      if (existsSync(path)) add(path, `${file} · ${parent}`, 'rule', 'inherited', parent)
    }
    scan(join(parent, '.claude', 'rules'), 'rule', 'inherited', parent)
    if (dirname(parent) === parent) break
  }
  const managed = process.platform === 'win32' ? join(process.env.ProgramFiles ?? 'C:/Program Files', 'ClaudeCode') : process.platform === 'darwin' ? '/Library/Application Support/ClaudeCode' : '/etc/claude-code'
  if (existsSync(join(managed, 'CLAUDE.md'))) add(join(managed, 'CLAUDE.md'), '组织托管指令', 'rule', 'managed', managed)
  if (existsSync(join(managed, 'managed-settings.json'))) add(join(managed, 'managed-settings.json'), 'Hooks · 组织托管', 'hooks', 'managed', managed)
  for (const item of out) {
    if (!['skill', 'command'].includes(item.kind)) continue
    try {
      const text = read(item.path), front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
      const fields = front ? parseDocument(front[1] ?? '') : null
      item.description = String(fields?.get('description') ?? '')
      item.invocation = '/' + (item.kind === 'skill' ? String(fields?.get('name') ?? item.name) : item.name)
      item.scope = item.source === 'project' ? (item.path.includes('settings.local') ? '项目本地' : '项目共享') : item.source
    } catch { /* Invalid content remains visible and editable. */ }
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
  if (typeof value === 'string' && /(?:--?(?:api[-_]?key|token|secret|password|authorization)=|[?&](?:api[-_]?key|token|secret|password|access_token)=|https?:\/\/[^/\s]+@)/i.test(value)) return MASK
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
  let value: unknown
  try { value = JSON.parse(raw || '{}') } catch { throw new Error('配置 JSON 语法无效；原文保留在文件中，请检查括号和逗号') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('配置必须是 JSON 对象')
  return value as Record<string, unknown>
}
export function validateContent(kind: Kind, content: string): string[] {
  if (Buffer.byteLength(content) > 1024 * 1024) return ['配置文件最大 1 MiB']
  if (kind === 'hooks' || kind === 'mcp' || kind === 'permissions') {
    try {
      const root = jsonRoot(content), errors: string[] = []
      for (const [name, value] of Object.entries(root)) {
        if (kind === 'permissions') {
          if (['allow', 'deny', 'ask', 'additionalDirectories'].includes(name) && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) errors.push(`${name}: 必须是字符串数组`)
          if (name === 'defaultMode' && !['default', 'acceptEdits', 'plan', 'bypassPermissions', 'auto', 'dontAsk'].includes(String(value))) errors.push('defaultMode 不是锁定版本模式')
        } else if (kind === 'mcp') {
          if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${name}: 服务配置必须是对象`); continue }
          const config = value as Record<string, unknown>
          if (!config.type || config.type === 'stdio') { if (typeof config.command !== 'string' || !config.command.trim()) errors.push(`${name}: stdio 需要 command`) }
          else if (config.type === 'http' || config.type === 'sse') { try { const url = new URL(String(config.url)); if (!['http:', 'https:'].includes(url.protocol)) throw new Error() } catch { errors.push(`${name}: HTTP/SSE 需要有效 URL`) } }
          else errors.push(`${name}: 文件配置不支持此 MCP type`)
          if (config.args !== undefined && (!Array.isArray(config.args) || config.args.some(arg => typeof arg !== 'string'))) errors.push(`${name}: args 必须是字符串数组`)
          if (config.env !== undefined && (!config.env || typeof config.env !== 'object' || Array.isArray(config.env) || Object.values(config.env).some(v => typeof v !== 'string'))) errors.push(`${name}: env 必须是字符串映射`)
        } else {
          // Event names from SDK 0.3.314 HOOK_EVENTS; unknown fields are preserved.
          const events = ['PreToolUse','PostToolUse','PostToolUseFailure','PostToolBatch','Notification','UserPromptSubmit','UserPromptExpansion','SessionStart','SessionEnd','Stop','StopFailure','SubagentStart','SubagentStop','PreCompact','PostCompact','PreModelSwitch','PostModelSwitch','PermissionRequest','PermissionDenied','Setup','TeammateIdle','TaskCreated','TaskCompleted','Elicitation','ElicitationResult','ConfigChange','WorktreeCreate','WorktreeRemove','InstructionsLoaded','CwdChanged','FileChanged','DirectoryAdded','MessageDisplay']
          if (!events.includes(name)) errors.push(`${name}: 锁定版本未定义此 Hook 事件`)
          if (!Array.isArray(value)) { errors.push(`${name}: 事件配置必须是数组`); continue }
          for (const group of value) {
            if (!group || !Array.isArray(group.hooks)) { errors.push(`${name}: 每项需要 hooks 数组`); continue }
            if (group.matcher !== undefined && typeof group.matcher !== 'string') errors.push(`${name}: matcher 必须是字符串`)
            for (const hook of group.hooks) {
              if (!hook || typeof hook !== 'object' || typeof hook.type !== 'string') { errors.push(`${name}: Hook 需要 type`); continue }
              if (hook.type === 'command' && (typeof hook.command !== 'string' || !hook.command.trim())) errors.push(`${name}: command Hook 缺少命令`)
              if (['prompt', 'agent'].includes(hook.type) && typeof hook.prompt !== 'string') errors.push(`${name}: prompt/agent Hook 缺少 prompt`)
              if (hook.type === 'http' && typeof hook.url !== 'string') errors.push(`${name}: HTTP Hook 缺少 URL`)
              if (hook.timeout !== undefined && (typeof hook.timeout !== 'number' || hook.timeout <= 0)) errors.push(`${name}: timeout 必须大于 0`)
            }
          }
        }
      }
      return errors
    } catch (error) { return [String(error)] }
  }
  const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  // Native 2.1.314 permits a body-only skill and optional metadata.
  if (!front) return []
  const doc = parseDocument(front[1] ?? '')
  if (doc.errors.length) return doc.errors.map(error => error.message)
  if (kind === 'skill' || kind === 'command') {
    const name = doc.get('name')
    if (name !== undefined && (typeof name !== 'string' || !name.trim() || /[<>\p{Cc}\p{Cf}\p{Co}\p{Cn}]|^ | $| {2}/u.test(name))) return ['name 包含原生命令不接受的字符']
    if (doc.has('description') && typeof doc.get('description') !== 'string') return ['description 必须为字符串']
    for (const field of ['disable-model-invocation', 'user-invocable']) {
      const value = doc.get(field)
      if (value !== undefined && !/^(true|false|yes|no|on|off|1|0)$/i.test(String(value))) return [`${field} 必须为原生布尔值`]
    }
    if (doc.has('context') && doc.get('context') !== 'fork') return ['context 只支持 fork']
    const tools = doc.get('allowed-tools')
    if (tools !== undefined && typeof tools !== 'string' && !(Array.isArray(tools) && tools.every(value => typeof value === 'string'))) return ['allowed-tools 必须为字符串或字符串数组']
  }
  return []
}
export function readResource(workspace: string, id: string) {
  const item = resource(workspace, id)
  if (existsSync(item.path) && statSync(item.path).size > 1024 * 1024) throw new Error('文件过大，请使用外部编辑器')
  const raw = read(item.path)
  const content = item.kind === 'hooks' || item.kind === 'mcp' || item.kind === 'permissions' ? JSON.stringify(mask(jsonRoot(raw)[item.kind === 'hooks' ? 'hooks' : item.kind === 'permissions' ? 'permissions' : 'mcpServers'] ?? {}), null, 2) : raw
  return { ...item, content, revision: hash(raw), errors: validateContent(item.kind, item.kind === 'hooks' || item.kind === 'mcp' || item.kind === 'permissions' ? JSON.stringify(jsonRoot(raw)[item.kind === 'hooks' ? 'hooks' : item.kind === 'permissions' ? 'permissions' : 'mcpServers'] ?? {}) : content) }
}
export function writeResource(workspace: string, id: string, content: string, revision: string): void {
  const item = resource(workspace, id)
  if (!item.writable) throw new Error('此来源只读，请复制到用户或项目范围')
  const raw = read(item.path)
  if (hash(raw) !== revision) throw new Error('文件已被其他操作修改，请重新加载后比较；草稿已保留')
  const restoredContent = item.kind === 'hooks' || item.kind === 'mcp' || item.kind === 'permissions' ? JSON.stringify(restore(jsonRoot(content), jsonRoot(raw)[item.kind === 'hooks' ? 'hooks' : item.kind === 'permissions' ? 'permissions' : 'mcpServers'])) : content
  const errors = validateContent(item.kind, restoredContent)
  if (errors.length) throw new Error(errors.join('\n'))
  let next = content
  if (item.kind === 'hooks' || item.kind === 'mcp' || item.kind === 'permissions') {
    const root = jsonRoot(raw), key = item.kind === 'hooks' ? 'hooks' : item.kind === 'permissions' ? 'permissions' : 'mcpServers'
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
