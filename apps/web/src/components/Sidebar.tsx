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
  IconFolder,
  IconFolderPlus,
  IconSliders,
  IconX,
} from './Icon'
import { Menu, MenuItem } from './ui/Menu'
import { baseName, compactPath } from '../lib/path'

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
const PINNED_KEY = 'ccweb.pinnedWorkspaces'

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

  const VIEW_MODE_KEY = 'ccweb.sidebarViewMode'
  const [viewMode, setViewMode] = useState<'workspace' | 'flat'>(() => {
    try {
      return (localStorage.getItem(VIEW_MODE_KEY) as 'workspace' | 'flat') || 'workspace'
    } catch {
      return 'workspace'
    }
  })
  const persistViewMode = (mode: 'workspace' | 'flat') => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {
      // ignore
    }
  }

  const [searchOpen, setSearchOpen] = useState(false)
  const [addDrawerOpen, setAddDrawerOpen] = useState(false)
  const currentWorkspace = settings?.workspace ?? null
  const [expandedWs, setExpandedWs] = useState<string[]>(() => (currentWorkspace ? [currentWorkspace] : []))

  useEffect(() => {
    if (currentWorkspace && !expandedWs.includes(currentWorkspace)) {
      setExpandedWs((prev) => [...prev, currentWorkspace])
    }
  }, [currentWorkspace])

  const toggleExpandWs = (dir: string) => {
    setExpandedWs((prev) => (prev.includes(dir) ? prev.filter((d) => d !== dir) : [...prev, dir]))
  }

  const workspaces = settings?.workspaces ?? []
  const [hiddenWs, setHiddenWs] = useState<string[]>(() => readList(HIDDEN_KEY))
  const [pinnedWs] = useState<string[]>(() => readList(PINNED_KEY))
  const visibleWorkspaces = workspaces
    .filter((w) => !hiddenWs.includes(w.dir))
    .sort(
      (a, b) =>
        Number(pinnedWs.includes(b.dir)) - Number(pinnedWs.includes(a.dir)) ||
        (a.dir === currentWorkspace ? -1 : b.dir === currentWorkspace ? 1 : 0),
    )

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

      {/* 工作区标题与动作区 (对标 DeepSeek Harness 架构) */}
      <div className="ws-section-header">
        <div className="ws-section-title-wrap">
          <span className="ws-section-title">工作区</span>
          <span className="ws-section-count">{visibleWorkspaces.length}</span>
        </div>
        <div className="ws-section-actions">
          <button
            type="button"
            className={`ws-icon-btn ${searchOpen ? 'is-active' : ''}`}
            onClick={() => setSearchOpen((v) => !v)}
            title="搜索会话"
            aria-label="搜索会话"
          >
            <IconSearch width={13} height={13} />
          </button>
          <Menu
            label="视图模式"
            width={160}
            trigger={({ open }) => (
              <button
                type="button"
                className={`ws-icon-btn ${open ? 'is-active' : ''}`}
                title="视图与分组模式"
                aria-label="视图模式"
              >
                <IconSliders width={13} height={13} />
              </button>
            )}
          >
            {(close) => (
              <div className="p-1">
                <div className="menu-label">分组方式</div>
                <MenuItem
                  selected={viewMode === 'workspace'}
                  onClick={() => {
                    persistViewMode('workspace')
                    close()
                  }}
                >
                  按工作区
                </MenuItem>
                <MenuItem
                  selected={viewMode === 'flat'}
                  onClick={() => {
                    persistViewMode('flat')
                    close()
                  }}
                >
                  单列表
                </MenuItem>
              </div>
            )}
          </Menu>
          <button
            type="button"
            className={`ws-icon-btn ${addDrawerOpen ? 'is-active' : ''}`}
            onClick={() => setAddDrawerOpen((v) => !v)}
            title="打开新项目 / 添加工作区"
            aria-label="打开新项目"
          >
            <IconFolderPlus width={14} height={14} />
          </button>
        </div>
      </div>

      {/* 搜索展开框 (对标 DeepSeek Harness 截图 5) */}
      {searchOpen && (
        <div className="sidebar-search animate-slide-down">
          <IconSearch width={13} height={13} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话名称..."
            aria-label={t('sb.search')}
          />
          {query && (
            <button
              type="button"
              className="icon-btn search-clear-btn"
              onClick={() => setQuery('')}
              title="清空搜索"
            >
              <IconX width={11} height={11} />
            </button>
          )}
        </div>
      )}

      {/* 极速添加工作区抽屉 (彻底解决弹窗卡死与打不开问题) */}
      {addDrawerOpen && (
        <WorkspaceAddDrawer
          onPick={(dir) => {
            if (hiddenWs.includes(dir)) {
              const next = hiddenWs.filter((d) => d !== dir)
              setHiddenWs(next)
              try {
                localStorage.setItem(HIDDEN_KEY, JSON.stringify(next))
              } catch {
                // ignore
              }
            }
            onSetWorkspace(dir)
            setAddDrawerOpen(false)
          }}
          onClose={() => setAddDrawerOpen(false)}
        />
      )}

      <div
        className="session-list"
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(e) => e.preventDefault()}
      >
        {viewMode === 'workspace' ? (
          /* 按工作区分组的树形视图 (对标 DeepSeek Harness 截图 2) */
          <div className="ws-tree-container">
            {visibleWorkspaces.map((w) => {
              const isActive = w.dir === currentWorkspace
              const isExpanded = expandedWs.includes(w.dir)
              return (
                <div key={w.dir} className={`ws-tree-node ${isActive ? 'is-active' : ''}`}>
                  <div
                    className="ws-tree-header"
                    onClick={() => {
                      if (!isActive) onSetWorkspace(w.dir)
                      toggleExpandWs(w.dir)
                    }}
                  >
                    <button
                      type="button"
                      className="ws-tree-chevron-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleExpandWs(w.dir)
                      }}
                      title={isExpanded ? '折叠' : '展开'}
                    >
                      <IconChevron
                        width={12}
                        height={12}
                        className={`chev ${isExpanded ? 'is-open' : ''}`}
                      />
                    </button>
                    <span className="ws-tree-glyph">
                      <IconFolder width={14} height={14} />
                    </span>
                    <span className="ws-tree-name" title={w.dir}>
                      {baseName(w.dir)}
                    </span>
                    {isActive && <span className="ws-tree-active-pill">当前</span>}
                    <span className="ws-tree-count">{w.sessions}</span>
                  </div>

                  {/* 展开的会话子树 */}
                  {isExpanded && isActive && (
                    <div className="ws-tree-children animate-slide-down">
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
                      {filtered.length === 0 && (
                        <p className="menu-empty" style={{ padding: '10px 14px', fontSize: 11.5 }}>
                          {query ? t('sb.noMatch') : '暂无会话，点击上方新建'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {visibleWorkspaces.length === 0 && (
              <p className="menu-empty" style={{ padding: '22px 10px' }}>
                暂无工作区，点击右上角「+」添加
              </p>
            )}
          </div>
        ) : (
          /* 单列表视图 */
          <>
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
          </>
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

function WorkspaceAddDrawer({
  onPick,
  onClose,
}: {
  onPick: (dir: string) => void
  onClose: () => void
}) {
  const [discovered, setDiscovered] = useState<Array<{ name: string; path: string; isGit: boolean }>>([])
  const [picking, setPicking] = useState(false)
  const [manualPath, setManualPath] = useState('')
  const [pickError, setPickError] = useState<string | null>(null)
  const abortCtrlRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/workspaces/discover')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { discovered?: Array<{ name: string; path: string; isGit: boolean }> } | null) => {
        if (data?.discovered) setDiscovered(data.discovered)
      })
      .catch(() => {})
  }, [])

  const cancelPick = () => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort()
      abortCtrlRef.current = null
    }
    setPicking(false)
  }

  // 优先调起浏览器原生 showDirectoryPicker (Chromium 原生，100% 弹窗成功置顶且不卡死)
  const pickFolder = async () => {
    setPicking(true)
    setPickError(null)

    // 1. 如果浏览器支持 showDirectoryPicker，直接在前端唤起系统窗口！
    if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
      try {
        const handle = await (
          window as unknown as { showDirectoryPicker: () => Promise<{ name: string }> }
        ).showDirectoryPicker()
        if (handle?.name) {
          // 在已发现的项目或已知项目中匹配
          const matched = discovered.find(
            (d) => d.name.toLowerCase() === handle.name.toLowerCase(),
          )
          if (matched) {
            onPick(matched.path)
            onClose()
            return
          }
          // 如果不在同级发现列表中，自动填入名称引导确认
          setManualPath(handle.name)
        }
      } catch (e: unknown) {
        if ((e as Error)?.name === 'AbortError') {
          // 用户主动关闭了浏览器原生对话框
          setPicking(false)
          return
        }
      }
    }

    // 2. 协同后端服务原生选择器
    const ctrl = new AbortController()
    abortCtrlRef.current = ctrl
    try {
      const res = await fetch('/api/dialog/pick-folder', { method: 'POST', signal: ctrl.signal })
      const data = (await res.json()) as { path: string | null }
      if (data?.path) {
        onPick(data.path)
        onClose()
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        setPickError('未能打开系统选择器，请直接点击下方候选项目或输入路径')
      }
    } finally {
      setPicking(false)
      abortCtrlRef.current = null
    }
  }

  const isAbsolute =
    /^[a-zA-Z]:[\\/]/.test(manualPath.trim()) ||
    manualPath.trim().startsWith('\\\\') ||
    manualPath.trim().startsWith('/')

  return (
    <div className="ws-add-drawer animate-slide-down">
      <div className="ws-add-drawer-header">
        <span className="ws-add-title">打开新项目</span>
        <button type="button" className="icon-btn" onClick={onClose} title="关闭">
          <IconX width={12} height={12} />
        </button>
      </div>

      <button
        type="button"
        className={`ws-pick-card ${picking ? 'is-picking' : ''}`}
        onClick={picking ? cancelPick : pickFolder}
      >
        <div className="ws-pick-icon">
          {picking ? <span className="ws-spinner" /> : <IconFolder width={17} height={17} />}
        </div>
        <div className="ws-pick-text">
          <div className="ws-pick-title">{picking ? '正在等待选择目录…' : '打开本地文件夹…'}</div>
          <div className="ws-pick-desc">{picking ? '点击可取消当前等待' : '调起系统文件窗口选定项目目录'}</div>
        </div>
        <div className="ws-pick-action">
          {picking ? (
            <span style={{ fontSize: 11, color: 'var(--color-accent)' }}>取消</span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>浏览 →</span>
          )}
        </div>
      </button>

      {pickError && <div className="ws-pick-error">{pickError}</div>}

      {discovered.length > 0 && (
        <div className="ws-discover-section">
          <div className="ws-discover-header">
            <span>本地已检测到的项目</span>
            <span className="ws-discover-tag">{discovered.length}</span>
          </div>
          <div className="ws-discover-list">
            {discovered.map((d) => (
              <button
                key={d.path}
                type="button"
                className="ws-discover-item"
                onClick={() => {
                  onPick(d.path)
                  onClose()
                }}
                title={d.path}
              >
                <span className="ws-discover-name">{d.name}</span>
                {d.isGit && <span className="badge-git">git</span>}
                <span className="ws-discover-path">{compactPath(d.path, 28)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ws-manual-input-row">
        <input
          className="input ws-manual-input"
          placeholder="输入目录绝对路径，如 C:\Projects\app"
          value={manualPath}
          onChange={(e) => setManualPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isAbsolute) {
              e.preventDefault()
              onPick(manualPath.trim())
              onClose()
            }
          }}
        />
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!isAbsolute}
          onClick={() => {
            if (isAbsolute) {
              onPick(manualPath.trim())
              onClose()
            }
          }}
        >
          打开
        </button>
      </div>
    </div>
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
