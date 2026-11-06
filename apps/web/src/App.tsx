import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WsClient } from './ws'
import { useStore, parseQuestions } from './store'
import { t, tf, useLocale } from './i18n'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import MessageStream from './components/MessageStream'
import Composer from './components/Composer'
import ChangesPanel from './components/ChangesPanel'
import FilesPanel from './components/FilesPanel'
import PlanPanel from './components/PlanPanel'
import DetailsPanel from './components/DetailsPanel'
import { initDrawerWidth } from './components/DrawerResizer'
import UsageBar from './components/UsageBar'
import PermissionCard from './components/PermissionCard'
import QuestionCard from './components/QuestionCard'
import CommandPalette from './components/CommandPalette'
import Toast from './components/Toast'
import QueueDock from './components/QueueDock'
import { BrandMark, IconEdit, IconSearch, IconSparkle, IconFile } from './components/Icon'
import type { SettingsTab } from './components/SettingsCenter'

const STARTER_ACTIONS = [
  {
    title: '梳理项目架构',
    desc: '模块关系与技术栈概览',
    icon: <IconSearch width={14} height={14} />,
    prompt: '分析当前项目的架构目录与核心模块关系，给出总体技术概览',
  },
  {
    title: '运行测试体检',
    desc: '执行测试并定位报错',
    icon: <IconSparkle width={14} height={14} />,
    prompt: '运行当前项目的自动化测试，检查并分析所有失败用例与报错根因',
  },
  {
    title: '审查近期改动',
    desc: '检查未提交变更与 Diff',
    icon: <IconFile width={14} height={14} />,
    prompt: '检查当前工作区未提交的代码变更与最近提交记录，审查是否有潜在缺陷',
  },
  {
    title: '代码规范体检',
    desc: '静态分析与代码健康度',
    icon: <IconEdit width={14} height={14} />,
    prompt: '对当前项目执行代码规范与静态分析检查，列出需要优化的潜在坏味道',
  },
]

const NativeTerminal = lazy(() => import('./components/NativeTerminal'))
const SettingsCenter = lazy(() => import('./components/SettingsCenter'))

const MUTATIONS = [
  'files.rewind',
  'task.stop',
  'mcp.control',
  'settings.patch',
  'workspace.set',
  'permission.resolve',
  'queue.delete',
  'queue.resume',
  'session.new',
  'session.rename',
  'session.delete',
  'abort',
  'interrupt',
]

/** 这些原生 CLI 操作不在 Web 客户端提供;给出原因与替代路径,不再静默跳转终端 */
const NATIVE_ONLY: Record<string, string> = {
  login: '原生登录不在 Web 客户端提供。若使用第三方模型，请在「设置 → 模型与连接」填写接口地址与 API Key。',
  logout: '退出原生登录需要在终端执行 /logout；Web 客户端不转发该操作。',
  'terminal-setup': '终端快捷键设置只对本地终端生效，Web 客户端不需要。',
  vim: '编辑器键位属于终端交互配置，此客户端不支持切换。',
  doctor: '运行时诊断可在「设置 → 关于与更新」查看版本与就绪状态。',
  update: '升级需要重新安装并启动，客户端不会自动替换正在使用的运行时。',
  install: '安装独立 CLI 不在此客户端执行；当前运行使用随包的 SDK 运行时。',
  plugins: '插件管理暂未提供图形界面，可先在配置文件中维护。',
  plugin: '插件管理暂未提供图形界面，可先在配置文件中维护。',
  'add-dir': '附加目录请在「设置 → 运行与权限」的权限规则里维护。',
}

export default function App() {
  const pendingPrompts = useRef(new Map<string, { key: string; text: string }>())
  const wsRef = useRef<WsClient | null>(null)
  const sendControl = useCallback((msg: Record<string, unknown>) => {
    if (msg.t === 'settings.patch') useStore.setState({ settingsPending: Date.now() })
    wsRef.current?.send({
      ...msg,
      ...(MUTATIONS.includes(String(msg.t)) ? { commandId: crypto.randomUUID() } : {}),
    } as { t: string })
  }, [])

  const [settingsTab, setSettingsTab] = useState<SettingsTab>('connection')
  const [detailsTab, setDetailsTab] = useState<'context' | 'controls'>('context')
  const [nativeOpen, setNativeOpen] = useState(false)
  const [drawer, setDrawer] = useState<'changes' | 'files' | 'plan' | 'details' | null>(null)
  const [focusFile, setFocusFile] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  useLocale()

  useEffect(() => {
    initDrawerWidth()
  }, [])

  useEffect(() => {
    const handleFocus = (e: Event) => {
      const customEvent = e as CustomEvent<string>
      if (typeof customEvent.detail === 'string') {
        setFocusFile(customEvent.detail)
        setDrawer('changes')
      }
    }
    window.addEventListener('ccweb:focus-change', handleFocus)
    return () => window.removeEventListener('ccweb:focus-change', handleFocus)
  }, [])

  const entries = useStore((s) => s.entries)
  const tasks = useStore((s) => s.nativeTasks)
  const activeTasks = tasks.filter((task) => task.status !== 'completed' && task.status !== 'failed')
  const empty = entries.length === 0
  const busy = useStore((s) => s.busy)
  const conn = useStore((s) => s.conn)
  const everConnected = useRef(false)
  if (conn === 'open') everConnected.current = true
  const connBanner = conn !== 'open' && everConnected.current
  const workspace = useStore((s) => s.settings?.workspace)

  const changeInfo = useMemo(() => {
    const files: string[] = []
    let count = 0
    for (const entry of entries) {
      if (entry.type !== 'turn') continue
      for (const block of entry.blocks) {
        if (block.kind !== 'tool') continue
        if (!['Edit', 'Write', 'MultiEdit'].includes(block.toolName)) continue
        // 只有工具真实返回成功才算"本次改动";未审批/失败的请求不计入
        if (block.status !== 'done') continue
        count++
        const file = String((block.input as Record<string, unknown> | null)?.file_path ?? block.toolName)
        if (!files.includes(file)) files.push(file)
      }
    }
    return { count, files }
  }, [entries])

  const openSettings = useCallback((tab?: SettingsTab) => {
    if (tab) setSettingsTab(tab)
    setNavOpen(false)
    setPaletteOpen(false)
    setSettingsOpen(true)
  }, [])

  const closeDrawer = useCallback(() => setDrawer(null), [])

  useEffect(() => {
    document.title = busy ? '● 生成中… — ccweb' : 'ccweb'
  }, [busy])

  // 设置变更的“请求中”兜底:8 秒内没有运行时回执就说明没有被确认,不能静默当作成功
  const settingsPending = useStore((s) => s.settingsPending)
  useEffect(() => {
    if (settingsPending === null) return
    const timer = setTimeout(() => {
      if (useStore.getState().settingsPending === null) return
      useStore.setState({ settingsPending: null })
      useStore.getState().setError('设置更改未收到运行时确认，可能未生效。请检查连接后重试。')
    }, 8000)
    return () => clearTimeout(timer)
  }, [settingsPending])

  // 全局快捷键:Ctrl+K 面板 / Ctrl+, 设置 / Ctrl+N 新建会话 / Ctrl+B 侧栏
  const newSessionRef = useRef<() => void>(() => {})
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('.native-panel')) return
      if (e.key === 'Escape' && drawer && !(e.target as HTMLElement)?.closest('.composer')) {
        setDrawer(null)
        return
      }
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (e.key === ',') {
        e.preventDefault()
        openSettings()
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        newSessionRef.current()
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setSidebarCollapsed((v) => !v)
      } else if (e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setDrawer((v) => (v ? null : 'changes'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer, openSettings])

  useEffect(() => {
    const store = useStore.getState()
    const ws = new WsClient(store.setConn)
    wsRef.current = ws
    ws.connect()

    let nativeCommands: Array<{ name: string; description: string }> = []
    const mergeCommands = (discovered: Array<{ name: string; description: string }>) => [
      ...new Map([...nativeCommands, ...discovered].map((item) => [item.name, item])).values(),
    ]
    const off = ws.on((msg) => {
      const s = useStore.getState()
      switch (msg.t) {
        case 'ack': {
          if (!msg.requestId) break
          const pending = pendingPrompts.current.get(msg.requestId)
          if (pending && msg.ok && localStorage.getItem(pending.key)?.trim() === pending.text) localStorage.removeItem(pending.key)
          pendingPrompts.current.delete(msg.requestId)
          useStore.setState({ lastAck: { id: msg.requestId, ok: msg.ok === true } })
          if (!msg.ok) useStore.setState({ settingsPending: null })
          break
        }
        case 'file.baseline':
          if (msg.toolUseId && msg.baseline) useStore.setState({ fileBaselines: { ...s.fileBaselines, [msg.toolUseId]: msg.baseline } })
          break
        case 'rewind':
          if (msg.result) useStore.setState({ rewind: { preview: !!msg.preview, result: msg.result } })
          break
        case 'accepted':
          if (msg.runId && msg.text) useStore.setState({ checkpoints: [...s.checkpoints.filter((item) => item.id !== msg.runId), { id: msg.runId, text: msg.text.slice(0, 80) }] })
          if (msg.sessionId && msg.sessionId !== s.sessionId) s.applyInit({ sessionId: msg.sessionId, model: s.model, providerModel: s.providerModel, endpoint: s.endpoint })
          if (msg.text) s.appendUser(msg.text, msg.runId, msg.images)
          break
        case 'state':
          if (msg.state === 'cancelled' || msg.state === 'failed') s.finishTurn()
          break
        case 'permission.resolved':
          if (msg.requestId) {
            s.resolvePermissionLocal(msg.requestId)
            s.resolveQuestionLocal(msg.requestId)
          }
          break
        case 'init':
          s.applyInit({ sessionId: msg.sessionId ?? null, model: msg.model ?? null, providerModel: msg.providerModel ?? null, endpoint: msg.endpoint ?? null })
          if (!msg.sessionId) nativeCommands = []
          else if (msg.slashCommands?.length) nativeCommands = msg.slashCommands
          s.setSlashCommands(mergeCommands(s.settings?.slashCommands ?? []))
          break
        case 'sessions':
          if (msg.sessions) s.setSessions(msg.sessions)
          break
        case 'files':
          if (msg.files) s.setFileResults(msg.files)
          break
        case 'settings':
          if (msg.settings) {
            s.setSettings(msg.settings)
            s.setSlashCommands(mergeCommands(msg.settings.slashCommands ?? []))
            if (useStore.getState().settingsPending !== null) useStore.setState({ settingsPending: null })
          }
          break
        case 'queue':
          if (msg.items) s.setQueue(msg.items as Array<{ uuid: string; text: string }>)
          break
        case 'mcpStatus':
          if (msg.servers) s.setMcp(msg.servers)
          break
        case 'history':
          if (msg.messages) s.replayHistory(msg.messages)
          break
        case 'cleared':
          s.clearView()
          break
        case 'block':
          if (msg.action === 'start') {
            s.onBlockStart({
              blockType: msg.blockType ?? 'text',
              index: msg.index ?? 0,
              toolUseId: msg.toolUseId,
              toolName: msg.toolName,
            })
          } else s.onBlockStop(msg.index ?? 0)
          break
        case 'delta':
          if (msg.text) s.onDelta({ kind: msg.kind ?? 'text', text: msg.text, toolUseId: msg.toolUseId })
          break
        case 'message': {
          const sm = msg.sdkMessage as { type?: string; subtype?: string } | undefined
          const task = msg.sdkMessage as { task_id?: string; run_id?: string; status?: string; description?: string; summary?: string; subtype?: string } | undefined
          if (sm?.type === 'system' && task?.task_id && ['task_started', 'task_progress', 'task_notification'].includes(task.subtype ?? '')) {
            const previous = s.nativeTasks.find((item) => item.id === task.task_id)
            if (!previous?.runId || !task.run_id || task.run_id >= previous.runId) {
              useStore.setState({
                nativeTasks: [
                  ...s.nativeTasks.filter((item) => item.id !== task.task_id),
                  {
                    id: task.task_id,
                    runId: task.run_id,
                    status: task.status ?? 'running',
                    description: task.description ?? previous?.description ?? task.task_id,
                    summary: task.summary,
                  },
                ].slice(-200),
              })
            }
          }
          const diagnostic = msg.sdkMessage as { subtype?: string; hook_id?: string; hook_name?: string; hook_event?: string; outcome?: string; output?: string; stderr?: string; exit_code?: number } | undefined
          if (sm?.type === 'system' && diagnostic?.hook_id && ['hook_started', 'hook_progress', 'hook_response'].includes(diagnostic.subtype ?? '')) {
            const record = {
              id: diagnostic.hook_id,
              event: diagnostic.hook_event ?? 'Hook',
              name: diagnostic.hook_name ?? '',
              status: diagnostic.outcome ?? diagnostic.subtype ?? 'unknown',
              output: String(diagnostic.output ?? diagnostic.stderr ?? '').slice(0, 16000),
              exitCode: diagnostic.exit_code,
            }
            useStore.setState({ runtimeDiagnostics: [...s.runtimeDiagnostics.filter((item) => item.id !== record.id), record].slice(-200) })
          }
          if (sm?.type === 'assistant') s.onAssistantMessage(msg.sdkMessage)
          else if (sm?.type === 'user') {
            const content = (msg.sdkMessage as { message?: { content?: unknown } }).message?.content
            if (
              s.interrupted &&
              Array.isArray(content) &&
              content.length === 1 &&
              (content[0] as { type?: string; text?: string })?.type === 'text' &&
              (content[0] as { text?: string }).text === '[Request interrupted by user]'
            ) {
              s.pushTurnError(t('ms.interrupted'), true)
              s.setInterrupted(false)
            } else s.onUserMessage(msg.sdkMessage)
          } else if (sm?.type === 'system' && ['local_command_output', 'informational'].includes(sm.subtype ?? '')) {
            const content = (msg.sdkMessage as { content?: string }).content
            if (content) s.pushTurnError(content, true)
          } else if (sm?.type === 'result') {
            if (sm.subtype === 'cancelled') {
              if (s.interrupted) s.pushTurnError(t('ms.interrupted'), true)
            } else if (sm.subtype != null && sm.subtype !== 'success') {
              if (s.interrupted) s.pushTurnError(t('ms.interrupted'), true)
              else s.pushTurnError(tf('err.turnError', sm.subtype))
            }
            s.setInterrupted(false)
            s.finishTurn()
          }
          break
        }
        case 'models':
          if (msg.models) useStore.setState({ availableModels: msg.models })
          break
        case 'metrics':
          if (msg.metrics) s.setMetrics(msg.metrics)
          break
        case 'context':
          if (msg.usage && typeof msg.usage === 'object') s.setContext(msg.usage as Record<string, unknown>)
          break
        case 'permission.ask':
          if (msg.requestId && msg.toolName) {
            const questions = parseQuestions(msg.input ?? {})
            if (questions) s.pushQuestion({ requestId: msg.requestId, questions })
            else {
              s.pushPermission({
                title: msg.title,
                description: msg.description,
                plan: msg.plan,
                requestId: msg.requestId,
                toolName: msg.toolName,
                input: msg.input ?? {},
              })
            }
          }
          break
        case 'error':
          if (msg.message) s.setError(msg.message)
          useStore.setState({ settingsPending: null })
          break
      }
    })

    return () => {
      off()
      ws.dispose()
    }
  }, [])

  // 连接(含重连)后:补拉列表/设置 + 恢复上次会话
  useEffect(() => {
    const unsub = useStore.subscribe((s, prev) => {
      if (s.conn === 'open' && prev.conn !== 'open') {
        wsRef.current?.send({ t: 'session.list' })
        wsRef.current?.send({ t: 'settings.get' })
        for (const commandId of pendingPrompts.current.keys()) wsRef.current?.send({ t: 'request.status', commandId })
        const last = localStorage.getItem('ccweb.lastSession')
        if (last) sendControl({ t: 'session.open', sessionId: last })
      }
      if (s.sessionId !== prev.sessionId) {
        if (s.sessionId) localStorage.setItem('ccweb.lastSession', s.sessionId)
        else localStorage.removeItem('ccweb.lastSession')
      }
    })
    return unsub
  }, [sendControl])

  const send = (text: string, images?: string[]) => {
    const command = /^\/([\w:-]+)(?:\s+(.*))?$/.exec(text.trim())
    if (command) {
      const name = command[1]!
      const argument = command[2]?.trim()
      const guiTabs: Record<string, SettingsTab> = {
        permissions: 'permission',
        mcp: 'mcp',
        hooks: 'hooks',
        skills: 'skill',
        memory: 'rule',
        model: 'connection',
        settings: 'connection',
      }
      if (Object.hasOwn(guiTabs, name) && !(name === 'model' && argument)) {
        openSettings(guiTabs[name])
        return 'local'
      }
      if (['review', 'diff', 'changes'].includes(name)) {
        setDrawer('changes')
        return 'local'
      }
      if (['files', 'tree'].includes(name)) {
        setDrawer('files')
        return 'local'
      }
      if (['context', 'tasks', 'cost', 'usage', 'details', 'rewind'].includes(name)) {
        setDetailsTab(name === 'tasks' || name === 'rewind' ? 'controls' : 'context')
        setDrawer('details')
        return 'local'
      }
      if (['clear', 'new', 'plan', 'model', 'effort', 'export', 'help'].includes(name)) {
        if (name === 'clear' || name === 'new') sendControl({ t: 'session.new' })
        else if (name === 'plan') sendControl({ t: 'settings.patch', scope: useStore.getState().sessionId ? 'session' : 'default', patch: { permissionMode: 'plan' } })
        else if (name === 'model' && argument) sendControl({ t: 'settings.patch', scope: useStore.getState().sessionId ? 'session' : 'default', patch: { model: argument } })
        else if (name === 'effort' && argument && ['low', 'medium', 'high', 'xhigh', 'max'].includes(argument)) sendControl({ t: 'settings.patch', scope: 'default', patch: { effort: argument } })
        else if (name === 'export') exportMarkdown()
        else if (name === 'help') useStore.getState().setNotice('常用命令:/clear /new /plan /model /settings /mcp /context /export;也可以按 Ctrl K 打开命令面板。')
        else openSettings('connection')
        return 'local'
      }
      if (Object.hasOwn(NATIVE_ONLY, name)) {
        useStore.getState().setNotice(NATIVE_ONLY[name]!)
        return false
      }
      if (!useStore.getState().slashCommands.some((item) => item.name === name)) {
        useStore.getState().setError(`未发现 /${name}。新建或修改命令后请新建会话重新加载。`)
        return false
      }
    }
    const sessionId = useStore.getState().sessionId
    const commandId = crypto.randomUUID()
    const currentWorkspace = useStore.getState().settings?.workspace ?? 'launch'
    const key = `ccweb.draft:${currentWorkspace}:${sessionId ?? 'new'}`
    const sent = wsRef.current?.send({ t: 'prompt', sessionId: sessionId ?? undefined, text, images, commandId })
    if (!sent) {
      useStore.getState().setError('连接已断开，草稿已保留')
      return false
    }
    pendingPrompts.current.set(commandId, { key, text })
    return commandId
  }
  const interrupt = () => {
    sendControl({ t: 'interrupt' })
    useStore.getState().setInterrupted(true)
  }
  const resolvePermission = (requestId: string, allow: boolean, always = false) => {
    sendControl({ t: 'permission.resolve', requestId, allow, always })
  }
  const resolveQuestion = (requestId: string, allow: boolean, updatedInput?: Record<string, unknown>) => {
    sendControl({ t: 'permission.resolve', requestId, allow, updatedInput })
  }
  const confirmAttachmentNavigation = () =>
    !useStore.getState().attachmentDraft ||
    window.confirm('切换项目或会话会放弃尚未发送的图片附件；文字草稿会保留。是否继续？')

  /**
   * 导航前保护:附件 + 运行中任务。
   * 运行中必须显式确认,确认后先中断再切换——不做"静默杀任务",也不把任务留在后台无法查看。
   */
  const guardNavigation = (action: () => void) => {
    if (!confirmAttachmentNavigation()) return
    const state = useStore.getState()
    if (state.busy || state.permissions.length > 0 || state.question) {
      if (
        !window.confirm(
          '当前任务仍在运行。继续会先停止它；已经生成的内容会保留在原会话里。是否继续？',
        )
      )
        return
      sendControl({ t: 'interrupt' })
      useStore.getState().setInterrupted(true)
    }
    action()
  }

  const openSession = (id: string, fork = false) => {
    guardNavigation(() => {
      setNavOpen(false)
      setDrawer(null)
      sendControl({ t: 'session.open', sessionId: id, fork })
    })
  }
  const newSession = () => {
    guardNavigation(() => {
      setNavOpen(false)
      setDrawer(null)
      sendControl({ t: 'session.new' })
    })
  }
  newSessionRef.current = newSession
  const renameSession = (id: string, title: string) => sendControl({ t: 'session.rename', sessionId: id, title })
  const deleteSession = (id: string) => {
    const title = useStore.getState().sessions.find((item) => item.id === id)?.title
    sendControl({ t: 'session.delete', sessionId: id, title })
  }

  const exportMarkdown = () => {
    const { entries: current } = useStore.getState()
    if (current.length === 0) {
      useStore.getState().setError(t('err.noExport'))
      return
    }
    const lines: string[] = [`# ccweb 对话导出`, ``, `> ${new Date().toLocaleString()}`, ``]
    for (const entry of current) {
      if (entry.type === 'user') lines.push(`## 用户`, ``, entry.text, ``)
      else if (entry.type === 'turn') {
        const hasContent = entry.blocks.some((block) => (block.kind === 'tool' ? true : block.text.trim().length > 0))
        if (!hasContent) continue
        lines.push(`## 助手`, ``)
        for (const block of entry.blocks) {
          if (block.kind === 'text') lines.push(block.text, ``)
          else if (block.kind === 'tool') {
            lines.push('```', `[${block.toolName}] ${block.inputRaw?.slice(0, 200) ?? ''}`, block.resultText ? `→ ${block.resultText.slice(0, 500)}` : '', '```', '')
          }
        }
      } else lines.push(`> ⚠ ${entry.text}`, ``)
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `ccweb-${new Date().toISOString().slice(0, 10)}.md`
    link.click()
    URL.revokeObjectURL(link.href)
    useStore.getState().setNotice('对话已导出为 Markdown。')
  }
  const regenerate = () => {
    const { entries: current } = useStore.getState()
    const lastUser = [...current].reverse().find((e) => e.type === 'user')
    if (lastUser && lastUser.type === 'user') send(lastUser.text, lastUser.images)
  }
  const forkFromMessage = (uuid: string) => {
    const sid = useStore.getState().sessionId
    if (sid) sendControl({ t: 'session.open', sessionId: sid, fork: true, upToMessageId: uuid })
  }
  const searchFiles = (query: string) => {
    wsRef.current?.send({ t: 'files.search', query })
  }
  const setWorkspace = (dir: string) => {
    guardNavigation(() => sendControl({ t: 'workspace.set', dir }))
  }

  const composer = (
    <Composer
      onSend={send}
      onInterrupt={interrupt}
      onSearchFiles={searchFiles}
      sendControl={sendControl}
      hero={empty}
      onAddConnection={() => openSettings('connection')}
      onNewSession={newSession}
    />
  )

  return (
    <div className="app-shell">
      {connBanner && (
        <div className="conn-banner" role="status">
          <span className="dot warn live" />
          {t('conn.reconnecting')}
        </div>
      )}
      <div className={`app ${navOpen ? 'sidebar-open' : ''}`}>
        <Sidebar
          onSetWorkspace={(dir) => {
            setNavOpen(false)
            setWorkspace(dir)
          }}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onOpenSession={openSession}
          onNewSession={newSession}
          onRename={renameSession}
          onDelete={deleteSession}
          onExport={exportMarkdown}
          onOpenSettings={() => openSettings()}
        />
        {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}

        <main className="workbench">
          <TopBar
            onOpenSettings={() => openSettings()}
            onNewSession={newSession}
            onRename={renameSession}
            onExport={exportMarkdown}
            onOpenChanges={() => setDrawer('changes')}
            onOpenFiles={() => setDrawer('files')}
            onOpenPlan={() => setDrawer('plan')}
            onOpenDetails={() => {
              setDetailsTab('context')
              setDrawer('details')
            }}
            onOpenNav={() => setNavOpen(true)}
            changeCount={changeInfo.files.length}
            sidebarCollapsed={sidebarCollapsed}
            onExpandSidebar={() => setSidebarCollapsed(false)}
            activeDrawer={drawer}
            onToggleDrawer={(target) => setDrawer((curr) => (curr === target ? null : target))}
            activeTasksCount={activeTasks.length}
          />

          {nativeOpen ? (
            <Suspense fallback={<p style={{ padding: 20 }}>正在加载原生终端…</p>}>
              <NativeTerminal onClose={() => setNativeOpen(false)} />
            </Suspense>
          ) : (
            <div className="conversation">
              {empty ? (
                <>
                  <div className="empty-state">
                    <span className="empty-mark">
                      <BrandMark size={40} />
                    </span>
                    <h1>{t('hero.title2')}</h1>
                    <p>{t('hero.sub2')}</p>
                    <div className="empty-hint">
                      {workspace && (
                        <span>
                          {t('hero.project')} {workspace.split(/[\\/]/).filter(Boolean).pop()}
                        </span>
                      )}
                      {workspace && <span>·</span>}
                      <kbd>Ctrl K</kbd>
                      <span>{t('hero.paletteHint')}</span>
                    </div>

                    <div className="starter-prompts">
                      {STARTER_ACTIONS.map((action) => (
                        <button
                          key={action.title}
                          type="button"
                          className="starter-card"
                          onClick={() => {
                            window.dispatchEvent(
                              new CustomEvent('ccweb:insert-prompt', { detail: action.prompt }),
                            )
                          }}
                        >
                          <span className="starter-icon">{action.icon}</span>
                          <div className="starter-content">
                            <span className="starter-title">{action.title}</span>
                            <span className="starter-desc">{action.desc}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="dock">
                    <div className="dock-inner">
                      {composer}
                      <UsageBar onOpenDetails={(tab) => { setDetailsTab(tab ?? 'context'); setDrawer('details'); }} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="stream-wrap">
                    <MessageStream onRegenerate={regenerate} onForkFromMessage={forkFromMessage} />
                  </div>
                  <div className="dock">
                    <div className="dock-inner">
                      <QueueDock onResume={() => sendControl({ t: 'queue.resume' })} onDelete={(uuid) => sendControl({ t: 'queue.delete', uuid })} />
                      <PermissionCard onResolve={resolvePermission} />
                      <QuestionCard onResolve={resolveQuestion} />
                      {tasks.length > 0 && (
                        <div className="change-strip">
                          <span className={`dot ${activeTasks.length > 0 ? 'accent live' : 'ok'}`} style={{ marginLeft: 2 }} />
                          <strong>
                            后台任务 · {tasks.length} 个
                            {activeTasks.length > 0 ? `（${activeTasks.length} 个进行中）` : '（已结束）'}
                          </strong>
                          <span className="files">
                            {tasks
                              .slice(-2)
                              .map((task) => task.description)
                              .join(' · ')}
                          </span>
                          <button
                            className="btn btn-sm"
                            onClick={() => {
                              setDetailsTab('controls')
                              setDrawer('details')
                            }}
                          >
                            查看
                          </button>
                        </div>
                      )}
                      {changeInfo.count > 0 && (
                        <div className="change-strip">
                          <IconEdit width={14} height={14} style={{ color: 'var(--color-accent)', flex: '0 0 auto' }} />
                          <strong>
                            本次改动 · {changeInfo.files.length} 个文件
                          </strong>
                          <span className="files">{changeInfo.files.slice(0, 3).join(' · ')}</span>
                          <button className="btn btn-sm" onClick={() => setDrawer('changes')}>
                            查看
                          </button>
                        </div>
                      )}
                      {composer}
                      <UsageBar onOpenDetails={(tab) => { setDetailsTab(tab ?? 'context'); setDrawer('details'); }} />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </main>

        {drawer === 'changes' && (
          <ChangesPanel
            onClose={closeDrawer}
            focusFile={focusFile}
            onSwitchToFiles={() => setDrawer('files')}
            onSwitchToPlan={() => setDrawer('plan')}
            onSwitchToDetails={() => {
              setDetailsTab('controls')
              setDrawer('details')
            }}
          />
        )}
        {drawer === 'files' && (
          <FilesPanel
            onClose={closeDrawer}
            onSwitchToChanges={() => setDrawer('changes')}
            onSwitchToPlan={() => setDrawer('plan')}
            onSwitchToDetails={() => {
              setDetailsTab('controls')
              setDrawer('details')
            }}
          />
        )}
        {drawer === 'plan' && (
          <PlanPanel
            onClose={closeDrawer}
            onSwitchToChanges={() => setDrawer('changes')}
            onSwitchToFiles={() => setDrawer('files')}
            onSwitchToDetails={() => {
              setDetailsTab('controls')
              setDrawer('details')
            }}
          />
        )}
        {drawer === 'details' && (
          <DetailsPanel
            onClose={closeDrawer}
            send={sendControl}
            initialTab={detailsTab}
            onSwitchToChanges={() => setDrawer('changes')}
            onSwitchToFiles={() => setDrawer('files')}
            onSwitchToPlan={() => setDrawer('plan')}
          />
        )}
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNewSession={newSession}
        onOpenSettings={() => openSettings()}
        onOpenSession={openSession}
        onSetWorkspace={setWorkspace}
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        onExportSession={exportMarkdown}
        onOpenDrawer={(tab) => {
          if (tab === 'details') setDetailsTab('controls')
          setDrawer(tab)
        }}
        onExecuteAction={(action) => {
          if (action === 'clear') {
            useStore.getState().clearView()
            useStore.getState().setNotice('已清空当前对话屏幕')
          } else if (action === 'plan') {
            setDrawer('plan')
            window.dispatchEvent(new CustomEvent('ccweb:insert-prompt', { detail: '/plan ' }))
          } else if (action === 'compact') {
            send('/compact')
          } else if (action === 'cost') {
            setDetailsTab('context')
            setDrawer('details')
          }
        }}
      />
      {settingsOpen && (
        <Suspense fallback={<div role="status">正在打开设置…</div>}>
          <SettingsCenter
            open={settingsOpen}
            initialTab={settingsTab}
            onClose={() => setSettingsOpen(false)}
            send={sendControl}
            onOpenNative={() => {
              setSettingsOpen(false)
              setNativeOpen(true)
            }}
            onNewSession={newSession}
          />
        </Suspense>
      )}
      <Toast />
    </div>
  )
}
