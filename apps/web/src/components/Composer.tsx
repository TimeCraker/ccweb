import { useRef, useState } from 'react'
import { useStore } from '../store'

interface Props {
  onSend: (text: string) => void
  onInterrupt: () => void
}

export default function Composer({ onSend, onInterrupt }: Props) {
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
    <div className="border-t border-border bg-panel px-6 py-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-xl border border-border-strong bg-panel-2 px-3 py-2 focus-within:border-accent">
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
            className="max-h-48 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-text-faint"
          />
          {busy ? (
            <button
              onClick={onInterrupt}
              className="shrink-0 rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-dim transition-colors hover:border-danger hover:text-danger"
            >
              停止
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              发送
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-text-faint">
          Enter 发送 · Shift+Enter 换行 · Esc 中断
        </p>
      </div>
    </div>
  )
}
