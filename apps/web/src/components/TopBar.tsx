import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { t, tf, useLocale } from '../i18n'
import { SectionIcon, IconChevron } from './Icon'
interface Props {
  onOpenSettings: () => void
  onPatch: (patch: Record<string, unknown>) => void
  onSetWorkspace: (dir: string) => void
  onToggleDetails?: () => void
  onNative?: () => void
  onReview?: () => void
}
export default function TopBar({ onToggleDetails, onReview, onNative }: Props) {
  const sessionId = useStore(s => s.sessionId)
  const session = useStore(s => s.sessions.find(item => item.id === s.sessionId))
  const firstPrompt = useStore(s => s.entries.find(entry => entry.type === "user"))
  const title = session?.title ?? (firstPrompt?.type === "user" ? firstPrompt.text.split("\n")[0]!.slice(0, 80) : undefined) ?? (sessionId ? '当前会话' : '新会话')
  return <header className="workbench-header"><div className="conversation-heading"><h1>{title}</h1>{session?.gitBranch && <span className="branch-label"><IconForkSmall />{session.gitBranch}</span>}</div><div className="header-actions"><button onClick={onNative}>原生终端</button><button onClick={onReview}>改动与检查</button><button onClick={onToggleDetails}><SectionIcon name="panel" width={17} height={17} />运行详情</button><kbd><span>⌕</span> Ctrl K</kbd></div></header>
}
function IconForkSmall() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m0-6c7 0 12 0 12-3"/></svg> }
/** 工作区选择:胶囊 + 下拉(启动目录 + 全部历史项目) */
export function WorkspacePicker({
  workspaces,
  current,
  onPick,
}: {
  workspaces: Array<{ dir: string; sessions: number; lastModified: string | null }>
  current: string | null
  onPick: (dir: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [directory, setDirectory] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useLocale()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const label = current ? baseName(current) : t('ws.title')

  return (
    <div className="relative" ref={ref}>
      <button className={`pill ${open ? 'active' : ''}`} onClick={() => setOpen((v) => !v)} title={current ?? ''}>
        <span className="max-w-40 truncate">{label}</span>
        <IconChevron width={12} height={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="animate-pop-in absolute left-0 top-9 z-30 max-h-80 w-72 overflow-y-auto rounded-lg border border-border-strong bg-panel p-1 shadow-xl">
          {!current && (
            <div className="rounded-md bg-panel-2 px-2.5 py-1.5 text-xs text-accent">{t('palette.launchDir')}</div>
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
                {w.dir} · {tf('ws.sessions', w.sessions)}
              </span>
            </button>
          ))}
          <form className="workspace-entry" onSubmit={e => { e.preventDefault(); if (directory.trim()) { onPick(directory.trim()); setOpen(false) } }}><label>工作区目录<input aria-label="工作区目录" value={directory} onChange={e => setDirectory(e.target.value)} placeholder="输入现有目录的绝对路径" /></label><button type="submit" disabled={!directory.trim()}>打开目录</button></form>
          {workspaces.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-text-faint">{t('ws.none')}</p>
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
