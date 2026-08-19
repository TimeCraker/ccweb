import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * 运行时设置与端点模板。
 * 关键原则:生效端点/模型的真值读 ~/.claude/settings.json(用户权威配置),
 * 绝不用 server 进程 env(启动终端不同会导致继承漂移——用户实际 bug)。
 */

export interface RuntimeSettings {
  model: string | null
  permissionMode: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions' | null
  effort: string | null
  /** 端点模板 key(settings.<key>.json) */
  endpointTemplate: string | null
  /** 工作区目录(session cwd) */
  workspace: string | null
}

export const runtimeSettings: RuntimeSettings = {
  model: null,
  permissionMode: null,
  effort: null,
  endpointTemplate: null,
  workspace: null,
}

export interface EndpointTemplate {
  key: string
  name: string
  baseUrl: string | null
}

const CC_DIR = join(homedir(), '.claude')

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

/** 读取 cc-toolkit 端点模板列表(不含任何凭证;URL 明文展示) */
export function listEndpointTemplates(): EndpointTemplate[] {
  const dir = join(CC_DIR, 'cc-toolkit', 'settings')
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.startsWith('settings.') && f.endsWith('.json'))
  } catch {
    return []
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
      })
    } catch {
      // 跳过坏模板
    }
  }
  return out
}

/** 应用端点模板:返回需注入子进程的 env 片段(含 token,仅留在 server 侧) */
export function endpointEnv(templateKey: string | null): Record<string, string> {
  if (!templateKey) return {}
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
