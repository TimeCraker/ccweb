import { useEffect, useRef, useState } from 'react'
import { WsClient } from './ws'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import MessageStream from './components/MessageStream'
import Composer from './components/Composer'
import MetricsBar from './components/MetricsBar'
import PermissionCard from './components/PermissionCard'
import ContextPanel from './components/ContextPanel'
import CommandPalette from './components/CommandPalette'
import SettingsModal from './components/SettingsModal'

export default function App() {
  const wsRef = useRef<WsClient | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 全局快捷键:Ctrl+K 面板 / Ctrl+, 设置 / Ctrl+B 侧栏折叠
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
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
          break
        case 'sessions':
          if (msg.sessions) s.setSessions(msg.sessions)
          break
        case 'settings':
          if (msg.settings) s.setSettings(msg.settings)
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

  // 连接建立/会话切换后刷新会话列表
  useEffect(() => {
    const unsub = useStore.subscribe((s, prev) => {
      if (s.conn === 'open' && prev.conn !== 'open') {
        wsRef.current?.send({ t: 'session.list' })
      }
    })
    return unsub
  }, [])

  const send = (text: string) => {
    const sessionId = useStore.getState().sessionId
    useStore.getState().appendUser(text)
    wsRef.current?.send({ t: 'prompt', sessionId: sessionId ?? undefined, text })
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
    wsRef.current?.send({ t: 'session.open', sessionId: id, fork })
  }
  const newSession = () => {
    wsRef.current?.send({ t: 'session.new' })
  }
  const renameSession = (id: string, title: string) => {
    wsRef.current?.send({ t: 'session.rename', sessionId: id, title })
  }

  return (
    <div className="flex h-full">
      <Sidebar onOpenSession={openSession} onNewSession={newSession} onRename={renameSession} />
      <main className="flex min-w-0 flex-1 flex-col border-l border-border">
        <MessageStream />
        <PermissionCard onResolve={resolvePermission} />
        <MetricsBar />
        <Composer onSend={send} onInterrupt={interrupt} />
      </main>
      <ContextPanel />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNewSession={newSession}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSession={openSession}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        send={(m) => wsRef.current?.send(m as { t: string })}
      />
    </div>
  )
}
