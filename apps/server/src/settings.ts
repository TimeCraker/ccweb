import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * 运行时设置与端点模板。
 * - 模型/权限模式:当前会话热切(q.setModel / q.setPermissionMode)
 * - effort / 端点:子进程 env,新会话生效(诚实语义,UI 同步提示)
 * - 端点模板兼容 cc-toolkit/settings/*.json(仅 name/url,token 永不出 server)
 */

export interface RuntimeSettings {
  model: string | null
  permissionMode: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions' | null
  effort: string | null
  /** 端点模板 key(settings.<key>.json) */
  endpointTemplate: string | null
}

export const runtimeSettings: RuntimeSettings = {
  model: process.env.ANTHROPIC_MODEL ?? null,
  permissionMode: null,
  effort: process.env.CLAAUDE_CODE_EFFORT_LEVEL ?? process.env.CLAUDE_CODE_EFFORT_LEVEL ?? null,
  endpointTemplate: null,
}

export interface EndpointTemplate {
  key: string
  name: string
  baseUrl: string | null
}

/** 读取 cc-toolkit 端点模板列表(不含任何凭证) */
export function listEndpointTemplates(): EndpointTemplate[] {
  const dir = join(homedir(), '.claude', 'cc-toolkit', 'settings')
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
      const url = json.env?.ANTHROPIC_BASE_URL ?? null
      const model = json.env?.ANTHROPIC_MODEL
      out.push({
        key,
        name: key,
        baseUrl: url,
        ...(model ? {} : {}),
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
  const dir = join(homedir(), '.claude', 'cc-toolkit', 'settings')
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
