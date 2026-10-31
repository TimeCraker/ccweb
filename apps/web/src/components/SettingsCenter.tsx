import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseDocument } from 'yaml'
import { useStore } from '../store'
import { setTheme, useThemeMode } from '../theme'
import { setLocale, useLocale } from '../i18n'
import { BrandMark, SectionIcon, IconSearch, IconPlus } from './Icon'
import DiffView from './DiffView'

type Kind = 'skill' | 'command' | 'rule' | 'mcp' | 'hooks'
type Tab = 'general' | 'connection' | 'permission' | Kind | 'about'
interface Resource { id: string; name: string; kind: Kind; source: 'user' | 'project' | 'plugin'; path: string; writable: boolean }
interface Document extends Resource { content: string; revision: string; errors: string[] }
interface Runtime { configDirectory?: string; sdkVersion: string; binarySource: string; credentialConfigured: boolean; endpoint: string }
const tabs: Array<[Tab, string]> = [['general', '通用'], ['connection', '模型与连接'], ['permission', '运行与权限'], ['skill', 'Skills'], ['command', 'Commands'], ['rule', '上下文与规则'], ['mcp', 'MCP 与工具'], ['hooks', 'Hooks'], ['about', '关于与更新']]
const sourceLabel = { user: '用户', project: '当前项目', plugin: '插件 · 只读' }
async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? '操作失败，请重试')
  return data
}
function frontmatter(content: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content)
  const document = parseDocument(match?.[1] ?? '')
  return { match, document, body: match ? content.slice(match[0].length) : content }
}

export default function SettingsCenter({ open, onClose, send }: { open: boolean; onClose: () => void; send: (message: Record<string, unknown>) => void }) {
  const settings = useStore(s => s.settings)
  const operationError = useStore(s => s.error)
  const mcp = useStore(s => s.mcpServers)
  const slashCommands = useStore(s => s.slashCommands)
  const locale = useLocale()
  const { mode } = useThemeMode()
  const [tab, setTab] = useState<Tab>('connection')
  const [navigationSearch, setNavigationSearch] = useState('')
  const [resources, setResources] = useState<Resource[]>([])
  const [selected, setSelected] = useState<Document | null>(null)
  const [draft, setDraft] = useState('')
  const [source, setSource] = useState('all')
  const [search, setSearch] = useState('')
  const [sourceMode, setSourceMode] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [model, setModel] = useState('')
  const [newName, setNewName] = useState<string | null>(null)
  const [createSource, setCreateSource] = useState('project')
  const [copyContent, setCopyContent] = useState<string | null>(null)
  const [connection, setConnection] = useState({ name: '', url: '', token: '', model: '' })
  const box = useRef<HTMLDivElement>(null)
  const request = useRef(0)
  const workspace = settings?.workspace ?? ''
  const dirty = selected !== null && draft !== selected.content
  const parsed = useMemo(() => frontmatter(draft), [draft])
  const query = useMemo(() => `workspace=${encodeURIComponent(workspace)}`, [workspace])
  const connectionDirty = Object.values(connection).some(value => value.trim() !== '')
  const hasUnsaved = dirty || connectionDirty || newName !== null || model.length > 0
  const dismissDraft = useCallback(() => !hasUnsaved || window.confirm('放弃尚未保存的更改？'), [hasUnsaved])
  const close = useCallback(() => { if (dismissDraft()) onClose() }, [dismissDraft, onClose])
  const refresh = useCallback(async () => {
    const data = await api<Resource[]>(`resources?${query}`)
    setResources(data)
  }, [query])
  useEffect(() => { setNotice(current => current.startsWith('正在提交') ? '默认配置已保存；热切操作由服务确认，其余设置在新会话生效。' : current) }, [settings])
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    send({ t: 'settings.get' })
    void api<Resource[]>(`resources?${query}`, undefined, controller.signal).then(setResources).catch(e => { if (!controller.signal.aborted) setError(String(e)) })
    void api<Runtime>('runtime', undefined, controller.signal).then(setRuntime).catch(e => { if (!controller.signal.aborted) setError(String(e)) })
    return () => controller.abort()
  }, [open, query, send])
  useEffect(() => {
    if (!open) return
    const beforeUnload = (event: BeforeUnloadEvent) => { if (hasUnsaved) { event.preventDefault(); event.returnValue = '' } }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
      if (event.key !== 'Tab') return
      const items = [...(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, textarea, select, a[href]') ?? [])].filter(item => item.getClientRects().length)
      const first = items[0], last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('keydown', key, true) }
  }, [open, hasUnsaved, close])
  useEffect(() => { if (open) box.current?.focus() }, [open])
  async function load(item: Resource) {
    if (!dismissDraft()) return
    const id = ++request.current
    setError(''); setNotice(''); setSaving(true)
    try {
      const document = await api<Document>(`resource?${query}&id=${encodeURIComponent(item.id)}`)
      if (id !== request.current) return
      setSelected(document); setDraft(document.content); setPreview(false); setSourceMode(false)
    } catch (e) { if (id === request.current) setError(String(e)) }
    finally { if (id === request.current) setSaving(false) }
  }
  function changeTab(next: Tab) {
    if (!dismissDraft()) return
    request.current += 1
    setConnection({ name: '', url: '', token: '', model: '' }); setModel(''); setTab(next); setSelected(null); setDraft(''); setError(''); setNotice(''); setNewName(null); setSaving(false)
    if (next === 'mcp') send({ t: 'mcp.status' })
  }
  async function save() {
    if (!selected) return
    if (!preview) { setPreview(true); setNotice('请核对下方差异与写入位置，再点击确认保存。'); return }
    setSaving(true); setError('')
    try {
      const result = await api<Document>('resource', { workspace, id: selected.id, content: draft, revision: selected.revision })
      setSelected(result); setDraft(result.content); setNotice('已保存。当前运行保持已加载配置；新会话使用保存版本。'); setPreview(false)
      await refresh(); send({ t: 'settings.get' })
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }
  async function create() {
    if (!newName || !['skill', 'command', 'rule'].includes(tab)) return
    setSaving(true); setError('')
    let content = copyContent ?? (tab === 'skill' ? `---\nname: ${newName}\ndescription: Describe when to use this skill\n---\n\n# Instructions\n\nWrite your instructions here.\n` : `---\ndescription: Describe this command or rule\n---\n\nWrite instructions here.\n`)
    if (tab === 'skill' && copyContent) {
      const parsed = frontmatter(content); parsed.document.set('name', newName)
      content = `---\n${parsed.document.toString()}---\n${parsed.body}`
    }
    try {
      const item = await api<Resource>('resource/create', { workspace, source: createSource, kind: tab, name: newName, content })
      if (item.kind === 'command' || item.kind === 'skill') { const state = useStore.getState(); state.setSlashCommands([...state.slashCommands.filter(command => command.name !== item.name), { name: item.name, description: '' }]) }
      setNewName(null); setCopyContent(null); await refresh(); await load(item); send({ t: 'settings.get' })
      setNotice('已创建，可继续编辑内容。')
    } catch (e) { setError(String(e)) } finally { setSaving(false) }
  }
  async function remove() {
    if (!selected || !window.confirm(`删除 ${selected.name}？原内容会保存在本地备份中。`)) return
    setSaving(true); setError('')
    try { await api('resource/delete', { workspace, id: selected.id, revision: selected.revision }); setSelected(null); setDraft(''); await refresh(); setNotice('已删除，原内容已备份。'); send({ t: 'settings.get' }) }
    catch (e) { setError(String(e)) } finally { setSaving(false) }
  }
  function setField(key: string, value: string) {
    const next = frontmatter(draft)
    if (next.document.errors.length) { setSourceMode(true); return }
    next.document.set(key, value)
    setDraft(`---\n${next.document.toString()}---\n${next.body}`)
  }
  if (!open) return null
  const currentLabel = tabs.find(([id]) => id === tab)?.[1]
  const isResource = ['skill', 'command', 'rule', 'mcp', 'hooks'].includes(tab)
  const items = resources.filter(item => item.kind === tab && (source === 'all' || item.source === source) && item.name.toLowerCase().includes(search.toLowerCase()))
  const patch = (patch: Record<string, unknown>) => { useStore.getState().setError(null); setNotice('正在提交，运行时确认后生效…'); send({ t: 'settings.patch', patch }) }
  return <div className="settings-center" role="dialog" aria-modal="true" aria-label="settings" tabIndex={-1} ref={box}>
    <aside className="settings-navigation">
      <div className="settings-brand"><BrandMark size={36} /><strong>ccweb</strong></div><button className="settings-back" onClick={close}><span>←</span> 返回工作台</button><h1>设置</h1>
      <div className="settings-search"><IconSearch width={19} height={19} /><input aria-label="搜索设置" placeholder="搜索设置…" value={navigationSearch} onChange={e => setNavigationSearch(e.target.value)} /></div>
      <nav role="tablist" aria-label="settings sections">{tabs.filter(([, label]) => label.toLowerCase().includes(navigationSearch.toLowerCase())).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => changeTab(id)}><SectionIcon name={id} width={21} height={21} />{label}</button>)}</nav>
      <small>工作区：{workspace || '启动目录'}</small>
    </aside>
    <section className="settings-content">
      <header><div><h2>{currentLabel}</h2><p>查看来源、写入目标与生效时间</p></div><button aria-label="关闭设置" onClick={close}>关闭</button></header>
      {(error || operationError) && <div role="alert" className="settings-error">{error || operationError}</div>}
      {notice && <div role="status" className="settings-notice">{notice}</div>}
      {isResource ? <>
        <div className="resource-filters"><span>来源</span><div className="source-segments" role="group" aria-label="配置来源">{[["all","全部"],["user","用户"],["project","当前项目"],["plugin","插件"]].map(([id,label]) => <button key={id} aria-pressed={source === id} onClick={() => { if (dismissDraft()) setSource(id!) }}>{label}</button>)}</div><div className="resource-search"><IconSearch width={19} height={19} /><input placeholder="搜索技能或命令…" aria-label="搜索配置条目" value={search} onChange={e => setSearch(e.target.value)} /></div>{['skill', 'command', 'rule'].includes(tab) && <button onClick={() => { if (dismissDraft()) { setSelected(null); setDraft(''); setCopyContent(null); setNewName('') } }} className="resource-new"><IconPlus width={19} height={19} />新建{currentLabel}</button>}</div>
        {tab === 'command' && <div className="settings-notice"><p>图形操作（只读）：/plan、/model、/clear、/new、/settings、/mcp、/help。登录、终端设置、升级等 TUI 操作请在终端执行。</p><p>发现的命令：{slashCommands.map(item => `/${item.name}`).join(' · ') || '暂无'}。文件扫描只表示发现；原生运行时会在新会话加载并验证可调用能力。</p></div>}
        {tab === 'mcp' && <div className="settings-notice"><button onClick={() => send({ t: 'mcp.status' })}>刷新运行时状态</button>{mcp.length ? mcp.map(server => <span key={server.name}> {server.name}: {server.status} </span>) : ' 尚无已启动会话的 MCP 状态；配置文件存在不代表已连接。'}</div>}
        {(tab === 'mcp' || tab === 'hooks') && <p className="settings-help">按原生 JSON 配置编辑；保存时只更新当前分区，保留文件中的其他设置。凭证使用遮罩，保持占位符即可保留原值。新会话生效。</p>}
        {newName !== null && <form className="resource-create" onSubmit={e => { e.preventDefault(); void create() }}><label>名称<input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="review-changes" required /></label><label>保存到<select value={createSource} onChange={e => setCreateSource(e.target.value)}><option value="project">当前项目</option><option value="user">用户</option></select></label><button type="submit" disabled={saving || !newName.trim()}>创建</button><button type="button" onClick={() => setNewName(null)}>取消</button></form>}
        <div className="resource-workspace"><div className="resource-list">{items.map(item => <button key={item.id} className={selected?.id === item.id ? 'selected' : ''} onClick={() => void load(item)}><strong>{item.name}</strong><span className={`source-badge ${item.source}`}>{sourceLabel[item.source]}</span><small>{!item.writable ? "原生只读条目 · 可复制编辑" : "原生配置 · 新会话加载"}</small></button>)}{!items.length && <p>此来源暂无条目。可新建用户或项目配置。</p>}</div>
          <div className="resource-editor">{selected ? <>
            <div className="resource-heading"><div><h3>{selected.name}{dirty && <span className="dirty-indicator">● 有未保存更改</span>}</h3><p>来源：{sourceLabel[selected.source]}<span className="metadata-divider">|</span>生效：新会话</p></div><div><div className="editor-segments"><button aria-pressed={!sourceMode} onClick={() => setSourceMode(false)}>编辑</button><button aria-pressed={sourceMode} onClick={() => setSourceMode(true)}>源码</button></div>{['skill', 'command', 'rule'].includes(tab) && <button onClick={() => { if (dismissDraft()) { setCopyContent(draft); setNewName(`${selected.name.replace(/:/g, '-')}-copy`) } }}>复制</button>}<details className="resource-more"><summary aria-label="条目操作">⋯</summary><div><button disabled={saving} onClick={() => { if (dismissDraft()) void load(selected) }}>重新加载</button>{selected.writable && ['skill', 'command', 'rule'].includes(tab) && <button className="danger" disabled={saving} onClick={() => void remove()}>删除</button>}</div></details></div></div>
            {selected.errors.length > 0 && <div className="settings-error">{selected.errors.join('\n')}</div>}
            {!selected.writable && <p className="settings-notice">此来源只读，可复制为用户或项目条目后修改。</p>}
            {!sourceMode && ['skill', 'command'].includes(tab) && !parsed.document.errors.length ? <><label>名称<input value={String(parsed.document.get('name') ?? selected.name)} readOnly /></label><label>说明<input value={String(parsed.document.get('description') ?? '')} disabled={!selected.writable} onChange={e => setField('description', e.target.value)} /></label><label className="body-editor">指令正文<LineEditor label="指令正文" value={parsed.body} readOnly={!selected.writable} onChange={value => setDraft(parsed.match ? draft.slice(0, parsed.match[0].length) + value : value)} /></label></> : <label className="body-editor">{tab === 'mcp' || tab === 'hooks' ? 'JSON 配置' : 'Markdown 源码'}<LineEditor label="配置源码" value={draft} readOnly={!selected.writable} onChange={setDraft} /></label>}
            {preview && <DiffView oldStr={selected.content} newStr={draft} />}
            <footer className="resource-save"><div><small>写入位置</small><code title={selected.path}>{selected.source === 'project' ? selected.path.replace(workspace, '').replace(/^[\\/]/, '') : selected.path}</code><small>当前会话沿用已加载版本</small></div><button onClick={() => setPreview(!preview)}>查看差异</button>{selected.writable && <><button disabled={saving || !dirty} onClick={() => { setDraft(selected.content); setError('') }}>取消更改</button><button className="primary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? '保存中…' : preview ? '确认保存' : '保存更改'}</button></>}</footer>
          </> : <div className="settings-empty">选择一个条目，查看来源与内容。</div>}</div></div>
      </> : <div className="settings-form">
        {tab === 'general' && <><label>主题<select value={mode} onChange={e => setTheme(e.target.value as 'system' | 'dark' | 'light')}><option value="system">跟随系统</option><option value="dark">深色</option><option value="light">浅色</option></select></label><label>语言<select value={locale} onChange={e => setLocale(e.target.value as 'zh' | 'en')}><option value="zh">中文</option><option value="en">English</option></select></label><p>外观偏好保存在本浏览器，不修改 Claude 配置。</p></>}
        {tab === 'connection' && <>
          <p>配置来源：Claude 用户设置、启动环境与选择的端点模板。凭证只保留在本机服务端。</p><dl><dt>当前连接</dt><dd>{settings?.currentEndpoint ?? runtime?.endpoint ?? '尚未读取'}</dd><dt>当前会话模式</dt><dd>{settings?.active?.permissionMode ?? '尚未启动；使用默认值'}</dd><dt>默认模型</dt><dd>{settings?.model ?? settings?.currentModel ?? '继承运行时'}</dd><dt>凭证检查</dt><dd>{runtime?.credentialConfigured ? '检测到凭证配置，实际调用仍需验证' : '未检测到环境凭证；也可使用 Claude 原生登录或配置端点'}</dd></dl>
          <button disabled={saving} onClick={() => { setSaving(true); setError(''); void api<{ binaryStarted: boolean; version: string; credentialConfigured: boolean }>('readiness').then(result => setNotice(`${result.binaryStarted ? '本机运行时启动成功' : '本机运行时不可用'}：${result.version}。${result.credentialConfigured ? '检测到凭证配置' : '未检测到环境凭证，可检查原生登录'}；此检查没有调用模型，账号权限与额度需由实际任务验证。`)).catch(e => setError(String(e))).finally(() => setSaving(false)) }}>检查本机就绪状态</button>
          <label>默认模型<input value={model} placeholder={settings?.model ?? '留空恢复继承'} onChange={e => setModel(e.target.value)} /></label><button onClick={() => patch({ model: model.trim() || null })}>应用模型</button>
          <label>思考力度<select value={settings?.effort ?? ''} onChange={e => patch({ effort: e.target.value || null })}><option value="">继承默认</option>{['low', 'medium', 'high', 'xhigh', 'max'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>端点模板<select value={settings?.endpointTemplate ?? ''} onChange={e => patch({ endpointTemplate: e.target.value || null })}><option value="">继承当前环境</option>{settings?.endpoints.map(item => <option key={item.key} value={item.key}>{item.name} · {item.baseUrl}</option>)}</select></label>
          <details><summary>添加或更新连接</summary><form onSubmit={e => { e.preventDefault(); setError(''); setSaving(true); void api<{ path: string; key: string }>('connection', connection).then(result => { setConnection({ name: '', url: '', token: '', model: '' }); setNotice(`已保存到 ${result.path}，请选择该模板以应用。`); send({ t: 'settings.get' }) }).catch(e => setError(String(e))).finally(() => setSaving(false)) }}>
            {(['name', 'url', 'model', 'token'] as const).map(key => <label key={key}>{{ name: '连接名称', url: 'API 端点', model: '默认模型', token: 'API 凭证（留空保留原值）' }[key]}<input type={key === 'token' ? 'password' : 'text'} autoComplete="off" value={connection[key]} required={key === 'name' || key === 'url'} onChange={e => setConnection({ ...connection, [key]: e.target.value })} /></label>)}<p>写入位置：{runtime?.configDirectory ?? "~/.claude"}/cc-toolkit/settings/settings.{connection.name || "连接名称"}.json。凭证不回传到界面或快照。</p><button disabled={saving} type="submit">保存连接</button></form></details>
        </>}
        {tab === 'permission' && <><label>运行模式<select value={settings?.permissionMode ?? 'default'} onChange={e => { if (e.target.value !== 'bypassPermissions' || window.confirm('运行一切将跳过常规工具审批，确认仅对此次使用明确开启？')) patch({ permissionMode: e.target.value }) }}><option value="default">手动审批</option><option value="auto">自动模式（运行时支持时可用）</option><option value="acceptEdits">自动接受文件编辑</option><option value="plan">计划模式</option><option value="bypassPermissions">运行一切</option></select></label><p>模式由原生运行时确认。不支持时会返回错误，界面不会将自动模式映射为跳过审批。运行一切不作为下次启动的默认权限。</p><label>文件配置来源<select aria-label="文件配置来源" value={settings?.contextScope ?? 'full'} onChange={e => patch({ contextScope: e.target.value })}><option value="full">用户＋项目＋本地</option><option value="project">项目＋本地</option><option value="none">不加载文件配置</option></select></label><p>配置来源对新会话生效；这不是完整沙箱隔离。环境、原生登录、恢复会话和其他运行时来源需分别检查。</p></>}
        {tab === 'about' && <><dl><dt>ccweb</dt><dd>{settings?.serverVersion}</dd><dt>Agent SDK</dt><dd>{runtime?.sdkVersion ?? '读取中'}</dd><dt>执行来源</dt><dd>{runtime?.binarySource ?? 'SDK 随包运行时'}</dd></dl><p>采用已验证的精确依赖版本。更新本机 CLI 不会自动替换本应用运行时；当前运行不自动重启。</p><button disabled={saving} onClick={() => { setSaving(true); void api<{ version: string }>('updates').then(result => setNotice(`npm 最新版本：${result.version}；当前：${settings?.serverVersion}。升级需重新安装并启动，不自动替换。`)).catch(e => setError(String(e))).finally(() => setSaving(false)) }}>检查更新</button></>}
      </div>}
    </section>
  </div>
}

function LineEditor({ label, value, readOnly, onChange }: { label: string; value: string; readOnly: boolean; onChange: (value: string) => void }) {
  return <div className="line-editor"><pre aria-hidden="true">{Array.from({ length: value.split('\n').length }, (_, i) => i + 1).join('\n')}</pre><textarea aria-label={label} value={value} readOnly={readOnly} spellCheck={false} onChange={event => onChange(event.target.value)} onScroll={event => { const gutter = event.currentTarget.previousElementSibling; if (gutter) gutter.scrollTop = event.currentTarget.scrollTop }} /></div>
}
