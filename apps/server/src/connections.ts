import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { APP_DIR } from './dirs.js'

/**
 * ccweb 自有模型连接存储。
 *
 * 为什么单独存:旧实现直接把连接写进 ~/.claude/cc-toolkit/settings/settings.<name>.json,
 * 会覆盖用户已有模板、名称被限制为 ASCII。新连接默认写入 ccweb 自有目录(0600),
 * cc-toolkit 模板继续只读兼容;运行时优先按模板 key 解析,找不到再回落到这里。
 *
 * 凭证约束:API Key 只存在本机该文件里,任何列表/快照/错误响应都不回传原文。
 */

export interface StoredConnection {
  /** 稳定 key,用于 endpointTemplate;随机生成,不直接暴露用户输入 */
  key: string
  name: string
  baseUrl: string
  model: string | null
  apiKey?: string
  createdAt: number
  updatedAt: number
}

export interface PublicConnection {
  key: string
  name: string
  baseUrl: string
  model: string | null
  hasKey: boolean
  createdAt: number
  updatedAt: number
}

interface StoreShape {
  version: 1
  connections: StoredConnection[]
}

const FILE = () => join(APP_DIR, 'connections.json')
const TEMPLATE_PREFIX = 'ccweb-'

function readStore(): StoreShape {
  try {
    const raw = JSON.parse(readFileSync(FILE(), 'utf8')) as Partial<StoreShape>
    const connections = Array.isArray(raw.connections) ? raw.connections : []
    return {
      version: 1,
      connections: connections.filter(
        (item): item is StoredConnection =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as StoredConnection).key === 'string' &&
          typeof (item as StoredConnection).baseUrl === 'string',
      ),
    }
  } catch {
    return { version: 1, connections: [] }
  }
}

function writeStore(store: StoreShape): void {
  const path = FILE()
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(store, null, 2), { mode: 0o600 })
    renameSync(temporary, path)
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

/** 只做保守规范化:去首尾空格与末尾斜杠;其余路径保持用户输入,不做 /v1 猜测 */
export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error('请填写接口地址')
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('接口地址不是合法 URL，请包含 http:// 或 https://')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('接口地址只支持 http 或 https')
  if (url.username || url.password) throw new Error('请不要把凭证写在接口地址里')
  if (url.search) throw new Error('接口地址不要包含查询参数')
  const pathname = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${pathname === '/' ? '' : pathname}`
}

/** 由 Base URL 推导 Messages 请求地址:
 *  已以 /messages 结尾 → 原样;以 /v1 结尾 → 追加 /messages;其他 → 追加 /v1/messages。
 *  实际请求地址会回传 UI 展示,避免用户猜路径。
 */
export function resolveMessagesUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl)
  if (/\/messages$/.test(base)) return base
  if (/\/v1$/.test(base)) return `${base}/messages`
  return `${base}/v1/messages`
}

export function listConnections(): PublicConnection[] {
  return readStore().connections.map(({ apiKey, ...rest }) => ({ ...rest, hasKey: Boolean(apiKey) }))
}

export function templateKeyOf(connectionKey: string): string {
  return `${TEMPLATE_PREFIX}${connectionKey}`
}

export function connectionKeyOfTemplate(templateKey: string): string | null {
  return templateKey.startsWith(TEMPLATE_PREFIX) ? templateKey.slice(TEMPLATE_PREFIX.length) : null
}

export function getConnection(key: string): StoredConnection | null {
  return readStore().connections.find((item) => item.key === key) ?? null
}

export function saveConnection(input: {
  key?: string | null
  name?: string | null
  baseUrl: string
  model?: string | null
  /** undefined = 保留原 key;'' = 明确清除 */
  apiKey?: string | null
}): PublicConnection {
  const store = readStore()
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const existing = input.key ? store.connections.find((item) => item.key === input.key) : undefined
  const name = (input.name ?? '').trim() || existing?.name || hostOf(baseUrl)
  if (name.length > 60) throw new Error('连接名称不超过 60 个字符')
  const now = Date.now()
  const key = existing?.key ?? randomUUID().replace(/-/g, '').slice(0, 12)
  const next: StoredConnection = {
    key,
    name,
    baseUrl,
    model: input.model === undefined ? existing?.model ?? null : input.model || null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  if (input.apiKey === undefined) {
    if (existing?.apiKey) next.apiKey = existing.apiKey
  } else if (input.apiKey) {
    next.apiKey = input.apiKey.trim()
  }
  const connections = existing
    ? store.connections.map((item) => (item.key === key ? next : item))
    : [...store.connections, next]
  writeStore({ version: 1, connections })
  const { apiKey, ...rest } = next
  return { ...rest, hasKey: Boolean(apiKey) }
}

export function removeConnection(key: string): boolean {
  const store = readStore()
  const connections = store.connections.filter((item) => item.key !== key)
  if (connections.length === store.connections.length) return false
  writeStore({ version: 1, connections })
  return true
}

/** 运行时注入 env:仅返回需要的键,apiKey 不进入日志/快照 */
export function connectionEnv(templateKey: string): Record<string, string> {
  const key = connectionKeyOfTemplate(templateKey)
  if (!key) return {}
  const connection = getConnection(key)
  if (!connection) return {}
  const env: Record<string, string> = { ANTHROPIC_BASE_URL: connection.baseUrl }
  if (connection.apiKey) env.ANTHROPIC_AUTH_TOKEN = connection.apiKey
  if (connection.model) env.ANTHROPIC_MODEL = connection.model
  return env
}

export type ProbeCategory =
  | 'ok'
  | 'auth'
  | 'path'
  | 'rate'
  | 'server'
  | 'network'
  | 'timeout'
  | 'protocol'
  | 'model'
  | 'invalid'

export interface ProbeResult {
  ok: boolean
  category: ProbeCategory
  status?: number
  model?: string
  elapsedMs: number
  requestUrl: string
  message: string
  detail?: string
}

const CATEGORY_HINT: Record<Exclude<ProbeCategory, 'ok'>, string> = {
  auth: '接口拒绝了这个 API Key（401/403）。请检查 Key 是否有效、是否属于该服务商，以及账号权限。',
  path: '服务端没有这个接口路径（404/405）。请核对 Base URL 是否应包含 /v1 或完整的 /messages 路径。',
  rate: '请求被限流或额度不足（429）。请稍后重试，或检查服务商账户额度。',
  server: '服务商返回了 5xx，可能是临时故障。稍后再试。',
  network: '无法连接到该地址。请检查网络、代理与地址拼写。',
  timeout: '请求超时。服务商可能较慢，或地址指向了不可达的网关。',
  protocol: '该地址返回的不是 Anthropic Messages 格式。此接口格式当前不兼容，请填写兼容的接口地址。',
  model: '服务商不认识这个模型 ID。请填写该服务商提供的模型 ID，或留空使用连接默认模型。',
  invalid: '请求参数或地址不合法，请检查表单。',
}

function sanitize(text: string, secret?: string): string {
  let out = text.replace(/\s+/g, ' ').trim()
  if (secret) out = out.split(secret).join('***')
  return out.slice(0, 400)
}

function classifyStatus(status: number, body: Record<string, unknown> | null): Exclude<ProbeCategory, 'ok'> {
  if (status === 401 || status === 403) return 'auth'
  if (status === 404 || status === 405) return 'path'
  if (status === 429) return 'rate'
  if (status >= 500) return 'server'
  if (status === 400 || status === 422) {
    const message = JSON.stringify(body ?? {}).toLowerCase()
    if (message.includes('model')) return 'model'
    return 'invalid'
  }
  return 'invalid'
}

/**
 * 可选的显式连通测试:一次真实调用,禁工具、不重试、20 秒超时。
 * 结果绑定调用方传入的草稿快照,不会写任何配置文件。
 */
export async function testConnection(input: {
  baseUrl: string
  apiKey?: string | null
  model?: string | null
  connectionKey?: string | null
}): Promise<ProbeResult> {
  const started = Date.now()
  let requestUrl: string
  try {
    requestUrl = resolveMessagesUrl(input.baseUrl)
  } catch (error) {
    return {
      ok: false,
      category: 'invalid',
      elapsedMs: 0,
      requestUrl: input.baseUrl,
      message: error instanceof Error ? error.message : CATEGORY_HINT.invalid,
    }
  }
  const stored = input.connectionKey ? getConnection(input.connectionKey) : null
  const apiKey = (input.apiKey ?? '').trim() || stored?.apiKey || ''
  const model = (input.model ?? '').trim() || stored?.model || ''

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
  }
  if (apiKey) {
    headers['x-api-key'] = apiKey
    headers.authorization = `Bearer ${apiKey}`
  }
  const body: Record<string, unknown> = {
    max_tokens: 16,
    messages: [{ role: 'user', content: 'ping' }],
  }
  if (model) body.model = model

  let response: Response
  try {
    response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      redirect: 'error',
    })
  } catch (error) {
    const name = (error as { name?: string }).name ?? ''
    const timedOut = name === 'TimeoutError' || name === 'AbortError'
    return {
      ok: false,
      category: timedOut ? 'timeout' : 'network',
      elapsedMs: Date.now() - started,
      requestUrl,
      message: CATEGORY_HINT[timedOut ? 'timeout' : 'network'],
      detail: sanitize(String((error as { message?: string }).message ?? error), apiKey),
    }
  }

  const raw = await response.text().catch(() => '')
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    parsed = null
  }
  const elapsedMs = Date.now() - started
  const looksHtml = /^\s*</.test(raw)
  const openAiShape = Boolean(parsed && (Array.isArray(parsed.choices) || typeof parsed.object === 'string'))

  if (!response.ok) {
    const category = openAiShape ? 'protocol' : classifyStatus(response.status, parsed)
    return {
      ok: false,
      category,
      status: response.status,
      elapsedMs,
      requestUrl,
      message: CATEGORY_HINT[category],
      detail: sanitize(raw, apiKey),
    }
  }

  if (looksHtml || openAiShape) {
    return {
      ok: false,
      category: 'protocol',
      status: response.status,
      elapsedMs,
      requestUrl,
      message: CATEGORY_HINT.protocol,
      detail: sanitize(raw, apiKey),
    }
  }

  const blocks = parsed?.content
  if (!Array.isArray(blocks)) {
    return {
      ok: false,
      category: 'protocol',
      status: response.status,
      elapsedMs,
      requestUrl,
      message: CATEGORY_HINT.protocol,
      detail: sanitize(raw, apiKey),
    }
  }

  return {
    ok: true,
    category: 'ok',
    status: response.status,
    model: typeof parsed?.model === 'string' ? parsed.model : model || undefined,
    elapsedMs,
    requestUrl,
    message: '连接成功。测试只验证文本接口可达，工具与图片能力仍需在任务中确认。',
    detail: undefined,
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'model connection'
  }
}
