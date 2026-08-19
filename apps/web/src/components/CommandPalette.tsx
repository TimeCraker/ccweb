import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale, toggleLocale } from '../i18n'
import { toggleTheme } from '../theme'

interface Cmd {
  id: string
  label: string
  hint?: string
  run: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  onNewSession: () => void
  onOpenSettings: () => void
  onOpenSession: (id: string) => void
  onSetWorkspace: (dir: string) => void
}

const EMPTY_WORKSPACES: Array<{ dir: string; sessions: number; lastModified: string | null }> = []

/** 命令面板(Ctrl+K):动作 + 工作区 + 会话跳转,全键盘操作 */
export default function CommandPalette({
  open,
  onClose,
  onNewSession,
  onOpenSettings,
  onOpenSession,
  onSetWorkspace,
}: Props) {
  const sessions = useStore((s) => s.sessions)
  // 注意:zustand selector 必须返回稳定引用;派生默认值放 selector 外(否则 React #185)
  const settings = useStore((s) => s.settings)
  const workspaces = settings?.workspaces ?? EMPTY_WORKSPACES
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useLocale()

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const items = useMemo<Cmd[]>(() => {
    const cmds: Cmd[] = [
      { id: 'new', label: t('palette.cmd.newSession'), hint: '⌘N', run: onNewSession },
      { id: 'settings', label: t('palette.cmd.settings'), hint: '⌘,', run: onOpenSettings },
      { id: 'theme', label: t('palette.cmd.theme'), run: toggleTheme },
      { id: 'lang', label: t('palette.cmd.lang'), run: toggleLocale },
    ]
    const wsList: Cmd[] = workspaces.slice(0, 10).map((w) => {
      const parts = w.dir.split(/[\\/]/).filter(Boolean)
      return {
        id: `w:${w.dir}`,
        label: `切换工作区:${parts[parts.length - 1] ?? w.dir}`,
        hint: 'workspace',
        run: () => onSetWorkspace(w.dir),
      }
    })
    const sess: Cmd[] = sessions.slice(0, 20).map((s) => ({
      id: `s:${s.id}`,
      label: s.title || '(no title)',
      hint: 'session',
      run: () => onOpenSession(s.id),
    }))
    const all = [...cmds, ...wsList, ...sess]
    if (!q) return all
    const needle = q.toLowerCase()
    return all.filter((c) => c.label.toLowerCase().includes(needle))
  }, [q, sessions, workspaces, onNewSession, onOpenSettings, onOpenSession, onSetWorkspace])

  if (!open) return null

  const exec = (c: Cmd | undefined) => {
    if (!c) return
    c.run()
    onClose()
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="command palette"
        className="animate-pop-in w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-border-strong bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setSel(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(s + 1, items.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(s - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              exec(items[sel])
            } else if (e.key === 'Escape') {
              onClose()
            }
          }}
          placeholder={t('palette.placeholder')}
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-text-faint"
        />
        <div className="max-h-72 overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-text-faint">{t('palette.empty')}</p>
          )}
          {items.map((c, i) => {
            const prev = items[i - 1]
            const kind = c.id.startsWith('s:') ? 's' : c.id.startsWith('w:') ? 'w' : 'c'
            const prevKind = prev ? (prev.id.startsWith('s:') ? 's' : prev.id.startsWith('w:') ? 'w' : 'c') : ''
            const showGroup = kind !== prevKind
            const groupLabel = kind === 's' ? t('palette.sessions') : kind === 'w' ? '工作区' : t('palette.commands')
            return (
              <div key={c.id}>
                {showGroup && (
                  <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-text-faint">
                    {groupLabel}
                  </p>
                )}
                <button
                  onClick={() => exec(c)}
                  onMouseEnter={() => setSel(i)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                    i === sel ? 'bg-panel-2 text-text' : 'text-text-dim'
                  }`}
                >
                  <span className="truncate">{c.label}</span>
                  {c.hint && <span className="ml-2 shrink-0 font-mono text-[10px] text-text-faint">{c.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
