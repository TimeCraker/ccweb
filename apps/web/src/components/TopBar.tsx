import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { t, tf, useLocale } from '../i18n'
import { IconChevron, IconGear, IconPencil, IconPlus, IconSun, IconMoon, SectionIcon } from './Icon'
import { Menu, MenuItem } from './ui/Menu'
import { cycleTheme, useThemeMode } from '../theme'
import { baseName } from '../lib/path'

interface Props {
  onOpenSettings: () => void
  onNewSession: () => void
  onRename: (id: string, title: string) => void
  onExport: () => void
  onOpenChanges: () => void
  onOpenDetails: () => void
  onOpenNav?: () => void
  changeCount: number
  sidebarCollapsed?: boolean
  onExpandSidebar?: () => void
}

export default function TopBar({
  onOpenSettings,
  onNewSession,
  onRename,
  onExport,
  onOpenChanges,
  onOpenDetails,
  onOpenNav,
  changeCount,
  sidebarCollapsed,
  onExpandSidebar,
}: Props) {
  const sessionId = useStore((s) => s.sessionId)
  const session = useStore((s) => s.sessions.find((item) => item.id === s.sessionId))
  const workspace = useStore((s) => s.settings?.workspace)
  const firstPrompt = useStore((s) => s.entries.find((entry) => entry.type === 'user'))
  const effectiveSessionTitle =
    session?.title && session.title !== t('sb.untitled') && session.title !== '(无标题)'
      ? session.title
      : undefined
  const fallbackPromptTitle =
    firstPrompt?.type === 'user'
      ? firstPrompt.text.replace(/^[\s#*>`-]+/, '').split(/[\r\n。！？!?]/)[0]?.trim()?.slice(0, 40)
      : undefined
  const title =
    effectiveSessionTitle ??
    fallbackPromptTitle ??
    (sessionId ? t('sb.untitled') : t('hd.newSession'))
  const { mode } = useThemeMode()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)
  useLocale()

  useEffect(() => {
    if (!editing) setDraft(title)
  }, [title, editing])

  // 自动萃取持久化:当会话为 (无标题) 但已有首句提问时，自动通知后端固化标题
  useEffect(() => {
    if (sessionId && !effectiveSessionTitle && fallbackPromptTitle) {
      onRename(sessionId, fallbackPromptTitle)
    }
  }, [sessionId, effectiveSessionTitle, fallbackPromptTitle, onRename])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commitRename = () => {
    const next = draft.trim()
    if (sessionId && next && next !== title) onRename(sessionId, next)
    setEditing(false)
  }

  return (
    <header className="header">
      {sidebarCollapsed && onExpandSidebar && (
        <button
          className="icon-btn sidebar-expand"
          onClick={onExpandSidebar}
          aria-label={t('sb.expand')}
          title={t('sb.expand')}
        >
          <SectionIcon name="panel" width={17} height={17} />
        </button>
      )}
      {onOpenNav && (
        <button className="icon-btn nav-toggle" onClick={onOpenNav} aria-label={t('sb.expand')} title={t('sb.expand')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
      )}
      <div className="header-title">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') {
                setDraft(title)
                setEditing(false)
              }
            }}
            className="header-title-input"
            aria-label={t('hd.rename')}
          />
        ) : (
          <div
            className="header-title-text-wrap"
            onDoubleClick={() => {
              if (sessionId) {
                setDraft(title)
                setEditing(true)
              }
            }}
            title={sessionId ? '双击修改会话标题' : title}
          >
            <h1 title={title}>{title}</h1>
            {sessionId && (
              <button
                type="button"
                className="header-title-edit-btn"
                onClick={() => {
                  setDraft(title)
                  setEditing(true)
                }}
                title="修改会话标题"
                aria-label="修改会话标题"
              >
                <IconPencil width={11} height={11} />
              </button>
            )}
          </div>
        )}
        {workspace && (
          <span className="header-project" title={workspace}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5Z" />
            </svg>
            {baseName(workspace)}
          </span>
        )}
      </div>

      <div className="header-actions">
        <button
          className="icon-btn"
          onClick={cycleTheme}
          title={`${t('hd.theme')} · ${mode === 'dark' ? t('hd.themeDark') : mode === 'light' ? t('hd.themeLight') : t('hd.themeSystem')}`}
          aria-label={t('hd.theme')}
        >
          {mode === 'dark' ? <IconMoon width={16} height={16} /> : mode === 'light' ? <IconSun width={16} height={16} /> : <IconContrast />}
        </button>
        <Menu
          label={t('hd.menu')}
          align="end"
          width={248}
          trigger={({ open }) => (
            <button className="icon-btn" aria-expanded={open} aria-label={t('hd.more')} title={t('hd.more')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.7" />
                <circle cx="12" cy="12" r="1.7" />
                <circle cx="19" cy="12" r="1.7" />
              </svg>
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem
                icon={<IconPlus width={14} height={14} style={{ marginTop: 2 }} />}
                onClick={() => {
                  close()
                  onNewSession()
                }}
              >
                {t('hd.newSession')}
              </MenuItem>
              {sessionId && (
                <MenuItem
                  icon={<IconPencil width={14} height={14} style={{ marginTop: 2 }} />}
                  onClick={() => {
                    close()
                    setDraft(title)
                    setEditing(true)
                  }}
                >
                  {t('hd.rename')}
                </MenuItem>
              )}
              <MenuItem onClick={() => { close(); onExport() }}>{t('hd.export')}</MenuItem>
              <div className="menu-sep" />
              {changeCount > 0 && (
                <MenuItem
                  onClick={() => {
                    close()
                    onOpenChanges()
                  }}
                  description={tf('dw.fileCount', changeCount)}
                  aside={<IconChevron width={13} height={13} style={{ transform: 'rotate(-90deg)' }} />}
                >
                  {t('hd.changes')}
                </MenuItem>
              )}
              <MenuItem
                onClick={() => {
                  close()
                  onOpenDetails()
                }}
                aside={<IconChevron width={13} height={13} style={{ transform: 'rotate(-90deg)' }} />}
              >
                {t('hd.details')}
              </MenuItem>
              <div className="menu-sep" />
              <MenuItem
                icon={<IconGear width={14} height={14} style={{ marginTop: 2 }} />}
                onClick={() => {
                  close()
                  onOpenSettings()
                }}
                aside={<kbd className="menu-kbd" aria-hidden="true">Ctrl ,</kbd>}
              >
                {t('sb.settings')}
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </header>
  )
}

function IconContrast() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

