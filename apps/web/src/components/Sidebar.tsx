import { useState } from 'react'
import { useStore } from '../store'
import type { SessionMeta } from '../types'
import { IconSearch, IconFork, IconPencil, IconChat, IconTrash } from './Icon'

interface Props {
  collapsed?: boolean
  onToggleCollapse?: () => void
  onOpenSession: (id: string, fork?: boolean) => void
  onNewSession: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onExport: () => void
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

export default function Sidebar({
  collapsed = false,
  onToggleCollapse,
  onOpenSession,
  onNewSession,
  onRename,
  onDelete,
  onExport,
}: Props) {
  const conn = useStore((s) => s.conn)
  const sessions = useStore((s) => s.sessions)
  const activeId = useStore((s) => s.sessionId)
  const [query, setQuery] = useState('')

  /** 折叠态:窄条,仅图标(悬停展开省略;Ctrl+B 切换) */
  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-panel py-3">
        <button onClick={onNewSession} title="新建会话 (Ctrl+N)" aria-label="新建会话" className="icon-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <div className="my-1 h-px w-6 bg-border" />
        <div className="flex-1 overflow-y-auto py-1" title={sessions.length > 15 ? `共 ${sessions.length} 个会话,展开侧栏查看全部` : undefined}>
          {sessions.slice(0, 15).map((s) => (
            <button
              key={s.id}
              onClick={() => onOpenSession(s.id)}
              title={s.title}
              className={`mb-0.5 grid size-8 place-items-center rounded-lg ${
                s.id === activeId ? 'bg-panel-2 text-accent' : 'text-text-faint hover:text-text-dim'
              }`}
            >
              <IconChat width={14} height={14} />
            </button>
          ))}
        </div>
        <button onClick={onExport} title="导出对话 Markdown" aria-label="导出对话" className="icon-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
        </button>
        <button onClick={onToggleCollapse} title="展开侧栏 (Ctrl+B)" aria-label="展开侧栏" className="icon-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </aside>
    )
  }

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
          <span className="font-mono text-[10px] text-text-faint">Ctrl N</span>
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
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[10px] text-text-faint">v0.1.0</span>
          <div className="flex gap-1">
            <button onClick={onExport} title="导出对话 Markdown" className="icon-btn !size-6" aria-label="导出对话">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
            </button>
            <button onClick={onToggleCollapse} title="折叠侧栏 (Ctrl+B)" className="icon-btn !size-6" aria-label="折叠侧栏">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          </div>
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
      role="button"
      tabIndex={editing ? -1 : 0}
      aria-current={active ? 'true' : undefined}
      onKeyDown={(e) => {
        if (!editing && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`group relative mb-0.5 cursor-pointer rounded-lg px-2.5 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50 ${
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
              onBlur={() => {
                // 失焦即提交(不再丢草稿);Esc 恢复由 onKeyDown 处理
                if (draft.trim() && draft !== s.title) onRename(draft.trim())
                setEditing(false)
              }}
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
