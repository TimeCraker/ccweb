import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { t, tf, useLocale } from '../i18n'
import type { SessionMeta } from '../types'
import {
  IconSearch,
  IconFork,
  IconPencil,
  IconChat,
  IconTrash,
  BrandMark,
  IconGear,
  IconPlus,
  IconChevron,
  SectionIcon,
} from './Icon'
import { Menu, MenuItem } from './ui/Menu'
import { baseName, compactPath, isTempPath } from '../lib/path'

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
const HIDDEN_KEY = 'ccweb.hiddenWorkspaces'

function readList(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : []
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
  const hour = Math.floor(min / 60)
  if (hour < 24) return tf('time.hour', hour)
  const day = Math.floor(hour / 24)
  return tf('time.day', day)
}

type Bucket = 'today' | 'yesterday' | 'week' | 'earlier'

function bucketOf(iso: string | null): Bucket {
  if (!iso) return 'earlier'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'earlier'
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const yesterday = new Date(start)
  yesterday.setDate(start.getDate() - 1)
  if (date >= start) return 'today'
  if (date >= yesterday) return 'yesterday'
  if (date >= new Date(start.getTime() - 6 * 86_400_000)) return 'week'
  return 'earlier'
}

const BUCKET_ORDER: Bucket[] = ['today', 'yesterday', 'week', 'earlier']
const BUCKET_LABEL: Record<Bucket, () => string> = {
  today: () => t('sb.today'),
  yesterday: () => t('sb.yesterday'),
  week: () => t('sb.week'),
  earlier: () => t('sb.earlier'),
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
  const settings = useStore((s) => s.settings)
  const busy = useStore((s) => s.busy)
  const conn = useStore((s) => s.conn)
  const savedSessions = useStore((s) => s.sessions)
  const firstPrompt = useStore((s) => s.entries.find((entry) => entry.type === 'user'))
  const activeId = useStore((s) => s.sessionId)
  const sessions =
    activeId && !savedSessions.some((session) => session.id === activeId)
      ? [
          {
            id: activeId,
            title:
              firstPrompt?.type === 'user'
                ? firstPrompt.text.split('\n')[0]!.slice(0, 80)
                : t('sb.untitled'),
            lastModified: null,
            gitBranch: null,
          },
          ...savedSessions,
        ]
      : savedSessions
  const serverVersion = useStore((s) => s.settings?.serverVersion)
  const [query, setQuery] = useState('')
  // 拖拽排序状态(hooks 全部在 collapsed 分支之前,防 hook 顺序变化)
  const [order, setOrder] = useState<string[]>(() => readList(ORDER_KEY))
  const [dragId, setDragId] = useState<string | null>(null)
  const dragIdRef = useRef<string | null>(null)
  useLocale()

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

  /** 拖动项 hover 到目标行:交换两者顺序 */
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

  const connDot = conn === 'open' ? 'ok' : conn === 'connecting' ? 'warn live' : 'danger'
  const connLabel =
    conn === 'open' ? t('sb.connected') : conn === 'connecting' ? t('sb.connecting') : t('sb.reconnecting')

  /** 折叠态:独立窄栏,仅图标;文字只在 tooltip / 无障碍名称里 */
  if (collapsed) {
    return (
      <aside className="sidebar is-rail">
        <button
          className="rail-item"
          onClick={onToggleCollapse}
          title={t('sb.expand')}
          aria-label={t('sb.expand')}
        >
          <SectionIcon name="panel" width={18} height={18} />
        </button>
        <button
          className="rail-item"
          onClick={onNewSession}
          title={`${t('sb.new')} (Ctrl+N)`}
          aria-label={t('sb.new')}
        >
          <IconPlus width={18} height={18} />
        </button>
        <Menu
          label={t('sb.sessions')}
          width={288}
          className="p-1.5"
          trigger={({ open }) => (
            <button
              className={`rail-item ${activeId ? 'is-active' : ''}`}
              aria-label={t('sb.sessions')}
              title={t('sb.sessions')}
              aria-expanded={open}
            >
              <IconChat width={18} height={18} />
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="menu-label row">
                <span>{t('sb.sessions')}</span>
                <span style={{ fontWeight: 400 }}>{sessions.length}</span>
              </div>
              {sessions.length === 0 && <p className="menu-empty">{t('sb.none')}</p>}
              {sessions.map((s) => (
                <MenuItem
                  key={s.id}
                  selected={s.id === activeId}
                  onClick={() => {
                    close()
                    onOpenSession(s.id)
                  }}
                  description={s.id === activeId && busy ? t('queue.queued') : timeAgo(s.lastModified)}
                >
                  {s.title || t('sb.untitled')}
                </MenuItem>
              ))}
            </>
          )}
        </Menu>
        <div style={{ flex: 1 }} />
        <span
          className={`dot ${connDot}`}
          title={connLabel}
          aria-label={connLabel}
          style={{ marginBottom: 6 }}
        />
        <button
          className="rail-item"
          onClick={onOpenSettings}
          title={t('sb.settings')}
          aria-label={t('sb.settings')}
        >
          <IconGear width={18} height={18} />
        </button>
      </aside>
    )
  }

  const ordered = applySessionOrder(sessions, order)
  const filtered = query
    ? ordered.filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    : ordered
  const groups = BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: filtered.filter((s) => bucketOf(s.lastModified) === bucket),
  })).filter((group) => group.items.length > 0)

  return (
    <aside className="sidebar">
      <div className="brand-row">
        <BrandMark size={30} />
        <span className="brand-name">ccweb</span>
        <span className="brand-actions">
          <button
            className="icon-btn"
            onClick={onToggleCollapse}
            title={t('sb.collapse')}
            aria-label={t('sb.collapse')}
          >
            <SectionIcon name="panel" width={17} height={17} />
          </button>
        </span>
      </div>

      <button className="sidebar-new" onClick={onNewSession}>
        <IconPlus width={16} height={16} />
        {t('sb.new')}
        <kbd aria-hidden="true">Ctrl N</kbd>
      </button>

      <Menu
        label={t('sb.project.recent')}
        width={318}
        trigger={({ open }) => (
          <button className="workspace-trigger" aria-expanded={open} title={settings?.workspace ?? ''}>
            <WorkspaceGlyph />
            <span className="ws-name">
              {settings?.workspace ? baseName(settings.workspace) : t('ws.title')}
            </span>
            <IconChevron
              width={13}
              height={13}
              className="chev"
              style={{ transform: open ? 'rotate(180deg)' : undefined }}
            />
          </button>
        )}
      >
        {(close) => (
          <WorkspaceMenu
            workspaces={settings?.workspaces ?? []}
            current={settings?.workspace ?? null}
            onPick={(dir) => {
              close()
              onSetWorkspace(dir)
            }}
          />
        )}
      </Menu>

      {sessions.length > 6 && (
        <div className="sidebar-search">
          <IconSearch width={13} height={13} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('sb.search')}
            aria-label={t('sb.search')}
          />
        </div>
      )}

      <div
        className="session-list"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(e) => e.preventDefault()}
      >
        {groups.map((group) => (
          <div key={group.bucket}>
            <p className="session-group-label">
              <span>{BUCKET_LABEL[group.bucket]()}</span>
            </p>
            {group.items.map((s) => (
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
        ))}
        {filtered.length === 0 && (
          <p className="menu-empty" style={{ padding: '22px 10px' }}>
            {query ? t('sb.noMatch') : t('sb.none')}
          </p>
        )}
      </div>

      <footer className="sidebar-footer">
        <button className="sidebar-foot-btn" onClick={onOpenSettings}>
          <IconGear width={16} height={16} />
          {t('sb.settings')}
        </button>
        <div className="sidebar-footer-row">
          <span className={`dot ${connDot}`} />
          <span>{connLabel}</span>
          <span className="version">v{serverVersion || '…'}</span>
          <button
            className="icon-btn"
            style={{ width: 22, height: 22 }}
            onClick={onExport}
            title={t('sb.export')}
            aria-label={t('sb.export')}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
          </button>
        </div>
      </footer>
    </aside>
  )
}

function WorkspaceGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5Z" />
    </svg>
  )
}

function WorkspaceMenu({
  workspaces,
  current,
  onPick,
}: {
  workspaces: Array<{ dir: string; sessions: number; lastModified: string | null }>
  current: string | null
  onPick: (dir: string) => void
}) {
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [path, setPath] = useState('')
  const [hidden, setHidden] = useState<string[]>(() => readList(HIDDEN_KEY))
  const inputRef = useRef<HTMLInputElement>(null)
  useLocale()

  const hide = (dir: string) => {
    const next = [...hidden, dir]
    setHidden(next)
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next))
    } catch {
      // 忽略写入失败
    }
  }
  const restore = () => {
    setHidden([])
    try {
      localStorage.removeItem(HIDDEN_KEY)
    } catch {
      // 忽略
    }
  }

  const visible = workspaces
    .filter((w) => !hidden.includes(w.dir))
    .filter((w) => !query || w.dir.toLowerCase().includes(query.toLowerCase()))
  // 临时目录降权排后,但不隐藏
  const sorted = [...visible].sort((a, b) => Number(isTempPath(a.dir)) - Number(isTempPath(b.dir)))

  if (adding) {
    const absolute = /^[a-zA-Z]:[\\/]/.test(path.trim()) || path.trim().startsWith('\\\\') || path.trim().startsWith('/')
    return (
      <form
        className="p-1"
        onSubmit={(e) => {
          e.preventDefault()
          const dir = path.trim()
          if (!dir || !absolute) return
          if (hidden.includes(dir)) restore()
          onPick(dir)
        }}
      >
        <div className="menu-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('sb.project.add')}</span>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 22, height: 22 }}
            onClick={() => {
              setAdding(false)
              setPath('')
            }}
            aria-label={t('sb.project.back')}
            title={t('sb.project.back')}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <input
          ref={inputRef}
          autoFocus
          className="input"
          style={{ height: 34, fontSize: 12.5 }}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder={t('sb.project.pathHint')}
          aria-label={t('sb.project.path')}
          spellCheck={false}
        />
        <p
          style={{
            padding: '6px 2px 8px',
            fontSize: 11,
            lineHeight: 1.55,
            color: path.trim() && !absolute ? 'var(--color-danger)' : 'var(--color-text-faint)',
          }}
        >
          {path.trim() && !absolute ? t('sb.project.absolute') : t('sb.project.existHint')}
        </p>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setAdding(false)
              setPath('')
            }}
          >
            {t('sb.project.back')}
          </button>
          <button type="submit" className="btn btn-sm btn-primary" disabled={!absolute}>
            {t('sb.project.open')}
          </button>
        </div>
      </form>
    )
  }

  return (
    <>
      <div className="menu-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('sb.project.search')}
          aria-label={t('sb.project.search')}
        />
      </div>
      <div className="menu-label">{t('sb.project.recent')}</div>
      {sorted.length === 0 && (
        <p className="menu-empty">
          {workspaces.length === 0 || hidden.length > 0 ? t('sb.project.none') : t('sb.noMatch')}
        </p>
      )}
      {sorted.map((w) => {
        const active = w.dir === current
        return (
          <div key={w.dir} className={`ws-item ${active ? 'is-active' : ''}`}>
            <button
              type="button"
              onClick={() => onPick(w.dir)}
              className="ws-open"
              role="menuitemradio"
              aria-checked={active}
              title={w.dir}
            >
              <span className="menu-body">
                <strong>
                  {baseName(w.dir)}
                  {isTempPath(w.dir) && (
                    <span className="badge" style={{ marginLeft: 6 }}>
                      {t('sb.project.temp')}
                    </span>
                  )}
                </strong>
                <span className="ws-path">{compactPath(w.dir, 40)}</span>
                <small>{tf('ws.sessions', w.sessions)}</small>
              </span>
              {active && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginTop: 2 }}>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="ws-remove"
              title={t('sb.project.remove')}
              aria-label={`${t('sb.project.remove')}: ${baseName(w.dir)}`}
              onClick={() => hide(w.dir)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        )
      })}
      <div className="menu-pin">
        <MenuItem
          onClick={() => setAdding(true)}
          icon={<IconPlus width={14} height={14} style={{ marginTop: 2, color: 'var(--color-accent)' }} />}
          description={t('sb.project.pathHint')}
        >
          {t('sb.project.add')}
        </MenuItem>
        {hidden.length > 0 && (
          <MenuItem onClick={restore} description={`${hidden.length}`}>
            {t('sb.project.restore')}
          </MenuItem>
        )}
        <p className="menu-foot-note" style={{ padding: '6px 10px 2px' }}>
          {t('sb.project.hidden')}
        </p>
      </div>
    </>
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
      className="session-row"
      style={dragging ? { opacity: 0.45 } : undefined}
      onClick={() => !editing && onOpen()}
    >
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
            if (draft.trim() && draft !== s.title) onRename(draft.trim())
            setEditing(false)
          }}
          className="input"
          style={{ height: 26, fontSize: 12.5, padding: '0 7px' }}
          aria-label={t('sb.rename')}
        />
      ) : (
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="title">{s.title || t('sb.untitled')}</span>
          <span className="meta">
            {running ? (
              <span className="session-running">
                <span className="dot ok live" style={{ marginRight: 5 }} /> {t('dw.statusRunning')}
              </span>
            ) : (
              timeAgo(s.lastModified)
            )}
            {s.gitBranch && <span style={{ marginLeft: 6, fontFamily: 'var(--font-mono)' }}>{s.gitBranch}</span>}
          </span>
        </span>
      )}
      {!editing && (
        <span className="row-actions">
          <button
            className="icon-btn"
            aria-label={t('sb.rename')}
            title={t('sb.rename')}
            onClick={(e) => {
              e.stopPropagation()
              setDraft(s.title)
              setEditing(true)
            }}
          >
            <IconPencil width={12} height={12} />
          </button>
          <button
            className="icon-btn"
            aria-label={t('sb.fork')}
            title={t('sb.fork')}
            onClick={(e) => {
              e.stopPropagation()
              onFork()
            }}
          >
            <IconFork width={12} height={12} />
          </button>
          <button
            className="icon-btn"
            aria-label={t('sb.delete')}
            title={t('sb.delete')}
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm(tf('sb.deleteConfirm', s.title || s.id.slice(0, 8)))) onDelete(s.id)
            }}
          >
            <IconTrash width={12} height={12} />
          </button>
        </span>
      )}
    </div>
  )
}
