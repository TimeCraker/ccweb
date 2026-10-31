import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { CC_DIR, APP_DIR } from './dirs.js'
import { connectionEnv, listConnections, templateKeyOf } from './connections.js'

/**
 * 运行时设置与端点模板。
 * 关键原则:生效端点/模型的真值读 ~/.claude/settings.json(用户权威配置),
 * 绝不用 server 进程 env(启动终端不同会导致继承漂移——用户实际 bug)。
 */

export interface RuntimeSettings {
  authentication: 'inherit' | 'native'
  model: string | null
  permissionMode: 'auto' | 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions' | null
  effort: string | null
  /** 端点模板 key(settings.<key>.json) */
  endpointTemplate: string | null
  /** 工作区目录(session cwd) */
  workspace: string | null
  /**
   * 会话上下文注入档位(新会话生效):
   * full   = user+project+local——~/.claude 全套(默认,与 claude CLI 行为一致)
   * project= 仅项目级——无全局 CLAUDE.md/hooks/skills 注入,会话彼此隔离
   * none   = 完全不加载文件系统设置(dsh 式纯净,自定义 systemPrompt 场景)
   */
  contextScope: 'full' | 'project' | 'none'
}

export const runtimeSettings: RuntimeSettings = {
  authentication: 'inherit',
  model: null,
  permissionMode: null,
  effort: null,
  endpointTemplate: null,
  workspace: null,
  contextScope: 'full',
}

export interface EndpointTemplate {
  key: string
  name: string
  baseUrl: string | null
  /** 模板/连接声明的默认模型;仅用于界面显示"使用默认"的具体值 */
  model: string | null
}

export { CC_DIR, APP_DIR } from './dirs.js'
try {
  const saved = JSON.parse(readFileSync(join(APP_DIR, 'settings.json'), 'utf8')) as Partial<RuntimeSettings>
  for (const key of ['model', 'effort', 'endpointTemplate', 'workspace'] as const) {
    if (typeof saved[key] === 'string' || saved[key] === null) runtimeSettings[key] = saved[key] ?? null
  }
  if (['inherit', 'native'].includes(String(saved.authentication))) runtimeSettings.authentication = saved.authentication!
  if (['full', 'project', 'none'].includes(String(saved.contextScope))) runtimeSettings.contextScope = saved.contextScope!
  if (['default', 'auto', 'acceptEdits', 'plan'].includes(String(saved.permissionMode))) runtimeSettings.permissionMode = saved.permissionMode!
} catch { /* First run uses defaults. */ }
export function saveRuntimeSettings(): void {
  mkdirSync(APP_DIR, { recursive: true })
  const path = join(APP_DIR, 'settings.json')
  const temp = `${path}.${crypto.randomUUID()}.tmp`
  writeFileSync(temp, JSON.stringify(runtimeSettings, null, 2), { mode: 0o600 })
  renameSync(temp, path)
}

/** ~/.claude/settings.json 的 env 段(用户权威生效配置) */
export function readActiveEnv(): Record<string, string> {
  try {
    const json = JSON.parse(readFileSync(join(CC_DIR, 'settings.json'), 'utf8')) as {
      env?: Record<string, string>
    }
    return json.env ?? {}
  } catch {
    return {}
  }
}

/** 读取端点模板列表(不含任何凭证;URL 明文展示)。
 *  来源合并:cc-toolkit 旧模板(只读兼容) + ccweb 自有连接(可编辑)。
 */
export function listEndpointTemplates(): EndpointTemplate[] {
  const dir = join(CC_DIR, 'cc-toolkit', 'settings')
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.startsWith('settings.') && f.endsWith('.json'))
  } catch {
    files = []
  }
  const out: EndpointTemplate[] = []
  for (const f of files) {
    const key = f.slice('settings.'.length, -'.json'.length)
    try {
      const json = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
        env?: Record<string, string>
      }
      out.push({
        key,
        name: key,
        baseUrl: json.env?.ANTHROPIC_BASE_URL ?? null,
        model: json.env?.ANTHROPIC_MODEL ?? null,
      })
    } catch {
      // 跳过坏模板
    }
  }
  for (const connection of listConnections()) {
    out.push({
      key: templateKeyOf(connection.key),
      name: connection.name,
      baseUrl: connection.baseUrl,
      model: connection.model,
    })
  }
  return out
}

/** 应用端点模板:返回需注入子进程的 env 片段(含 token,仅留在 server 侧) */
export function endpointEnv(templateKey: string | null): Record<string, string> {
  if (!templateKey) return {}
  // ccweb 自有连接优先:key 前缀区分,避免与用户 cc-toolkit 模板重名
  if (templateKey.startsWith('ccweb-')) return connectionEnv(templateKey)
  if (!/^[a-zA-Z0-9_-]+$/.test(templateKey)) throw new Error('Invalid endpoint template key')
  const dir = join(CC_DIR, 'cc-toolkit', 'settings')
  try {
    const json = JSON.parse(
      readFileSync(join(dir, `settings.${templateKey}.json`), 'utf8'),
    ) as { env?: Record<string, string> }
    const env = json.env ?? {}
    const picked: Record<string, string> = {}
    for (const k of [
      'ANTHROPIC_BASE_URL',
      'ANTHROPIC_AUTH_TOKEN',
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      'API_TIMEOUT_MS',
    ]) {
      if (env[k]) picked[k] = env[k] ?? ''
    }
    return picked
  } catch {
    return {}
  }
}

// ---------- 工作区(对齐 dsh):从 ~/.claude/projects 反解用户全部项目目录 ----------

export interface WorkspaceInfo {
  dir: string
  sessions: number
  lastModified: string | null
}

/** 已知工作区列表:扫描 ~/.claude/projects 各目录,读最新 jsonl 的 cwd 真值 + 会话数 */
export function listWorkspaces(): WorkspaceInfo[] {
  const root = join(CC_DIR, 'projects')
  let dirs: string[]
  try {
    dirs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
  const out: WorkspaceInfo[] = []
  for (const d of dirs) {
    const pdir = join(root, d)
    let files: string[]
    try {
      files = readdirSync(pdir).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    if (files.length === 0) continue
    try {
      const sorted = files
        .map((f) => ({ f, m: statSync(join(pdir, f)).mtimeMs }))
        .sort((a, b) => b.m - a.m)
      const newest = sorted[0]
      if (!newest) continue
      const first = readFileSync(join(pdir, newest.f), 'utf8').slice(0, 4096)
      const cwdMatch = first.match(/"cwd":"([^"]+)"/)
      if (!cwdMatch?.[1]) continue
      out.push({
        dir: cwdMatch[1].replace(/\\\\/g, '\\'),
        sessions: files.length,
        lastModified: new Date(newest.m).toISOString(),
      })
    } catch {
      continue
    }
  }
  return out.sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''))
}

// ---------- ~/.claude 配置面板数据(Skills / Rules / CLAUDE.md) ----------

export interface SkillInfo {
  name: string
  description: string
  local: boolean // true = 本机不上云(cc-chat-curate 等)
}

export function listUserSkills(): SkillInfo[] {
  const dir = join(CC_DIR, 'skills')
  let entries: string[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }
  const out: SkillInfo[] = []
  for (const name of entries) {
    let description = ''
    try {
      const md = readFileSync(join(dir, name, 'SKILL.md'), 'utf8')
      const m = md.match(/^description:\s*(.+)$/m)
      if (m?.[1]) description = m[1].trim().slice(0, 120)
    } catch {
      // 无 SKILL.md 的目录跳过描述
    }
    out.push({ name, description, local: false })
  }
  return out
}

export function listUserRules(): Array<{ name: string; size: number }> {
  const dir = join(CC_DIR, 'rules')
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => {
        let size = 0
        try {
          size = readFileSync(join(dir, f), 'utf8').length
        } catch {
          // 忽略
        }
        return { name: f, size }
      })
  } catch {
    return []
  }
}

export function readClaudeMd(): string | null {
  try {
    const s = readFileSync(join(CC_DIR, 'CLAUDE.md'), 'utf8')
    return s.length > 8000 ? `${s.slice(0, 8000)}\n…(截断)` : s
  } catch {
    return null
  }
}

/**
 * 斜杠命令:直扫 ~/.claude/commands 与工作区 .claude/commands(连接即有,无需 spawn);
 * SDK init 的 slash_commands 到达后由前端合并(补内置命令)。
 */
export function listSlashCommands(workspace?: string | null): Array<{ name: string; description: string }> {
  const out: Array<{ name: string; description: string }> = []
  function add(path: string, name: string) {
    try { const md = readFileSync(path, 'utf8'); out.push({ name, description: md.match(/^description:\s*(.+)$/m)?.[1]?.trim().slice(0, 100) ?? '' }) } catch { /* Optional resource. */ }
  }
  function scan(dir: string, prefix = '', depth = 0): void {
    if (depth > 5) return
    try { for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) scan(join(dir, entry.name), `${prefix}${entry.name}:`, depth + 1)
      else if (entry.name.endsWith('.md')) add(join(dir, entry.name), prefix + entry.name.slice(0, -3))
    } } catch { /* No commands. */ }
  }
  for (const config of [CC_DIR, ...(workspace ? [join(workspace, '.claude')] : [])]) {
    scan(join(config, 'commands'))
    try { for (const name of readdirSync(join(config, 'skills'))) add(join(config, 'skills', name, 'SKILL.md'), name) } catch { /* No skills. */ }
  }
  return [...new Map(out.map(item => [item.name, item])).values()]
}


/** Explicit native login must not reuse a third-party endpoint's bearer credential. */
export function nativeAuthenticationEnv(): Record<string, string> {
  return { ANTHROPIC_BASE_URL: 'https://api.anthropic.com', ANTHROPIC_AUTH_TOKEN: '', ANTHROPIC_API_KEY: '', ANTHROPIC_MODEL: '', ANTHROPIC_DEFAULT_SONNET_MODEL: '', ANTHROPIC_DEFAULT_OPUS_MODEL: '', ANTHROPIC_DEFAULT_HAIKU_MODEL: '', ANTHROPIC_SMALL_FAST_MODEL: '', CLAUDE_CODE_SUBAGENT_MODEL: '', ANTHROPIC_CUSTOM_HEADERS: '', CLAUDE_CODE_USE_BEDROCK: '0', CLAUDE_CODE_USE_VERTEX: '0', CLAUDE_CODE_USE_FOUNDRY: '0' }
}
export function effectiveEnv(config = runtimeSettings): Record<string, string | undefined> {
  return { ...process.env, ...readActiveEnv(), ...endpointEnv(config.endpointTemplate), ...(config.authentication === 'native' ? nativeAuthenticationEnv() : {}) }
}
