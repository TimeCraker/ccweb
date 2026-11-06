import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale, toggleLocale } from '../i18n'
import { cycleTheme, useThemeMode } from '../theme'
import { baseName } from '../lib/path'

interface Cmd {
  id: string
  label: string
  hint?: string
  group: 'commands' | 'workspaces' | 'sessions'
  run: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  onNewSession: () => void
  onOpenSettings: () => void
  onOpenSession: (id: string) => void
  onSetWorkspace: (dir: string) => void
  onToggleSidebar?: () => void
  onExportSession?: () => void
  onOpenDrawer?: (tab: 'changes' | 'files' | 'plan' | 'details') => void
  onExecuteAction?: (action: 'clear' | 'plan' | 'compact' | 'cost') => void
}

const EMPTY_WORKSPACES: Array<{ dir: string; sessions: number; lastModified: string | null }> = []

/** 命令面板(Ctrl+K):动作 + 项目 + 会话跳转,全键盘操作 */
export default function CommandPalette({
  open,
  onClose,
  onNewSession,
  onOpenSettings,
  onOpenSession,
  onSetWorkspace,
  onToggleSidebar,
  onExportSession,
  onOpenDrawer,
  onExecuteAction,
}: Props) {
  const sessions = useStore((s) => s.sessions)
  const settings = useStore((s) => s.settings)
  const workspaces = settings?.workspaces ?? EMPTY_WORKSPACES
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const locale = useLocale()
  const { mode } = useThemeMode()

  useEffect(() => {
    const element = listRef.current?.querySelectorAll<HTMLElement>('.palette-item')[selected] ?? null
    element?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(0)
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  const items = useMemo<Cmd[]>(() => {
    const tr = (key: Parameters<typeof t>[0]): string => t(key, locale) as string
    const commands: Cmd[] = [
      { id: 'new', label: tr('palette.cmd.newSession'), hint: 'Ctrl N', group: 'commands', run: onNewSession },
      { id: 'settings', label: tr('palette.cmd.settings'), hint: 'Ctrl ,', group: 'commands', run: onOpenSettings },
      {
        id: 'toggleSidebar',
        label: '折叠 / 展开侧边栏',
        hint: 'Ctrl B',
        group: 'commands',
        run: () => onToggleSidebar?.(),
      },
      {
        id: 'drawer-changes',
        label: '打开伴侣抽屉: 代码改动审查 (Changes Diff)',
        hint: 'Ctrl J',
        group: 'commands',
        run: () => onOpenDrawer?.('changes'),
      },
      {
        id: 'drawer-files',
        label: '打开伴侣抽屉: 工作区文件树 (Files Tree)',
        hint: 'Files',
        group: 'commands',
        run: () => onOpenDrawer?.('files'),
      },
      {
        id: 'drawer-plan',
        label: '打开伴侣抽屉: 实施计划跟踪 (Plan Outline)',
        hint: 'Plan',
        group: 'commands',
        run: () => onOpenDrawer?.('plan'),
      },
      {
        id: 'drawer-details',
        label: '打开伴侣抽屉: 任务与运行详情 (Tasks & Details)',
        hint: 'Tasks',
        group: 'commands',
        run: () => onOpenDrawer?.('details'),
      },
      {
        id: 'cmd-clear',
        label: '清空当前对话屏幕 (/clear)',
        hint: '/clear',
        group: 'commands',
        run: () => onExecuteAction?.('clear'),
      },
      {
        id: 'cmd-plan',
        label: '制定工程实施计划 (/plan)',
        hint: '/plan',
        group: 'commands',
        run: () => onExecuteAction?.('plan'),
      },
      {
        id: 'cmd-compact',
        label: '精简会话上下文 (/compact)',
        hint: '/compact',
        group: 'commands',
        run: () => onExecuteAction?.('compact'),
      },
      {
        id: 'cmd-cost',
        label: '查看 Token 消耗与成本 (/cost)',
        hint: '/cost',
        group: 'commands',
        run: () => onExecuteAction?.('cost'),
      },
      {
        id: 'exportMd',
        label: '导出当前会话为 Markdown',
        group: 'commands',
        run: () => onExportSession?.(),
      },
      {
        id: 'theme',
        label: `${tr('hd.theme')} · ${mode === 'dark' ? tr('hd.themeDark') : mode === 'light' ? tr('hd.themeLight') : tr('hd.themeSystem')}`,
        group: 'commands',
        run: cycleTheme,
      },
      { id: 'lang', label: tr('palette.cmd.lang'), group: 'commands', run: toggleLocale },
    ]
    const projectItems: Cmd[] = workspaces.slice(0, 12).map((workspace) => ({
      id: `w:${workspace.dir}`,
      label: baseName(workspace.dir),
      hint: workspace.dir,
      group: 'workspaces',
      run: () => onSetWorkspace(workspace.dir),
    }))
    const sessionItems: Cmd[] = sessions.slice(0, 20).map((session) => ({
      id: `s:${session.id}`,
      label: session.title || '(无标题)',
      hint: session.gitBranch ?? undefined,
      group: 'sessions',
      run: () => onOpenSession(session.id),
    }))
    const all = [...commands, ...projectItems, ...sessionItems]
    if (!query) return all
    const needle = query.toLowerCase()
    return all.filter((item) => item.label.toLowerCase().includes(needle) || (item.hint ?? '').toLowerCase().includes(needle))
  }, [query, locale, sessions, workspaces, onNewSession, onOpenSettings, onOpenSession, onSetWorkspace, mode, onToggleSidebar, onExportSession, onOpenDrawer, onExecuteAction])

  if (!open) return null

  const exec = (command: Cmd | undefined) => {
    if (!command) return
    command.run()
    onClose()
  }

  return (
    <div
      className="palette-overlay"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        const native = event.nativeEvent as KeyboardEvent & { isComposing?: boolean }
        if (native.isComposing || native.keyCode === 229) return
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="命令面板" className="palette">
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelected(0)
          }}
          onKeyDown={(event) => {
            const native = event.nativeEvent as KeyboardEvent & { isComposing?: boolean }
            if (native.isComposing || native.keyCode === 229) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setSelected((value) => Math.min(value + 1, items.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setSelected((value) => Math.max(value - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              exec(items[selected])
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          }}
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.placeholder')}
        />
        <div className="palette-list" ref={listRef}>
          {items.length === 0 && <p className="palette-empty">{t('palette.empty')}</p>}
          {items.map((command, index) => {
            const previous = items[index - 1]
            const showGroup = !previous || previous.group !== command.group
            const groupLabel =
              command.group === 'sessions'
                ? t('palette.sessions')
                : command.group === 'workspaces'
                  ? t('palette.workspaces')
                  : t('palette.commands')
            return (
              <div key={command.id}>
                {showGroup && <p className="palette-group">{groupLabel}</p>}
                <button
                  className="palette-item"
                  data-active={index === selected}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => exec(command)}
                >
                  <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {command.label}
                  </span>
                  {command.hint && (
                    <span
                      style={{
                        marginLeft: 10,
                        flex: '0 0 auto',
                        maxWidth: 220,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: command.group === 'workspaces' ? 'var(--font-mono)' : undefined,
                        fontSize: command.group === 'workspaces' ? 10.5 : 11,
                        color: 'var(--color-text-faint)',
                      }}
                    >
                      {command.hint}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
