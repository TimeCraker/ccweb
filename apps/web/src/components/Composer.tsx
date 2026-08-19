import { useRef, useState } from 'react'
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
  const busy = useStore((s) => s.busy)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    const t = text.trim()
    if (!t || busy) return
    onSend(t)
    setText('')
  }

  return (
    <div className={hero ? 'w-full' : 'border-t border-border bg-panel px-6 py-4'}>
      <div className={hero ? '' : 'mx-auto max-w-3xl'}>
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
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              } else if (e.key === 'Escape' && busy) {
                e.preventDefault()
                onInterrupt()
              }
            }}
            rows={1}
            placeholder={busy ? '正在生成…按 Esc 中断' : '给 Claude Code 发送任务…'}
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
