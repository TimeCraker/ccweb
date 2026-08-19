import { useState } from 'react'
import type { ThinkingBlock as T } from '../render/blocks'

export default function ThinkingBlock({ block }: { block: T }) {
  const [open, setOpen] = useState(false)
  const lines = block.text.split('\n').length

  return (
    <div className="my-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[11px] text-text-faint transition-colors hover:text-text-dim"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        {block.streaming ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 animate-pulse rounded-full bg-accent/70" />
            思考中…
          </span>
        ) : (
          <span>已思考({lines} 行)</span>
        )}
      </button>
      {open && (
        <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-panel px-3 py-2 font-mono text-[11px] leading-relaxed text-text-faint">
          {block.text}
        </pre>
      )}
    </div>
  )
}
