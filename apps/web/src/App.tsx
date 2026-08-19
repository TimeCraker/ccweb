import { useEffect, useRef, useState } from 'react'
import { WsClient } from './ws'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import MessageStream from './components/MessageStream'
import Composer from './components/Composer'
import MetricsBar from './components/MetricsBar'
import PermissionCard from './components/PermissionCard'
import ContextPanel from './components/ContextPanel'
import CommandPalette from './components/CommandPalette'
import SettingsModal from './components/SettingsModal'
import Toast from './components/Toast'
import { BrandMark } from './components/Icon'

export default function App() {
  const wsRef = useRef<WsClient | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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

    const off = ws.on((msg) => {
      const s = useStore.getState()
      switch (msg.t) {
        case 'init':
          s.applyInit({
            sessionId: msg.sessionId ?? null,
            model: msg.model ?? null,
            endpoint: msg.endpoint ?? null,
          })
          if (msg.slashCommands?.length) {
            const existing = s.slashCommands
            const merged = [...existing]
            for (const c of msg.slashCommands) {
              if (!merged.some((x) => x.name === c.name)) merged.push(c)
            }
            s.setSlashCommands(merged)
          }
          break
        case 'sessions':
          if (msg.sessions) s.setSessions(msg.sessions)
          break
        case 'settings':
          if (msg.settings) {
            s.setSettings(msg.settings)
            // 斜杠命令:settings 提供(连接即有);SDK init 到达时合并去重(补内置)
            if (msg.settings.slashCommands?.length) s.setSlashCommands(msg.settings.slashCommands)
          }
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
          const sm = msg.sdkMessage as { type?: string } | undefined
          if (sm?.type === 'assistant') s.onAssistantMessage(msg.sdkMessage)
          else if (sm?.type === 'user') s.onUserMessage(msg.sdkMessage)
          else if (sm?.type === 'result') s.finishTurn()
          break
        }
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
            s.pushPermission({
              requestId: msg.requestId,
              toolName: msg.toolName,
              input: msg.input ?? {},
            })
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
        const last = localStorage.getItem('ccweb.lastSession')
        if (last && !s.entries.length) wsRef.current?.send({ t: 'session.open', sessionId: last })
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
    const sessionId = useStore.getState().sessionId
    useStore.getState().appendUser(images?.length ? `${text}\n[图片 ×${images.length}]` : text)
    wsRef.current?.send({ t: 'prompt', sessionId: sessionId ?? undefined, text, images })
  }
  const interrupt = () => {
    wsRef.current?.send({ t: 'interrupt' })
    useStore.getState().setBusy(false)
  }
  const resolvePermission = (requestId: string, allow: boolean, always = false) => {
    useStore.getState().resolvePermissionLocal(requestId)
    wsRef.current?.send({ t: 'permission.resolve', requestId, allow, always })
  }
  const openSession = (id: string, fork = false) => {
    // 生成中先中断(同新建会话保护)
    if (useStore.getState().busy) interrupt()
    wsRef.current?.send({ t: 'session.open', sessionId: id, fork })
  }
  const newSession = () => {
    // 生成中先中断,避免直接丢弃进行中的回合
    if (useStore.getState().busy) interrupt()
    wsRef.current?.send({ t: 'session.new' })
  }
  newSessionRef.current = newSession
  const renameSession = (id: string, title: string) => {
    wsRef.current?.send({ t: 'session.rename', sessionId: id, title })
  }
  const deleteSession = (id: string) => {
    wsRef.current?.send({ t: 'session.delete', sessionId: id })
  }
  /** 导出当前对话为 Markdown */
  const exportMarkdown = () => {
    const { entries } = useStore.getState()
    const lines: string[] = [`# ccweb 对话导出`, ``, `> ${new Date().toLocaleString()}`, ``]
    for (const e of entries) {
      if (e.type === 'user') {
        lines.push(`## 🧑 用户`, ``, e.text, ``)
      } else {
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
    if (lastUser && lastUser.type === 'user') send(lastUser.text)
  }
  const patchSettings = (patch: Record<string, unknown>) => {
    wsRef.current?.send({ t: 'settings.patch', patch })
  }

  const composer = (
    <Composer onSend={send} onInterrupt={interrupt} hero={empty} />
  )

  const setWorkspace = (dir: string) => {
    wsRef.current?.send({ t: 'workspace.set', dir })
  }

  return (
    <div className="flex h-full flex-col">
      {/* 断线重连通栏(dsh 对齐):仅断开且正在重连时显示 */}
      {connBanner && (
        <div className="animate-fade-in flex h-7 shrink-0 items-center justify-center gap-2 bg-warn/15 px-4 text-[11px] text-warn" role="status">
          <span className="size-1.5 animate-pulse rounded-full bg-warn" />
          连接已断开,正在重连…
        </div>
      )}
      <TopBar
        onOpenSettings={() => setSettingsOpen(true)}
        onPatch={patchSettings}
        onSetWorkspace={setWorkspace}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onOpenSession={openSession}
          onNewSession={newSession}
          onRename={renameSession}
          onDelete={deleteSession}
          onExport={exportMarkdown}
        />
        <main className="flex min-w-0 flex-1 flex-col border-l border-border">
          {empty ? (
            <div className="hero-glow flex flex-1 flex-col items-center justify-center overflow-y-auto px-6">
              <BrandMark size={56} uid="hero" />
              <h1 className="mt-5 text-xl font-semibold tracking-tight">今天做点什么?</h1>
              <p className="mt-1.5 text-sm text-text-dim">
                完整 ~/.claude 配置已就绪 · 你的 skills / memory / MCP 自动生效
              </p>
              <div className="mt-7 w-full max-w-2xl">{composer}</div>
              <p className="mt-3 text-[11px] text-text-faint">
                <span className="font-mono">{settingsMeta}</span>
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-text-faint">
                <Chip k="Ctrl K" v="命令面板" />
                <Chip k="Ctrl N" v="新建会话" />
                <Chip k="Esc" v="中断生成" />
                <Chip k="Ctrl ," v="设置" />
              </div>
            </div>
          ) : (
            <>
              <MessageStream onRegenerate={regenerate} />
              <PermissionCard onResolve={resolvePermission} />
              <MetricsBar />
              {composer}
            </>
          )}
        </main>
        <ContextPanel />
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNewSession={newSession}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSession={openSession}
        onSetWorkspace={setWorkspace}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        send={(m) => wsRef.current?.send(m as { t: string })}
      />
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
