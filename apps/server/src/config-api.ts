import { Hono } from 'hono'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs'
import { dirname, join, relative, resolve, sep, isAbsolute, basename } from 'node:path'
import { homedir } from 'node:os'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { parseDocument } from 'yaml'
import { APP_DIR, CC_DIR, runtimeSettings, effectiveEnv, listEndpointTemplates, listWorkspaces } from './settings.js'
import { listConnections, removeConnection, saveConnection, testConnection, templateKeyOf } from './connections.js'
import { listDeletedSessions, restoreDeletedSession } from './session-backup.js'
import { isLoopbackOrigin } from './origin.js'
import { buildWorkspaceTree, readWorkspaceSnapshot } from './files.js'

type Kind = 'skill' | 'command' | 'rule' | 'hooks' | 'mcp' | 'permissions'
type Source = 'user' | 'project' | 'plugin' | 'inherited' | 'managed'
interface Resource { id: string; name: string; kind: Kind; source: Source; path: string; writable: boolean; description?: string; invocation?: string; scope?: string; namespace?: string }
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
    let namespace: string | undefined
    if (source === 'plugin') { try { namespace = String(JSON.parse(read(join(root, '.claude-plugin', 'plugin.json'))).name || basename(root)) } catch { namespace = basename(root) } }
    out.push({ id, name, kind, source, path, namespace, writable: !['plugin', 'inherited', 'managed'].includes(source) && safeTarget(path, root) })
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
  if (existsSync(join(managed, 'managed-settings.json'))) { add(join(managed, 'managed-settings.json'), 'Hooks · 组织托管', 'hooks', 'managed', managed); add(join(managed, 'managed-settings.json'), '权限 · 组织托管', 'permissions', 'managed', managed) }
  if (existsSync(join(managed, 'managed-mcp.json'))) add(join(managed, 'managed-mcp.json'), 'MCP · 组织托管', 'mcp', 'managed', managed)
  let projectRoot = workspace
  try { projectRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: workspace, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).trim() } catch { /* A non-repository uses its project root. */ }
  const memoryDirectories = new Set([join(CC_DIR, 'projects', process.env.CLAUDE_CODE_PROJECT_DIR_NAME || projectRoot.replace(/[^a-zA-Z0-9]/g, '-'), 'memory')])
  for (const file of [join(CC_DIR, 'settings.json'), join(workspace, '.claude', 'settings.json'), join(workspace, '.claude', 'settings.local.json'), join(managed, 'managed-settings.json')]) {
    try { const setting = JSON.parse(read(file)) as { autoMemoryDirectory?: string }; if (typeof setting.autoMemoryDirectory === 'string') { const directory = setting.autoMemoryDirectory.startsWith('~/') ? join(homedir(), setting.autoMemoryDirectory.slice(2)) : setting.autoMemoryDirectory; if (isAbsolute(directory)) memoryDirectories.add(directory) } } catch { /* Invalid optional settings remain diagnosable in native context. */ }
  }
  for (const directory of memoryDirectories) if (existsSync(directory)) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) if (entry.isFile() && entry.name.endsWith('.md')) {
      const path = join(directory, entry.name)
      add(path, `自动记忆/${entry.name}`, 'rule', inside(resolve(path), resolve(CC_DIR)) ? 'user' : 'inherited', inside(resolve(path), resolve(CC_DIR)) ? CC_DIR : directory)
    }
  }
  for (const item of out) {
    if (!['skill', 'command'].includes(item.kind)) continue
    try {
      const text = read(item.path), front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
      const fields = front ? parseDocument(front[1] ?? '') : null
      item.description = String(fields?.get('description') ?? '')
      const commandName = item.kind === 'skill' ? String(fields?.get('name') ?? item.name) : item.name
      item.invocation = '/' + (item.namespace && !commandName.startsWith(item.namespace + ':') ? `${item.namespace}:${commandName}` : commandName)
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
  const unique = new Map<string, Resource>()
  for (const item of out) { const key = `${item.kind}:${item.path}`; if (!unique.has(key)) unique.set(key, item) }
  return [...unique.values()]
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
    if (kind === 'skill' && name !== undefined && (typeof name !== 'string' || !name.trim() || /[<>\p{Cc}\p{Cf}\p{Co}\p{Cn}]|^ | $| {2}/u.test(name))) return ['name 包含原生命令不接受的字符']
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
  if (origin && origin !== new URL(c.req.url).origin && !isLoopbackOrigin(origin)) return c.json({ error: 'Origin rejected' }, 403)
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
  const env = effectiveEnv()
  return c.json({ sdkVersion: sdk.version, binarySource: 'SDK bundled', credentialConfigured: !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.CLAUDE_CODE_OAUTH_TOKEN), endpoint: env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com', configDirectory: CC_DIR, endpoints: listEndpointTemplates() })
})
configApi.get('/readiness', async c => {
  const require = createRequire(import.meta.url)
  const sdkRequire = createRequire(require.resolve('@anthropic-ai/claude-agent-sdk'))
  const nativePackage = `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}`
  const binary = join(dirname(sdkRequire.resolve(`${nativePackage}/package.json`)), process.platform === 'win32' ? 'claude.exe' : 'claude')
  const { stdout } = await promisify(execFile)(binary, ['--version'], { timeout: 15000, windowsHide: true })
  const env = effectiveEnv()
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
// ccweb 自有模型连接:默认存储(不含 cc-toolkit 兼容负担),凭证只留在本机文件
configApi.get('/connections', c => c.json(listConnections()))
configApi.post('/connections', async c => {
  const body = await c.req.json<{ key?: string | null; name?: string; baseUrl: string; model?: string | null; apiKey?: string | null; inheritAuth?: boolean }>()
  const connection = saveConnection({
    key: body.key ?? null,
    name: body.name ?? null,
    baseUrl: body.baseUrl,
    model: body.model ?? null,
    apiKey: body.apiKey === undefined ? undefined : body.apiKey,
    inheritAuth: body.inheritAuth,
  })
  return c.json({ connection, templateKey: templateKeyOf(connection.key), path: join(APP_DIR, 'connections.json') })
})
configApi.post('/connections/delete', async c => {
  const body = await c.req.json<{ key: string }>()
  const removed = removeConnection(body.key)
  return c.json({ ok: removed })
})
configApi.post('/connections/test', async c => {
  const body = await c.req.json<{ baseUrl: string; apiKey?: string | null; model?: string | null; connectionKey?: string | null; inheritAuth?: boolean }>()
  const result = await testConnection({
    baseUrl: body.baseUrl,
    apiKey: body.apiKey ?? null,
    model: body.model ?? null,
    connectionKey: body.connectionKey ?? null,
    inheritAuth: body.inheritAuth,
  })
  return c.json(result)
})
// 最近删除的会话:删除时保留 transcript 备份,恢复只写回 ~/.claude/projects 原始目录
configApi.get('/sessions/deleted', c => c.json(listDeletedSessions()))
configApi.post('/sessions/restore', async c => {
  const body = await c.req.json<{ id: string }>()
  const sessionId = restoreDeletedSession(String(body.id ?? ''))
  if (!sessionId) throw new Error('备份不存在、已恢复，或目标会话仍然存在')
  return c.json({ ok: true, sessionId })
})

async function pickFolderNative(): Promise<string | null> {
  if (process.platform === 'win32') {
    // 使用 Windows 现代 IFileOpenDialog (FOS_PICKFOLDERS 0x20 | FOS_FORCEFILESYSTEM 0x40)，与系统资源管理器完全一致
    const script = `
$code = @"
using System;
using System.Runtime.InteropServices;

public class NativeFolderPicker {
    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [ComImport]
    [Guid("D57C7288-D4AD-4768-BE02-9D969532D960")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes();
        void SetFileTypeIndex();
        void GetFileTypeIndex();
        void Advise();
        void Unadvise();
        void SetOptions(uint fos);
        void GetOptions(out uint fos);
        void SetDefaultFolder(IntPtr psi);
        void SetFolder(IntPtr psi);
        void GetFolder(out IntPtr ppsi);
        void GetCurrentSelection(out IntPtr ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
    }

    [ComImport]
    [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem {
        void BindToHandler();
        void GetParent();
        void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes();
        void Compare();
    }

    [ComImport]
    [Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
    [ClassInterface(ClassInterfaceType.None)]
    private class FileOpenDialogRCW { }

    public static string Pick() {
        try {
            var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
            dialog.SetOptions(0x20 | 0x40);
            dialog.SetTitle("选择文件夹");
            IntPtr hwnd = GetForegroundWindow();
            int hr = dialog.Show(hwnd);
            if (hr == 0) {
                IShellItem item;
                dialog.GetResult(out item);
                string path;
                item.GetDisplayName(0x80058000, out path);
                return path;
            }
        } catch {}
        return null;
    }
}
"@
Add-Type -TypeDefinition $code -Language CSharp
$res = [NativeFolderPicker]::Pick()
if ($res) { Write-Output $res }
`;
    try {
      const { stdout } = await promisify(execFile)(
        'powershell.exe',
        ['-STA', '-NoProfile', '-Command', script],
        { timeout: 60_000, windowsHide: false },
      );
      const selected = stdout.trim();
      return selected && existsSync(selected) ? selected : null;
    } catch {
      return null;
    }
  } else if (process.platform === 'darwin') {
    try {
      const { stdout } = await promisify(execFile)(
        'osascript',
        ['-e', 'POSIX path of (choose folder with prompt "选择项目目录")'],
        { timeout: 120_000 },
      );
      const selected = stdout.trim();
      return selected && existsSync(selected) ? selected : null;
    } catch {
      return null;
    }
  }
  return null;
}

// 原生系统文件夹选择器
configApi.post('/dialog/pick-folder', async (c) => {
  const chosen = await pickFolderNative();
  return c.json({ path: chosen });
});

// 智能路径与项目名称解析 (支持绝对路径、相对路径、纯目录名模糊匹配)
configApi.post('/workspaces/resolve-path', async (c) => {
  const body = await c.req.json<{ input?: string }>();
  const raw = (body.input || '').trim().replace(/^["']|["']$/g, '');
  if (!raw) return c.json({ ok: false, error: '请输入项目目录路径或名称' });

  // 1. 如果已是完整绝对路径且真实存在
  if (isAbsolute(raw) && existsSync(raw) && statSync(raw).isDirectory()) {
    return c.json({ ok: true, path: resolve(raw) });
  }

  // 2. 依次在常用基准目录中搜寻
  const current = resolve(runtimeSettings.workspace || process.env.CCWEB_WORKSPACE || process.cwd());
  const parent = dirname(current);
  const home = homedir();
  const desktop = join(home, 'Desktop');
  const searchRoots = [desktop, parent, current, home, join(home, 'Projects')];

  for (const root of searchRoots) {
    if (!existsSync(root)) continue;
    const directTarget = join(root, raw);
    if (existsSync(directTarget) && statSync(directTarget).isDirectory()) {
      return c.json({ ok: true, path: resolve(directTarget) });
    }
    // 忽略大小写匹配目录名
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.toLowerCase() === raw.toLowerCase()) {
          return c.json({ ok: true, path: join(root, entry.name) });
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. 从已知工作区列表中根据名字匹配
  try {
    const known = listWorkspaces();
    const matched = known.find((w) => basename(w.dir).toLowerCase() === raw.toLowerCase());
    if (matched && existsSync(matched.dir)) {
      return c.json({ ok: true, path: matched.dir });
    }
  } catch {
    // ignore
  }

  return c.json({
    ok: false,
    error: `未在桌面或工作区附近找到目录 "${raw}"，请输入完整绝对路径（如 C:\\Projects\\app）`,
  });
});

// 扫描当前工作区同级、桌面与子目录候选项目
configApi.get('/workspaces/discover', async (c) => {
  const current = resolve(runtimeSettings.workspace || process.env.CCWEB_WORKSPACE || process.cwd());
  const parent = dirname(current);
  const home = homedir();
  const desktop = join(home, 'Desktop');
  const discovered: Array<{ name: string; path: string; isGit: boolean }> = [];
  const visited = new Set<string>();
  const IGNORED = new Set(['node_modules', '.git', 'dist', '$RECYCLE.BIN', 'System Volume Information', 'tmp']);

  const scanDir = (dir: string) => {
    try {
      if (existsSync(dir) && statSync(dir).isDirectory()) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name.startsWith('.') || IGNORED.has(entry.name)) continue;
          const full = join(dir, entry.name);
          if (visited.has(full) || full === current) continue;
          visited.add(full);
          const isGit = existsSync(join(full, '.git'));
          discovered.push({ name: entry.name, path: full, isGit });
        }
      }
    } catch {
      // ignore
    }
  };

  // 优先扫描桌面、父目录、当前目录内部子目录
  scanDir(desktop);
  scanDir(parent);
  scanDir(current);

  return c.json({
    current,
    discovered: discovered.slice(0, 60),
  });
});

// 打开系统本地文件夹资源管理器 (若传入的是文件则在资源管理器中选中该文件)
configApi.post('/workspaces/open-folder', async (c) => {
  const body = await c.req.json<{ path?: string }>();
  const target = (body.path || '').trim();
  if (!target || !existsSync(target)) {
    return c.json({ ok: false, error: '路径不存在或无效' }, 400);
  }
  try {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const isDir = statSync(target).isDirectory();
    if (isWindows) {
      if (isDir) {
        execFile('explorer.exe', [target]);
      } else {
        execFile('explorer.exe', [`/select,${target}`]);
      }
    } else if (isMac) {
      if (isDir) {
        execFile('open', [target]);
      } else {
        execFile('open', ['-R', target]);
      }
    } else {
      execFile('xdg-open', [isDir ? target : dirname(target)]);
    }
    return c.json({ ok: true });
  } catch (err: unknown) {
    return c.json({ ok: false, error: (err as Error)?.message || '无法打开文件夹' }, 500);
  }
});

// 打开系统本地文件(调用系统默认关联程序)
configApi.post('/workspaces/open-file', async (c) => {
  const body = await c.req.json<{ path?: string }>();
  const rawPath = (body.path || '').trim();
  if (!rawPath) return c.json({ ok: false, error: '请指定文件路径' }, 400);

  const current = resolve(runtimeSettings.workspace || process.env.CCWEB_WORKSPACE || process.cwd());
  const target = isAbsolute(rawPath) ? resolve(rawPath) : resolve(current, rawPath);

  if (!existsSync(target) || !statSync(target).isFile()) {
    return c.json({ ok: false, error: '文件不存在或不是有效文件' }, 400);
  }

  const realCurrent = realpathSync(current);
  const realTarget = realpathSync(target);
  if (!realTarget.startsWith(realCurrent)) {
    return c.json({ ok: false, error: '禁止越界访问工作区外部文件' }, 403);
  }

  try {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    if (isWindows) {
      execFile('cmd.exe', ['/c', 'start', '""', target], { windowsVerbatimArguments: true });
    } else if (isMac) {
      execFile('open', [target]);
    } else {
      execFile('xdg-open', [target]);
    }
    return c.json({ ok: true });
  } catch (err: unknown) {
    return c.json({ ok: false, error: (err as Error)?.message || '无法打开目标文件' }, 500);
  }
});

// 工作区文件树
configApi.get("/workspaces/tree", async (c) => {
  const current = resolve(runtimeSettings.workspace || process.env.CCWEB_WORKSPACE || process.cwd());
  const tree = buildWorkspaceTree(current);
  return c.json({ ok: true, root: current, tree });
});

// 工作区文件只读内容读取
configApi.post("/workspaces/read-file", async (c) => {
  const body = await c.req.json<{ path?: string }>();
  const target = (body.path || "").trim();
  if (!target) return c.json({ ok: false, error: "请指定文件路径" }, 400);
  const current = resolve(runtimeSettings.workspace || process.env.CCWEB_WORKSPACE || process.cwd());
  const content = readWorkspaceSnapshot(current, target);
  if (content === undefined) {
    return c.json({ ok: false, error: "无法读取文件内容（可能文件不存在、超出大小限制或为二进制）" }, 404);
  }
  return c.json({ ok: true, content, path: target });
});

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  aac: 'audio/aac',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  '7z': 'application/x-7z-compressed',
  json: 'application/json',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
};

// 原始工作区文件流读取（用于多媒体与文档预览，支持 Range 分段）
configApi.get("/workspaces/raw-file", async (c) => {
  const target = (c.req.query("path") || "").trim();
  if (!target) return c.text("请指定文件路径", 400);
  const current = resolve(runtimeSettings.workspace || process.env.CCWEB_WORKSPACE || process.cwd());
  const fullPath = resolve(current, target);
  if (!inside(fullPath, current) || !existsSync(fullPath)) {
    return c.text("文件不存在或越权访问", 404);
  }
  const stat = statSync(fullPath);
  if (!stat.isFile()) return c.text("不是有效文件", 400);
  if (stat.size > 80 * 1024 * 1024) {
    return c.text("文件超出预览大小限制 (80MB)", 413);
  }

  const ext = (target.split('.').pop() || '').toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const rangeHeader = c.req.header("range");

  if (rangeHeader && rangeHeader.startsWith("bytes=")) {
    const parts = rangeHeader.replace("bytes=", "").split("-");
    const start = parseInt(parts[0] || "0", 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

    if (start >= stat.size || end >= stat.size || start > end) {
      return c.text("请求范围不满足", 416, {
        "Content-Range": `bytes */${stat.size}`,
      });
    }

    const chunkLength = end - start + 1;
    const buffer = Buffer.alloc(chunkLength);
    const fd = openSync(fullPath, "r");
    readSync(fd, buffer, 0, chunkLength, start);
    closeSync(fd);

    return c.body(buffer, 206, {
      "Content-Type": mime,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunkLength),
      "Cache-Control": "no-cache",
    });
  }

  const data = readFileSync(fullPath);
  return c.body(data, 200, {
    'Content-Type': mime,
    'Content-Length': String(stat.size),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  });
});

const PLAN_WHITELIST = new Set([
  'implementation_plan.md',
  'SPEC.md',
  'task.md',
  'todo.md',
  'PLAN.md',
]);

// 工作区实施计划原子持久化写入（仅限白名单计划文件，防越权与逃逸）
configApi.post("/workspaces/write-plan", async (c) => {
  const body = await c.req.json<{ path?: string; content?: string }>();
  const target = (body.path || "").trim();
  const content = body.content;

  if (!target || typeof content !== 'string') {
    return c.json({ ok: false, error: "缺少路径或文件内容" }, 400);
  }
  const base = basename(target);
  if (!PLAN_WHITELIST.has(base) || target !== base) {
    return c.json({ ok: false, error: "只允许安全持久化白名单计划文件" }, 403);
  }
  if (content.length > 512 * 1024) {
    return c.json({ ok: false, error: "计划文件超出大小限制" }, 400);
  }

  const current = resolve(runtimeSettings.workspace || process.env.CCWEB_WORKSPACE || process.cwd());
  const fullPath = join(current, base);
  if (!inside(fullPath, current)) {
    return c.json({ ok: false, error: "禁止越权访问工作区外部" }, 403);
  }

  try {
    atomicWrite(fullPath, content);
    return c.json({ ok: true, path: base, size: content.length });
  } catch (error) {
    return c.json({ ok: false, error: (error as Error).message }, 500);
  }
});
