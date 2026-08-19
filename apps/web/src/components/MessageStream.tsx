import { useEffect, useRef } from 'react'
import { useStore } from '../store'

export default function MessageStream() {
  const entries = useStore((s) => s.entries)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {entries.length === 0 ? (
        <div className="grid h-full place-items-center">
          <div className="text-center">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl border border-border bg-panel text-xl">
              ⌘
            </div>
            <h2 className="text-base font-medium">开始新对话</h2>
            <p className="mt-1 text-sm text-text-dim">
              输入任务,回车发送 · Esc 中断 · 完整 ~/.claude 配置自动生效
            </p>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          {entries.map((e) =>
            e.role === 'user' ? (
              <div key={e.id} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-xl rounded-br-sm border border-border-strong bg-panel-2 px-4 py-2.5">
                  {e.text}
                </div>
              </div>
            ) : (
              <div
                key={e.id}
                className={`whitespace-pre-wrap leading-relaxed ${e.streaming ? 'stream-caret' : ''}`}
              >
                {e.text || '…'}
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}
