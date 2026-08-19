import { useStore } from '../store'

export default function Sidebar() {
  const conn = useStore((s) => s.conn)
  const model = useStore((s) => s.model)

  const connDot =
    conn === 'open' ? 'bg-ok' : conn === 'connecting' ? 'bg-warn animate-pulse' : 'bg-danger'

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <div className="grid size-6 place-items-center rounded-md bg-accent text-xs font-bold text-white">
          C
        </div>
        <span className="font-semibold tracking-wide">ccweb</span>
        <span className="ml-auto text-[10px] text-text-faint">v0.1</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-text-faint">
          会话
        </p>
        <p className="px-2 py-6 text-center text-xs text-text-faint">
          当前会话开始对话
          <br />
          历史会话管理即将上线
        </p>
      </div>

      <div className="border-t border-border p-3 text-xs text-text-dim">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${connDot}`} />
          <span>{conn === 'open' ? '已连接' : conn === 'connecting' ? '连接中…' : '已断开,重连中…'}</span>
        </div>
        <div className="mt-2 truncate font-mono text-[11px] text-text-faint" title={model ?? ''}>
          {model ?? 'model: auto'}
        </div>
      </div>
    </aside>
  )
}
