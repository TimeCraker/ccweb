import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseDocument } from 'yaml'
import { useStore } from '../store'
import { setTheme, useThemeMode } from '../theme'
import { setLocale, useLocale } from '../i18n'
import { SectionIcon, IconSearch, IconPlus, IconX, IconCheck, IconWarn } from './Icon'
import { Modal } from './ui/Menu'
import DiffView from './DiffView'
import { baseName } from '../lib/path'
import { getCachedEffort, saveCachedEffort } from './RunMenus'

type Kind = 'skill' | 'command' | 'rule' | 'mcp' | 'hooks' | 'permissions'
export type SettingsTab = 'general' | 'connection' | 'permission' | Kind | 'about'

interface Resource {
  id: string
  name: string
  kind: Kind
  source: 'user' | 'project' | 'plugin' | 'inherited' | 'managed'
  path: string
  writable: boolean
  description?: string
  invocation?: string
}
interface Document extends Resource {
  content: string
  revision: string
  errors: string[]
}
interface Runtime {
  configDirectory?: string
  sdkVersion: string
  binarySource: string
  credentialConfigured: boolean
  endpoint: string
}
interface Connection {
  key: string
  name: string
  baseUrl: string
  model: string | null
  hasKey: boolean
  inheritAuth: boolean
  createdAt: number
  updatedAt: number
}
interface DeletedSession {
  id: string
  title: string
  deletedAt: number
  projectDir: string
  bytes: number
}
interface ProbeResult {
  ok: boolean
  category: 'ok' | 'auth' | 'path' | 'rate' | 'server' | 'network' | 'timeout' | 'protocol' | 'model' | 'invalid'
  status?: number
  model?: string
  elapsedMs: number
  requestUrl: string
  message: string
  detail?: string
}

const NAV: Array<{ group: string; items: Array<[SettingsTab, string]> }> = [
  { group: '连接与权限', items: [['connection', '模型与连接'], ['permission', '工作方式与权限']] },
  { group: '工作环境', items: [['skill', '技能'], ['command', '指令'], ['rule', '上下文与规则']] },
  { group: '扩展', items: [['mcp', 'MCP 与工具'], ['hooks', 'Hooks']] },
  { group: '应用', items: [['general', '通用'], ['about', '关于与更新']] },
]

const TAB_TITLE: Record<Tab, { title: string; sub: string }> = {
  general: { title: '通用', sub: '外观与语言只保存在本浏览器，不影响 Claude 配置。' },
  connection: { title: '模型与连接', sub: '使用自己的 API 服务；保存后即可在输入区选择模型。' },
  permission: { title: '工作方式与权限', sub: '决定运行时在需要授权时怎么做。' },
  skill: { title: '技能', sub: '用户与项目技能；原生运行时在新会话加载。' },
  command: { title: '指令', sub: '斜杠指令与调用方式；文件保存后由新会话加载。' },
  rule: { title: '上下文与规则', sub: 'CLAUDE.md 与规则来源；已加载内容以原生运行时为准。' },
  mcp: { title: 'MCP 与工具', sub: 'MCP 服务状态与配置；配置文件存在不代表已连接。' },
  hooks: { title: 'Hooks', sub: 'Hook 执行诊断；配置存在不代表已执行。' },
  permissions: { title: '权限规则', sub: 'allow / ask / deny 与附加目录；保存只更新权限分区。' },
  about: { title: '关于与更新', sub: '版本、运行时来源与就绪状态。' },
}
type Tab = SettingsTab
const SOURCE_LABEL: Record<Resource['source'], string> = {
  user: '用户',
  project: '当前项目',
  plugin: '插件 · 只读',
  inherited: '父级继承 · 只读',
  managed: '组织托管 · 只读',
}
const TEMPLATE_PREFIX = 'ccweb-'

async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') throw error
    throw new Error('无法连接本机服务，请确认 ccweb 仍在运行。')
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? '操作失败，请重试')
  return data
}

function frontmatter(content: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  const document = parseDocument(match?.[1] ?? '')
  return { match, document, body: match ? content.slice(match[0].length) : content }
}

type AuthMode = 'key' | 'inherit' | 'none'

interface FormState {
  key: string | null
  name: string
  baseUrl: string
  model: string
  apiKey: string
  keepKey: boolean
  authMode: AuthMode
}

/** 连接表单的字段级校验:与服务端 normalizeBaseUrl 的边界保持一致 */
function validateConnection(form: FormState): Partial<Record<'name' | 'baseUrl' | 'model', string>> {
  const errors: Partial<Record<'name' | 'baseUrl' | 'model', string>> = {}
  if (form.name.trim().length > 60) errors.name = '连接名称不超过 60 个字符'
  const raw = form.baseUrl.trim()
  if (!raw) {
    errors.baseUrl = '请填写接口地址'
  } else {
    try {
      const url = new URL(raw)
      if (!['http:', 'https:'].includes(url.protocol)) errors.baseUrl = '只支持 http:// 或 https://'
      else if (url.username || url.password) errors.baseUrl = '不要把凭证写在地址里'
      else if (url.search) errors.baseUrl = '地址不要包含查询参数'
      else if (/\/messages$/i.test(url.pathname) && !/\/v1\/messages$/i.test(url.pathname)) {
        errors.baseUrl = '请填写根地址，不要包含 /messages；运行时会在根地址后追加 /v1/messages'
      }
    } catch {
      errors.baseUrl = '请输入完整地址，例如 https://api.example.com/anthropic'
    }
  }
  if (/\s/.test(form.model.trim())) errors.model = '模型 ID 不能包含空格'
  return errors
}

export default function SettingsCenter({
  open,
  onClose,
  send,
  initialTab = 'connection',
  onOpenNative,
  onNewSession,
}: {
  open: boolean
  onClose: () => void
  send: (message: Record<string, unknown>) => void
  initialTab?: Tab
  onOpenNative?: () => void
  onNewSession?: () => void
}) {
  const activeModel = useStore((s) => s.providerModel ?? s.model)
  const runtimeAlias = useStore((s) => s.model)
  const settings = useStore((s) => s.settings)
  const sessionId = useStore((s) => s.sessionId)
  const operationError = useStore((s) => s.error)
  const diagnostics = useStore((s) => s.runtimeDiagnostics)
  const availableModels = useStore((s) => s.availableModels)
  const mcp = useStore((s) => s.mcpServers)
  const slashCommands = useStore((s) => s.slashCommands)
  const locale = useLocale()
  const { mode } = useThemeMode()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [resources, setResources] = useState<Resource[]>([])
  const [selected, setSelected] = useState<Document | null>(null)
  const [draft, setDraft] = useState('')
  const [source, setSource] = useState('all')
  const [search, setSearch] = useState('')
  const [sourceMode, setSourceMode] = useState(false)
  const [conflict, setConflict] = useState<Document | null>(null)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [newName, setNewName] = useState<string | null>(null)
  const [createSource, setCreateSource] = useState('project')
  const [copyContent, setCopyContent] = useState<string | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [connectionError, setConnectionError] = useState('')
  const [connectionNotice, setConnectionNotice] = useState('')
  const [testing, setTesting] = useState(false)
  const [probe, setProbe] = useState<{ signature: string; result: ProbeResult } | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  /** 草稿编辑序号:任何字段修改都会让旧测试结果永久失效(即使改回原值) */
  const [draftVersion, setDraftVersion] = useState(0)
  const [formTouched, setFormTouched] = useState(false)
  const [formAttempted, setFormAttempted] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [needsNewSession, setNeedsNewSession] = useState(false)
  const [deletedSessions, setDeletedSessions] = useState<DeletedSession[]>([])
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const probeController = useRef<AbortController | null>(null)
  const probeSeq = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const request = useRef(0)
  const workspace = settings?.workspace ?? ''
  const formErrors = form ? validateConnection(form) : {}
  const formValid = Object.keys(formErrors).length === 0
  const dirty = selected !== null && draft !== selected.content
  const formDirty = form !== null && formTouched
  const hasUnsaved = dirty || formDirty || newName !== null
  const dismissDraft = useCallback(() => !hasUnsaved || window.confirm('放弃尚未保存的更改？'), [hasUnsaved])
  const close = useCallback(() => {
    if (!saving && dismissDraft()) onClose()
  }, [saving, dismissDraft, onClose])
  // Modal 已经通过 canDismiss 走过草稿确认;这里只做"正在保存"保护,避免重复确认
  const forceClose = useCallback(() => {
    if (!saving) onClose()
  }, [saving, onClose])
  const permissionFields = useMemo(() => {
    try {
      const value: unknown = JSON.parse(draft)
      return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
    } catch {
      return null
    }
  }, [draft])
  const parsed = useMemo(() => frontmatter(draft), [draft])
  const query = useMemo(() => `workspace=${encodeURIComponent(workspace)}`, [workspace])

  const refresh = useCallback(async () => {
    const data = await api<Resource[]>(`resources?${query}`)
    setResources(data)
  }, [query])

  const refreshConnections = useCallback(async () => {
    try {
      const list = await api<Connection[]>('connections')
      setConnections(Array.isArray(list) ? list : [])
    } catch (e) {
      setConnectionError(String(e instanceof Error ? e.message : e))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    send({ t: 'settings.get' })
    void api<Resource[]>(`resources?${query}`, undefined, controller.signal)
      .then(setResources)
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e instanceof Error ? e.message : e))
      })
    void api<Runtime>('runtime', undefined, controller.signal)
      .then(setRuntime)
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e instanceof Error ? e.message : e))
      })
    void refreshConnections()
    return () => {
      controller.abort()
      probeController.current?.abort()
      probeController.current = null
    }
  }, [open, query, send, refreshConnections])

  useEffect(() => {
    if (!open) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [open, hasUnsaved])

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
  }, [open, initialTab])

  useEffect(() => {
    if (!open || tab !== 'general') return
    let alive = true
    void api<DeletedSession[]>('sessions/deleted')
      .then((list) => {
        if (alive) setDeletedSessions(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (alive) setDeletedSessions([])
      })
    return () => {
      alive = false
    }
  }, [open, tab])

  async function restoreDeleted(session: DeletedSession) {
    setRestoringId(session.id)
    setError('')
    setNotice('')
    try {
      await api('sessions/restore', { id: session.id })
      send({ t: 'session.list' })
      setDeletedSessions(await api<DeletedSession[]>('sessions/deleted'))
      setNotice(`已恢复「${session.title}」，可在侧栏重新打开。`)
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setRestoringId(null)
    }
  }

  useEffect(() => {
    setNotice((current) => (current.startsWith('正在提交') ? '设置已提交；由运行时确认后生效。' : current))
  }, [settings])

  async function load(item: Resource, committed = false) {
    if (!committed && !dismissDraft()) return
    const id = ++request.current
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const document = await api<Document>(`resource?${query}&id=${encodeURIComponent(item.id)}`)
      if (id !== request.current) return
      setConflict(null)
      setSelected(document)
      setDraft(document.content)
      setPreview(false)
      setSourceMode(false)
    } catch (e) {
      if (id === request.current) setError(String(e instanceof Error ? e.message : e))
    } finally {
      if (id === request.current) setSaving(false)
    }
  }

  function changeTab(next: Tab) {
    if (!dismissDraft()) return
    request.current += 1
    setForm(null)
    setTab(next)
    setSelected(null)
    setDraft('')
    setError('')
    setNotice('')
    setConnectionError('')
    setConnectionNotice('')
    setNewName(null)
    setSaving(false)
    if (next === 'mcp') send({ t: 'mcp.status' })
  }

  async function save() {
    if (!selected) return
    if (!preview) {
      setPreview(true)
      setNotice('请核对差异与写入位置，再点击确认保存。')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await api<Document>('resource', { workspace, id: selected.id, content: draft, revision: selected.revision })
      setSelected(result)
      setDraft(result.content)
      setNotice('已保存。当前运行保持已加载配置，新会话使用保存版本。')
      setPreview(false)
      await refresh()
      send({ t: 'settings.get' })
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      if (String(e).includes('其他操作修改')) {
        try {
          setConflict(await api<Document>(`resource?${query}&id=${encodeURIComponent(selected.id)}`))
        } catch {
          // 保留草稿
        }
      }
    } finally {
      setSaving(false)
    }
  }

  async function create() {
    if (!newName || !['skill', 'command', 'rule'].includes(tab)) return
    setSaving(true)
    setError('')
    let content =
      copyContent ??
      (tab === 'skill'
        ? `---\nname: ${newName}\ndescription: 描述这个技能在什么场景使用\n---\n\n# 使用说明\n\n在这里写技能指令。\n`
        : `---\ndescription: 描述这条指令或规则\n---\n\n在这里写内容。\n`)
    if (tab === 'skill' && copyContent) {
      const copy = frontmatter(content)
      copy.document.set('name', newName)
      content = `---\n${copy.document.toString()}---\n${copy.body}`
    }
    try {
      const item = await api<Resource>('resource/create', { workspace, source: createSource, kind: tab, name: newName, content })
      if (item.kind === 'command' || item.kind === 'skill') {
        const state = useStore.getState()
        state.setSlashCommands([...state.slashCommands.filter((command) => command.name !== item.name), { name: item.name, description: '' }])
      }
      setNewName(null)
      setCopyContent(null)
      await refresh()
      await load(item, true)
      send({ t: 'settings.get' })
      setNotice('已创建，可以继续编辑内容。')
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!selected || !window.confirm(`删除 ${selected.name}？原内容会先备份到本地。`)) return
    setSaving(true)
    setError('')
    try {
      await api('resource/delete', { workspace, id: selected.id, revision: selected.revision })
      setSelected(null)
      setDraft('')
      await refresh()
      setNotice('已删除，原内容已备份。')
      send({ t: 'settings.get' })
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setSaving(false)
    }
  }

  function setField(key: string, value: string) {
    const next = frontmatter(draft)
    if (next.document.errors.length) {
      setSourceMode(true)
      return
    }
    next.document.set(key, value)
    setDraft(`---\n${next.document.toString()}---\n${next.body}`)
  }

  // ---------- 连接流程 ----------

  const currentTemplate = settings?.endpointTemplate ?? null
  const endpointList = settings?.endpoints ?? []
  const currentTemplateConnection = currentTemplate ? endpointList.find((item) => item.key === currentTemplate) : undefined
  const currentModel = settings?.active
    ? settings.active.providerModel ?? settings.active.model ?? activeModel ?? settings.currentModel ?? null
    : settings?.providerModel ?? settings?.model ?? activeModel ?? settings?.currentModel ?? null
  const describeSource = (key: string | null) => {
    if (!key) return settings?.authentication === 'native' ? 'Claude 原生登录' : '本机环境'
    const endpoint = endpointList.find((item) => item.key === key)
    return endpoint ? `连接「${endpoint.name}」` : '本机/旧模板（只读）'
  }
  const describeAuth = (auth: string | undefined, key: string | null) => {
    if (auth === 'native') return '原生登录'
    const connection = key?.startsWith('ccweb-') ? connections.find((item) => `ccweb-${item.key}` === key) : undefined
    if (connection?.inheritAuth) return '继承本机凭证'
    if (connection?.hasKey) return '连接 API Key'
    if (connection) return '无认证'
    return '本机环境'
  }
  const effortModel = settings?.model ?? settings?.active?.model ?? runtimeAlias ?? currentModel ?? (settings?.endpointTemplate ? settings.endpoints.find((item) => item.key === settings.endpointTemplate)?.model ?? null : null)
  const effortInfo = availableModels.find((item) => item.value === effortModel || item.resolvedModel === effortModel)
  const effortLevels: Array<'low' | 'medium' | 'high' | 'xhigh' | 'max'> =
    effortInfo?.supportsEffort === false
      ? []
      : effortInfo?.supportedEffortLevels && effortInfo.supportedEffortLevels.length > 0
        ? effortInfo.supportedEffortLevels
        : ['low', 'medium', 'high', 'xhigh', 'max']
  const cachedEffort = getCachedEffort(effortModel)
  const EFFORT_LABELS: Record<string, string> = { low: '低', medium: '中', high: '高', xhigh: '很高', max: '最大' }

  function startCreate() {
    setShowKey(false)
    setProbe(null)
    setConnectionError('')
    setConnectionNotice('')
    setNeedsNewSession(false)
    setDraftVersion((v) => v + 1)
    setFormTouched(false)
    setFormAttempted(false)
    setForm({ key: null, name: '', baseUrl: '', model: '', apiKey: '', keepKey: false, authMode: 'key' })
  }

  function startEdit(connection: Connection) {
    setShowKey(false)
    setProbe(null)
    setConnectionError('')
    setConnectionNotice('')
    setNeedsNewSession(false)
    setDraftVersion((v) => v + 1)
    setFormTouched(false)
    setFormAttempted(false)
    setForm({
      key: connection.key,
      name: connection.name,
      baseUrl: connection.baseUrl,
      model: connection.model ?? '',
      apiKey: '',
      keepKey: connection.hasKey,
      authMode: connection.inheritAuth ? 'inherit' : connection.hasKey ? 'key' : 'none',
    })
  }

  function updateForm(patch: Partial<FormState>) {
    setFormTouched(true)
    setDraftVersion((v) => v + 1)
    setForm((current) => (current ? { ...current, ...patch } : current))
  }

  function signatureOf(state: FormState): string {
    // 不泄漏到日志;只用于比较草稿身份。draftVersion 确保改回原值也不会复活旧结果。
    return `${draftVersion}|${state.key ?? ''}|${state.baseUrl.trim()}|${state.model.trim()}|${state.authMode}|${state.apiKey.trim()}|${state.keepKey ? 'keep' : 'new'}`
  }

  async function runProbe() {
    if (!form) return
    setFormAttempted(true)
    if (formErrors.baseUrl) {
      setConnectionError(formErrors.baseUrl)
      return
    }
    if (form.authMode === 'key' && !form.apiKey.trim() && !form.keepKey) {
      setConnectionError('测试连接需要 API Key；也可以先保存，稍后再测。')
      return
    }
    // 新测试取代旧测试:中止旧请求,并让迟到的旧响应无法写回
    probeController.current?.abort()
    const seq = ++probeSeq.current
    const signature = signatureOf(form)
    const controller = new AbortController()
    probeController.current = controller
    setTesting(true)
    setConnectionError('')
    setProbe(null)
    try {
      const result = await api<ProbeResult>(
        'connections/test',
        {
          baseUrl: form.baseUrl.trim(),
          apiKey: form.authMode === 'key' ? form.apiKey.trim() || null : form.authMode === 'none' ? '' : null,
          model: form.model.trim() || null,
          connectionKey: form.authMode === 'key' && form.keepKey ? form.key : null,
          inheritAuth: form.authMode === 'inherit',
        },
        controller.signal,
      )
      if (seq !== probeSeq.current || controller.signal.aborted) return
      setProbe({ signature, result })
    } catch (e) {
      if (seq !== probeSeq.current) return
      if (controller.signal.aborted) {
        setConnectionNotice('已取消测试，没有保存任何更改。')
        return
      }
      setConnectionError(String(e instanceof Error ? e.message : e))
    } finally {
      if (seq === probeSeq.current && probeController.current === controller) {
        probeController.current = null
        setTesting(false)
      }
    }
  }

  function cancelProbe() {
    probeController.current?.abort()
    probeController.current = null
    setTesting(false)
  }

  async function saveAndUse() {
    if (!form) return
    setFormAttempted(true)
    if (!formValid) {
      setConnectionError('请先修正表单中的错误：' + Object.values(formErrors).join('；'))
      return
    }
    const url = form.baseUrl.trim()
    const openAiLike = /(?:chat\/completions|\/responses)(?:$|[/?])/i.test(url)
    const protocolRejected =
      probe !== null && probe.signature === signatureOf(form) && probe.result.category === 'protocol'
    if (openAiLike || protocolRejected) {
      setConnectionError(
        '此接口格式当前不兼容：运行时需要 Anthropic Messages 兼容地址，OpenAI Chat Completions/Responses 不能直接使用。请换成服务商提供的兼容接口根地址。',
      )
      return
    }
    setSaving(true)
    setConnectionError('')
    setConnectionNotice('')
    try {
      const result = await api<{ connection: Connection; templateKey: string }>('connections', {
        key: form.key,
        name: form.name.trim() || null,
        baseUrl: form.baseUrl.trim(),
        model: form.model.trim() || null,
        apiKey:
          form.authMode === 'key'
            ? form.apiKey.trim() || (form.keepKey ? undefined : '')
            : form.authMode === 'none'
              ? ''
              : undefined,
        inheritAuth: form.authMode === 'inherit',
      })
      await refreshConnections()
      send({ t: 'settings.patch', scope: 'default', patch: { endpointTemplate: result.templateKey, model: null } })
      send({ t: 'settings.get' })
      // 保存成功后收起表单,避免把已保存内容误判为"未保存草稿"
      setForm(null)
      setFormTouched(false)
      setProbe(null)
      setNeedsNewSession(Boolean(sessionId))
      setConnectionNotice(
        `已保存「${result.connection.name}」。已请求设为默认连接：运行时确认后对新建会话生效，正在运行的任务不受影响。`,
      )
    } catch (e) {
      setConnectionError(String(e instanceof Error ? e.message : e))
    } finally {
      setSaving(false)
    }
  }

  async function useConnection(connection: Connection) {
    send({ t: 'settings.patch', scope: 'default', patch: { endpointTemplate: `${TEMPLATE_PREFIX}${connection.key}`, model: null } })
    send({ t: 'settings.get' })
    setConnectionNotice(`已请求切换到「${connection.name}」：运行时确认后对新建会话生效。`)
    setNeedsNewSession(Boolean(sessionId))
  }

  async function deleteConnection(connection: Connection) {
    if (!window.confirm(`删除连接「${connection.name}」？只删除 ccweb 保存的配置，不影响磁盘上的其他文件。`)) return
    setSaving(true)
    setConnectionError('')
    try {
      await api('connections/delete', { key: connection.key })
      if (currentTemplate === `${TEMPLATE_PREFIX}${connection.key}`) {
        send({ t: 'settings.patch', scope: 'default', patch: { endpointTemplate: null, model: null } })
        send({ t: 'settings.get' })
      }
      await refreshConnections()
      if (form?.key === connection.key) setForm(null)
      setConnectionNotice('连接已删除。')
    } catch (e) {
      setConnectionError(String(e instanceof Error ? e.message : e))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null
  const isResource = ['skill', 'command', 'rule', 'mcp', 'hooks', 'permissions'].includes(tab)
  const items = resources.filter(
    (item) => item.kind === tab && (source === 'all' || item.source === source) && item.name.toLowerCase().includes(search.toLowerCase()),
  )
  const patch = (value: Record<string, unknown>) => {
    useStore.getState().setError(null)
    setNotice('正在提交，等待运行时确认…')
    // 设置页修改的是“新会话默认”;当前会话的临时覆盖在输入区菜单里单独管理
    send({ t: 'settings.patch', scope: 'default', patch: value })
  }
  const head = TAB_TITLE[tab]
  const probeFresh = probe !== null && form !== null && probe.signature === signatureOf(form)
  const openAiLike = /(?:chat\/completions|\/responses)(?:$|[/?])/i.test(form?.baseUrl.trim() ?? '')
  const protocolBlocked = Boolean(form && (openAiLike || (probeFresh && probe?.result.category === 'protocol')))

  return (
    <Modal label="设置" onClose={forceClose} canDismiss={() => !saving && dismissDraft()}>
      <div ref={box} style={{ display: 'contents' }}>
        <nav className="settings-nav" aria-label="设置分类">
          <div className="nav-title">设置</div>
          {NAV.map((group) => (
            <div key={group.group}>
              <div className="nav-group">{group.group}</div>
              {group.items.map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id || (tab === 'permissions' && id === 'permission')}
                  disabled={saving}
                  onClick={() => changeTab(id)}
                >
                  <SectionIcon name={id === 'permissions' ? 'permission' : id} width={16} height={16} />
                  {label}
                </button>
              ))}
            </div>
          ))}
          <div className="nav-foot" title={workspace}>
            工作区：{workspace ? baseName(workspace) : '启动目录'}
          </div>
        </nav>

        <div className="settings-body">
          <div className="settings-head">
            <div>
              <h2>{head.title}</h2>
              <p>{head.sub}</p>
            </div>
            <div className="head-actions">
              <button className="icon-btn" aria-label="关闭设置" title="关闭设置 (Esc)" onClick={close} disabled={saving}>
                <IconX width={17} height={17} />
              </button>
            </div>
          </div>

          <div className="settings-scroll">
            {(error || operationError) && (
              <div role="alert" className="note danger" style={{ marginBottom: 12 }}>
                <div>{error || operationError}</div>
              </div>
            )}
            {notice && (
              <div role="status" className="note" style={{ marginBottom: 12 }}>
                <div>{notice}</div>
              </div>
            )}

            {tab === 'general' && (
              <div className="settings-section">
                <div className="field">
                  <span className="label">外观</span>
                  <div className="segmented" role="group" aria-label="外观">
                    {(
                      [
                        ['system', '跟随系统'],
                        ['light', '浅色'],
                        ['dark', '深色'],
                      ] as const
                    ).map(([value, label]) => (
                      <button key={value} aria-pressed={mode === value} onClick={() => setTheme(value)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="hint">只保存在本浏览器，不修改 Claude 配置。</span>
                </div>
                <div className="field">
                  <span className="label">界面语言</span>
                  <div className="segmented" role="group" aria-label="界面语言">
                    <button aria-pressed={locale === 'zh'} onClick={() => setLocale('zh')}>
                      中文
                    </button>
                    <button aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>
                      English
                    </button>
                  </div>
                  <span className="hint">部分高级设置的说明暂时只有中文。</span>
                </div>
                <div className="field">
                  <span className="label">快捷键</span>
                  <dl className="kv-list" style={{ maxWidth: 360 }}>
                    <dt>命令面板</dt>
                    <dd>Ctrl K</dd>
                    <dt>新建会话</dt>
                    <dd>Ctrl N</dd>
                    <dt>打开设置</dt>
                    <dd>Ctrl ,</dd>
                    <dt>折叠侧栏</dt>
                    <dd>Ctrl B</dd>
                  </dl>
                </div>
                <div className="field">
                  <span className="label">最近删除的会话</span>
                  <span className="hint">
                    删除会话前会保留原生 transcript 备份；恢复只写回原来的项目目录，不会重跑任务。
                  </span>
                  {deletedSessions.length === 0 && (
                    <p className="hint" style={{ fontSize: 12 }}>
                      没有可恢复的会话。
                    </p>
                  )}
                  {deletedSessions.map((session) => (
                    <div
                      key={session.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        border: '1px solid var(--color-border)',
                        borderRadius: 9,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <strong style={{ display: 'block', fontSize: 12.5, fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {session.title}
                        </strong>
                        <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>
                          {new Date(session.deletedAt).toLocaleString()} · {Math.max(1, Math.round(session.bytes / 1024))} KB
                        </span>
                      </div>
                      <button
                        className="btn btn-sm"
                        disabled={restoringId !== null}
                        onClick={() => void restoreDeleted(session)}
                      >
                        {restoringId === session.id ? '恢复中…' : '恢复'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'connection' && (
              <div className="settings-section">
                <div className="note">
                  <div>
                    <strong>当前会话</strong>
                    <div style={{ marginTop: 3 }}>
                      {settings?.active
                        ? [
                            settings.active.providerModel ?? settings.active.model ?? currentModel
                              ? `模型 ${settings.active.providerModel ?? settings.active.model ?? currentModel}`
                              : '使用连接默认模型',
                            describeSource(settings.active.endpointTemplate),
                            describeAuth(settings.active.authentication ?? settings.authentication, settings.active.endpointTemplate),
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : '尚未开始会话；下一次发送会使用下面的新会话默认。'}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <strong>新会话默认</strong>
                      <div style={{ marginTop: 3 }}>
                        {settings?.providerModel ?? settings?.model ?? currentTemplateConnection?.model ?? '连接默认模型'} ·{' '}
                        {currentTemplateConnection?.name ?? (settings?.authentication === 'native' ? 'Claude 原生登录' : '本机环境')}
                      </div>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11.5 }}>
                      这里保存的是新会话默认；当前会话的模型/工作方式请在输入区菜单切换。正在运行的任务不受影响。
                    </div>
                  </div>
                </div>

                {connectionError && (
                  <div role="alert" className="note danger">
                    <div>{connectionError}</div>
                  </div>
                )}
                {connectionNotice && (
                  <div role="status" className="note ok">
                    <div>{connectionNotice}</div>
                    {needsNewSession && sessionId && onNewSession && (
                      <div style={{ marginTop: 7 }}>
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            onClose()
                            onNewSession()
                          }}
                        >
                          新建会话并应用
                        </button>
                        <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.8 }}>
                          当前会话会保留在列表里，草稿不受影响。
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {!(form && connections.length === 0) && (
                  <>
                    <h3>已保存的连接</h3>
                    <p className="hint" style={{ marginTop: -6, fontSize: 11.5 }}>
                      这里只列出 ccweb 保存的连接。从本机环境或旧 cc-toolkit 模板读取的端点仍会出现在模型菜单里，保持只读。
                    </p>
                  </>
                )}
                {connections.length === 0 && !form && (
                  <div className="note">
                    <div>
                      <strong>还没有连接</strong>
                      <div style={{ marginTop: 3 }}>添加一个 API 服务后即可开始对话。也可以继续使用本机已有的 Claude 登录。</div>
                    </div>
                  </div>
                )}
                {connections.map((connection) => {
                  const isCurrent = currentTemplate === `${TEMPLATE_PREFIX}${connection.key}`
                  return (
                    <div key={connection.key} className={`conn-card ${isCurrent ? 'is-active' : ''}`}>
                      <div className="conn-main">
                        <strong>
                          {connection.name}
                          {isCurrent && <span className="badge accent">新会话默认</span>}
                          <span
                            className={`dot ${connection.hasKey || connection.inheritAuth ? 'ok' : 'warn'}`}
                            title={connection.inheritAuth ? '继承本机凭证' : connection.hasKey ? '已保存 Key' : '无认证'}
                          />
                        </strong>
                        <div className="conn-url" title={connection.baseUrl}>
                          {connection.baseUrl}
                        </div>
                        <div className="conn-meta">
                          <span>{connection.model ? `默认模型 ${connection.model}` : '未指定默认模型'}</span>
                          <span>·</span>
                          <span>
                            {connection.inheritAuth
                              ? '继承本机环境凭证'
                              : connection.hasKey
                                ? '已保存 API Key'
                                : '无认证（仅适合本机网关）'}
                          </span>
                        </div>
                      </div>
                      <div className="conn-side">
                        {!isCurrent && (
                          <button className="btn btn-sm" onClick={() => void useConnection(connection)}>
                            使用
                          </button>
                        )}
                        <button className="btn btn-sm btn-ghost" onClick={() => startEdit(connection)}>
                          编辑
                        </button>
                        <button className="btn btn-sm btn-ghost btn-danger" onClick={() => void deleteConnection(connection)}>
                          删除
                        </button>
                      </div>
                    </div>
                  )
                })}

                {!form && (
                  <div className="row-actions">
                    <button className="btn btn-primary" onClick={startCreate}>
                      <IconPlus width={14} height={14} />添加连接
                    </button>
                    <button className="btn" disabled={saving} onClick={() => send({ t: 'models.list' })}>
                      发现可用模型
                    </button>
                  </div>
                )}

                {form && (
                  <form
                    className="settings-section"
                    style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 14, gap: 12 }}
                    onSubmit={(e) => {
                      e.preventDefault()
                      void saveAndUse()
                    }}
                  >
                    <h3 style={{ margin: 0 }}>{form.key ? '编辑连接' : '添加模型连接'}</h3>
                    <div className="form-grid">
                      <label className="field">
                        <span className="label">连接名称</span>
                        <input
                          value={form.name}
                          aria-label="连接名称"
                          aria-invalid={formAttempted && Boolean(formErrors.name)}
                          onChange={(e) => updateForm({ name: e.target.value })}
                          placeholder={form.baseUrl ? hostOf(form.baseUrl) : '例如：我的 GLM'}
                          autoComplete="off"
                        />
                        <span className="hint">仅用于界面显示，可留空。</span>
                        {formAttempted && formErrors.name && <span className="field-error">{formErrors.name}</span>}
                      </label>
                      <label className="field">
                        <span className="label">模型 ID</span>
                        <input
                          value={form.model}
                          aria-label="模型 ID"
                          aria-invalid={formAttempted && Boolean(formErrors.model)}
                          onChange={(e) => updateForm({ model: e.target.value })}
                          placeholder="例如：glm-4.7"
                          autoComplete="off"
                          list="probe-models"
                        />
                        <datalist id="probe-models">
                          {availableModels.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.providerModel ?? item.displayName}
                            </option>
                          ))}
                        </datalist>
                        <span className="hint">使用服务商提供的模型 ID；留空则用连接默认模型。</span>
                        {formAttempted && formErrors.model && <span className="field-error">{formErrors.model}</span>}
                      </label>
                      <label className="field full">
                        <span className="label">接口地址（Base URL）</span>
                        <input
                          value={form.baseUrl}
                          aria-label="接口地址（Base URL）"
                          aria-invalid={formAttempted && Boolean(formErrors.baseUrl)}
                          onChange={(e) => updateForm({ baseUrl: e.target.value })}
                          placeholder="https://api.example.com/anthropic"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <span className="hint">
                          需要 Anthropic Messages 兼容接口。末尾的 /v1 或 /v1/messages 会自动去掉，真实请求和测试统一使用“根地址 + /v1/messages”；不要包含其他 /messages 路径。
                          只提供 OpenAI Chat Completions 的服务暂不兼容。
                        </span>
                        {formAttempted && formErrors.baseUrl && <span className="field-error">{formErrors.baseUrl}</span>}
                      </label>
                      <div className="field full">
                        <span className="label">认证方式</span>
                        <div className="segmented" role="radiogroup" aria-label="认证方式">
                          {(
                            [
                              ['key', '连接 Key'],
                              ['inherit', '继承本机凭证'],
                              ['none', '无认证'],
                            ] as const
                          ).map(([mode, label]) => (
                            <button
                              key={mode}
                              type="button"
                              role="radio"
                              aria-checked={form.authMode === mode}
                              aria-pressed={form.authMode === mode}
                              onClick={() => updateForm({ authMode: mode })}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <span className="hint">
                          {form.authMode === 'key'
                            ? '使用并保存这个连接自己的 Key；留空时按无认证处理，不会继承其他来源的令牌。'
                            : form.authMode === 'inherit'
                              ? '明确继承本机 ~/.claude 或进程环境里的认证。只有选择这一项才会继承，避免串用其他连接的令牌。'
                              : '不使用你的真实 Key；本机/内网网关会收到非机密占位认证头（锁定运行时的要求），不会继承其他连接的令牌。保存会清除已保存的 Key。公网地址请改用 Key 或继承本机凭证。'}
                        </span>
                        {form.authMode === 'none' && form.keepKey && (
                          <span className="field-error">保存后会删除这个连接已保存的 API Key。</span>
                        )}
                      </div>
                      {form.authMode === 'key' && (
                        <label className="field full">
                          <span className="label">
                            API Key
                            {form.keepKey && <span className="badge">已保存</span>}
                          </span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input
                              type={showKey ? 'text' : 'password'}
                              value={form.apiKey}
                              aria-label="API Key"
                              onChange={(e) => updateForm({ apiKey: e.target.value })}
                              placeholder={form.keepKey ? '留空则保留已保存的 Key' : '粘贴服务商提供的 API Key'}
                              autoComplete="off"
                              spellCheck={false}
                            />
                            <button type="button" className="btn" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? '隐藏 Key' : '显示 Key'}>
                              {showKey ? '隐藏' : '显示'}
                            </button>
                          </div>
                          <span className="hint">只保存在本机服务端；不会进入对话、日志或截图。</span>
                        </label>
                      )}
                    </div>

                    {(openAiLike || (probeFresh && probe?.result.category === 'protocol')) && (
                      <div className="note danger" role="alert">
                        <IconWarn width={14} height={14} style={{ flex: '0 0 auto', marginTop: 1 }} />
                        <div>
                          <strong>此接口格式当前不兼容。</strong>
                          <div style={{ marginTop: 2 }}>
                            运行时需要 Anthropic Messages 兼容地址；OpenAI Chat Completions / Responses
                            不能直接用于当前运行时。请换成服务商提供的兼容接口根地址，例如以 /anthropic 或 /v1 结尾的地址。
                          </div>
                        </div>
                      </div>
                    )}

                    {probe && (
                      <div className={`note ${probeFresh ? (probe.result.ok ? 'ok' : 'danger') : 'warn'}`} role="status">
                        <div style={{ minWidth: 0 }}>
                          <strong>
                            {probeFresh ? (probe.result.ok ? '连通成功' : '连通失败') : '旧测试结果已失效'}
                            {probe.result.status ? ` · HTTP ${probe.result.status}` : ''} · {probe.result.elapsedMs}ms
                          </strong>
                          <div style={{ marginTop: 3 }}>
                            {probeFresh ? probe.result.message : '草稿已修改（包括认证方式或 Key）。请重新测试；以下仅保留上次请求记录。'}
                          </div>
                          <div style={{ marginTop: 3, fontSize: 11, opacity: 0.85 }}>
                            请求地址：{probe.result.requestUrl}
                            {probe.result.model ? ` · 模型 ${probe.result.model}` : ''}
                          </div>
                          {probe.result.detail && (
                            <details style={{ marginTop: 5 }}>
                              <summary style={{ cursor: 'pointer', fontSize: 11 }}>技术详情</summary>
                              <pre style={{ marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11 }}>{probe.result.detail}</pre>
                            </details>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="row-actions form-actions" style={{ justifyContent: 'space-between' }}>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => void runProbe()}
                          disabled={testing || saving}
                        >
                          {testing ? '测试中…' : probe ? '重试连接测试' : '测试连接'}
                        </button>
                        {testing && (
                          <button type="button" className="btn btn-ghost" onClick={cancelProbe}>
                            取消测试
                          </button>
                        )}
                      </div>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => {
                            setForm(null)
                            setProbe(null)
                            setConnectionError('')
                          }}
                          disabled={saving}
                        >
                          取消
                        </button>
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={saving || !formValid || protocolBlocked}
                          title={protocolBlocked ? '此接口格式当前不兼容，无法保存' : undefined}
                        >
                          {saving ? '保存中…' : '保存并使用'}
                        </button>
                      </div>
                    </div>
                    <p className="hint" style={{ fontSize: 11 }}>
                      {protocolBlocked
                        ? '检测到不兼容的接口格式：保存已禁用。请先改为 Anthropic Messages 兼容地址。'
                        : '测试会真实调用一次模型（禁用工具、不重试、20 秒超时，可能产生少量用量）；保存不要求先测试。测试成功只说明文本接口可达，工具与图片能力需在任务中验证。'}
                    </p>
                  </form>
                )}

                <h3>原生登录与运行时</h3>
                <label className="field" style={{ maxWidth: 420 }}>
                  <span className="label">认证来源</span>
                  <select
                    aria-label="认证来源"
                    value={settings?.authentication ?? 'inherit'}
                    onChange={(e) => patch({ authentication: e.target.value })}
                  >
                    <option value="inherit">继承本机 API 连接与凭证</option>
                    <option value="native">Claude 原生登录（不继承第三方 Token）</option>
                  </select>
                  <span className="hint">
                    当前会话：
                    {settings?.active
                      ? settings.active.authentication === 'native'
                        ? 'Claude 原生登录'
                        : '继承 API 连接'
                      : '尚未启动'}
                    ；默认：{settings?.authentication === 'native' ? 'Claude 原生登录' : '继承 API 连接'}。认证来源对新会话生效。
                  </span>
                </label>
                <div className="note">
                  <div>
                    <div>
                      配置目录 {runtime ? runtime.configDirectory ?? '~/.claude' : '~/.claude'}
                      {runtime?.credentialConfigured ? ' · 运行时环境检测到凭证' : ' · 运行时环境未检测到额外凭证'}
                    </div>
                    <div style={{ marginTop: 3 }}>
                      已保存的连接会单独注入凭证；本机环境凭证只作为兜底。原生登录需要终端交互，本客户端不再提供默认入口；第三方 Token 不会被发往 Claude 官方端点。
                    </div>
                  </div>
                </div>
                <div className="row-actions">
                  <button
                    className="btn"
                    disabled={saving}
                    onClick={() => {
                      setSaving(true)
                      void api<{ binaryStarted: boolean; version: string; credentialConfigured: boolean }>('readiness')
                        .then((result) =>
                          setConnectionNotice(
                            `${result.binaryStarted ? '本机运行时可用' : '本机运行时不可用'}：${result.version}。${
                              result.credentialConfigured ? '检测到凭证配置' : '未检测到环境凭证'
                            }；此检查不调用模型。`,
                          ),
                        )
                        .catch((e) => setConnectionError(String(e instanceof Error ? e.message : e)))
                        .finally(() => setSaving(false))
                    }}
                  >
                    检查本机就绪状态
                  </button>
                  <button className="btn" onClick={() => send({ t: 'settings.get' })}>
                    刷新配置
                  </button>
                </div>
              </div>
            )}

            {tab === 'permission' && (
              <div className="settings-section">
                <h3>默认工作方式</h3>
                <p className="hint" style={{ marginTop: -6, fontSize: 11.5 }}>
                  这里保存的是新会话默认。当前对话可在输入区「工作方式」菜单里临时切换，不会改动默认值。
                </p>
                <div className="mode-list">
                  {(
                    [
                      ['default', '默认模式 (default)', '需要授权时先询问你。推荐。'],
                      ['plan', '计划模式 (plan)', '只读规划设计方案，采纳确认后再开始修改。'],
                      ['auto', '自动模式 (auto)', '运行时接入风险分类器，安全操作全自动放行，高危操作拦截询问。'],
                      ['acceptEdits', '自动编辑 (accept-edits)', '仅放行文件改动免确认，系统命令行等仍需人工审核。'],
                      ['bypassPermissions', '跳过确认 (bypass)', '跳过常规权限确认，风险最高，仅在明确知情时使用。'],
                    ] as const
                  ).map(([value, label, desc]) => {
                    const active = (settings?.permissionMode ?? 'default') === value
                    return (
                      <button
                        key={value}
                        className={`mode-card ${active ? 'is-active' : ''}`}
                        aria-pressed={active}
                        onClick={() => {
                          if (value === 'bypassPermissions' && !window.confirm('跳过确认会让运行时直接执行命令与文件改动。确认设为默认工作方式？')) return
                          patch({ permissionMode: value })
                        }}
                      >
                        <span className="mode-radio" aria-hidden="true">{active ? <IconCheck width={11} height={11} /> : null}</span>
                        <span className="mode-copy">
                          <strong><span className={`mode-dot mode-dot-${value}`} aria-hidden="true" style={{ display: 'inline-block', marginRight: 6, verticalAlign: 'middle' }} />{label}</strong>
                          <small>{desc}</small>
                        </span>
                      </button>
                    )
                  })}
                </div>
                <p className="hint">工作方式属于权限维度，和模型、思考力度不是一回事；修改由运行时确认，被拒绝时保持原值。</p>

                <h3>文件配置来源</h3>
                <label className="field" style={{ maxWidth: 360 }}>
                  <select
                    value={settings?.contextScope ?? 'full'}
                    onChange={(e) => patch({ contextScope: e.target.value })}
                    aria-label="文件配置来源"
                  >
                    <option value="full">用户 + 项目 + 本地（与 CLI 一致）</option>
                    <option value="project">仅项目 + 本地</option>
                    <option value="none">不加载文件配置</option>
                  </select>
                  <span className="hint">新会话生效；这不是完整沙箱隔离。</span>
                </label>

                <h3>默认思考力度</h3>
                <div className="segmented" role="group" aria-label="默认思考力度">
                  <button
                    aria-pressed={!settings?.effort}
                    onClick={() => {
                      patch({ effort: null })
                      saveCachedEffort(null, effortModel)
                    }}
                  >
                    默认
                  </button>
                  {effortLevels.map((effort) => (
                    <button
                      key={effort}
                      aria-pressed={settings?.effort === effort}
                      onClick={() => {
                        patch({ effort })
                        saveCachedEffort(effort, effortModel)
                      }}
                    >
                      {EFFORT_LABELS[effort]}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap', gap: 6 }}>
                  <span className="hint" style={{ fontSize: 11.5 }}>
                    {effortLevels.length === 0
                      ? '当前模型声明不支持思考档位，只保留“默认”。'
                      : `新会话生效；未特别指定时由模型服务端决定思考预算${settings?.effort && !effortLevels.includes(settings.effort as (typeof effortLevels)[number]) ? `；当前保存的 ${settings.effort} 不在支持范围` : ''}。`}
                  </span>
                  {cachedEffort && !settings?.effort && effortLevels.includes(cachedEffort) && (
                    <button
                      type="button"
                      className="link-btn"
                      style={{ fontSize: 11.5, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      onClick={() => {
                        patch({ effort: cachedEffort })
                        saveCachedEffort(cachedEffort, effortModel)
                      }}
                    >
                      应用缓存档位「{EFFORT_LABELS[cachedEffort]}」为默认
                    </button>
                  )}
                </div>

                <div className="row-actions" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={() => changeTab('permissions')}>
                    编辑权限规则与附加目录
                  </button>
                  {sessionId && onNewSession && (
                    <button
                      className="btn"
                      onClick={() => {
                        onClose()
                        onNewSession()
                      }}
                    >
                      新建会话并应用
                    </button>
                  )}
                </div>
                <p className="hint" style={{ fontSize: 11.5 }}>
                  文件配置来源与思考力度只对新建会话生效。当前会话正在使用的内容不会被改写。
                </p>
              </div>
            )}

            {tab === 'about' && (
              <div className="settings-section">
                <dl className="kv-list" style={{ maxWidth: 460 }}>
                  <dt>ccweb</dt>
                  <dd>{settings?.serverVersion ?? '读取中'}</dd>
                  <dt>Agent SDK</dt>
                  <dd>{runtime?.sdkVersion ?? '读取中'}</dd>
                  <dt>执行来源</dt>
                  <dd>{runtime?.binarySource === 'SDK bundled' ? '随包 SDK 运行时' : runtime?.binarySource ?? '随包 SDK 运行时'}</dd>
                  <dt>配置目录</dt>
                  <dd style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{runtime?.configDirectory ?? '~/.claude'}</dd>
                </dl>
                <div className="row-actions">
                  <button
                    className="btn"
                    disabled={saving}
                    onClick={() => {
                      setSaving(true)
                      void api<{ version: string }>('updates')
                        .then((result) =>
                          setNotice(`npm 最新版本 ${result.version}，当前 ${settings?.serverVersion}。升级需要重新安装并重启，不会自动替换正在运行的运行时。`),
                        )
                        .catch((e) => setError(String(e instanceof Error ? e.message : e)))
                        .finally(() => setSaving(false))
                    }}
                  >
                    检查更新
                  </button>
                </div>
                {onOpenNative && (
                  <div className="note warn" style={{ marginTop: 14 }}>
                    <div>
                      <strong>开发者功能</strong>
                      <div style={{ marginTop: 3 }}>
                        原生终端只用于排障，需要本机 PTY 支持；不会出现在默认工作流程里，也可能修改本机 CLI 安装。
                      </div>
                      <button className="btn btn-sm" style={{ marginTop: 7 }} onClick={onOpenNative}>
                        打开原生终端
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isResource && (
              <div className="settings-section">
                <div className="resource-toolbar">
                  <div className="segmented" role="group" aria-label="配置来源">
                    {(
                      [
                        ['all', '全部'],
                        ['user', '用户'],
                        ['project', '当前项目'],
                        ['plugin', '插件'],
                        ['managed', '托管'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        aria-pressed={source === id}
                        disabled={saving}
                        onClick={() => {
                          if (dismissDraft()) setSource(id)
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="resource-search" style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                    <IconSearch width={14} height={14} style={{ position: 'absolute', left: 9, color: 'var(--color-text-faint)' }} />
                    <input
                      className="input"
                      style={{ height: 32, paddingLeft: 28, width: 190, fontSize: 12.5 }}
                      placeholder="搜索条目…"
                      aria-label="搜索配置条目"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  {['skill', 'command', 'rule'].includes(tab) && (
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        if (!dismissDraft()) return
                        setSelected(null)
                        setDraft('')
                        setCopyContent(null)
                        setNewName('')
                      }}
                    >
                      <IconPlus width={13} height={13} />新建
                    </button>
                  )}
                </div>

                {tab === 'mcp' && (
                  <div className="note">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong>运行时状态</strong>
                        <button className="btn btn-sm" onClick={() => send({ t: 'mcp.status' })}>
                          刷新
                        </button>
                      </div>
                      {mcp.length === 0 && <div style={{ marginTop: 4 }}>尚无已启动会话的 MCP 状态；配置存在不代表已连接。</div>}
                      {mcp.map((server) => (
                        <div key={server.name} style={{ marginTop: 6 }}>
                          <strong>{server.name}</strong>：{server.status} · {server.source ?? server.scope ?? '来源未知'}
                          {server.error && <div role="alert">{server.error}</div>}
                          {server.tools && <div style={{ fontSize: 11 }}>工具：{server.tools.join('、')}</div>}
                          <div className="row-actions">
                            {(
                              [
                                ['reconnect', '重连'],
                                ['enable', '启用'],
                                ['disable', '停用'],
                              ] as const
                            ).map(([action, label]) => (
                              <button key={action} className="btn btn-sm" onClick={() => send({ t: 'mcp.control', name: server.name, action })}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab === 'hooks' && (
                  <div className="note">
                    <div>
                      <strong>执行诊断</strong>
                      {diagnostics.length === 0 && <div style={{ marginTop: 4 }}>尚无原生 Hook 事件。配置存在不代表已执行。</div>}
                      {diagnostics.map((item) => (
                        <details key={item.id} style={{ marginTop: 6 }}>
                          <summary style={{ cursor: 'pointer' }}>
                            {item.event} · {item.name} · {item.status}
                            {item.exitCode !== undefined ? ` · 退出码 ${item.exitCode}` : ''}
                          </summary>
                          <pre className="raw">{item.output || '原生未提供输出'}</pre>
                        </details>
                      ))}
                    </div>
                  </div>
                )}

                {tab === 'permissions' && (
                  <p className="note">
                    <span>
                      原生 permissions 分区：allow / ask / deny 为工具规则数组，additionalDirectories 为附加目录数组。保存只更新这部分，保留其他设置与未知字段；新会话生效。
                    </span>
                  </p>
                )}

                {tab === 'command' && (
                  <div className="note">
                    <div>
                      <strong>图形操作</strong>
                      <div style={{ marginTop: 3 }}>
                        /plan、/model、/clear、/new、/settings、/mcp、/context、/export 可直接在输入框使用。
                        原生登录、终端设置等交互操作不再从工作台进入。
                      </div>
                      <div style={{ marginTop: 5, fontSize: 11.5 }}>
                        运行时可见指令：{slashCommands.length ? slashCommands.map((item) => `/${item.name}`).join(' · ') : '暂无'}
                      </div>
                    </div>
                  </div>
                )}

                {newName !== null && (
                  <form
                    className="resource-toolbar resource-create"
                    style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: 12 }}
                    onSubmit={(e) => {
                      e.preventDefault()
                      void create()
                    }}
                  >
                    <label className="field" style={{ flex: 1, minWidth: 180 }}>
                      <span className="label">名称</span>
                      <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="review-changes" required />
                    </label>
                    <label className="field" style={{ width: 150 }}>
                      <span className="label">保存到</span>
                      <select value={createSource} onChange={(e) => setCreateSource(e.target.value)}>
                        <option value="project">当前项目</option>
                        <option value="user">用户</option>
                      </select>
                    </label>
                    <div className="row-actions">
                      <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !newName.trim()}>
                        创建
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setNewName(null)}>
                        取消
                      </button>
                    </div>
                  </form>
                )}

                <div className="resource-split">
                  <div className="resource-list" role="list">
                    {items.length === 0 && (
                      <p className="empty">
                        此来源暂无条目。
                        {['skill', 'command', 'rule'].includes(tab) ? '可新建用户或项目条目，保存后由新会话加载。' : ''}
                      </p>
                    )}
                    {items.map((item) => (
                      <button
                        key={item.id}
                        role="listitem"
                        aria-current={selected?.id === item.id}
                        onClick={() => void load(item)}
                      >
                        <span className="name">{item.name}</span>
                        <span className="meta">
                          {SOURCE_LABEL[item.source]}
                          {item.description ? ` · ${item.description}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="resource-editor">
                    {!selected && <div className="resource-empty">选择一个条目查看内容与来源。</div>}
                    {selected && (
                      <>
                        <div className="editor-head">
                          <div style={{ minWidth: 0 }}>
                            <h4>
                              {selected.name}
                              {dirty && <span className="badge accent" style={{ marginLeft: 6 }}>未保存</span>}
                            </h4>
                            <p>
                              {SOURCE_LABEL[selected.source]} · 新会话生效
                              {!selected.writable ? ' · 只读' : ''}
                            </p>
                          </div>
                          <div className="head-actions">
                            <div className="segmented">
                              <button aria-pressed={!sourceMode} onClick={() => setSourceMode(false)}>
                                编辑
                              </button>
                              <button aria-pressed={sourceMode} onClick={() => setSourceMode(true)}>
                                源码
                              </button>
                            </div>
                            {['skill', 'command', 'rule'].includes(tab) && (
                              <button
                                className="btn btn-sm btn-ghost"
                                onClick={() => {
                                  if (!dismissDraft()) return
                                  setCopyContent(draft)
                                  setNewName(`${selected.name.replace(/:/g, '-')}-copy`)
                                }}
                              >
                                复制
                              </button>
                            )}
                            {selected.writable && ['skill', 'command', 'rule'].includes(tab) && (
                              <button className="btn btn-sm btn-ghost btn-danger" disabled={saving} onClick={() => void remove()}>
                                删除
                              </button>
                            )}
                          </div>
                        </div>

                        {selected.errors.length > 0 && (
                          <div className="note danger">
                            <div>{selected.errors.join('\n')}</div>
                          </div>
                        )}
                        {!selected.writable && <p className="note">此来源只读，可先复制为用户或项目条目再修改。</p>}

                        {!sourceMode && tab === 'permissions' && permissionFields ? (
                          <>
                            {(
                              [
                                ['allow', '允许规则'],
                                ['ask', '每次审批规则'],
                                ['deny', '拒绝规则'],
                                ['additionalDirectories', '附加目录'],
                              ] as const
                            ).map(([field, label]) => (
                              <label className="field" key={field}>
                                <span className="label">{label}（一行一项）</span>
                                <div className="line-editor" style={{ minHeight: 96 }}>
                                  <pre aria-hidden="true">
                                    {Array.from({ length: 6 }, (_, i) => i + 1).join('\n')}
                                  </pre>
                                  <textarea
                                    aria-label={label}
                                    value={Array.isArray(permissionFields[field]) ? (permissionFields[field] as string[]).join('\n') : ''}
                                    readOnly={!selected.writable}
                                    onChange={(e) =>
                                      setDraft(
                                        JSON.stringify(
                                          {
                                            ...permissionFields,
                                            [field]: e.target.value
                                              .split('\n')
                                              .map((line) => line.trim())
                                              .filter(Boolean),
                                          },
                                          null,
                                          2,
                                        ),
                                      )
                                    }
                                  />
                                </div>
                              </label>
                            ))}
                          </>
                        ) : !sourceMode && ['skill', 'command'].includes(tab) && !parsed.document.errors.length ? (
                          <>
                            <label className="field">
                              <span className="label">名称</span>
                              <input value={String(parsed.document.get('name') ?? selected.name)} readOnly />
                            </label>
                            <label className="field">
                              <span className="label">说明</span>
                              <input
                                value={String(parsed.document.get('description') ?? '')}
                                disabled={!selected.writable}
                                onChange={(e) => setField('description', e.target.value)}
                              />
                            </label>
                            <label className="field">
                              <span className="label">正文</span>
                              <div className="line-editor">
                                <pre aria-hidden="true">
                                  {Array.from({ length: Math.min(60, Math.max(8, parsed.body.split('\n').length)) }, (_, i) => i + 1).join('\n')}
                                </pre>
                                <textarea
                                  aria-label="正文"
                                  value={parsed.body}
                                  readOnly={!selected.writable}
                                  onChange={(e) =>
                                    setDraft(parsed.match ? draft.slice(0, parsed.match[0].length) + e.target.value : e.target.value)
                                  }
                                />
                              </div>
                            </label>
                          </>
                        ) : (
                          <label className="field">
                            <span className="label">{['mcp', 'hooks', 'permissions'].includes(tab) ? 'JSON 配置' : 'Markdown 源码'}</span>
                            <div className="line-editor">
                              <pre aria-hidden="true">
                                {Array.from({ length: Math.min(80, Math.max(8, draft.split('\n').length)) }, (_, i) => i + 1).join('\n')}
                              </pre>
                              <textarea
                                aria-label="配置源码"
                                value={draft}
                                readOnly={!selected.writable}
                                spellCheck={false}
                                onChange={(e) => setDraft(e.target.value)}
                              />
                            </div>
                          </label>
                        )}

                        {conflict && (
                          <div className="note danger">
                            <div>
                              <strong>磁盘版本与当前草稿不同（草稿已保留）</strong>
                              <DiffView oldStr={conflict.content} newStr={draft} />
                              <button
                                className="btn btn-sm"
                                onClick={() => {
                                  setSelected(conflict)
                                  setConflict(null)
                                  setPreview(true)
                                  setNotice('已把最新磁盘版本作为比较基线，请核对后明确保存。')
                                }}
                              >
                                以磁盘版本为基线
                              </button>
                            </div>
                          </div>
                        )}
                        {preview && <DiffView oldStr={selected.content} newStr={draft} />}

                        <div className="row-actions" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: 9 }}>
                          <span className="hint" style={{ fontSize: 11, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            写入位置：{selected.source === 'project' ? selected.path.replace(workspace, '').replace(/^[\\/]/, '') : selected.path}
                          </span>
                          <div className="row-actions">
                            <button className="btn btn-sm" onClick={() => setPreview(!preview)}>
                              {preview ? '收起差异' : '查看差异'}
                            </button>
                            {selected.writable && (
                              <>
                                <button
                                  className="btn btn-sm btn-ghost"
                                  disabled={!dirty}
                                  onClick={() => {
                                    setDraft(selected.content)
                                    setError('')
                                  }}
                                >
                                  撤销
                                </button>
                                <button className="btn btn-sm btn-primary" disabled={!dirty || saving || conflict !== null} onClick={() => void save()}>
                                  {saving ? '保存中…' : preview ? '确认保存' : '保存'}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}