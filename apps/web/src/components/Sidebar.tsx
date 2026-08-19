import { useEffect, useState } from 'react'
import { useStore } from '../store'
import type { SessionMeta } from '../types'

interface Props {
  onOpenSession: (id: string, fork?: boolean) => void
  onNewSession: () => void
  onRename: (id: string, title: string) => void
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff)) return ''
  const min = Math.floor(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  return `${d} 天前`
}

export default function Sidebar({ onOpenSession, onNewSession, onRename }: Props) {
  const conn = useStore((s) => s.conn)
  const model = useStore((s) => s.model)
  const settings = useStore((s) => s.settings)
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.sessionId)
  const [query, setQuery] = useState('')
  const modelLabel = model ?? settings?.model ?? 'auto'

  useEffect(() => {
    // 连接建立后拉取会话列表(重连也会刷新)
    if (conn === 'open') {
      // 由 App 层在 open 时发送 session.list;这里仅订阅
    }
  }, [conn])

  const filtered = query
    ? sessions.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    : sessions

  const connDot =
    conn === 'open' ? 'bg-ok' : conn === 'connecting' ? 'bg-warn animate-pulse' : 'bg-danger'

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <div className="grid size-6 place-items-center rounded-md bg-accent text-xs font-bold text-white">
          C
        </div>
        <span className="font-semibold tracking-wide">ccweb</span>
        <span className="ml-auto text-[10px] text-text-faint">v0.1</span>
      </div>

      <div className="p-2">
        <button
          onClick={onNewSession}
          className="w-full rounded-lg border border-border-strong bg-panel-2 px-3 py-2 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
        >
          + 新建会话
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索会话…"
          className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-xs outline-none placeholder:text-text-faint focus:border-accent"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-text-faint">
          历史({filtered.length})
        </p>
        {filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-text-faint">
            {query ? '无匹配会话' : '暂无历史会话'}
          </p>
        )}
        {filtered.map((s) => (
          <SessionRow
            key={s.id}
            s={s}
            active={s.id === activeId}
            onOpen={() => onOpenSession(s.id)}
            onFork={() => onOpenSession(s.id, true)}
            onRename={(title) => onRename(s.id, title)}
          />
        ))}
      </div>

      <div className="border-t border-border p-3 text-xs text-text-dim">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${connDot}`} />
          <span>{conn === 'open' ? '已连接' : conn === 'connecting' ? '连接中…' : '已断开,重连中…'}</span>
        </div>
        <div className="mt-2 truncate font-mono text-[11px] text-text-faint" title={modelLabel}>
          {modelLabel}
        </div>
      </div>
    </aside>
  )
}

function SessionRow({
  s,
  active,
  onOpen,
  onFork,
  onRename,
}: {
  s: SessionMeta
  active: boolean
  onOpen: () => void
  onFork: () => void
  onRename: (title: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(s.title)

  return (
    <div
      className={`group relative mb-0.5 cursor-pointer rounded-lg px-3 py-2 transition-colors ${
        active ? 'bg-panel-2' : 'hover:bg-panel-2/60'
      }`}
      onClick={() => !editing && onOpen()}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" />}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              onRename(draft.trim())
              setEditing(false)
            } else if (e.key === 'Escape') {
              setDraft(s.title)
              setEditing(false)
            }
          }}
          onBlur={() => setEditing(false)}
          className="w-full rounded border border-accent bg-bg px-1.5 py-0.5 text-xs outline-none"
        />
      ) : (
        <p className="truncate pr-10 text-xs text-text-dim">{s.title || '(无标题)'}</p>
      )}
      <div className="mt-1 flex items-center gap-2 text-[10px] text-text-faint">
        <span>{timeAgo(s.lastModified)}</span>
        {s.gitBranch && (
          <span className="rounded bg-border px-1 font-mono">{s.gitBranch}</span>
        )}
      </div>
      {!editing && (
        <div className="absolute right-2 top-2 hidden gap-0.5 group-hover:flex">
          <button
            title="重命名"
            aria-label="rename session"
            onClick={(e) => {
              e.stopPropagation()
              setDraft(s.title)
              setEditing(true)
            }}
            className="rounded px-1 text-[11px] text-text-faint hover:text-accent"
          >
            ✎
          </button>
          <button
            title="从此处分叉新会话"
            aria-label="fork session"
            onClick={(e) => {
              e.stopPropagation()
              onFork()
            }}
            className="rounded px-1 text-[11px] text-text-faint hover:text-accent"
          >
            ⎇
          </button>
        </div>
      )}
    </div>
  )
}
