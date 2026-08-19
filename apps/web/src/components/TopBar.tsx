import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { BrandMark, IconGear, IconMoon, IconSun, IconChevron, IconGauge, IconSparkle } from './Icon'
import { toggleTheme, useTheme } from '../theme'

interface Props {
  onOpenSettings: () => void
  onPatch: (patch: Record<string, unknown>) => void
  onSetWorkspace: (dir: string) => void
}

const MODELS = ['auto', 'opus', 'sonnet', 'haiku', 'inherit']
const PERMISSIONS = ['default', 'acceptEdits', 'plan', 'bypassPermissions']

/** 顶栏:品牌 + 工作区切换(dsh 语义)· 模型/权限一键切换 */
export default function TopBar({ onOpenSettings, onPatch, onSetWorkspace }: Props) {
  const theme = useTheme()
  const model = useStore((s) => s.model ?? s.settings?.model ?? s.settings?.currentModel)
  const permissionMode = useStore((s) => s.settings?.permissionMode ?? 'default')
  const settings = useStore((s) => s.settings)

  const modelLabel = model ?? 'auto'

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
      <div className="flex items-center gap-2.5">
        <BrandMark size={22} uid="top" />
        <span className="text-sm font-semibold tracking-tight">ccweb</span>
      </div>
      <div className="mx-1 h-4 w-px bg-border" />

      {/* 工作区切换(dsh 对齐):默认启动目录,可换任意历史项目 */}
      <WorkspacePicker
        workspaces={settings?.workspaces ?? []}
        current={settings?.workspace ?? null}
        onPick={onSetWorkspace}
      />

      <p
        className="min-w-0 flex-1 truncate text-xs text-text-faint"
        title={settings?.currentEndpoint ?? ''}
      >
        {settings?.currentEndpoint ? hostOf(settings.currentEndpoint) : ''}
      </p>

      <div className="flex items-center gap-2">
        <Dropdown
          icon={<IconSparkle width={13} height={13} />}
          value={modelLabel}
          options={[...new Set([modelLabel, ...MODELS])]}
          onSelect={(m) => onPatch({ model: m })}
        />
        <Dropdown
          icon={<IconGauge width={13} height={13} />}
          value={permissionMode ?? 'default'}
          options={PERMISSIONS}
          onSelect={(p) => onPatch({ permissionMode: p })}
        />
        <button
          className="icon-btn"
          aria-label="toggle theme"
          onClick={toggleTheme}
          title={theme === 'dark' ? '浅色模式' : '深色模式'}
        >
          {theme === 'dark' ? <IconSun width={15} height={15} /> : <IconMoon width={15} height={15} />}
        </button>
        <button className="icon-btn" aria-label="settings" onClick={onOpenSettings} title="设置 (Ctrl+,)">
          <IconGear width={15} height={15} />
        </button>
      </div>
    </header>
  )
}

/** 工作区选择:胶囊 + 下拉(启动目录 + 全部历史项目) */
function WorkspacePicker({
  workspaces,
  current,
  onPick,
}: {
  workspaces: Array<{ dir: string; sessions: number; lastModified: string | null }>
  current: string | null
  onPick: (dir: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const label = current ? baseName(current) : '启动目录'

  return (
    <div className="relative" ref={ref}>
      <button className={`pill ${open ? 'active' : ''}`} onClick={() => setOpen((v) => !v)} title={current ?? ''}>
        <span className="max-w-40 truncate">{label}</span>
        <IconChevron width={12} height={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="animate-pop-in absolute left-0 top-9 z-30 max-h-80 w-72 overflow-y-auto rounded-lg border border-border-strong bg-panel p-1 shadow-xl">
          {!current && (
            <div className="rounded-md bg-panel-2 px-2.5 py-1.5 text-xs text-accent">启动目录(当前)</div>
          )}
          {workspaces.map((w) => (
            <button
              key={w.dir}
              onClick={() => {
                onPick(w.dir)
                setOpen(false)
              }}
              className={`flex w-full flex-col rounded-md px-2.5 py-1.5 text-left ${
                w.dir === current ? 'bg-panel-2' : 'hover:bg-panel-2/60'
              }`}
            >
              <span className={`truncate text-xs ${w.dir === current ? 'text-accent' : 'text-text-dim'}`}>
                {baseName(w.dir)}
              </span>
              <span className="truncate font-mono text-[10px] text-text-faint" title={w.dir}>
                {w.dir} · {w.sessions} 会话
              </span>
            </button>
          ))}
          {workspaces.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-text-faint">暂无历史工作区</p>
          )}
        </div>
      )}
    </div>
  )
}

function baseName(dir: string): string {
  const parts = dir.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? dir
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** 胶囊下拉:点击展开小浮层,点外关闭 */
function Dropdown({
  icon,
  value,
  options,
  onSelect,
}: {
  icon: React.ReactNode
  value: string
  options: string[]
  onSelect: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button className={`pill ${open ? 'active' : ''}`} onClick={() => setOpen((v) => !v)}>
        {icon}
        <span className="max-w-32 truncate font-mono text-[11px]">{value}</span>
        <IconChevron width={12} height={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="animate-pop-in absolute right-0 top-9 z-30 min-w-36 overflow-hidden rounded-lg border border-border-strong bg-panel p-1 shadow-xl">
          {options.map((o) => (
            <button
              key={o}
              onClick={() => {
                onSelect(o)
                setOpen(false)
              }}
              className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-left font-mono text-xs ${
                o === value ? 'bg-panel-2 text-accent' : 'text-text-dim hover:text-text'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
