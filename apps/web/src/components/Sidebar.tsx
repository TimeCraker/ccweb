import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { t, tf, useLocale } from '../i18n'
import { WorkspacePicker } from './TopBar'
import type { SessionMeta } from '../types'
import { IconSearch, IconFork, IconPencil, IconChat, IconTrash, BrandMark, IconGear, IconPlus, SectionIcon } from './Icon'

interface Props {
  onSetWorkspace: (dir: string) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  onOpenSession: (id: string, fork?: boolean) => void
  onNewSession: () => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onExport: () => void
  onOpenSettings?: () => void
}

// ---------- 拖拽排序(纯前端,localStorage 持久化) ----------

const ORDER_KEY = 'ccweb.sessionOrder'

function readSessionOrder(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]') as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** 稳定排序:order 里的按序,不在 order 里的按原序追加(派生放 selector 外,防 React #185) */
function applySessionOrder(sessions: SessionMeta[], order: string[]): SessionMeta[] {
  if (order.length === 0) return sessions
  const pos = new Map(order.map((id, i) => [id, i]))
  const known = sessions.filter((s) => pos.has(s.id))
  if (known.length === 0) return sessions
  const rest = sessions.filter((s) => !pos.has(s.id))
  known.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0))
  return [...known, ...rest]
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff)) return ''
  const min = Math.floor(diff / 60_000)
  if (min < 1) return t('time.now')
  if (min < 60) return tf('time.min', min)
  const h = Math.floor(min / 60)
  if (h < 24) return tf('time.hour', h)
  const d = Math.floor(h / 24)
  return tf('time.day', d)
}

export default function Sidebar({
  onSetWorkspace,
  collapsed = false,
  onToggleCollapse,
  onOpenSession,
  onNewSession,
  onRename,
  onDelete,
  onExport,
  onOpenSettings,
}: Props) {
  const settings = useStore(s => s.settings)
  const busy = useStore(s => s.busy)
  const conn = useStore((s) => s.conn)
  const savedSessions = useStore((s) => s.sessions)
  const firstPrompt = useStore(s => s.entries.find(entry => entry.type === "user"))
  const activeId = useStore((s) => s.sessionId)
  const sessions = activeId && !savedSessions.some(session => session.id === activeId) ? [{ id: activeId, title: firstPrompt?.type === "user" ? firstPrompt.text.split("\n")[0]!.slice(0, 80) : "当前会话", lastModified: null, gitBranch: null }, ...savedSessions] : savedSessions
  const serverVersion = useStore((s) => s.settings?.serverVersion)
  const [query, setQuery] = useState('')
  // 拖拽排序状态(hooks 全部在 collapsed 早退之前,防 React #300)
  const [order, setOrder] = useState<string[]>(() => readSessionOrder())
  const [dragId, setDragId] = useState<string | null>(null)
  const dragIdRef = useRef<string | null>(null)
  useLocale()

  // 顺序变更即写回(挂载时回写同值,无副作用)
  useEffect(() => {
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(order))
    } catch {
      // 隐私模式等写入失败忽略
    }
  }, [order])

  const handleItemDragStart = (id: string) => {
    dragIdRef.current = id
    setDragId(id)
  }

  /** 拖动项 hover 到目标行:交换两者顺序(交换后光标下即拖动项自身,重复事件自然空转) */
  const handleItemDragOver = (targetId: string) => {
    const dragged = dragIdRef.current
    if (!dragged || dragged === targetId) return
    setOrder((prev) => {
      const ids = applySessionOrder(sessions, prev).map((s) => s.id)
      const i = ids.indexOf(dragged)
      const j = ids.indexOf(targetId)
      if (i === -1 || j === -1 || i === j) return prev
      ids[i] = targetId
      ids[j] = dragged
      return ids
    })
  }

  const handleItemDragEnd = () => {
    dragIdRef.current = null
    setDragId(null)
  }

  /** 折叠态:窄条,仅图标(悬停展开省略;Ctrl+B 切换) */
  if (collapsed) {
    return (
      <aside className="session-sidebar is-collapsed flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-panel py-3">
        <button onClick={onNewSession} title={`${t('sb.new')} (Ctrl+N)`} aria-label={t('sb.new')} className="icon-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <div className="my-1 h-px w-6 bg-border" />
        <div className="flex-1 overflow-y-auto py-1" title={sessions.length > 15 ? tf('sb.more', sessions.length) : undefined}>
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
        <button onClick={onOpenSettings} title="设置" aria-label="settings" className="icon-btn">设置</button>
        <button onClick={onExport} title={t('sb.export')} aria-label={t('sb.export')} className="icon-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
        </button>
        <button onClick={onToggleCollapse} title={t('sb.expand')} aria-label={t('sb.expand')} className="icon-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </aside>
    )
  }

  const ordered = applySessionOrder(sessions, order)
  const filtered = query
    ? ordered.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    : ordered

  const connDot =
    conn === 'open' ? 'bg-ok' : conn === 'connecting' ? 'bg-warn animate-pulse' : 'bg-danger'

  return (
    <aside className="session-sidebar flex shrink-0 flex-col">
      <div className="sidebar-brand"><BrandMark size={38} /><strong>ccweb</strong><span className="sidebar-connection"><i className={connDot} /><span>{conn === 'open' ? '本地连接' : conn === 'connecting' ? '连接中' : '已断开'}</span></span></div>
      <div className="sidebar-workspace"><WorkspacePicker workspaces={settings?.workspaces ?? []} current={settings?.workspace ?? null} onPick={onSetWorkspace} /></div>
      {/* 新会话 */}
      <div className="sidebar-controls">
        <button
          onClick={onNewSession}
          className="sidebar-new"
        >
          <IconPlus width={20} height={20} />{t('sb.new')}
          <kbd>Ctrl N</kbd>
        </button>
        <div className="sidebar-search relative">
          <IconSearch
            width={13}
            height={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sb.search')}
            className="w-full rounded-lg border border-border bg-bg py-1.5 pl-8 pr-3 text-xs outline-none placeholder:text-text-faint focus:border-accent"
          />
        </div>
      </div>

      {/* 列表容器统一处理 dragover/drop(允许放置 + move 光标);行级 dragover 驱动换序 */}
      <div
        className="session-list flex-1 overflow-y-auto"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(e) => e.preventDefault()}
      >
        <p className="session-list-label">最近会话 <span>{filtered.length}</span></p>
        {filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-text-faint">
            {query ? t('sb.noMatch') : t('sb.none')}
          </p>
        )}
        {filtered.map((s) => (
          <SessionRow
            key={s.id}
            s={s}
            active={s.id === activeId}
            running={s.id === activeId && busy}
            dragging={s.id === dragId}
            onItemDragStart={handleItemDragStart}
            onItemDragOver={handleItemDragOver}
            onItemDragEnd={handleItemDragEnd}
            onOpen={() => onOpenSession(s.id)}
            onFork={() => onOpenSession(s.id, true)}
            onRename={(title) => onRename(s.id, title)}
            onDelete={() => onDelete(s.id)}
          />
        ))}
      </div>

      <footer className="sidebar-footer"><button aria-label="settings" onClick={onOpenSettings}><IconGear width={20} height={20} />设置</button><button onClick={onToggleCollapse} aria-label={t('sb.collapse')}><SectionIcon name="panel" width={20} height={20} />折叠侧栏</button><div className="sidebar-footer-meta"><span><i className={connDot} />{conn === 'open' ? t('sb.connected') : t('sb.connecting')}</span><span>v{serverVersion || '…'}</span><button onClick={onExport} aria-label={t('sb.export')} title={t('sb.export')}>↓</button></div></footer>
    </aside>
  )
}

function SessionRow({
  s,
  running = false,
  active,
  dragging,
  onItemDragStart,
  onItemDragOver,
  onItemDragEnd,
  onOpen,
  onFork,
  onRename,
  onDelete,
}: {
  s: SessionMeta
  running?: boolean
  active: boolean
  dragging?: boolean
  onItemDragStart: (id: string) => void
  onItemDragOver: (id: string) => void
  onItemDragEnd: () => void
  onOpen: () => void
  onFork: () => void
  onRename: (title: string) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(s.title)
  useLocale()

  return (
    <div
      role="button"
      tabIndex={editing ? -1 : 0}
      aria-current={active ? 'true' : undefined}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', s.id)
        e.dataTransfer.effectAllowed = 'move'
        onItemDragStart(s.id)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        onItemDragOver(s.id)
      }}
      onDragEnd={onItemDragEnd}
      onKeyDown={(e) => {
        if (!editing && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`session-row group relative mb-0.5 cursor-pointer rounded-lg px-2.5 py-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/50 ${
        active ? 'bg-panel-2' : 'hover:bg-panel-2/60'
      } ${dragging ? 'opacity-40' : ''}`}
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
            <p className="truncate pr-10 text-xs text-text-dim">{s.title || t('sb.untitled')}</p>
          )}
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-faint">
            {running ? <span className="session-running">● 运行中</span> : <span>{timeAgo(s.lastModified)}</span>}
            {s.gitBranch && <span className="truncate font-mono">{s.gitBranch}</span>}
          </div>
        </div>
      </div>
      {!editing && (
        <div className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 gap-0.5 group-hover:flex">
          <button
            aria-label={t('sb.rename')}
            title={t('sb.rename')}
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
            aria-label={t('sb.fork')}
            title={t('sb.fork')}
            onClick={(e) => {
              e.stopPropagation()
              onFork()
            }}
            className="grid size-6 place-items-center rounded text-text-faint hover:text-text"
          >
            <IconFork width={12} height={12} />
          </button>
          <button
            aria-label={t('sb.delete')}
            title={t('sb.delete')}
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm(tf('sb.deleteConfirm', s.title || s.id.slice(0, 8)))) {
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
