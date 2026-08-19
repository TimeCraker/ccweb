import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { IconSend, IconStop } from './Icon'

interface Props {
  onSend: (text: string) => void
  onInterrupt: () => void
  /** hero 模式:空态居中大输入框 */
  hero?: boolean
}

export default function Composer({ onSend, onInterrupt, hero = false }: Props) {
  const [text, setText] = useState('')
  const [slashSel, setSlashSel] = useState(0)
  const busy = useStore((s) => s.busy)
  const slashCommands = useStore((s) => s.slashCommands)
  const taRef = useRef<HTMLTextAreaElement>(null)

  /** 斜杠命令补全:输入以 / 开头(且仅首词)时弹出过滤列表 */
  const slashMatches = useMemo(() => {
    if (!text.startsWith('/') || text.includes('\n')) return []
    const word = text.slice(1)
    return slashCommands
      .filter((c) => c.name.toLowerCase().includes(word.toLowerCase()))
      .slice(0, 8)
  }, [text, slashCommands])

  const submit = () => {
    const t = text.trim()
    if (!t || busy) return
    onSend(t)
    setText('')
  }

  const pickSlash = (name: string) => {
    setText(`/${name} `)
    setSlashSel(0)
    taRef.current?.focus()
  }

  return (
    <div className={hero ? 'relative w-full' : 'relative border-t border-border bg-panel px-6 py-4'}>
      <div className={hero ? '' : 'mx-auto max-w-3xl'}>
        {slashMatches.length > 0 && (
          <div className="animate-pop-in absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-border-strong bg-panel p-1.5 shadow-2xl">
            {slashMatches.map((c, i) => (
              <button
                key={c.name}
                onClick={() => pickSlash(c.name)}
                onMouseEnter={() => setSlashSel(i)}
                className={`flex w-full items-baseline gap-2.5 rounded-lg px-3 py-1.5 text-left ${
                  i === slashSel ? 'bg-panel-2' : ''
                }`}
              >
                <span className="font-mono text-xs text-accent">/{c.name}</span>
                <span className="truncate text-[11px] text-text-faint">{c.description}</span>
              </button>
            ))}
          </div>
        )}
        <div
          className={`composer-shell flex items-end gap-2 rounded-2xl px-3.5 py-2.5 ${
            hero ? 'bg-panel shadow-lg' : 'rounded-xl bg-panel-2'
          }`}
        >
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (slashMatches.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSlashSel((s) => Math.min(s + 1, slashMatches.length - 1))
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSlashSel((s) => Math.max(s - 1, 0))
                  return
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault()
                  pickSlash(slashMatches[slashSel]?.name ?? '')
                  return
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              } else if (e.key === 'Escape' && busy) {
                e.preventDefault()
                onInterrupt()
              }
            }}
            rows={1}
            placeholder={busy ? '正在生成…按 Esc 中断' : '给 Claude Code 发送任务…(/ 命令)'}
            className="max-h-48 min-h-6 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-text-faint"
          />
          {busy ? (
            <button
              onClick={onInterrupt}
              aria-label="停止生成"
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-border-strong text-text-dim transition-colors hover:border-danger hover:text-danger"
            >
              <IconStop width={14} height={14} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim()}
              aria-label="发送"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-white transition-all hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-35"
            >
              <IconSend width={14} height={14} />
            </button>
          )}
        </div>
        {!hero && (
          <p className="mt-2 text-center text-[11px] text-text-faint">
            Enter 发送 · Shift+Enter 换行 · Esc 中断
          </p>
        )}
      </div>
    </div>
  )
}
