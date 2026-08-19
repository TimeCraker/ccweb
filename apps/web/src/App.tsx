import { useEffect, useRef } from 'react'
import { WsClient } from './ws'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import MessageStream from './components/MessageStream'
import Composer from './components/Composer'
import MetricsBar from './components/MetricsBar'
import PermissionCard from './components/PermissionCard'
import ContextPanel from './components/ContextPanel'

export default function App() {
  const wsRef = useRef<WsClient | null>(null)

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

  const send = (text: string) => {
    useStore.getState().appendUser(text)
    wsRef.current?.send({ t: 'prompt', text })
  }
  const interrupt = () => {
    wsRef.current?.send({ t: 'interrupt' })
    useStore.getState().setBusy(false)
  }
  const resolvePermission = (requestId: string, allow: boolean, always = false) => {
    useStore.getState().resolvePermissionLocal(requestId)
    wsRef.current?.send({ t: 'permission.resolve', requestId, allow, always })
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col border-l border-border">
        <MessageStream />
        <PermissionCard onResolve={resolvePermission} />
        <MetricsBar />
        <Composer onSend={send} onInterrupt={interrupt} />
      </main>
      <ContextPanel />
    </div>
  )
}
