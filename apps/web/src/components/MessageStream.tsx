import { useEffect, useRef, useState } from 'react'
import { useStore, visibleEntries } from '../store'
import type { Block, TurnEntry } from '../render/blocks'
import Markdown from './Markdown'
import ThinkingBlock from './ThinkingBlock'
import ToolCard from './ToolCard'

export default function MessageStream() {
  const entries = useStore((s) => visibleEntries(s.entries))
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
            e.type === 'user' ? (
              <div key={e.id} className="group flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap rounded-xl rounded-br-sm border border-border-strong bg-panel-2 px-4 py-2.5">
                  {e.text}
                </div>
                <CopyButton text={e.text} className="ml-1.5 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            ) : (
              <TurnView key={e.id} turn={e} />
            ),
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}

function TurnView({ turn }: { turn: TurnEntry }) {
  const lastTextStreaming = (() => {
    for (let i = turn.blocks.length - 1; i >= 0; i--) {
      const b = turn.blocks[i]
      if (b && b.kind === 'text') return b.streaming
      if (b && b.kind === 'tool') return false
    }
    return false
  })()

  return (
    <div className="space-y-1">
      {turn.blocks.map((b, i) => (
        <BlockView key={i} block={b} isLastText={b.kind === 'text' && b.streaming && lastTextStreaming} />
      ))}
    </div>
  )
}

function BlockView({ block, isLastText }: { block: Block; isLastText: boolean }) {
  const [copied, setCopied] = useState(false)
  if (block.kind === 'thinking') return <ThinkingBlock block={block} />
  if (block.kind === 'tool') return <ToolCard block={block} />
  return (
    <div className={`group relative ${isLastText ? 'stream-caret' : ''}`}>
      <Markdown text={block.text || '…'} />
      {!block.streaming && block.text && (
        <button
          onClick={() => {
            void navigator.clipboard.writeText(block.text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
          className="absolute -right-14 top-0 rounded-md border border-border bg-panel px-2 py-1 text-[10px] text-text-faint opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
        >
          {copied ? '已复制' : '复制'}
        </button>
      )}
    </div>
  )
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className={`self-center rounded-md border border-border bg-panel px-2 py-1 text-[10px] text-text-faint transition-colors hover:text-text ${className ?? ''}`}
    >
      {copied ? '已复制' : '复制'}
    </button>
  )
}
