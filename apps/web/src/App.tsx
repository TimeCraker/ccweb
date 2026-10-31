import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { WsClient } from './ws'
import { useStore, parseQuestions } from './store'
import { t, tf, useLocale } from './i18n'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import MessageStream from './components/MessageStream'
import Composer from './components/Composer'
import ChangesReview from './components/ChangesReview'
import MetricsBar from './components/MetricsBar'
import PermissionCard from './components/PermissionCard'
import QuestionCard from './components/QuestionCard'
import ContextPanel from './components/ContextPanel'
import CommandPalette from './components/CommandPalette'
const NativeTerminal = lazy(() => import('./components/NativeTerminal'))
const SettingsModal = lazy(() => import('./components/SettingsCenter'))
import Toast from './components/Toast'
import QueueDock from './components/QueueDock'
import { BrandMark } from './components/Icon'

export default function App() {
  const pendingPrompts = useRef(new Map<string, { key: string; text: string }>())
  const wsRef = useRef<WsClient | null>(null)
  const sendControl = useCallback((msg: Record<string, unknown>) => {
    const mutations = ['files.rewind', 'task.stop', 'mcp.control', 'settings.patch', 'workspace.set', 'permission.resolve', 'queue.delete', 'queue.resume', 'session.new', 'session.rename', 'session.delete', 'abort', 'interrupt']
    wsRef.current?.send({ ...msg, ...(mutations.includes(String(msg.t)) ? { commandId: crypto.randomUUID() } : {}) } as { t: string })
  }, [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const [settingsTab, setSettingsTab] = useState<"connection" | "permission" | "mcp" | "hooks" | "skill" | "rule">("connection")
  const [detailsTab, setDetailsTab] = useState<"context" | "controls">("context")
  const [nativeOpen, setNativeOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useLocale()
  const empty = useStore((s) => s.entries.length === 0)
  const busy = useStore((s) => s.busy)
  const conn = useStore((s) => s.conn)
  // 仅"曾连上过又断开"才显示重连横幅(首连的 connecting 安静)
  const everConnected = useRef(false)
  if (conn === 'open') everConnected.current = true
  const connBanner = conn !== 'open' && everConnected.current
  const snap = useStore((s) => s.settings)
  const settingsMeta = [snap?.currentModel, snap?.currentEndpoint ? hostOf(snap.currentEndpoint) : null]
    .filter(Boolean)
    .join(' · ')

  // 页面标题未读点:后台生成时提示
  useEffect(() => {
    document.title = busy ? '● 生成中… — ccweb' : 'ccweb — Claude Code Console'
  }, [busy])

  // 全局快捷键:Ctrl+K 面板 / Ctrl+, 设置 / Ctrl+N 新建会话
  const newSessionRef = useRef<() => void>(() => {})
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('.native-panel')) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        newSessionRef.current()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        setSidebarCollapsed((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const store = useStore.getState()
    const ws = new WsClient(store.setConn)
    wsRef.current = ws
    ws.connect()

    let nativeCommands: Array<{ name: string; description: string }> = []
    const mergeCommands = (discovered: Array<{ name: string; description: string }>) => [...new Map([...nativeCommands, ...discovered].map(item => [item.name, item])).values()]
    const off = ws.on((msg) => {
      const s = useStore.getState()
      switch (msg.t) {
        case 'ack': {
          if (!msg.requestId) break
          const pending = pendingPrompts.current.get(msg.requestId)
          if (pending && msg.ok && localStorage.getItem(pending.key)?.trim() === pending.text) localStorage.removeItem(pending.key)
          pendingPrompts.current.delete(msg.requestId)
          useStore.setState({ lastAck: { id: msg.requestId, ok: msg.ok === true } })
          break
        }
        case 'file.baseline':
          if (msg.toolUseId && msg.baseline) useStore.setState({ fileBaselines: { ...s.fileBaselines, [msg.toolUseId]: msg.baseline } })
          break
        case 'rewind':
          if (msg.result) useStore.setState({ rewind: { preview: !!msg.preview, result: msg.result } })
          break
        case 'accepted':
          if (msg.runId && msg.text) useStore.setState({ checkpoints: [...s.checkpoints.filter(item => item.id !== msg.runId), { id: msg.runId, text: msg.text.slice(0, 80) }] })
          if (msg.sessionId && msg.sessionId !== s.sessionId) s.applyInit({ sessionId: msg.sessionId, model: s.model, endpoint: s.endpoint })
          if (msg.text) s.appendUser(msg.text, msg.runId, msg.images)
          break
        case 'state':
          if (msg.state === 'cancelled' || msg.state === 'failed') s.finishTurn()
          break
        case 'permission.resolved':
          if (msg.requestId) { s.resolvePermissionLocal(msg.requestId); s.resolveQuestionLocal(msg.requestId) }
          break
        case 'init':
          s.applyInit({
            sessionId: msg.sessionId ?? null,
            model: msg.model ?? null,
            endpoint: msg.endpoint ?? null,
          })
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
            // 斜杠命令:settings 提供(连接即有);SDK init 到达时合并去重(补内置)
            s.setSlashCommands(mergeCommands(msg.settings.slashCommands ?? []))
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
          } else {
            s.onBlockStop(msg.index ?? 0)
          }
          break
        case 'delta':
          if (msg.text) {
            s.onDelta({ kind: msg.kind ?? 'text', text: msg.text, toolUseId: msg.toolUseId })
          }
          break
        case 'message': {
          const sm = msg.sdkMessage as { type?: string; subtype?: string } | undefined
          const task = msg.sdkMessage as { task_id?: string; run_id?: string; status?: string; description?: string; summary?: string; subtype?: string } | undefined
          if (sm?.type === 'system' && task?.task_id && ['task_started', 'task_progress', 'task_notification'].includes(task.subtype ?? '')) {
            const previous = s.nativeTasks.find(item => item.id === task.task_id)
            if (!previous?.runId || !task.run_id || task.run_id >= previous.runId) useStore.setState({ nativeTasks: [...s.nativeTasks.filter(item => item.id !== task.task_id), { id: task.task_id, runId: task.run_id, status: task.status ?? 'running', description: task.description ?? previous?.description ?? task.task_id, summary: task.summary }].slice(-200) })
          }
          const diagnostic = msg.sdkMessage as { subtype?: string; hook_id?: string; hook_name?: string; hook_event?: string; outcome?: string; output?: string; stderr?: string; exit_code?: number } | undefined
          if (sm?.type === 'system' && diagnostic?.hook_id && ['hook_started', 'hook_progress', 'hook_response'].includes(diagnostic.subtype ?? '')) {
            const record = { id: diagnostic.hook_id, event: diagnostic.hook_event ?? 'Hook', name: diagnostic.hook_name ?? '', status: diagnostic.outcome ?? diagnostic.subtype ?? 'unknown', output: String(diagnostic.output ?? diagnostic.stderr ?? '').slice(0, 16000), exitCode: diagnostic.exit_code }
            useStore.setState({ runtimeDiagnostics: [...s.runtimeDiagnostics.filter(item => item.id !== record.id), record].slice(-200) })
          }
          if (sm?.type === 'assistant') s.onAssistantMessage(msg.sdkMessage)
          else if (sm?.type === 'user') {
            // SDK 中断协议:不发 result,而是注入 [Request interrupted by user] 的 user 消息。
            // 用户主动中断时转为中性提示行,不当普通消息渲染
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
            } else {
              s.onUserMessage(msg.sdkMessage)
            }
          }
          else if (sm?.type === 'system' && ['local_command_output', 'informational'].includes(sm.subtype ?? '')) { const content = (msg.sdkMessage as { content?: string }).content; if (content) s.pushTurnError(content, true) }
          else if (sm?.type === 'result') {
            // turn 错误行:result 非 success 时在流末尾追加红色错误行;
            // 用户主动中断(Esc/Stop)时若有 result 也走中性提示(通常中断无 result)
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
          if (msg.usage && typeof msg.usage === 'object') {
            s.setContext(msg.usage as Record<string, unknown>)
          }
          break
        case 'permission.ask':
          if (msg.requestId && msg.toolName) {
            // AskUserQuestion 类:input.questions 存在走问题接管,否则普通审批
            const questions = parseQuestions(msg.input ?? {})
            if (questions) {
              s.pushQuestion({ requestId: msg.requestId, questions })
            } else {
              s.pushPermission({
                title: msg.title, description: msg.description, plan: msg.plan,
                requestId: msg.requestId,
                toolName: msg.toolName,
                input: msg.input ?? {},
              })
            }
          }
          break
        case 'error':
          if (msg.message) s.setError(msg.message)
          break
      }
    })

    return () => {
      off()
      ws.dispose()
    }
  }, [])

  // 连接(含重连)后:补拉列表/设置 + 恢复上次会话(刷新不再丢对话)
  useEffect(() => {
    const unsub = useStore.subscribe((s, prev) => {
      if (s.conn === 'open' && prev.conn !== 'open') {
        wsRef.current?.send({ t: 'session.list' })
        wsRef.current?.send({ t: 'settings.get' })
        for (const commandId of pendingPrompts.current.keys()) wsRef.current?.send({ t: 'request.status', commandId })
        const last = localStorage.getItem('ccweb.lastSession')
        if (last) sendControl({ t: 'session.open', sessionId: last })
      }
      // 持久化当前会话,供刷新恢复
      if (s.sessionId !== prev.sessionId) {
        if (s.sessionId) localStorage.setItem('ccweb.lastSession', s.sessionId)
        else localStorage.removeItem('ccweb.lastSession')
      }
    })
    return unsub
  }, [])

  const send = (text: string, images?: string[]) => {
    const command = /^\/([\w:-]+)(?:\s+(.*))?$/.exec(text.trim())
    if (command) {
      const name = command[1]!, argument = command[2]?.trim()
      const guiTabs = { permissions: 'permission', mcp: 'mcp', hooks: 'hooks', skills: 'skill', memory: 'rule', model: 'connection', settings: 'connection' } as const
      if (Object.hasOwn(guiTabs, name) && !(name === 'model' && argument)) {
        setSettingsTab(guiTabs[name as keyof typeof guiTabs]); setSettingsOpen(true); return 'local'
      }
      if (['context', 'tasks', 'rewind'].includes(name)) { setDetailsTab(name === 'context' ? 'context' : 'controls'); setDetailsOpen(true); return 'local' }
      if (['clear', 'new', 'plan', 'model', 'effort', 'export'].includes(name)) {
        if (name === 'clear' || name === 'new') sendControl({ t: 'session.new' })
        else if (name === 'plan') sendControl({ t: 'settings.patch', patch: { permissionMode: 'plan' } })
        else if (name === 'model' && argument) sendControl({ t: 'settings.patch', patch: { model: argument } })
        else if (name === 'effort' && argument && ['low','medium','high','xhigh','max'].includes(argument)) sendControl({ t: 'settings.patch', patch: { effort: argument } })
        else if (name === 'export') exportMarkdown()
        else { setSettingsTab('connection'); setSettingsOpen(true) }
        return 'local'
      }
      if (['login', 'logout', 'terminal-setup', 'vim', 'doctor', 'update', 'install', 'plugins', 'plugin', 'add-dir', 'help'].includes(name)) {
        setNativeOpen(true)
        return false
      }
      if (!useStore.getState().slashCommands.some(item => item.name === name)) { useStore.getState().setError(`未发现 /${name}。新建或修改命令后请启动新会话重新加载。`); return false }
    }
    const sessionId = useStore.getState().sessionId
    const commandId = crypto.randomUUID()
    const workspace = useStore.getState().settings?.workspace ?? 'launch'
    const key = `ccweb.draft:${workspace}:${sessionId ?? 'new'}`
    const sent = wsRef.current?.send({ t: 'prompt', sessionId: sessionId ?? undefined, text, images, commandId })
    if (!sent) { useStore.getState().setError('连接已断开，草稿已保留'); return false }
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
  /** 问题接管回执:提交带 answers(updatedInput),跳过 = deny */
  const resolveQuestion = (
    requestId: string,
    allow: boolean,
    updatedInput?: Record<string, unknown>,
  ) => {
    sendControl({ t: 'permission.resolve', requestId, allow, updatedInput })
  }
  const confirmAttachmentNavigation = () => !useStore.getState().attachmentDraft || window.confirm('切换会话或工作区将放弃尚未发送的图片附件；文字草稿会保留。是否继续？')
  const openSession = (id: string, fork = false) => {
    if (!confirmAttachmentNavigation()) return
    // 生成中先中断(同新建会话保护)
    sendControl({ t: 'session.open', sessionId: id, fork })
  }
  const newSession = () => {
    if (!confirmAttachmentNavigation()) return
    // 生成中先中断,避免直接丢弃进行中的回合
    sendControl({ t: 'session.new' })
  }
  newSessionRef.current = newSession
  const renameSession = (id: string, title: string) => {
    sendControl({ t: 'session.rename', sessionId: id, title })
  }
  const deleteSession = (id: string) => {
    sendControl({ t: 'session.delete', sessionId: id })
  }
  /** 导出当前对话为 Markdown(空对话提示而非导出空文件) */
  const exportMarkdown = () => {
    const { entries } = useStore.getState()
    if (entries.length === 0) {
      useStore.getState().setError(t('err.noExport'))
      return
    }
    const lines: string[] = [`# ccweb 对话导出`, ``, `> ${new Date().toLocaleString()}`, ``]
    for (const e of entries) {
      if (e.type === 'user') {
        lines.push(`## 🧑 用户`, ``, e.text, ``)
      } else if (e.type === 'turn') {
        // 无可见内容的 turn(空回包/被中断在首块前)不产出空标题
        const hasContent = e.blocks.some((b) => (b.kind === 'tool' ? true : b.text.trim().length > 0))
        if (!hasContent) continue
        lines.push(`## 🤖 助手`, ``)
        for (const b of e.blocks) {
          if (b.kind === 'text') lines.push(b.text, ``)
          else if (b.kind === 'tool')
            lines.push(
              '```',
              `[${b.toolName}] ${b.inputRaw?.slice(0, 200) ?? ''}`,
              b.resultText ? `→ ${b.resultText.slice(0, 500)}` : '',
              '```',
              '',
            )
        }
      } else {
        lines.push(`> ⚠ ${e.text}`, ``)
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ccweb-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const regenerate = () => {
    const { entries } = useStore.getState()
    const lastUser = [...entries].reverse().find((e) => e.type === 'user')
    if (lastUser && lastUser.type === 'user') send(lastUser.text, lastUser.images)
  }
  const patchSettings = (patch: Record<string, unknown>) => {
    sendControl({ t: 'settings.patch', patch })
  }
  /** Fork the native transcript at the selected user message, inclusive. */
  const forkFromMessage = (uuid: string) => {
    const sid = useStore.getState().sessionId
    if (sid) sendControl({ t: 'session.open', sessionId: sid, fork: true, upToMessageId: uuid })
  }
  /** @文件补全:server 侧工作区扫描 */
  const searchFiles = (query: string) => {
    wsRef.current?.send({ t: 'files.search', query })
  }

  const composer = (
    <Composer onSend={send} onInterrupt={interrupt} onSearchFiles={searchFiles} sendControl={sendControl} hero={empty} />
  )

  const setWorkspace = (dir: string) => {
    if (!confirmAttachmentNavigation()) return
    sendControl({ t: 'workspace.set', dir })
  }

  return (
    <div className="app-shell flex h-full flex-col">
      {/* 断线重连通栏(dsh 对齐):仅断开且正在重连时显示 */}
      {connBanner && (
        <div className="animate-fade-in flex h-7 shrink-0 items-center justify-center gap-2 bg-warn/15 px-4 text-[11px] text-warn" role="status">
          <span className="size-1.5 animate-pulse rounded-full bg-warn" />
          {t('conn.reconnecting')}
        </div>
      )}
      <div className="workbench-layout flex min-h-0 flex-1">
        <Sidebar
          onSetWorkspace={setWorkspace}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onOpenSession={openSession}
          onNewSession={newSession}
          onRename={renameSession}
          onDelete={deleteSession}
          onExport={exportMarkdown}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <main className="workbench-main flex min-w-0 flex-1 flex-col">
      <TopBar
        onOpenSettings={() => setSettingsOpen(true)}
        onPatch={patchSettings}
        onSetWorkspace={setWorkspace}
        onToggleDetails={() => setDetailsOpen(v => !v)}
        onNative={() => setNativeOpen(v => !v)}
        onReview={() => setReviewOpen(v => !v)}
      />

          {nativeOpen && <Suspense fallback={<p>正在加载原生终端…</p>}><NativeTerminal onClose={() => setNativeOpen(false)} /></Suspense>}
          {reviewOpen && !nativeOpen && <ChangesReview onClose={() => setReviewOpen(false)} />}
          <div className="conversation-layout" hidden={reviewOpen || nativeOpen}>
          {empty ? (
            <>
              <div className="empty-welcome">
                <BrandMark size={64} uid="hero" />
                <h1>{t('hero.title')}</h1><p>{t('hero.sub')}</p>
                <div className="welcome-shortcuts"><Chip k="Ctrl K" v={t('hero.palette')} /><Chip k="Ctrl N" v={t('hero.newSession')} /><Chip k="Ctrl ," v={t('hero.settings')} /></div>
                {settingsMeta && <span className="welcome-endpoint">{settingsMeta}</span>}
              </div>
              <div className="action-dock">{composer}</div><MetricsBar />
            </>
          ) : (
            <>
              <MessageStream onRegenerate={regenerate} onForkFromMessage={forkFromMessage} />
              <div className="action-dock">
              <QueueDock onResume={() => sendControl({ t: 'queue.resume' })} onDelete={(uuid) => sendControl({ t: 'queue.delete', uuid })} />
              <PermissionCard onResolve={resolvePermission} />
              <QuestionCard onResolve={resolveQuestion} />
              {composer}
              </div>
              <MetricsBar />
            </>
          )}
          </div>
        </main>
        {detailsOpen && <div className="runtime-details"><button onClick={() => setDetailsOpen(false)}>关闭运行详情</button><ContextPanel key={detailsTab} send={sendControl} initialTab={detailsTab} /></div>}
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNewSession={newSession}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSession={openSession}
        onSetWorkspace={setWorkspace}
      />
      {settingsOpen && <Suspense fallback={<div role="status">正在打开设置…</div>}><SettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        onClose={closeSettings}
        send={sendControl}
      /></Suspense>}
      <Toast />
    </div>
  )
}

function Chip({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-md border border-border bg-panel px-2 py-1">
      <kbd className="font-mono text-[10px] text-text-dim">{k}</kbd>
      <span>{v}</span>
    </span>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
