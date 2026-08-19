import { useEffect, useState } from 'react'
import { useStore } from '../store'
import type { SessionMeta } from '../types'
import { IconSearch, IconFork, IconPencil, IconChat, IconTrash } from './Icon'

interface Props {
  onOpenSession: (id: string, fork?: boolean) => void
  onNewSession: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
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

export default function Sidebar({ onOpenSession, onNewSession, onRename, onDelete }: Props) {
  const conn = useStore((s) => s.conn)
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.sessionId)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (conn === 'open') {
      // 会话列表由 App 层在 open 时拉取;这里仅订阅
    }
  }, [conn])

  const filtered = query
    ? sessions.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    : sessions

  const connDot =
    conn === 'open' ? 'bg-ok' : conn === 'connecting' ? 'bg-warn animate-pulse' : 'bg-danger'

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-panel">
      {/* 新会话 */}
      <div className="p-3 pb-2">
        <button
          onClick={onNewSession}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-panel-2 px-3 py-2 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
        >
          新建会话
          <span className="font-mono text-[10px] text-text-faint">⌘N</span>
        </button>
        <div className="relative mt-2">
          <IconSearch
            width={13}
            height={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话…"
            className="w-full rounded-lg border border-border bg-bg py-1.5 pl-8 pr-3 text-xs outline-none placeholder:text-text-faint focus:border-accent"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-text-faint">
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
            onDelete={() => onDelete(s.id)}
          />
        ))}
      </div>

      <div className="border-t border-border p-3 text-xs text-text-dim">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${connDot}`} />
          <span>{conn === 'open' ? '已连接' : conn === 'connecting' ? '连接中…' : '已断开,重连中…'}</span>
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
  onDelete,
}: {
  s: SessionMeta
  active: boolean
  onOpen: () => void
  onFork: () => void
  onRename: (title: string) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(s.title)

  return (
    <div
      className={`group relative mb-0.5 cursor-pointer rounded-lg px-2.5 py-2 transition-colors ${
        active ? 'bg-panel-2' : 'hover:bg-panel-2/60'
      }`}
      onClick={() => !editing && onOpen()}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" />}
      <div className="flex items-center gap-2.5">
        <IconChat
          width={14}
          height={14}
          className={`shrink-0 ${active ? 'text-accent' : 'text-text-faint'}`}
        />
        <div className="min-w-0 flex-1">
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
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-faint">
            <span>{timeAgo(s.lastModified)}</span>
            {s.gitBranch && <span className="truncate font-mono">{s.gitBranch}</span>}
          </div>
        </div>
      </div>
      {!editing && (
        <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 gap-0.5 group-hover:flex">
          <button
            aria-label="重命名会话"
            title="重命名"
            onClick={(e) => {
              e.stopPropagation()
              setDraft(s.title)
              setEditing(true)
            }}
            className="grid size-6 place-items-center rounded text-text-faint hover:text-text"
          >
            <IconPencil width={12} height={12} />
          </button>
          <button
            aria-label="分叉会话"
            title="从此分叉"
            onClick={(e) => {
              e.stopPropagation()
              onFork()
            }}
            className="grid size-6 place-items-center rounded text-text-faint hover:text-text"
          >
            <IconFork width={12} height={12} />
          </button>
          <button
            aria-label="删除会话"
            title="删除(不可恢复)"
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm(`删除会话「${s.title || s.id.slice(0, 8)}」?此操作不可恢复。`)) {
                onDelete(s.id)
              }
            }}
            className="grid size-6 place-items-center rounded text-text-faint hover:text-danger"
          >
            <IconTrash width={12} height={12} />
          </button>
        </div>
      )}
    </div>
  )
}
